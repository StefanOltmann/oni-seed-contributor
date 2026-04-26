# WASM Bridge Design — ONI Seed Contributor

**Date:** 2026-04-26
**Status:** Approved (pending implementation)
**Scope:** v1 of the Kotlin/JVM ↔ WASM worldgen bridge

## Context

The `oni-seed-contributor` repo is a Docker-based service intended to expose
Oxygen Not Included worldgen — implemented in Rust, distributed as a WASM
module via the `@tigin-backwards/oxygen-not-included-worldgen` npm package —
through a JVM service so it can be called from elsewhere in the
ONI-seed-browser ecosystem.

The current state of the repo: server skeleton (Ktor 3.4.2, Netty), build
plumbing (Kotlin 2.3.20 / JVM 25, version catalog, multi-arch Docker, GHCR
publish), Javet on the classpath, and the WASM bundle vendored under
`src/main/resources/worldgen/`. The bridge itself is unimplemented — the
init block in `src/main/kotlin/Worldgen.kt` contains a `// TODO` and the
`worldgen` global it references is never bound into V8.

The owner's stated ask is "throw in a coordinate, get JSON back." The
storage backend (`oni-seed-browser-backend`) already owns queue, upload,
auth, and dedup, so this service does not need to participate in the
contributor protocol; it only needs to be a worldgen-as-a-service.

## Goals

- `GET /generate/{coord}` returns trimmed worldgen JSON for a valid ONI
  coordinate.
- Architecture isolates the V8/Javet runtime behind an interface so a
  multi-runtime pool can replace the single-runtime implementation without
  touching the domain or HTTP layers.
- Errors are typed and stable across all failure modes (invalid coordinate,
  WASM panic, timeout, postprocess failure) so an upstream orchestrator can
  branch on `code` without parsing strings.
- Postprocessing splits across the JS↔JVM boundary: bulky per-cell arrays
  are dropped on the JS side (avoid JNI traffic); fine shaping happens in
  typed Kotlin against `oniSeedBrowserModel`.

## Non-Goals (v1)

Caching, authentication, rate limiting, queue integration, upload to the
backend, metrics endpoint, multi-runtime pool, hot-reload of the WASM
bundle, schema-validating responses, the full WASM API surface (settle,
entities, settings bundles, digest, etc.). Each is additive on top of this
design.

## Architecture

Three layers, each only aware of the layer directly below it.

```
┌──────────────────────────────── http ────────────────────────────────┐
│  Routings.kt:  get("/generate/{coord}") { service.generate(coord) }  │
│  ErrorMapping: WorldgenError → HTTP status + structured body         │
└─────────────────────────────────┬────────────────────────────────────┘
                                  ▼ calls
┌────────────────────────────── worldgen ──────────────────────────────┐
│  WorldgenService:                                                    │
│    1. validate coord syntactically                                   │
│    2. pool.withRuntime { it.generate(coord) }   ← raw trimmed JSON   │
│    3. Postprocessor.shape(rawJson) → Cluster (oniSeedBrowserModel)   │
│  Returns Result<Cluster, WorldgenError>                              │
└─────────────────────────────────┬────────────────────────────────────┘
                                  ▼ uses
┌──────────────────────────────── wasm ────────────────────────────────┐
│  WorldgenRuntimePool:                                                │
│    suspend fun <T> withRuntime(block: suspend (R) -> T): T           │
│    (v1: a Mutex + one runtime; v2: a channel of N runtimes)          │
│                                                                      │
│  WorldgenRuntime (interface):                                        │
│    suspend fun generate(coord: String): String   ← trimmed JSON      │
│                                                                      │
│  JavetWorldgenRuntime (impl):                                        │
│    boots NodeRuntime, registers a classpath module resolver,         │
│    runs a bootstrap module that synchronously instantiates the WASM  │
│    from in-memory bytes, parks `worldgen` on a global, and serves    │
│    subsequent generate(coord) calls by invoking it.                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Composition

`Application.module()` is the composition root. It builds a
`WorldgenRuntimePool { JavetWorldgenRuntime() }`, constructs
`WorldgenService(pool, Postprocessor())`, and hands the service to
`configureRouting(service)`. Nothing else allocates these objects.

### Key seam: the pool

`WorldgenRuntimePool` exposes only `withRuntime { ... }`. The v1 single-
runtime version uses a `Mutex`; a future N-runtime version uses a
`Channel<R>` of pooled instances. `WorldgenService` is unchanged when the
pool grows.

## Components

### `wasm/WorldgenRuntime.kt`

Interface, ~5 lines.

```kotlin
interface WorldgenRuntime : AutoCloseable {
    suspend fun generate(coord: String): String   // trimmed JSON, raw text
}
```

### `wasm/JavetWorldgenRuntime.kt`

The only file that knows Javet/V8/JS.

Constructor:
1. Read `worldgen/oni_wasm_bg.wasm` from classpath into a `byte[]` and
   bind it on `globalThis.wasmBytes`.
2. Register an `IV8ModuleResolver` that resolves `./index.js` and
   `./oni_wasm.js` from classpath instead of the filesystem.
3. Run a bootstrap module:
   ```js
   import init, { worldgen } from './index.js';
   await init({ module: new WebAssembly.Module(globalThis.wasmBytes) });
   globalThis.__worldgen = worldgen;
   ```
   This synchronously instantiates the WASM from in-memory bytes (no
   `fetch`, no `fs.readFileSync` needed) and parks `worldgen` on a global.
4. `nodeRuntime.await()` to drain microtasks.

`generate(coord)` runs a small parameterized executor — coord passed via
a V8 binding, **not** string-concatenated into JS — that calls
`__worldgen.generate(coord)`, runs the first-pass stripper, returns the
JSON string.

`close()` disposes the runtime.

### `wasm/JsBridge.kt`

Holds the JS source text for the first-pass stripper as a constant. The
existing logic from `Worldgen.kt` (drop `element_table`, per-world
`element_idx`/`mass`/`temperature`/`disease_idx`/`disease_count`/
`pickupables`, biome cell `type`, geyser `cell`, building `cell`/
`connections`/`rotationOrientation`, starmap POI roll fields) lives here,
ported into a function rather than concatenated into every call.

It's its own file because the JS is data, not control flow — keeping it
out of `JavetWorldgenRuntime.kt` keeps that file focused on runtime
lifecycle.

### `wasm/WorldgenRuntimePool.kt`

```kotlin
class WorldgenRuntimePool(
    private val factory: () -> WorldgenRuntime
) : AutoCloseable {
    private var runtime = factory()
    @Volatile private var poisoned = false
    private val mutex = Mutex()

    suspend fun <T> withRuntime(block: suspend (WorldgenRuntime) -> T): T =
        mutex.withLock {
            if (poisoned) {
                runtime.close()
                runtime = factory()
                poisoned = false
            }
            block(runtime)
        }

    fun markPoisoned() { poisoned = true }

    override fun close() = runtime.close()
}
```

The N-runtime version replaces `mutex + runtime` with a
`Channel<WorldgenRuntime>` of size N and keeps the same public API.

### `worldgen/Postprocessor.kt`

Pure JVM, no Javet dependency.

- Parses raw JSON to the `Cluster` type from `oniSeedBrowserModel` using
  `kotlinx.serialization` configured with `ignoreUnknownKeys = true`
  (forward-compat across WASM bundle updates).
- Drops the small per-element fields the JS strip didn't handle, by
  operating on the typed model rather than string surgery.
- Returns `Cluster`. Serializing it back to JSON is the route's job
  (Ktor `ContentNegotiation`).

### `worldgen/WorldgenService.kt`

```kotlin
class WorldgenService(
    private val pool: WorldgenRuntimePool,
    private val postprocessor: Postprocessor,
    private val timeout: Duration = 30.seconds,
) {
    suspend fun generate(coord: String): Result<Cluster, WorldgenError> {
        if (!ClusterType.isValidCoordinate(coord))
            return Err(InvalidCoordinate(coord))
        return try {
            withTimeout(timeout) {
                pool.withRuntime { rt -> postprocessor.shape(rt.generate(coord)) }
            }.let(::Ok)
        } catch (e: TimeoutCancellationException) {
            pool.markPoisoned()
            Err(Timeout(coord, timeout))
        } catch (e: JavetException) {
            Err(WasmFailure(coord, e.message))
        } catch (e: SerializationException) {
            Err(BridgeFailure("postprocess", e.message))
        }
    }
}
```

`Result`/`Ok`/`Err` is a tiny in-house sealed type — avoids pulling Arrow
for one usage site.

### `worldgen/WorldgenError.kt`

```kotlin
sealed class WorldgenError(val code: String) {
    data class InvalidCoordinate(val coord: String) : WorldgenError("INVALID_COORDINATE")
    data class Timeout(val coord: String, val after: Duration) : WorldgenError("TIMEOUT")
    data class WasmFailure(val coord: String, val detail: String?) : WorldgenError("WASM_FAILURE")
    data class BridgeFailure(val stage: String, val detail: String?) : WorldgenError("BRIDGE_FAILURE")
}
```

### `http/Routings.kt`

```kotlin
fun Application.configureRouting(service: WorldgenService) {
    install(CORS) { /* unchanged from current */ }
    routing {
        get("/")                 { call.respondText("ONI seed contributor $VERSION ...") }
        get("/generate/{coord}") {
            val coord = call.parameters["coord"]!!
            when (val r = service.generate(coord)) {
                is Ok  -> call.respond(r.value)         // ContentNegotiation serializes Cluster
                is Err -> respondError(call, r.error)
            }
        }
    }
}
```

### `http/ErrorMapping.kt`

Single function `respondError` that maps `WorldgenError` to
`(HttpStatusCode, ErrorBody)` and responds.

```kotlin
@Serializable data class ErrorBody(
    val code: String,
    val message: String,
    val coordinate: String? = null,
)
```

### `Application.kt`

```kotlin
fun main() {
    val pool = WorldgenRuntimePool { JavetWorldgenRuntime() }
    val service = WorldgenService(pool, Postprocessor())

    Runtime.getRuntime().addShutdownHook(Thread { pool.close() })

    embeddedServer(Netty, port = 8080, host = "0.0.0.0") { module(service) }
        .start(wait = true)
}

fun Application.module(service: WorldgenService) = configureRouting(service)
```

The side-effecting `Worldgen.generate(...)` debug call before
`embeddedServer` in the current code is removed.

## Data Flow

### Cold start (once, at process boot)

1. `main()` constructs `WorldgenRuntimePool { JavetWorldgenRuntime() }`.
2. `JavetWorldgenRuntime.<init>` blocks while it spins up the
   `NodeRuntime`, registers the classpath module resolver, runs the
   bootstrap module, parks `worldgen` on `globalThis.__worldgen`, and
   awaits pending microtasks.
3. The runtime is "warm" — every `generate` call reuses the same parsed
   JS modules and the same instantiated WASM. No re-init per request.
4. Ktor binds `:8080`. First request can already be served.

### Hot path (per request)

```
HTTP GET /generate/PRE-C-719330309-0-0-ZB937
   │
   ▼  Ktor coroutine on Netty's IO dispatcher
configureRouting → service.generate(coord)
   │
   ▼  validate coord syntactically (zero V8)
ClusterType.isValidCoordinate(coord)?  ── no ──► Err(InvalidCoordinate) ──► 400
   │ yes
   ▼  withTimeout(30s) {
pool.withRuntime { rt ->
   │  mutex.withLock — at most one V8 call in flight
   ▼
JavetWorldgenRuntime.generate(coord)
   │  • bind coord as a V8 string parameter (no string concat into JS)
   │  • run the pre-loaded JS:
   │       const r = __worldgen.generate(coord);
   │       firstPassStrip(r);                       // drops bulky per-cell arrays
   │       return JSON.stringify(r);
   ▼
String                                            (~tens-to-hundreds of KB)
   │
   ▼  back in Kotlin, still inside withRuntime
Postprocessor.shape(rawJson)
   │  • Json.decodeFromString<Cluster>(rawJson) using oniSeedBrowserModel
   │  • drop small per-element fields the JS strip didn't touch
   ▼
Cluster                                            (typed)
   │
   ▼ }                                              mutex released
Ok(Cluster)
   │
   ▼  Ktor ContentNegotiation
serialize Cluster → application/json → 200
```

### Failure branches

- WASM throws (panic, bad coord that survived the syntactic check) →
  `JavetException` bubbles out → `WasmFailure` → 502.
- 30 s deadline elapses → `withTimeout` cancels the coroutine; the
  in-flight V8 call keeps running until completion. Pool is marked
  `poisoned`; the next `withRuntime` rebuilds it. Caller sees `Timeout` →
  504.
- Result JSON doesn't deserialize to `Cluster` →
  `BridgeFailure("postprocess", ...)` → 500. (Indicates schema drift
  between WASM bundle and `oniSeedBrowserModel`.)

### Concurrency contract

- `WorldgenService.generate` is `suspend` and safe to call from many
  request coroutines simultaneously.
- `pool.withRuntime` serializes V8 access. Today: request N waits for
  request N-1. When pooling lands, contention drops to 1/N; service code
  unchanged.
- Backpressure beyond OS socket queues is out of scope for v1.

## Error Handling

### Principle

Errors are values once they cross the `WorldgenService` boundary. Inside
the service we catch dependency exceptions; outside, only
`Result<Cluster, WorldgenError>` flows. Routes never see raw Javet or
serialization exceptions.

### Variants

| Variant | Triggered by | HTTP | Body `code` | Retryable? |
|---|---|---|---|---|
| `InvalidCoordinate` | fails `ClusterType.isValidCoordinate` | 400 | `INVALID_COORDINATE` | No — drop from queue |
| `Timeout` | wall-clock > configured deadline | 504 | `TIMEOUT` | Yes — but mark coord flaky |
| `WasmFailure` | `JavetException`, including JS-side throws and Rust panics | 502 | `WASM_FAILURE` | Maybe — once, then drop |
| `BridgeFailure` | postprocess deserialization or any Kotlin-side bug | 500 | `BRIDGE_FAILURE` | No — operator alert |

### Response body

```json
{
  "code": "TIMEOUT",
  "message": "Worldgen exceeded 30s for coordinate PRE-C-...-ZB937",
  "coordinate": "PRE-C-...-ZB937"
}
```

Stable shape across all error variants. `code` is the machine-readable
switch; `message` is human-readable; `coordinate` is included when known.

### Layer responsibilities

- `JavetWorldgenRuntime.generate` lets Javet throw freely. It does not
  classify failures; classification is the service's job.
- `WorldgenService.generate` is the only place that turns exceptions into
  `WorldgenError`.
- `respondError` is the only place that turns `WorldgenError` into HTTP.

### Logging policy

- `InvalidCoordinate`: INFO. Cheap, expected.
- `Timeout`: WARN with coordinate + duration.
- `WasmFailure`: WARN with coordinate + Javet message; stack at DEBUG.
- `BridgeFailure`: ERROR with full stack — schema drift or our bug.

### Runtime poisoning

When `withTimeout` fires, the in-flight V8 call keeps running on its
thread until it completes. The runtime slot is therefore in unknown
state. The pool marks it `poisoned`, releases the mutex; the *next*
`withRuntime` closes and rebuilds before yielding. Cost: one cold-start
hits the request that follows a timeout. Acceptable trade vs. trying to
abort a synchronous V8 call.

### Explicit non-behaviors

- No retry inside the service. Orchestrator owns retry policy.
- No cache. Each call is a fresh worldgen.
- No errors-as-200s. HTTP status is honest.

## Testing

### Unit — `Postprocessor` (pure JVM)

- Drives off `src/test/resources/sample.json` plus a couple of malformed
  variants.
- Asserts: dropped fields are absent, retained fields present, `Cluster`
  round-trips through `Json.encodeToString` cleanly.
- A schema-drift fixture (extra unknown field) confirms `ignoreUnknownKeys`
  survives WASM-side additions.
- Milliseconds, no Javet, no native libs.

### Unit — `WorldgenService` with a fake runtime

`FakeRuntime : WorldgenRuntime` returns canned strings or throws on
demand. Cases:
- happy path → `Ok(Cluster)`
- runtime throws `JavetException` → `Err(WasmFailure)`
- runtime blocks longer than configured timeout → `Err(Timeout)` and
  pool's `markPoisoned()` was called
- postprocessor sees malformed JSON → `Err(BridgeFailure)`
- bad coordinate string → `Err(InvalidCoordinate)`, runtime never invoked

### Unit — `WorldgenRuntimePool`

- 5 concurrent `withRuntime` callers; assert observed concurrency = 1.
- After `markPoisoned()`, next `withRuntime` invokes the factory again
  (factory wrapped to count calls).

### Integration — real bridge

`JavetWorldgenRuntimeTest` boots a real `JavetWorldgenRuntime`, calls
`generate("PRE-C-719330309-0-0-ZB937")`, asserts the result deserializes
to a `Cluster` with expected world count, expected coordinate echoed
back, and presence of expected biomes. Structural assertions only — no
byte-for-byte match (fragile across WASM versions). The existing
commented-out assertion in `WorldgenTest.kt` stays commented.

Tagged `wasm` so `gradle test -PexcludeTags=wasm` can skip on
constrained platforms. Default `gradle test` runs them.

### End-to-end — Ktor route

`testApplication { client.get("/generate/...") }` driving a service
backed by `FakeRuntime`. Confirms route plumbing, content negotiation,
and error mapping (one `400`/`504`/`502`/`500` case each via
fake-induced failures). No real WASM in the loop.

### Out of scope

WASM correctness (upstream's job), long-running stability/leak tests
(manual pre-deploy), concurrency stress beyond the pool's serialization
invariant.

### CI

`./gradlew test` runs everything on Linux x86_64 (GH Actions). The
Dockerfile already does `RUN ./gradlew --no-daemon --info test
buildFatJar`, so the integration test runs as part of the image build.
Provided the Linux Javet native is on the classpath — a packaging concern,
below.

## Operational Concerns

### Javet native libraries

Today `build.gradle.kts` declares only `javet-node-windows-x86_64`. The
Dockerfile builds an `eclipse-temurin:25-jre-alpine` image; Javet does
**not** ship a musl-libc native, so the JAR will fail to load `libnode`
on Alpine.

Required changes:
- Add `javet-node-linux-x86_64` and `javet-node-linux-arm64` (CI builds
  both). Keep `javet-node-windows-x86_64` for dev. All three can ship in
  the fat jar (a few MB per native).
- Switch the runtime base from `eclipse-temurin:25-jre-alpine` to
  `eclipse-temurin:25-jre` (Debian-slim). Costs ~30 MB image size, gains
  glibc.
- At process start, log Javet's resolved native path. If load fails, log
  *which* artifact is missing.

### Build dependency

The bootstrap module loads `index.js` and `oni_wasm.js` as ES modules
via the registered `IV8ModuleResolver`, reading them as strings from
classpath resources. **No JS toolchain (npm/webpack) is needed** — the
prebuilt files already in `src/main/resources/worldgen/` ship as-is.

### Memory

A warm `NodeRuntime` + instantiated WASM sits at ~150–250 MB resident.
Single instance v1 fits in a 512 MB container. Pool growth is linear;
document in README.

### Configuration

Three env vars, all read in `Application.kt` via `System.getenv`:
- `WORLDGEN_TIMEOUT_SECONDS` (default `30`)
- `WORLDGEN_PORT` (default `8080`)
- `WORLDGEN_RUNTIME_POOL_SIZE` (default `1`; reserved for future, ignored
  today)

No config file. No DI container.

### Shutdown

JVM shutdown hook closes the pool, which closes the runtime, which
disposes V8. Without this, Javet's native threads can keep the JVM alive.

### Observability v1

Existing logback + `println`-style logging in `Routings.kt` is fine. Add:
- per-request log line with coord, outcome, duration ms
- WARN/ERROR levels for failure variants per "Error Handling" above
- `GET /` keeps reporting version + uptime

No Prometheus/metrics endpoint in v1; bolt on later via
`ktor-server-metrics-micrometer`.

## Migration from current code

Three files survive in spirit, none survive byte-for-byte:

- `Worldgen.kt` → split into `wasm/JavetWorldgenRuntime.kt` and
  `wasm/JsBridge.kt`. The `// TODO` block is replaced by the bootstrap
  module described in "Components".
- `Application.kt` loses the side-effecting `Worldgen.generate(...)`
  debug call before `embeddedServer`. Gains composition root wiring and
  shutdown hook.
- `Routings.kt` loses nothing; gains `/generate/{coord}` and now takes
  `WorldgenService` as a parameter.

## File map (final)

```
src/main/kotlin/
    Application.kt
    Result.kt                  (in-house Ok/Err sealed type)
    wasm/
        WorldgenRuntime.kt
        JavetWorldgenRuntime.kt
        JsBridge.kt
        WorldgenRuntimePool.kt
    worldgen/
        WorldgenService.kt
        WorldgenError.kt
        Postprocessor.kt
    http/
        Routings.kt
        ErrorMapping.kt
src/main/resources/
    logback.xml
    worldgen/                  (unchanged: index.js, oni_wasm.js, oni_wasm_bg.wasm, ...)
src/test/kotlin/
    PostprocessorTest.kt
    WorldgenServiceTest.kt
    WorldgenRuntimePoolTest.kt
    JavetWorldgenRuntimeTest.kt    (tag: wasm)
    RoutingsTest.kt
src/test/resources/
    sample.json                (unchanged)
    sample-malformed.json
    sample-with-unknown-field.json
```
