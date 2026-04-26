# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

This repo is mid-build, not mid-maintain. The source of truth for what
this service does and how it's structured is the `docs/` directory, not
the current state of `src/main/kotlin/`. Read in this order:

1. `docs/DESIGN.md` — the approved v1 architecture (revision 2)
2. `docs/IMPLEMENTATION_PLAN.md` — the TDD-shaped task list to build it
3. `docs/DESIGN_DECISION_LOG.md` — *why* each design call was made, in
   "In the face of X, we elected Y, knowing Z" format. Superseded
   decisions are kept and marked. **Append new decisions, don't rewrite
   old ones.**

`src/main/kotlin/Worldgen.kt` currently contains a `// TODO` where the
WASM bridge should be — the existing skeleton boots Ktor but `/generate`
doesn't exist yet. Do not treat the current code as canonical.

## Project in one paragraph

A Kotlin/JVM Ktor service that exposes Oxygen Not Included worldgen
(implemented in Rust, distributed as a WASM module via the
`@tigin-backwards/oxygen-not-included-worldgen` npm package) over HTTP:
`GET /generate/{coord}` returns trimmed worldgen JSON. The service is
deliberately a pure-pull WASM-as-a-service — no auth, no queue, no
upload. It is the server-side equivalent of one slice of the
`oni-seed-browser` frontend's existing in-browser WASM run; the rest of
the contributor pipeline (queue, upload, Steam JWT) lives elsewhere.

## Commands

```bash
./gradlew test                           # all tests
./gradlew test --tests WorldgenServiceTest    # single class
./gradlew test --tests RoutingsTest
SKIP_WASM_TESTS=1 ./gradlew test         # skip the V8/WASM integration test
                                         #   (use when the Javet native lib
                                         #    isn't available locally)
./gradlew run                            # boot the server on :8080
./gradlew buildFatJar                    # produces build/libs/*-all.jar
./gradlew --no-daemon test buildFatJar   # mirrors the Dockerfile build stage
```

The shell here is bash on Windows (Git Bash). `find`, `head`, `rm`, etc.
work; use forward slashes in paths. PowerShell is also available.

## Architecture

Three layers in flat files (no packages) — matches the sibling
`oni-seed-browser-backend`'s house style:

```
Application.kt           composition root: build runtime, wire service, shutdown hook
Routings.kt              GET /generate/{coord} + GET / + sealed-error → HTTP mapping
WorldgenService.kt       suspend (String) → Result<String>; sealed WorldgenError
                         (catches TimeoutCancellationException → schedules exitProcess(70))
JavetWorldgenRuntime.kt  V8/Node lifecycle + module resolver + cached __generate function
                         + the JS strip constant (one file, runtime + the JS it loads)
```

Three sharp seams worth knowing:

- **`WorldgenService` takes a `suspend (String) -> String`, not a class.**
  Production wires `WorldgenService(runtime::generate)`; tests wire
  lambdas. There is no `WorldgenRuntime` interface — by design (see
  `DESIGN_DECISION_LOG.md` DD-007).
- **The runtime serializes V8 access via an internal `Mutex`.** When v2
  needs N runtimes, the change is the wiring at `Application.kt`
  becoming `WorldgenService { coord -> pool.withRuntime { it.generate(coord) } }`
  — the service is unchanged.
- **Timeouts crash the process.** Javet's `terminateExecution` cannot
  interrupt code inside the WASM compartment, so a runaway coord can't
  be cancelled. `WorldgenService` calls `kotlin.system.exitProcess(70)`
  on timeout (after a brief delay so the 504 reaches the client). The
  Docker/k8s `restart: on-failure` policy brings the container back.
  See DD-009→011 for the reasoning trail.

## Gotchas to know upfront

- **JS strip MUST run before `JSON.stringify`.** The WASM returns objects
  with `Uint16Array`/`Float32Array`/etc. typed-array fields; if you
  stringify before deleting them, they serialize as `{"0":v,"1":v,...}`
  objects rather than being omitted. The integration test guards this
  with a `raw.contains("\"0\":")` regression check.
- **The return type is raw JSON, not `Cluster`.** `oni-seed-browser-model`'s
  `Cluster` is a *post-upload* shape requiring uploader metadata this
  service can't supply. Frontend goes `WASM → WorldgenMapData →
  WorldgenMapDataConverter → Cluster` in two stages; we don't
  re-implement either step here. The integration test round-trips
  through the vendored converter as proof we produce ecosystem-shaped
  bytes. See DD-006.
- **Javet does not ship a musl-libc native.** The runtime image must be
  Debian-slim (`eclipse-temurin:25-jre`), not Alpine. The Linux x86_64
  and arm64 Javet natives must be on the classpath as `runtimeOnly`.
- **Node modules load via `IV8ModuleResolver` reading from classpath,
  not the filesystem.** No npm/webpack at build time; the prebuilt
  `worldgen/index.js`, `oni_wasm.js`, `oni_wasm_bg.wasm` ship as classpath
  resources.
- **`globalObject.set("name", ByteArray)` does NOT marshal to a JS
  `Uint8Array`/`ArrayBuffer`.** Use `nodeRuntime.createV8ValueArrayBuffer(size)
  .also { it.fromBytes(bytes) }` and bind that.

## Ecosystem context

Sibling repos that this service interacts with conceptually (none are
build-time dependencies; all live in the same `IdeaProjects/` parent
directory):

| Repo | Role |
|---|---|
| `oni-seed-browser-backend` | storage, queue, upload, dedup, Steam JWT verification. Routes: `POST /upload`, `POST /request-coordinate`, `POST /requested-coordinate`, `POST /report-worldgen-failure`. |
| `oni-seed-browser` | Compose Multiplatform frontend. `service/DefaultWebClient.kt` already does in-browser WASM run + `POST /upload` with the user's Steam JWT and the `"onimaxxing 2.0.1"` mod-hash stamp. This service is the server-side equivalent of just the WASM-run portion. |
| `oni-seed-browser-model` | Shared model types (already a build dep at version `cc174d2`). The post-upload `Cluster` lives here; the intermediate `WorldgenMapData` does not (it's frontend-only and gets vendored into our test sources). |

The owner runs the deployed stack as Docker images on a VPS:
`steam-login-helper`, `oni-seed-browser-backend`, `oni-seed-browser`, plus
this contributor service. The contributor service does not call any of
the others; a future "container for map collection" (the orchestrator
the owner mentioned) will sit between this service and the backend.

## Git remotes

```
origin    → https://github.com/raiscan/oni-seed-contributor.git    (the user's fork — push here)
upstream  → https://github.com/StefanOltmann/oni-seed-contributor.git  (Stefan's — pull only)
```

The CI workflow at `.github/workflows/build.yml` pushes images to
`ghcr.io/stefanoltmann/oni-seed-contributor:latest`. On the fork it will
fail until either disabled or rewritten to push to
`ghcr.io/raiscan/...`. Do not push to `main` on the fork without checking
with the user first.
