# ONI Seed Contributor

![Kotlin](https://img.shields.io/badge/kotlin-2.3.20-blue.svg?logo=kotlin)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![JVM](https://img.shields.io/badge/-JVM-gray.svg?style=flat)
![WASM](https://img.shields.io/badge/-WASM-gray.svg?style=flat)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-gray?&logo=GitHub-Sponsors&logoColor=EA4AAA)](https://github.com/sponsors/StefanOltmann)

Docker-based service that runs the [onimaxxing](https://onimaxxing.com)
worldgen WASM module on the JVM, exposing it over HTTP. Server-side
companion to the in-browser worldgen in
[oni-seed-browser](https://github.com/StefanOltmann/oni-seed-browser).

## API

```
GET /                       → version banner
GET /generate/{coord}       → trimmed worldgen JSON (200) or {code,message,coordinate} error body
```

Errors:

| HTTP | `code`               | when |
|------|----------------------|------|
| 400  | `INVALID_COORDINATE` | coordinate fails the `oni-seed-browser-model` regex |
| 502  | `WASM_FAILURE`       | Rust panic, JS throw, or WASM-rejected coordinate |
| 504  | `TIMEOUT`            | `WORLDGEN_TIMEOUT_SECONDS` exceeded — *the process exits 70 a moment after the 504 is sent; orchestrator restarts it* |
| 500  | `UNEXPECTED`         | unanticipated bug; full stack on stderr, generic message to client |

## Run via Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/stefanoltmann/oni-seed-contributor:latest
curl http://localhost:8080/generate/LUSH-A-867734350-0-0-0
```

A 1 GB memory limit is comfortable; the V8 + WASM heap typically sits
~150 MB at idle and grows to 300–500 MB under load.

### Multi-arch image build (amd64 + arm64)

Docker buildx is required for native multi-arch images:

```bash
docker buildx create --use --name oni-seed-contributor-builder
docker buildx inspect --bootstrap
docker buildx build --platform linux/amd64,linux/arm64 \
  -t your-registry/oni-seed-contributor:latest --push .
```

Notes:

- Multi-arch builds must be pushed to a registry; `--load` only loads a single-arch image locally.
- If you only want one architecture locally, use `--platform linux/amd64` (or `linux/arm64`) with `--load`.
- The runtime base is `eclipse-temurin:25-jre` (Debian-slim). **Do not switch to Alpine** — Javet ships no musl-libc native and the JAR will fail to load `libnode`.

## Run locally (development)

Requirements: a JDK supported by foojay (Gradle auto-downloads JDK 25 on first build).

```bash
./gradlew run                                # boots on :8080
curl http://localhost:8080/generate/LUSH-A-867734350-0-0-0
```

Cold start is ~1–3 s while V8 boots and the WASM is instantiated.
First request after cold start sees that latency; subsequent requests
hit the cached runtime.

## Configuration

Two environment variables, both optional:

| Variable | Default | Notes |
|---|---|---|
| `WORLDGEN_PORT` | `8080` | HTTP listen port |
| `WORLDGEN_TIMEOUT_SECONDS` | `30` | per-request wall-clock; on timeout the process exits with code 70 (see *Failure & restart*) |

## Failure & restart

The WASM call cannot be cancelled in-process — Javet's
`terminateExecution()` doesn't reach code executing inside the WASM
compartment, so a runaway coordinate can't be aborted. To prevent one
slow seed from permanently blocking the runtime mutex, on timeout the
service:

1. Returns the `TIMEOUT` 504 to the requesting client.
2. Schedules a non-daemon thread that sleeps ~2 s (so the response
   flushes), then calls `exitProcess(70)` (`70 == EX_SOFTWARE`).
3. Container orchestrator (Docker `restart: on-failure`, k8s
   `restartPolicy: Always`) brings the container back. ~1–3 s cold
   start, then traffic resumes.

Document this when deploying — the operator should expect occasional
restarts on bad coordinates rather than treat them as crashes.

The full reasoning is in [`docs/DESIGN_DECISION_LOG.md`](docs/DESIGN_DECISION_LOG.md)
DD-009 → DD-011.

## Tests

```bash
./gradlew test                               # 13 tests (5 service + 5 route + 3 V8/WASM)
SKIP_WASM_TESTS=1 ./gradlew test             # 10 tests (skips the V8 integration path)
```

Set `SKIP_WASM_TESTS=1` on platforms where the Javet native isn't
available locally (Alpine without glibc, exotic architectures). CI
runs the full suite as part of the Docker build stage.

## Architecture

Three flat-file layers in `src/main/kotlin/`:

```
Application.kt           composition root
Routings.kt              GET /, GET /generate/{coord}, error→HTTP mapping
WorldgenService.kt       sealed WorldgenError, validate/timeout/classify
JavetWorldgenRuntime.kt  V8/Node + WASM lifecycle, mutex, JS strip
```

The full design is in [`docs/DESIGN.md`](docs/DESIGN.md). Decision
rationale (12 entries, "In the face of X, we elected Y, knowing Z"
format) is in [`docs/DESIGN_DECISION_LOG.md`](docs/DESIGN_DECISION_LOG.md).
The implementation plan that drove this build is in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## License & credits

AGPL-3.0. The bundled WASM module
(`src/main/resources/worldgen/`) is the upstream
`@tigin-backwards/oxygen-not-included-worldgen` v2.0.1 npm package
(MIT). The Kotlin types in `src/test/kotlin/WorldgenModels.kt` and
`WorldgenMapDataConverter.kt` are vendored verbatim from the
[oni-seed-browser](https://github.com/StefanOltmann/oni-seed-browser)
frontend (commonMain) for round-trip parity testing.
