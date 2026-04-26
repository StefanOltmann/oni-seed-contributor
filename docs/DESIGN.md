# Design — ONI Seed Contributor (WASM Bridge)

**Status:** Shipped (revision 2 approved 2026-04-26; reconciled with the
implementation 2026-04-26 after the per-task code-review pass surfaced
several Javet-API and Operations notes that needed back-porting into
the spec).
**Scope:** v1 of the Kotlin/JVM ↔ WASM worldgen bridge

## Context

The `oni-seed-contributor` repo is a Docker-based service that exposes
Oxygen Not Included worldgen — implemented in Rust, distributed as a WASM
module via the `@tigin-backwards/oxygen-not-included-worldgen` npm package —
through a JVM service so it can be called from elsewhere in the
ONI-seed-browser ecosystem. v1 is built: 4 production source files, 13
passing tests (including a real V8 + WASM integration test), multi-arch
Docker image building from `eclipse-temurin:25-jre`. This document is
the spec the implementation was built against; deviations the
implementation made on contact with reality (chiefly Javet 5.0.6 API
corrections) have been folded back into the relevant sections below.

The owner's stated ask is "throw in a coordinate, get JSON back." The
storage backend (`oni-seed-browser-backend`) already owns queue, upload,
auth, and dedup, so this service does not participate in the contributor
protocol; it only needs to be a worldgen-as-a-service. The frontend
(`oni-seed-browser`) already runs the same WASM client-side and uploads
under the user's Steam JWT (see
`oni-seed-browser/app/src/commonMain/kotlin/service/DefaultWebClient.kt:332`),
so this Docker service is the server-side equivalent of one slice of the
frontend's flow — the WASM call itself, nothing more.

## Goals

- `GET /generate/{coord}` returns trimmed worldgen JSON for a valid ONI
  coordinate. The response is the raw WASM output minus per-cell and
  similar bulky/derivable fields. Consumers parse it themselves.
- A single class owns the V8/Javet runtime and serializes access to it; v2
  can replace that single class with an N-instance pool without touching
  any other file.
- Errors are typed and stable across all failure modes (invalid coordinate,
  WASM panic, timeout) so an upstream orchestrator can branch on `code`
  without parsing strings.

## Non-Goals (v1)

Caching, authentication, rate limiting, queue integration, upload to the
backend, metrics endpoint, multi-runtime pool, hot-reload of the WASM
bundle, schema-validating responses, the full WASM API surface (settle,
entities, settings bundles, digest, etc.), and **typed deserialization of
the result**. The frontend's flow does the parse/convert step itself; we
have no business owning a `Cluster`/`UploadCluster`/etc. type.

## Why we return raw JSON, not a typed model

The `Cluster` type in `oni-seed-browser-model` is the *post-upload* shape:
it carries `uploaderSteamIdHash`, `uploaderAuthenticated`, `uploadDate`,
compacted `BiomePaths`, bitmask traits — fields the WASM cannot supply.
The frontend's pipeline
(`oni-seed-browser/app/src/commonMain/kotlin/ui/MapGenerationView.kt:158-167`)
goes WASM → `WorldgenMapData.fromJson(...)` → `WorldgenMapDataConverter
.convert(mapData, gameVersion)` → `Cluster`. The intermediate
`WorldgenMapData` lives in `oni-seed-browser/app/src/commonMain/kotlin/
worldgen/WorldgenModels.kt` (currently coupled to the frontend module).

Two ways to handle this:

- **Pass through raw JSON.** Service has no opinion on the schema. Every
  consumer reparses anyway. Keeps the service stateless about model
  versioning. Chosen.
- Vendor `WorldgenMapData` into `oni-seed-browser-model` and return that.
  Better long-term but requires a coordinated change in another repo;
  out of scope for v1.

The route therefore responds with `application/json` whose body is the
raw string the WASM produced (after JS-side stripping). No
`kotlinx.serialization` step in the hot path. No `Postprocessor`.

## Architecture

```
┌──────────────────────────────── HTTP ────────────────────────────────┐
│  Routings.kt:  GET /generate/{coord}                                 │
│      validate, withTimeout, call service, map outcome to HTTP        │
└─────────────────────────────────┬────────────────────────────────────┘
                                  ▼
┌────────────────────────────── Service ───────────────────────────────┐
│  WorldgenService:                                                    │
│    suspend fun generate(coord): Result<String>                       │
│    classifies failures into WorldgenError sealed class               │
└─────────────────────────────────┬────────────────────────────────────┘
                                  ▼
┌────────────────────────────── Runtime ───────────────────────────────┐
│  JavetWorldgenRuntime:                                               │
│    boots NodeRuntime, registers a classpath module resolver,         │
│    runs a bootstrap module that synchronously instantiates the WASM  │
│    from in-memory bytes, caches a `V8ValueFunction` for the JS-side  │
│    "generate-and-strip" function, and serves generate(coord) calls   │
│    under an internal Mutex.                                          │
└──────────────────────────────────────────────────────────────────────┘
```

Three layers, four files (plus `Application.kt` + `Routings.kt`):

```
src/main/kotlin/
    Application.kt              composition root, shutdown hook
    Routings.kt                 routes + inline error→HTTP mapping
    WorldgenService.kt          orchestration + sealed WorldgenError
    JavetWorldgenRuntime.kt     V8/WASM lifecycle + JS strip constant
src/main/resources/
    logback.xml
    worldgen/                   unchanged (index.js, oni_wasm.js, oni_wasm_bg.wasm, ...)
src/test/kotlin/
    WorldgenServiceTest.kt          lambda fakes, no V8 needed (5 tests)
    RoutingsTest.kt                 Ktor testApplication + lambda fakes (5 tests)
    JavetWorldgenRuntimeTest.kt     gated by SKIP_WASM_TESTS — boots real V8 (3 tests)
    WorldgenModels.kt               vendored verbatim from oni-seed-browser
    WorldgenMapDataConverter.kt     vendored verbatim from oni-seed-browser
src/test/resources/
    sample.json                 unchanged
```

This matches the sibling repo `oni-seed-browser-backend`'s house style
(flat package, top-level functions, no DI container, no separate
`ErrorMapping`/`Result`/`JsBridge` files).

## Components

### `JavetWorldgenRuntime.kt`

Owns the V8 lifecycle, the WASM instantiation, and a `Mutex` that
serializes generate() calls. The only file that imports Javet.

**Constructor (cold start, blocking).** Runs once at process boot.

1. Build a `NodeRuntime` via `V8Host.getNodeInstance().createV8Runtime()`.
2. Read `worldgen/oni_wasm_bg.wasm` from classpath into a `ByteArray` and
   bind it on `globalThis.wasmBytes` as a real V8 ArrayBuffer:

   ```kotlin
   nodeRuntime.createV8ValueArrayBuffer(wasmBytes.size).use { buf ->
       buf.fromBytes(wasmBytes)
       nodeRuntime.globalObject.set("wasmBytes", buf)
   }
   ```

   `globalObject.set("wasmBytes", byteArray)` does NOT auto-marshal a
   `ByteArray` into a JS `BufferSource` — JS would see an opaque Java
   reference and `new WebAssembly.Module(...)` would reject it.
3. Register an `IV8ModuleResolver` that compiles modules from classpath:

   ```kotlin
   nodeRuntime.setV8ModuleResolver { runtime, name, _ ->
       // Resolution rule: any specifier `./X` or `X` maps to the
       // classpath resource `worldgen/X`. The two specifiers we expect
       // are `./index.js` (from the bootstrap module) and `./oni_wasm.js`
       // (from index.js's `import * as _wasm from './oni_wasm.js'`).
       val basename = name.removePrefix("./")
       val src = Thread.currentThread().contextClassLoader
           .getResourceAsStream("worldgen/$basename")
           ?.use { it.readBytes().decodeToString() }
           ?: error("Module '$name' not found at classpath:worldgen/$basename")
       runtime.getExecutor(src)
           .setResourceName(name)
           .setModule(true)
           .compileV8Module()
   }
   ```

4. Compile and execute the bootstrap module. Source:

   ```js
   import init, { worldgen } from './index.js';
   // wasm-bindgen's web-target init expects { module_or_path: ... }.
   // Passing a pre-compiled WebAssembly.Module skips the URL/fetch path
   // that doesn't work in Javet (no import.meta.url base). The wrong
   // key (`module:`) leaves wasm-bindgen with `module_or_path === undefined`
   // and produces "TypeError: Invalid URL" at runtime.
   await init({ module_or_path: new WebAssembly.Module(globalThis.wasmBytes) });
   globalThis.__generate = function (coord) {
       const r = worldgen.generate(coord);
       // Drop typed-array fields BEFORE JSON.stringify; otherwise they
       // serialize as objects ({"0": v, "1": v, ...}) instead of being
       // omitted. This is the entire reason for the JS-side strip.
       delete r.element_table;
       for (const w of r.worlds) {
           delete w.element_idx;
           delete w.mass;
           delete w.temperature;
           delete w.disease_idx;
           delete w.disease_count;
           delete w.pickupables;
           for (const cell of w.biome_cells) delete cell.type;
           for (const g of w.geysers) delete g.cell;
           for (const e of w.other_entities) delete e.cell;
           for (const b of w.buildings) {
               delete b.cell;
               delete b.connections;
               delete b.rotationOrientation;
           }
       }
       for (const p of r.starmap_pois) {
           delete p.capacity_roll;
           delete p.recharge_roll;
           delete p.total_capacity;
           delete p.recharge_time;
       }
       return JSON.stringify(r);
   };
   ```

   Held as a `private const val` at the bottom of the file (next to the
   runtime that loads it; matches DD-008's flat layout). Compile and
   execute the bootstrap explicitly so top-level `await init(...)`
   actually completes before we look up `__generate`:

   ```kotlin
   nodeRuntime.getExecutor(BOOTSTRAP_SRC)
       .setResourceName("./bootstrap.mjs")
       .setModule(true)
       .compileV8Module()
       .use { module -> module.executeVoid() }
   ```

5. `nodeRuntime.await()` to drain the microtask queue and the Node event
   loop until `await init(...)` settles. Then `check(!nodeRuntime.isDead)`
   so a silent WASM-init rejection surfaces as a hard failure rather than
   a confusing "function is undefined" downstream.
6. Cache a handle to `globalThis.__generate` as a `V8ValueFunction` field
   on the runtime instance so per-call invocation skips re-resolving the
   global.

**Public API.**

```kotlin
class JavetWorldgenRuntime : AutoCloseable {
    private val mutex = Mutex()
    // built in init {} as described above
    private val nodeRuntime: NodeRuntime
    private val generateFn: V8ValueFunction

    /**
     * coord in, trimmed JSON out. Serialized via internal mutex.
     *
     * Note: `V8ValueFunction.invokeString(arg)` does NOT exist in
     * Javet 5.0.6 — that's the host-call form on `IV8ValueObject`. For
     * a cached function reference, use `callString(receiver, args...)`
     * with `null` as the receiver.
     */
    suspend fun generate(coord: String): String =
        mutex.withLock { generateFn.callString(null, coord) }

    /**
     * Holds the mutex (via runBlocking) so an in-flight generate
     * finishes before we release the V8 handle — without this, a
     * concurrent close + generate would free the native handle out
     * from under a running call. The wait is bounded by withTimeout
     * so a runaway native call (the same situation that triggered
     * exitProcess(70) — see DD-011) doesn't deadlock the JVM
     * shutdown hook indefinitely.
     */
    override fun close() = runBlocking {
        try {
            withTimeout(3.seconds) {
                mutex.withLock {
                    try { generateFn.close() } catch (_: Throwable) { /* swallow */ }
                    nodeRuntime.close()
                }
            }
        } catch (_: TimeoutCancellationException) {
            // Mutex is still held by a runaway native call; the
            // orchestrator's force-kill is the backstop. Best we can
            // do here is avoid blocking the shutdown sequence longer.
            System.err.println("[WARN] close() gave up after 3s; runtime mutex held by runaway native call")
        }
    }
}
```

Note on `setPurgeEventLoopBeforeClose(boolean)`: earlier drafts of this
spec called it before `close()`. The method does not exist on
`V8Runtime` in Javet 5.0.6; default `close()` performs the necessary
event-loop cleanup. Don't reintroduce the call.

Note on `V8Host.isLibraryReloadable()`: it is **static** on `V8Host`,
not an instance method on the result of `V8Host.getNodeInstance()`.
The cold-start log emits `V8Host.isLibraryReloadable()` for diagnostic
purposes; the resolved native path itself is not exposed by 5.0.6.

`callString(null, coord)` passes the coordinate as a real V8 string
argument — there is no JavaScript-source string concatenation
anywhere, which removes the JS-injection shape that the original
`Worldgen.kt` had before this rewrite.

**The pool seam, revisited.** The single-runtime case does not need a
separate `Pool` class — the `Mutex` lives on the runtime itself. When v2
needs N runtimes, the change is: extract `interface WorldgenRuntime`
(one method, `suspend fun generate(coord: String): String`), make today's
class implement it, add a `WorldgenRuntimePool` with a `Channel<R>`. All
call sites change from `runtime.generate(coord)` to
`pool.withRuntime { it.generate(coord) }`. That is two files added and
two call sites edited. We are not paying for that abstraction in v1.

### `WorldgenService.kt`

Orchestration: validate, enforce a wall-clock timeout, call the runtime,
classify failures. Defines the `WorldgenError` sealed type next to the
service that produces it.

```kotlin
sealed class WorldgenError(val code: String, message: String) : Throwable(message) {
    class InvalidCoordinate(val coord: String) :
        WorldgenError("INVALID_COORDINATE", "Coordinate '$coord' is not syntactically valid")
    class WasmFailure(val coord: String, detail: String?) :
        WorldgenError("WASM_FAILURE", "WASM rejected coordinate '$coord': $detail")
    class Timeout(val coord: String, val after: Duration) :
        WorldgenError("TIMEOUT", "Worldgen exceeded $after for coordinate '$coord'")
}

class WorldgenService(
    private val generator: suspend (String) -> String,
    private val timeout: Duration = 30.seconds,
    private val onTimeout: (coord: String) -> Unit = ::scheduleSelfTermination,
) {
    suspend fun generate(coord: String): Result<String> {
        if (!ClusterType.isValidCoordinate(coord))
            return Result.failure(WorldgenError.InvalidCoordinate(coord))
        return try {
            Result.success(withTimeout(timeout) { generator(coord) })
        } catch (e: TimeoutCancellationException) {
            // Fire-and-forget: schedule process exit asynchronously so
            // this coroutine can still return the Result.failure to the
            // route, which then writes the 504 to the client BEFORE the
            // JVM dies. The runaway V8 thread is unkillable from
            // in-process; only exit frees its CPU and unjams the mutex.
            // See DESIGN_DECISION_LOG.md DD-011.
            onTimeout(coord)
            Result.failure(WorldgenError.Timeout(coord, timeout))
        } catch (e: JavetException) {
            Result.failure(WorldgenError.WasmFailure(coord, e.message))
        }
    }
}

/**
 * Default `onTimeout` handler: spawn a non-daemon thread that sleeps
 * briefly (long enough for the 504 response to flush over the wire),
 * then calls `exitProcess(70)` (`70 == EX_SOFTWARE`).
 *
 * Tests pass a no-op (`onTimeout = { _ -> }`) so the test JVM survives.
 */
private fun scheduleSelfTermination(coord: String) {
    Thread {
        Thread.sleep(2_000) // give the route ~2 s to flush the response
        System.err.println("[FATAL] Worldgen timeout for '$coord' — exiting (70). Orchestrator should restart.")
        kotlin.system.exitProcess(70)
    }.apply {
        isDaemon = false
        name = "worldgen-self-termination"
        start()
    }
}
```

Uses `kotlin.Result<String>` rather than an in-house Either/sum type — one
call site does not justify a custom result wrapper. `WorldgenError` is a
`Throwable` so `Result.failure(...)` works directly.

**Why `generator` is a function reference, not a typed `Runtime`
parameter.** `WorldgenService` only needs to call one method. Taking a
`suspend (String) -> String` instead of a class:

- removes any need for an interface introduced "for testability"
  (production wires `WorldgenService(runtime::generate)`; tests wire
  `WorldgenService { coord -> "fake" }`);
- keeps the dependency direction explicit — the service knows nothing
  about V8 or pools, and never will;
- when v2 swaps the single runtime for a pool, the wiring becomes
  `WorldgenService { coord -> pool.withRuntime { it.generate(coord) } }`
  — the service still doesn't know.

**`InvalidCoordinate` covers syntax only.** `ClusterType.isValidCoordinate`
in `oni-seed-browser-model` is regex-based; it accepts strings the WASM
will still reject as nonsense seeds. Those land in `WasmFailure`.

**`WasmFailure` covers two distinct cases:** Rust panics (a real bug in
WASM or a corrupted build) and "syntactically valid coordinate that the
WASM refuses." We don't try to distinguish; from the caller's point of
view both are "the WASM said no."

### `Routings.kt`

Adds one route. Maps `WorldgenError` to HTTP inline — it's a 10-line
`when`, no separate file.

```kotlin
@Serializable
data class ErrorBody(val code: String, val message: String, val coordinate: String? = null)

fun Application.configureRouting(service: WorldgenService) {
    install(CORS) { /* unchanged from current */ }
    install(ContentNegotiation) { json() }
    routing {
        get("/") { call.respondText("ONI seed contributor $VERSION ...") }
        get("/generate/{coord}") {
            val coord = call.parameters["coord"]!!
            service.generate(coord)
                .onSuccess { call.respondText(it, ContentType.Application.Json) }
                .onFailure { e -> respondWorldgenError(call, e) }
        }
    }
}

private suspend fun respondWorldgenError(call: ApplicationCall, e: Throwable) {
    val (status, body) = when (e) {
        is WorldgenError.InvalidCoordinate -> HttpStatusCode.BadRequest to
            ErrorBody(e.code, e.message!!, e.coord)
        is WorldgenError.Timeout           -> HttpStatusCode.GatewayTimeout to
            ErrorBody(e.code, e.message!!, e.coord)
        is WorldgenError.WasmFailure       -> HttpStatusCode.BadGateway to
            ErrorBody(e.code, e.message!!, e.coord)
        else                               -> HttpStatusCode.InternalServerError to
            ErrorBody("UNEXPECTED", e.message ?: e::class.simpleName.orEmpty())
    }
    call.respond(status, body)
}
```

`respondText(it, ContentType.Application.Json)` ships the raw string from
the WASM directly as the response body — no re-parse, no re-stringify.

### `Application.kt`

```kotlin
fun main() {
    val runtime = JavetWorldgenRuntime()
    val service = WorldgenService(runtime::generate, timeout = envTimeout())

    Runtime.getRuntime().addShutdownHook(Thread { runtime.close() })

    embeddedServer(Netty, port = envPort(), host = "0.0.0.0") {
        configureRouting(service)
    }.start(wait = true)
}

private fun envTimeout() = (System.getenv("WORLDGEN_TIMEOUT_SECONDS")?.toIntOrNull() ?: 30).seconds
private fun envPort()    = System.getenv("WORLDGEN_PORT")?.toIntOrNull() ?: 8080
```

The side-effecting `Worldgen.generate(...)` debug call before
`embeddedServer` in the current code is removed. No `WORLDGEN_RUNTIME_POOL_SIZE`
env var — it would do nothing in v1.

## Data Flow

### Cold start (once)

1. `main()` constructs `JavetWorldgenRuntime()`.
2. Constructor blocks for ~1–3 s while it boots `NodeRuntime`, registers
   the classpath module resolver, runs the bootstrap module, drains
   microtasks, and caches the `__generate` function handle.
3. Ktor binds `:8080`. First request can already be served without
   further warmup.

### Hot path

```
HTTP GET /generate/PRE-C-719330309-0-0-ZB937
   │
   ▼  Ktor coroutine on Netty's IO dispatcher
service.generate(coord)
   │
   ▼  validate (pure regex via ClusterType.isValidCoordinate)
   │  ── invalid ──► Result.failure(InvalidCoordinate) ──► 400
   │  valid
   ▼  withTimeout(30s) {
runtime.generate(coord)
   │  └─ mutex.withLock { generateFn.invokeString(coord) }
   │     • coord is a real V8 string parameter
   │     • the JS function calls worldgen.generate(coord),
   │       deletes typed-array fields, then JSON.stringify
   ▼
String                                            (~tens-to-hundreds of KB)
   │
   ▼  }
Result.success(String)
   │
   ▼  respondText(it, application/json) → 200
```

### Failure branches

- WASM throws (panic; or syntactically valid coord WASM refuses) →
  `JavetException` → `WasmFailure` → **502**.
- Wall-clock > timeout → `TimeoutCancellationException` → `Timeout` → **504**.
- Anything else (programming bug) → catch-all → **500** with code `UNEXPECTED`.

### Concurrency contract

- `WorldgenService.generate` is `suspend` and safe to call from many
  request coroutines simultaneously.
- The mutex inside the runtime serializes V8 access. Today: request N
  waits for request N-1.
- When v2 introduces a pool, the call sites change but the contract
  doesn't. Backpressure beyond OS socket queues is out of scope.

### Timeout interaction: crash and restart

`withTimeout` cancels the *coroutine*, not the V8 call. The V8 call
keeps running on its native thread until it returns; while that's in
flight, the mutex is still held. Javet's `terminateExecution()` cannot
interrupt code executing inside the WASM compartment, only JS code
between WASM calls — so there is no in-process way to free the runaway
thread.

Two earlier strategies and why they failed:

- **Poison + rebuild on next acquire** — frees the mutex slot but not
  the thread; rebuild costs another ~1–3 s on top of the 30 s already
  lost; doesn't actually solve anything.
- **Drain the mutex** (just let the slow call finish) — worst case is
  catastrophic: one bad coord runs forever → mutex held forever → every
  subsequent request waits for the lock and times out → service is a
  permanent 504 generator until the container is killed.

**v1 strategy: crash and let the orchestrator restart.** When
`WorldgenService` catches `TimeoutCancellationException`, after building
the `WorldgenError.Timeout` to return, it calls
`kotlin.system.exitProcess(70)` (`70 == EX_SOFTWARE`). The Docker /
k8s `restart: on-failure` policy brings the container back; the new
process re-pays the ~1–3 s cold start and then serves traffic again.

What this trades:

- **Loses:** any other in-flight requests at the moment of timeout are
  dropped. The next `/generate` after restart pays cold-start latency.
  No "graceful degradation."
- **Gains:** the runaway V8 thread dies with the process — CPU is
  actually freed, not just queued behind a dead mutex. Failures show up
  as restart counts an operator can alert on. Honest, observable
  behaviour. Bounded recovery time.

The crash happens *after* the `WorldgenError.Timeout` is propagated up
to the route, so the requesting client still receives a `504` with the
structured error body before the process dies. Any later requests on
the same TCP connection fail; clients retry against the restarted
container.

When v2 introduces a multi-runtime pool, this strategy can soften — a
slow runtime can be killed in isolation while the others keep serving.
That's a bigger change than v1 warrants.

See `docs/DESIGN_DECISION_LOG.md` DD-009/010/011 for the full reasoning
trail.

## Error Handling

### Principle

Errors are values once they cross the `WorldgenService` boundary. The
service catches exception types from its dependencies; outside, only
`Result<String>` (where `failure` carries a `WorldgenError`) flows. The
route maps to HTTP and never sees raw Javet exceptions.

### Variants

| Variant | Triggered by | HTTP | Body `code` | Retryable? |
|---|---|---|---|---|
| `InvalidCoordinate` | regex check on the coordinate fails | 400 | `INVALID_COORDINATE` | No — drop from queue |
| `Timeout` | wall-clock > configured deadline | 504 | `TIMEOUT` | Yes — but mark coord flaky |
| `WasmFailure` | `JavetException`, including JS-side throws, Rust panics, *and* "valid syntax / nonsense seed" | 502 | `WASM_FAILURE` | Maybe — once, then drop |
| (catch-all) | unexpected exception (bug) | 500 | `UNEXPECTED` | No — operator alert |

### Response body

```json
{
  "code": "TIMEOUT",
  "message": "Worldgen exceeded 30s for coordinate 'PRE-C-...-ZB937'",
  "coordinate": "PRE-C-...-ZB937"
}
```

Stable across all error variants. `code` is the machine-readable switch.

### Logging

- `InvalidCoordinate`: INFO. Cheap, expected.
- `Timeout`: WARN with coordinate + duration.
- `WasmFailure`: WARN with coordinate + Javet message; full stack at DEBUG.
- catch-all: ERROR with full stack.

## Testing

### Unit — `WorldgenService` with a fake generator

The service takes a `suspend (String) -> String`, so the test double is
just a lambda — no fake class, no interface. Cases:

- happy path → `WorldgenService { _ -> "{...}" }` → `Result.success("{...}")`
- WASM throws → `WorldgenService { _ -> throw JavetException(...) }` →
  `Result.failure(WasmFailure)`
- runtime blocks → `WorldgenService { delay(60.seconds); "" }` with a
  short timeout → `Result.failure(Timeout)`
- bad coord → service short-circuits, lambda never invoked
  (assert via a counter inside the lambda)

### Integration — real bridge, gated

`JavetWorldgenRuntimeTest` boots a real `JavetWorldgenRuntime`, calls
`generate("PRE-C-719330309-0-0-ZB937")`, and asserts:

- the result is a non-empty JSON string
- the result does **not** contain `"\"0\":"` patterns from typed-array
  serialization (regression guard against the typed-array
  `JSON.stringify` foot-gun — if the JS strip ever stops running before
  stringify, this catches it loudly)
- the result parses successfully via the frontend's actual converter,
  using a tolerant `Json` (the WASM bundle frequently grows fields
  the vendored model doesn't know — strict decoding would false-fail
  on every npm bump):

  ```kotlin
  val tolerantJson = Json { ignoreUnknownKeys = true; isLenient = true }
  val mapData = tolerantJson.decodeFromString<WorldgenMapData>(result)
  val cluster = WorldgenMapDataConverter.convert(mapData, gameVersion = 0)
  assertEquals(coord, cluster.coordinate)
  assertTrue(cluster.asteroids.isNotEmpty())
  ```

  This is the strongest cheap assertion that what we produce matches what
  the rest of the ecosystem consumes. The typed-array leak test (above)
  is what guards the JS strip behaviour; the converter round-trip
  guards structural shape. `WorldgenMapData` and
  `WorldgenMapDataConverter` live in `oni-seed-browser`'s commonMain —
  copy them into `src/test/kotlin/` (they're small) rather than
  introducing a build-time dependency on the frontend module. Mark
  the copies with a comment pinning their source commit and the npm
  package version.

Gated via `org.junit.Assume.assumeTrue(System.getenv("SKIP_WASM_TESTS").isNullOrBlank())`
in a `@Before` so CI on platforms without a Javet native (or where it's
heavy) can opt out by setting the env var. Default `gradle test` runs
them. Simpler than JUnit `@Tag` filtering and works with the `kotlin-test-junit`
(JUnit 4) artifact already in the catalog.

### End-to-end — Ktor route

`testApplication { client.get("/generate/...") }` driving a service backed
by a fake runtime. Confirms route plumbing, CORS, content type, and error
mapping (one each of 400 / 504 / 502 / 500 via fake-induced failures).
No real WASM in the loop.

### Out of scope

WASM correctness (upstream's job), long-running stability/leak tests
(manual pre-deploy), concurrency stress beyond the mutex's serialization
invariant.

### CI

`./gradlew test` runs everything on Linux x86_64 (GH Actions). The
Dockerfile already does `RUN ./gradlew --no-daemon --info test buildFatJar`,
so the integration test runs as part of the image build. Provided the
Linux Javet native is on the classpath — see Operations below.

## Operations

### Javet native libraries

Javet does **not** ship a musl-libc native, so the runtime image must
be glibc-based. The Dockerfile uses `eclipse-temurin:25-jre`
(Debian-slim); do NOT switch back to `:25-jre-alpine` — the JAR will
fail to load `libnode`.

The version catalog declares all three platform natives as
`runtimeOnly`: `javet-node-windows-x86_64` (local dev),
`javet-node-linux-x86_64` and `javet-node-linux-arm64` (Docker target,
CI builds both architectures). All three ship in the fat JAR; only the
matching one is loaded at runtime.

At process start, the runtime logs `V8Host.isLibraryReloadable()` so a
missing-native failure is visible early. The resolved native library
path itself is not exposed by Javet 5.0.6, so the log is best-effort
("library loaded successfully" not "loaded from /path/...").

### Build dependency

The runtime loads `index.js` and `oni_wasm.js` as ES modules via the
registered `IV8ModuleResolver`, reading them as strings from classpath
resources. **No JS toolchain (npm/webpack) is needed** — the prebuilt
files already in `src/main/resources/worldgen/` ship as-is.

### Memory

A warm `NodeRuntime` plus instantiated WASM measures ~150 MB resident at
idle but rises to ~300–500 MB under load (V8 heap growth, transient
buffers from each `generate` call, large per-cell arrays alive within
the JS function before stripping). A 512 MB container is tight; a 1 GB
container is comfortable. The future N-runtime pool will not scale
linearly here either — each runtime has its own V8 heap. Measure before
spec'ing pool size.

### Configuration

Two env vars, read in `Application.kt` via `System.getenv`:

- `WORLDGEN_TIMEOUT_SECONDS` (default `30`)
- `WORLDGEN_PORT` (default `8080`)

No config file. No DI container. No reserved-but-unused vars.

### Shutdown

JVM shutdown hook calls `runtime.close()`. The close holds the runtime
mutex (via `runBlocking`) so an in-flight generate finishes before the
V8 handle is released — without this, a concurrent close + generate
would free the native handle out from under a running call. The wait
is bounded by `withTimeout(3.seconds)` so the
exitProcess(70)-on-timeout path (DD-011) doesn't deadlock the shutdown
hook indefinitely if the runaway native call is the very thing the
mutex is held by. After the timeout, the orchestrator's force-kill is
the backstop.

### Observability v1

`println`-style logging is the standing convention (matches sibling
`oni-seed-browser-backend`'s house style). Per-request log line with
coord, outcome, and duration ms is implemented in `Routings.kt`. The
catch-all 500 path logs the full throwable to stderr. Cold start
emits `[INIT] Javet native: reloadable=...` so a missing-native
failure is visible early. No structured logging or metrics endpoint
in v1; bolt on later via `ktor-server-metrics-micrometer` if needed.

## Migration from current code

- `Worldgen.kt` → renamed and rewritten as `JavetWorldgenRuntime.kt`. The
  `// TODO` block becomes the bootstrap module described above. The
  inline string-concatenated post-strip is gone — it's the JS function
  installed at boot.
- `Application.kt` loses the side-effecting `Worldgen.generate(...)`
  debug call before `embeddedServer`. Gains composition wiring and the
  shutdown hook.
- `Routings.kt` gains `/generate/{coord}` and `respondWorldgenError`,
  and now takes `WorldgenService` as a parameter.
- `WorldgenService.kt` is new.
- No new packages. Files stay flat in `src/main/kotlin/` to match
  `oni-seed-browser-backend`'s house style.

## Final file map

```
src/main/kotlin/
    Application.kt
    Routings.kt
    WorldgenService.kt
    JavetWorldgenRuntime.kt
src/main/resources/
    logback.xml
    worldgen/                 (unchanged: index.js, oni_wasm.js, oni_wasm_bg.wasm, ...)
src/test/kotlin/
    WorldgenServiceTest.kt
    RoutingsTest.kt
    JavetWorldgenRuntimeTest.kt        (gated by SKIP_WASM_TESTS env var)
    WorldgenModels.kt                  (vendored verbatim from oni-seed-browser)
    WorldgenMapDataConverter.kt        (vendored verbatim from oni-seed-browser)
src/test/resources/
    sample.json               (unchanged)
```

Four files under `src/main/kotlin/`, five test files (three of ours
plus the two vendored). No interfaces, no sealed `Result` wrapper, no
`ErrorMapping`/`JsBridge`/`Postprocessor` files, no DI container.
