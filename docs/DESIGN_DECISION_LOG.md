# Design Decision Log

A running record of the deliberate calls made while designing this
service. Each entry follows the same shape:

> **In the face of X, we elected Y, knowing Z.**

— so a future reader can reconstruct *why* a decision is the way it is,
not just *what* it is. Entries are append-only; superseded decisions are
left in place and marked.

---

## DD-001 — Scope: minimal now, extensible later

**In the face of** a wide WASM API surface (`generate_map_data`,
`settle_cluster_advance`, `get_entity_spawners`, settings bundles,
digest, version, etc.) and the owner's stated minimum ("throw in
coordinate, get JSON back. I have everything else"),
**we elected** to ship only `GET /generate/{coord}` for v1,
**knowing** that adding more endpoints later means one method on the
runtime + one route per addition — no upfront design tax for unused
capability, and no risk of locking an immature API contract.

---

## DD-002 — Concurrency: single runtime, mutex-serialized

**In the face of** Javet's `NodeRuntime` being single-threaded and the
WASM module holding a global `CLUSTER_CACHE` (so two parallel calls
would corrupt each other anyway),
**we elected** to use a single `JavetWorldgenRuntime` serialized by an
internal `Mutex` for v1,
**knowing** that throughput is bounded at `1 / generate-time` but that
the design keeps pooling as a localized swap (replace the mutex with a
`Channel<JavetWorldgenRuntime>` of size N) when traffic justifies it.
The owner's note — "we shouldn't write anything that blocks a meaningful
path to multithreading/pooling in the future" — is honoured by the
function-reference DI in DD-007 rather than by upfront pool plumbing.

---

## DD-003 — Contributor pipeline: pure-pull, no outbound

**In the face of** the existing upload protocol requiring a Steam JWT +
mod API key (which a Docker service has neither of) and the owner's
confirmation that "I have everything else" — the frontend
(`oni-seed-browser/app/src/commonMain/kotlin/service/DefaultWebClient.kt:332`)
already runs the same WASM client-side and uploads under the user's
Steam credentials with the `"onimaxxing 2.0.1"` mod-hash stamp,
**we elected** to make the service a pure-pull `GET /generate/{coord}`
with no outbound HTTP, no queue polling, no upload,
**knowing** that any future orchestrator (the planned "container for map
collection" the owner mentioned) will live elsewhere and will reuse the
operator's Steam JWT the same way the browser does today. This service
is the server-side equivalent of one slice of the frontend's flow — the
WASM call itself, nothing more.

---

## DD-004 — Error contract: HTTP status + structured body with stable codes

**In the face of** orchestrators needing to branch on failure type
(drop coord from queue, retry with backoff, alert operator) without
parsing free-form messages,
**we elected** to use plain HTTP status codes plus a structured
`{code, message, coordinate?}` body with a stable enum vocabulary
(`INVALID_COORDINATE → 400`, `TIMEOUT → 504`, `WASM_FAILURE → 502`,
`UNEXPECTED → 500`),
**knowing** that no concrete consumer exists today and the distinction
between `TIMEOUT` and `WASM_FAILURE` may not actually drive different
orchestrator behaviour — but the cost of fixing the contract earlier
than strictly necessary is zero, and the cost of changing it later is
non-zero.

---

## DD-005 — Postprocessing: heavy strip in JS, no Kotlin shaping

**In the face of** WASM output containing megabytes of per-cell
typed-array data (`element_idx`, `mass`, `temperature`,
`disease_idx`/`disease_count`, `pickupables`) that consumers don't need,
and the JNI cost of moving that data into the JVM only to drop it,
**we elected** to perform the entire bulky-field strip in JS before
`JSON.stringify` runs (so the bytes never cross the V8↔JNI boundary in
the first place),
**knowing** that the JS strip list must stay in lockstep with the
upstream `@tigin-backwards/oxygen-not-included-worldgen` npm package and
its frontend twin
(`oni-seed-browser/app/src/wasmJsMain/resources/worldgen.worker.mjs`)
when either changes — a real maintenance burden, but cheaper than the
JNI bandwidth alternative. The strip MUST run before `JSON.stringify`,
otherwise typed-array fields serialize as `{"0":v,"1":v,...}` objects
rather than being omitted.

---

## DD-006 — Return type: raw JSON, no typed model

**In the face of** the temptation to deserialize into
`oni-seed-browser-model.Cluster`, and the discovery that `Cluster` is a
*post-upload* shape (carries `uploaderSteamIdHash`,
`uploaderAuthenticated`, `uploadDate`, compacted `BiomePaths`, bitmask
traits) that the WASM cannot supply, and the frontend reaches via a
two-stage pipeline (`WASM → WorldgenMapData.fromJson(...) →
WorldgenMapDataConverter.convert(...) → Cluster` —
`oni-seed-browser/app/src/commonMain/kotlin/ui/MapGenerationView.kt:158-167`),
**we elected** to return the raw trimmed JSON string verbatim, with no
`kotlinx.serialization` step in the hot path,
**knowing** that this means downstream consumers will reparse — but
they would have anyway, and the alternative would force this service to
synthesize fake uploader metadata it has no business owning. Removes
the entire `Postprocessor` component from earlier drafts.

---

## DD-007 — DI shape: function reference, not extracted interface

**In the face of** needing a test double for `WorldgenService`'s
`generate` dependency, and the standard Kotlin reflex to extract a
`WorldgenRuntime` interface "for testability,"
**we elected** to have `WorldgenService` take a
`suspend (String) -> String` function reference (production wires
`WorldgenService(runtime::generate)`, tests wire
`WorldgenService { coord -> "fake-result" }`),
**knowing** that this avoids speculative interface extraction now and
keeps the future pool swap a one-line wiring change at the composition
root (`WorldgenService { coord -> pool.withRuntime { it.generate(coord) } }`).
Trade: a six-month-later reader sees `runtime::generate` and has to
chase what type `generator: suspend (String) -> String` is — but the
file count saved is real and the call graph stays explicit.

---

## DD-008 — File layout: flat, matches sibling repo

**In the face of** an initial three-package design
(`wasm/` + `worldgen/` + `http/`, ~10 source files including separate
`Pool`, `Result`, `ErrorMapping`, `JsBridge`, `Postprocessor`,
`WorldgenError`, `WorldgenRuntime` interface), and the sibling
`oni-seed-browser-backend` repo's flat layout with top-level functions,
no DI container, no sealed-result wrappers, and `UploadClusterConverter`
as a bare `object`,
**we elected** to collapse to four flat files (`Application.kt`,
`Routings.kt`, `WorldgenService.kt`, `JavetWorldgenRuntime.kt`),
co-locating sealed errors with the service that produces them and the
JS bootstrap constant with the runtime that loads it,
**knowing** that we are matching the owner's house style for
consistency across his ecosystem — and that introducing packages later
is cheap when there's a real reason for them, but introducing them
upfront is hard to take back.

---

## DD-009 — Timeout response (revision 1): poison runtime, rebuild on next acquire

**In the face of** `withTimeout` cancelling the coroutine but not the
underlying V8 native call (Javet's `terminateExecution()` cannot
interrupt code executing inside the WASM compartment),
**we elected** in revision 1 to mark the runtime "poisoned" on timeout
and rebuild it on the next `withRuntime` acquire,
**knowing** that rebuild only frees the mutex slot — not the runaway
thread, which keeps consuming CPU until natural exit — but that this at
least lets unrelated requests proceed.

**Status: superseded by DD-010 (drain) and then by DD-011 (crash).**

---

## DD-010 — Timeout response (revision 2): drain the mutex, no rebuild

**In the face of** revision 1's poison-and-rebuild costing ~1–3 s of
cold-start on the request that follows a timeout (in addition to the
30 s already lost) without solving the underlying "thread keeps running"
problem,
**we elected** in revision 2 to remove the poison logic and let the slow
call drain the mutex naturally,
**knowing** that rebuild was paying a cost without buying anything
useful — but **not** sufficiently considering the worst case (one bad
coord runs forever → mutex held forever → service is a permanent 504
generator until container restart).

**Status: superseded by DD-011.**

---

## DD-011 — Timeout response (revision 3): crash and restart

**In the face of** revision 2's worst case being strictly worse than
revision 1's (one slow seed permanently bricks the process versus one
slow seed costing one cold-start), and the deployment context being
containers managed by Docker/k8s with `restart: on-failure` semantics
already available,
**we elected** to call `kotlin.system.exitProcess(70)` from
`WorldgenService` on `WorldgenError.Timeout` and rely on the
container orchestrator to bring the process back,
**knowing** that this gives up "high availability under timeout" but
trades it for: (a) the runaway V8 thread dies with the process so CPU
is actually released, (b) failures are honest and observable to the
orchestrator (exit code 70 = `EX_SOFTWARE`), (c) 1–3 s of cold-start
downtime is dramatically better than permanent 504s, and (d) the
operator gets a restart count they can alert on. Cost: any in-flight
non-timeout requests are dropped at the same time, and the next
`/generate` on the new process pays the cold-start tax. Acceptable for
v1; revisitable when traffic justifies a multi-runtime pool that can
isolate the slow call.

---

## DD-012 — Health check: deferred, not added in v1

**In the face of** containerized deployments typically needing a
liveness/readiness probe, and the temptation to add `GET /health`
upfront,
**we elected** to ship v1 with only `GET /` returning a 200 + version
banner (already present in the existing skeleton) and treat that as the
liveness signal,
**knowing** that this is sufficient for `restart: on-failure` semantics
but means k8s readiness probes during the 1–3 s cold start may route
traffic to a not-yet-ready process. Operators can add a startup probe
externally (e.g., a `wait-for-it` loop) until a real `/health` that
exercises the runtime is added in a later iteration.

---

*Maintenance note: when a new design decision is made, append a
`DD-NNN` entry. When superseding a prior decision, mark the old entry
"Status: superseded by DD-NNN" rather than deleting — the history is
the value.*
