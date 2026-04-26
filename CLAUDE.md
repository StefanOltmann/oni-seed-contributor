# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

The source of truth for what this service does and *why it's shaped
this way* is the `docs/` directory. Read in this order before changing
anything non-trivial:

1. `docs/DESIGN.md` — the v1 architecture (revision 2). Spec, not history.
2. `docs/DESIGN_DECISION_LOG.md` — *why* each design call was made, in
   `"In the face of X, we elected Y, knowing Z"` format. Twelve entries
   (DD-001 → DD-012); superseded decisions are kept and marked.
   **This is append-only. New design calls go at the bottom; never
   rewrite or delete past entries.**
3. `docs/IMPLEMENTATION_PLAN.md` — the TDD-shaped plan that drove the
   v1 build. Mostly historical now (all eight tasks complete), but the
   per-task code blocks and troubleshooting notes are still useful when
   touching the corresponding files.

v1 is shipped: `GET /generate/{coord}` works, 13 tests pass, the
Dockerfile builds. Don't reintroduce a `// TODO` skeleton or treat the
old shape as canonical — that's the previous repo state.

## Project in one paragraph

A Kotlin/JVM Ktor service that exposes Oxygen Not Included worldgen
(implemented in Rust, distributed as a WASM module via the
`@tigin-backwards/oxygen-not-included-worldgen` npm package) over HTTP:
`GET /generate/{coord}` returns trimmed worldgen JSON. Deliberately a
pure-pull WASM-as-a-service — no auth, no queue, no upload. It is the
server-side equivalent of one slice of the
[oni-seed-browser](https://github.com/StefanOltmann/oni-seed-browser)
frontend's existing in-browser WASM run; the rest of the contributor
pipeline (queue, upload, Steam JWT) lives elsewhere.

## Commands

```bash
./gradlew test                                # all 13 tests
./gradlew test --tests WorldgenServiceTest    # single class
./gradlew test --tests RoutingsTest
./gradlew test --tests JavetWorldgenRuntimeTest    # the V8/WASM integration test
SKIP_WASM_TESTS=1 ./gradlew test              # skip the V8 path (Alpine, missing native, etc.)
./gradlew run                                 # boot on :8080 (env: WORLDGEN_PORT, WORLDGEN_TIMEOUT_SECONDS)
./gradlew buildFatJar                         # build/libs/*-all.jar
./gradlew --no-daemon test buildFatJar        # mirrors the Dockerfile build stage
```

JDK 25 is auto-provisioned by foojay-resolver on first build (see
`settings.gradle.kts`). No manual JDK install required.

The shell here is bash on Windows (Git Bash). `find`, `head`, `rm`
work; use forward slashes in paths. PowerShell is also available.

## Architecture

Three layers in flat files (no packages) — matches sibling
`oni-seed-browser-backend`'s house style:

```
src/main/kotlin/
    Application.kt           composition root: build runtime, wire service, shutdown hook
    Routings.kt              GET /, GET /generate/{coord}, sealed-error → HTTP mapping
    WorldgenService.kt       suspend (String) → Result<String>; sealed WorldgenError
                             (catches TimeoutCancellationException → schedules exitProcess(70))
    JavetWorldgenRuntime.kt  V8/Node lifecycle + module resolver + cached __generate function
                             + the JS strip constant (one file, runtime + the JS it loads)

src/test/kotlin/
    WorldgenServiceTest.kt          5 unit tests, lambda fakes
    RoutingsTest.kt                 5 Ktor testApplication tests
    JavetWorldgenRuntimeTest.kt     3 integration tests, real V8 (gated by SKIP_WASM_TESTS)
    WorldgenModels.kt               vendored verbatim from oni-seed-browser
    WorldgenMapDataConverter.kt     vendored verbatim from oni-seed-browser
```

Three sharp seams worth knowing:

- **`WorldgenService` takes a `suspend (String) -> String`, not a class.**
  Production wires `WorldgenService(runtime::generate)`; tests wire
  lambdas. There is no `WorldgenRuntime` interface — by design (DD-007).
- **The runtime serializes V8 access via an internal `Mutex`.** When v2
  needs N runtimes, the change is the wiring at `Application.kt` becoming
  `WorldgenService { coord -> pool.withRuntime { it.generate(coord) } }`
  — service is unchanged.
- **Timeouts crash the process.** Javet's `terminateExecution` cannot
  interrupt code inside the WASM compartment, so a runaway coord can't
  be cancelled. `WorldgenService` calls `kotlin.system.exitProcess(70)`
  on timeout (after a ~2 s delay so the 504 reaches the client). The
  Docker/k8s `restart: on-failure` policy brings the container back.
  See DD-009 → DD-011.

`close()` on `JavetWorldgenRuntime` holds the mutex via `runBlocking`
so an in-flight generate finishes before the V8 handle is released —
without this, a concurrent close would crash the JVM via the native
call. Don't drop that wrap.

## Javet 5.0.6 gotchas (caught the hard way)

These are NOT in Javet's docs and the obvious-looking calls compile
but fail at runtime. Document any new ones you find here.

- **`globalObject.set("name", ByteArray)` does NOT marshal to a JS
  `Uint8Array`/`ArrayBuffer`.** Use
  `nodeRuntime.createV8ValueArrayBuffer(size).also { it.fromBytes(bytes) }`
  and bind that. Otherwise JS sees an opaque Java reference and
  `new WebAssembly.Module(...)` rejects it.
- **`V8ValueFunction.invokeString(arg)` does not exist** — that's the
  `IV8ValueObject` host-call form (`obj.invokeString("methodName", args)`).
  For a cached function reference, use `fn.callString(receiver, arg)`
  with `null` as the receiver.
- **wasm-bindgen web-target `init` takes `{module_or_path: ...}`, NOT
  `{module: ...}`.** Wrong key gets you `undefined`, fallthrough to the
  URL/fetch path, and `TypeError: Invalid URL`. The destructuring is in
  `src/main/resources/worldgen/index.js`.
- **`V8Host.isLibraryReloadable()` is static**, not an instance method
  on `V8Host.getNodeInstance()`.
- **`setPurgeEventLoopBeforeClose(boolean)` does not exist on
  `V8Runtime` in 5.0.6.** Default `close()` is sufficient.
- **`JavetException` takes `JavetError` + a parameter map, not a String.**
  For tests that need to simulate a WASM failure:
  `JavetException(JavetError.ExecutionFailure, mapOf(JavetError.PARAMETER_MESSAGE to "boom"))`
  produces an exception whose `message` is `"boom"`.

## Other gotchas to know upfront

- **JS strip MUST run before `JSON.stringify`.** The WASM returns objects
  with `Uint16Array`/`Float32Array`/etc. typed-array fields; if you
  stringify before deleting them, they serialize as `{"0":v,"1":v,...}`
  objects rather than being omitted. The integration test guards this
  with a `raw.contains("\"0\":")` regression check. The strip-list in
  `BOOTSTRAP_SRC` (bottom of `JavetWorldgenRuntime.kt`) MUST stay in
  lockstep with the upstream
  `oni-seed-browser/app/src/wasmJsMain/resources/worldgen.worker.mjs`
  when the npm package version changes.
- **The return type is raw JSON, not `Cluster`.**
  `oni-seed-browser-model`'s `Cluster` is a *post-upload* shape
  requiring uploader metadata this service can't supply. Frontend
  goes `WASM → WorldgenMapData → WorldgenMapDataConverter → Cluster`
  in two stages; we don't re-implement either step here. The
  integration test round-trips through the vendored converter as proof
  we produce ecosystem-shaped bytes. See DD-006.
- **Javet does not ship a musl-libc native.** The runtime image must be
  Debian-slim (`eclipse-temurin:25-jre`), not Alpine. The Linux x86_64
  and arm64 Javet natives must be on the classpath as `runtimeOnly`.
- **Node modules load via `IV8ModuleResolver` reading from classpath,
  not the filesystem.** No npm/webpack at build time; the prebuilt
  `worldgen/index.js`, `oni_wasm.js`, `oni_wasm_bg.wasm` ship as
  classpath resources.
- **Cold start is ~1–3 s** (V8 + WASM instantiation). The runtime is
  built eagerly at `main()` startup, not lazily on first request, so
  `./gradlew run` blocks until it's ready before binding `:8080`.

## Ecosystem context

Sibling repos that this service interacts with conceptually (none are
build-time dependencies; all live in the same `IdeaProjects/` parent
directory):

| Repo | Role |
|---|---|
| `oni-seed-browser-backend` | Storage, queue, upload, dedup, Steam JWT verification. Routes: `POST /upload`, `POST /request-coordinate`, `POST /requested-coordinate`, `POST /report-worldgen-failure`. |
| `oni-seed-browser` | Compose Multiplatform frontend. `service/DefaultWebClient.kt:332` already does in-browser WASM run + `POST /upload` with the user's Steam JWT and the `"onimaxxing 2.0.1"` mod-hash stamp. This service is the server-side equivalent of just the WASM-run portion. |
| `oni-seed-browser-model` | Shared model types (build dep at version `cc174d2`). The post-upload `Cluster` lives here; the intermediate `WorldgenMapData` does not (it's frontend-only and gets vendored into our test sources). |

The owner runs the deployed stack as Docker images on a VPS:
`steam-login-helper`, `oni-seed-browser-backend`, `oni-seed-browser`,
plus this contributor service. The contributor service does not call
any of the others; a future "container for map collection" (the
orchestrator the owner mentioned) will sit between this service and
the backend.

## Deploy & CI

The GitHub Actions workflow at `.github/workflows/build.yml` builds
multi-arch (amd64 + arm64) and pushes to
`ghcr.io/stefanoltmann/oni-seed-contributor:latest` on every push to
`main`. If you're working on a fork without write access to that GHCR
namespace, the workflow will fail; either disable it on the fork via
the Actions tab or rewrite the tag in `build.yml`.
