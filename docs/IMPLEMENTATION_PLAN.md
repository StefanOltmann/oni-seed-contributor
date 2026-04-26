# ONI Seed Contributor — WASM Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement v1 of the Kotlin/JVM WASM bridge described in `docs/DESIGN.md`. Deliver `GET /generate/{coord}` returning trimmed worldgen JSON, with typed error handling, a single Javet-backed runtime serialized by an internal mutex, and an integration test that round-trips the result through the frontend's actual `WorldgenMapDataConverter`.

**Architecture:** Three layers in flat files (`Application.kt`, `Routings.kt`, `WorldgenService.kt`, `JavetWorldgenRuntime.kt`). `WorldgenService` takes a `suspend (String) -> String` so test doubles are lambdas — no extracted-for-testing interface, no separate `Pool` class. Raw JSON passes through; no typed `Cluster` parsing.

**Tech Stack:** Kotlin 2.3.20 (JVM 25), Ktor 3.4.2 (Netty), Javet 5.0.6 (V8/Node embedding), kotlinx.coroutines 1.10.x, kotlinx.serialization, JUnit 4 (via `kotlin-test-junit`).

---

## Pre-flight: read the design

Before writing any code, read `docs/DESIGN.md` end-to-end. The plan below assumes you have. Especially internalize:

- **Why the return type is raw JSON, not `Cluster`** (the "Why we return raw JSON" section)
- **The bootstrap sequence** (Components → `JavetWorldgenRuntime.kt` → Constructor)
- **The JS strip must run before `JSON.stringify`** (typed-array foot-gun)
- **No poison-and-rebuild on timeout** (Data Flow → Timeout interaction)

If any task in this plan contradicts the design, treat the design as authoritative and flag it.

---

## File map

```
src/main/kotlin/
    Application.kt              MODIFY (composition root, env vars, shutdown hook)
    Routings.kt                 MODIFY (add /generate/{coord} + error mapping)
    WorldgenService.kt          CREATE (sealed WorldgenError + service)
    JavetWorldgenRuntime.kt     CREATE (V8/WASM lifecycle + JS strip constant + mutex)
    Worldgen.kt                 DELETE (replaced by JavetWorldgenRuntime.kt)

src/test/kotlin/
    WorldgenServiceTest.kt      CREATE (lambda fakes; pure JVM, no V8)
    RoutingsTest.kt             CREATE (Ktor testApplication + lambda fake)
    JavetWorldgenRuntimeTest.kt CREATE (real V8; gated via SKIP_WASM_TESTS env)
    WorldgenModels.kt           CREATE (verbatim copy from oni-seed-browser)
    WorldgenMapDataConverter.kt CREATE (verbatim copy from oni-seed-browser)
    WorldgenTest.kt             DELETE (replaced by the three above)

src/test/resources/
    sample.json                 KEEP

build.gradle.kts                MODIFY (none — version catalog drives it)
gradle/libs.versions.toml       MODIFY (add Linux Javet natives, coroutines, ktor test host)
Dockerfile                      MODIFY (switch runtime base off Alpine)
```

---

## Task 1: Add missing dependencies to the version catalog

**Files:**
- Modify: `gradle/libs.versions.toml`
- Modify: `build.gradle.kts`

We need three things the current catalog doesn't have:

- Linux Javet natives (Windows-only today; Docker target is Linux)
- `kotlinx.coroutines.core` for `Mutex`, `withTimeout`, `delay`
- `ktor-server-test-host` and `kotlinx-coroutines-test` for the routing tests

- [ ] **Step 1: Add Javet Linux natives + coroutines + test host to the version catalog**

Edit `gradle/libs.versions.toml`. Add a `kotlinx-coroutines` version under `[versions]`:

```toml
[versions]
kotlin = "2.3.20"
ktor = "3.4.2"
git-versioning = "6.4.4"
logback = "1.4.14"
javet = "5.0.6"
oniSeedBrowserModel = "cc174d2"
kotlinx-coroutines = "1.10.2"
```

Add the following entries under `[libraries]`:

```toml
# Coroutines
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "kotlinx-coroutines" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "kotlinx-coroutines" }

# Javet (additional platform natives — runtime only)
javet-linux-x86_64 = { module = "com.caoccao.javet:javet-node-linux-x86_64", version.ref = "javet" }
javet-linux-arm64  = { module = "com.caoccao.javet:javet-node-linux-arm64",  version.ref = "javet" }

# Ktor server testing
ktor-server-test-host = { module = "io.ktor:ktor-server-test-host", version.ref = "ktor" }
```

- [ ] **Step 2: Reference the new dependencies in `build.gradle.kts`**

Open `build.gradle.kts`. Replace the existing `dependencies { ... }` block with:

```kotlin
dependencies {

    /* Ktor server */
    implementation(libs.bundles.ktor.server)
    implementation(libs.logback.classic)

    /* Ktor client (kept for future contributor wiring) */
    implementation(libs.ktor.client.okhttp)

    /* Coroutines */
    implementation(libs.kotlinx.coroutines.core)

    /* Domain model */
    implementation(libs.oniSeedBrowserModel)

    /* Javet — core + per-platform natives.
     * The Windows native is needed for local dev; the two Linux natives
     * are needed for the Docker image (amd64 + arm64 from CI). All three
     * are runtimeOnly so they don't appear on the compile classpath. */
    implementation(libs.javet.core)
    runtimeOnly(libs.javet.windows)
    runtimeOnly(libs.javet.linux.x86_64)
    runtimeOnly(libs.javet.linux.arm64)

    /* Tests */
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.ktor.server.test.host)
}
```

- [ ] **Step 3: Verify the build still resolves**

Run: `./gradlew --no-daemon dependencies --configuration runtimeClasspath | head -60`
Expected: dependency tree resolves without errors. You should see `javet-node-linux-x86_64`, `javet-node-linux-arm64`, and `kotlinx-coroutines-core` in the tree.

If a Javet Linux artifact 404s on Maven Central, search Maven Central for the correct artifact ID for Javet 5.0.6 — vendor sometimes splits artifacts (e.g. `javet-v8-linux-x86_64`). Adjust the catalog to match. Do not silently switch to a different Javet major.

- [ ] **Step 4: Commit**

```bash
git add gradle/libs.versions.toml build.gradle.kts
git commit -m "Add Linux Javet natives, coroutines, ktor test host"
```

---

## Task 2: Create the WorldgenService and its sealed error type

**Files:**
- Create: `src/main/kotlin/WorldgenService.kt`
- Create: `src/test/kotlin/WorldgenServiceTest.kt`

The service is pure orchestration: validate coordinate syntactically, enforce a wall-clock timeout, call a `suspend (String) -> String` to do the actual work, and translate failures into a sealed `WorldgenError`. No Javet here — that's why we test it first.

- [ ] **Step 1: Write the failing tests**

Create `src/test/kotlin/WorldgenServiceTest.kt`:

```kotlin
import com.caoccao.javet.exceptions.JavetException
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

private const val VALID_COORD   = "PRE-C-719330309-0-0-ZB937"
private const val INVALID_COORD = "definitely not a coordinate"

class WorldgenServiceTest {

    @Test
    fun `happy path returns success`() = runTest {
        val svc = WorldgenService(generator = { """{"ok":true}""" })
        val result = svc.generate(VALID_COORD)
        assertEquals("""{"ok":true}""", result.getOrThrow())
    }

    @Test
    fun `invalid coordinate short-circuits without invoking generator`() = runTest {
        var calls = 0
        val svc = WorldgenService(generator = { calls++; "" })
        val result = svc.generate(INVALID_COORD)
        assertEquals(0, calls)
        val err = result.exceptionOrNull()
        assertIs<WorldgenError.InvalidCoordinate>(err)
        assertEquals(INVALID_COORD, err.coord)
    }

    @Test
    fun `JavetException becomes WasmFailure`() = runTest {
        val svc = WorldgenService(generator = { throw JavetException("boom") })
        val err = svc.generate(VALID_COORD).exceptionOrNull()
        assertIs<WorldgenError.WasmFailure>(err)
        assertEquals(VALID_COORD, err.coord)
        assertTrue(err.message!!.contains("boom"))
    }

    @Test
    fun `slow generator becomes Timeout (and would self-terminate in production)`() = runTest {
        var terminationRequestedFor: String? = null
        val svc = WorldgenService(
            generator = { delay(10.seconds); "never" },
            timeout = 50.milliseconds,
            onTimeout = { coord -> terminationRequestedFor = coord },
        )
        val err = svc.generate(VALID_COORD).exceptionOrNull()
        assertIs<WorldgenError.Timeout>(err)
        assertEquals(VALID_COORD, err.coord)
        assertEquals(50.milliseconds, err.after)
        assertEquals(VALID_COORD, terminationRequestedFor) // production would have exited(70) here
    }

    @Test
    fun `error code strings are stable`() {
        assertEquals("INVALID_COORDINATE", WorldgenError.InvalidCoordinate("x").code)
        assertEquals("WASM_FAILURE",       WorldgenError.WasmFailure("x", null).code)
        assertEquals("TIMEOUT",            WorldgenError.Timeout("x", 1.seconds).code)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew --no-daemon test --tests WorldgenServiceTest`
Expected: compilation FAILURE — `Unresolved reference: WorldgenService` and `WorldgenError`.

- [ ] **Step 3: Create the production source**

Create `src/main/kotlin/WorldgenService.kt`:

```kotlin
import com.caoccao.javet.exceptions.JavetException
import de.stefan_oltmann.oni.model.ClusterType
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

sealed class WorldgenError(val code: String, message: String) : Throwable(message) {

    class InvalidCoordinate(val coord: String) :
        WorldgenError(
            code = "INVALID_COORDINATE",
            message = "Coordinate '$coord' is not syntactically valid",
        )

    class WasmFailure(val coord: String, detail: String?) :
        WorldgenError(
            code = "WASM_FAILURE",
            message = "WASM rejected coordinate '$coord': $detail",
        )

    class Timeout(val coord: String, val after: Duration) :
        WorldgenError(
            code = "TIMEOUT",
            message = "Worldgen exceeded $after for coordinate '$coord'",
        )
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
            // Fire-and-forget: schedule process exit asynchronously so this
            // coroutine can still return the Result.failure to the route,
            // which writes the 504 to the client BEFORE the JVM dies.
            // See docs/DESIGN_DECISION_LOG.md DD-011.
            onTimeout(coord)
            Result.failure(WorldgenError.Timeout(coord, timeout))
        } catch (e: JavetException) {
            Result.failure(WorldgenError.WasmFailure(coord, e.message))
        }
    }
}

/**
 * Default `onTimeout`: spawn a non-daemon thread that waits ~2s for
 * the 504 response to flush, then calls exitProcess(70). The orchestrator
 * (Docker / k8s `restart: on-failure`) brings the container back. The
 * runaway V8 thread is unkillable from in-process; only exit frees its
 * CPU and unjams the mutex. Tests inject a no-op (`onTimeout = { _ -> }`)
 * so the test JVM survives.
 */
private fun scheduleSelfTermination(coord: String) {
    Thread {
        Thread.sleep(2_000)
        System.err.println(
            "[FATAL] Worldgen timeout for '$coord' — exiting (70). Orchestrator should restart."
        )
        kotlin.system.exitProcess(70)
    }.apply {
        isDaemon = false
        name = "worldgen-self-termination"
        start()
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew --no-daemon test --tests WorldgenServiceTest`
Expected: PASS, 5 tests.

If `slow generator becomes Timeout` hangs instead of timing out, you forgot `runTest` (which uses a virtual scheduler) or `withTimeout` is not seeing the test's virtual time. The setup above is correct — use `runTest` + `delay` so virtual time advances, and the real-time `withTimeout(50.ms)` still trips because `delay` consumes virtual time the dispatcher passes through.

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/WorldgenService.kt src/test/kotlin/WorldgenServiceTest.kt
git commit -m "Add WorldgenService with sealed WorldgenError"
```

---

## Task 3: Add the /generate route and error→HTTP mapping

**Files:**
- Modify: `src/main/kotlin/Routings.kt`
- Create: `src/test/kotlin/RoutingsTest.kt`

The route validates nothing itself — it delegates to `WorldgenService` and maps the `Result<String>` to either a `200` with raw JSON or a `4xx/5xx` with a structured `ErrorBody`.

- [ ] **Step 1: Write the failing route tests**

Create `src/test/kotlin/RoutingsTest.kt`:

```kotlin
import com.caoccao.javet.exceptions.JavetException
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

private const val VALID = "PRE-C-719330309-0-0-ZB937"

class RoutingsTest {

    @Test
    fun `200 raw JSON on success`() = testApplication {
        val service = WorldgenService({ """{"hello":"world"}""" }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.OK, response.status)
        // Ktor 3 may emit "application/json" or "application/json; charset=UTF-8".
        assertTrue(response.headers["Content-Type"]!!.startsWith("application/json"))
        assertEquals("""{"hello":"world"}""", response.bodyAsText())
    }

    @Test
    fun `400 on invalid coordinate`() = testApplication {
        val service = WorldgenService({ error("must not be called") }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/generate/not-a-coord")
        assertEquals(HttpStatusCode.BadRequest, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("INVALID_COORDINATE", body["code"]!!.jsonPrimitive.content)
        assertEquals("not-a-coord",        body["coordinate"]!!.jsonPrimitive.content)
    }

    @Test
    fun `502 on WASM failure`() = testApplication {
        val service = WorldgenService({ throw JavetException("rust panic") }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.BadGateway, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("WASM_FAILURE", body["code"]!!.jsonPrimitive.content)
    }

    @Test
    fun `504 on timeout`() = testApplication {
        val service = WorldgenService(
            generator = { delay(10_000); "never" },
            timeout = 50.milliseconds,
            onTimeout = { _ -> /* no-op so the test JVM survives */ },
        )
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.GatewayTimeout, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("TIMEOUT", body["code"]!!.jsonPrimitive.content)
    }

    @Test
    fun `root route serves a version banner`() = testApplication {
        val service = WorldgenService({ "" }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().startsWith("ONI seed contributor"))
    }
}
```

- [ ] **Step 2: Run to confirm compilation failure on `configureRouting(service)`**

Run: `./gradlew --no-daemon test --tests RoutingsTest`
Expected: compile error — current `configureRouting` takes no parameter.

- [ ] **Step 3: Replace the contents of `Routings.kt`**

Open `src/main/kotlin/Routings.kt`. Replace the entire file with:

```kotlin
/*
 * ONI Contribitor service
 * Copyright (C) 2026 Stefan Oltmann
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable

@Serializable
data class ErrorBody(
    val code: String,
    val message: String,
    val coordinate: String? = null,
)

fun Application.configureRouting(service: WorldgenService) {

    println("[INIT] Starting Server at version $VERSION")

    install(ContentNegotiation) { json() }

    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Get)
        allowHeader(HttpHeaders.AccessControlAllowOrigin)
        allowHeader(HttpHeaders.ContentType)
        anyHost()
    }

    routing {

        get("/") {
            call.respondText("ONI seed contributor $VERSION")
        }

        get("/generate/{coord}") {
            // Ktor guarantees {coord} is present (the route wouldn't match
            // otherwise), so !! is safe.
            val coord = call.parameters["coord"]!!
            service.generate(coord)
                .onSuccess { call.respondText(it, ContentType.Application.Json) }
                .onFailure { e -> respondWorldgenError(call, e) }
        }
    }
}

private suspend fun respondWorldgenError(call: ApplicationCall, e: Throwable) {
    val (status, body) = when (e) {
        is WorldgenError.InvalidCoordinate ->
            HttpStatusCode.BadRequest to ErrorBody(e.code, e.message!!, e.coord)
        is WorldgenError.Timeout ->
            HttpStatusCode.GatewayTimeout to ErrorBody(e.code, e.message!!, e.coord)
        is WorldgenError.WasmFailure ->
            HttpStatusCode.BadGateway to ErrorBody(e.code, e.message!!, e.coord)
        else ->
            HttpStatusCode.InternalServerError to
                ErrorBody("UNEXPECTED", e.message ?: e::class.simpleName.orEmpty())
    }
    call.respond(status, body)
}
```

Note: this file no longer uses `httpClient`, `kotlin.uuid.Uuid`,
`kotlin.time.Clock`, or `ExperimentalSerializationApi` — those were left
over from the earlier scaffold. Drop them entirely (the `/` route's
uptime banner is replaced by a plain version banner per design).

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew --no-daemon test --tests RoutingsTest`
Expected: PASS, 5 tests.

If you get `Unresolved reference: VERSION`, that constant comes from the
generated `Version.kt` (see `build.gradle.kts:84-92`). Run a build once
to generate it: `./gradlew --no-daemon compileKotlin`.

- [ ] **Step 5: Commit**

```bash
git add src/main/kotlin/Routings.kt src/test/kotlin/RoutingsTest.kt
git commit -m "Add /generate/{coord} route with sealed-error-to-HTTP mapping"
```

---

## Task 4: Vendor the frontend's WorldgenMapData + Converter into test sources

**Files:**
- Create: `src/test/kotlin/WorldgenModels.kt`
- Create: `src/test/kotlin/WorldgenMapDataConverter.kt`

The integration test for `JavetWorldgenRuntime` (next task) round-trips
the WASM output through the same parser + converter the frontend uses.
Those types live in `oni-seed-browser` (frontend) and aren't published
as a library. Copy them verbatim into our test sources rather than
introducing a build-time dependency on the frontend module.

`CoordinateUtil.kt` is intentionally NOT vendored — neither
`WorldgenModels.kt` nor `WorldgenMapDataConverter.kt` references it. If
a later step turns out to need it, vendor it then.

- [ ] **Step 1: Copy the two files from `oni-seed-browser`**

Source paths in the sibling repo:

```
C:/Users/farre/IdeaProjects/oni-seed-browser/app/src/commonMain/kotlin/worldgen/WorldgenModels.kt
C:/Users/farre/IdeaProjects/oni-seed-browser/app/src/commonMain/kotlin/worldgen/WorldgenMapDataConverter.kt
```

Copy each verbatim to:

```
src/test/kotlin/WorldgenModels.kt
src/test/kotlin/WorldgenMapDataConverter.kt
```

The package declaration `package worldgen` stays as-is in the source —
match it. (Yes, the file is in `src/test/kotlin/` but the package is
`worldgen`. Kotlin doesn't require physical and logical layouts to
match; this keeps the verbatim-copy promise honest.)

- [ ] **Step 2: Add a header comment on each file documenting the source**

Prepend each of the two files (immediately after the existing license
header) with:

```kotlin
//
// VENDORED FROM oni-seed-browser (commonMain/worldgen/) — verbatim copy.
// Source repo: https://github.com/StefanOltmann/oni-seed-browser
// Pinned to onimaxxing npm package version 2.0.1
// (matches src/main/resources/worldgen/package.json).
//
// Test-only. If oni-seed-browser-model ever absorbs WorldgenMapData,
// delete these copies and switch to that dependency.
//
```

- [ ] **Step 3: Verify the test sources compile**

Run: `./gradlew --no-daemon compileTestKotlin`
Expected: success.

If a `Cluster`/`Asteroid`/`GeyserType`/etc. import doesn't resolve, those types come from `oni-seed-browser-model` (already in dependencies, version `cc174d2`). If something fails to resolve there, check whether the frontend pins a newer model commit — see `oni-seed-browser/gradle/libs.versions.toml` and update our `oniSeedBrowserModel` version to match.

- [ ] **Step 4: Commit**

```bash
git add src/test/kotlin/WorldgenModels.kt src/test/kotlin/WorldgenMapDataConverter.kt
git commit -m "Vendor WorldgenMapData + Converter from oni-seed-browser into test sources"
```

---

## Task 5: Implement JavetWorldgenRuntime (the V8/WASM bridge)

**Files:**
- Create: `src/main/kotlin/JavetWorldgenRuntime.kt`
- Create: `src/test/kotlin/JavetWorldgenRuntimeTest.kt`
- Delete: `src/main/kotlin/Worldgen.kt`
- Delete: `src/test/kotlin/WorldgenTest.kt`

This is the biggest task. It's broken into discrete sub-steps. The
integration test is real — it boots a NodeRuntime and instantiates the
WASM. Set `SKIP_WASM_TESTS=1` to skip on platforms where the Javet
native library isn't available.

- [ ] **Step 1: Write the integration test first (it will fail to compile, then fail to run)**

Create `src/test/kotlin/JavetWorldgenRuntimeTest.kt`:

```kotlin
import kotlinx.coroutines.test.runTest
import org.junit.Assume
import org.junit.Before
import worldgen.WorldgenMapData
import worldgen.WorldgenMapDataConverter
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private const val COORD = "PRE-C-719330309-0-0-ZB937"

class JavetWorldgenRuntimeTest {

    private lateinit var runtime: JavetWorldgenRuntime

    @Before
    fun gateAndBoot() {
        Assume.assumeTrue(
            "Set SKIP_WASM_TESTS=1 to skip; current host has no Javet native or you're skipping intentionally.",
            System.getenv("SKIP_WASM_TESTS").isNullOrBlank()
        )
        runtime = JavetWorldgenRuntime()
    }

    @AfterTest
    fun shutDown() {
        if (::runtime.isInitialized) runtime.close()
    }

    @Test
    fun `generate returns a non-empty JSON string`() = runTest {
        val raw = runtime.generate(COORD)
        assertTrue(raw.isNotBlank(), "expected non-empty JSON")
        assertTrue(raw.startsWith("{"), "expected JSON object, got: ${raw.take(80)}")
    }

    @Test
    fun `result has no typed-array object form leaks`() = runTest {
        // If the JS strip ever runs AFTER JSON.stringify (or stops
        // running at all), per-cell typed arrays serialize as objects:
        // {"0":12,"1":34,...}. Catch that loudly.
        val raw = runtime.generate(COORD)
        assertFalse(
            raw.contains("\"0\":") && raw.contains("\"1\":"),
            "found typed-array object-form artifacts; JS strip likely ran after JSON.stringify"
        )
    }

    @Test
    fun `result round-trips through frontend WorldgenMapDataConverter`() = runTest {
        val raw = runtime.generate(COORD)

        // The vendored WorldgenMapData.fromJson uses ignoreUnknownKeys=false
        // (strict). The WASM bundle frequently grows fields the model doesn't
        // know about — drift between the npm package and the vendored model
        // is expected and not a regression. Use a tolerant decoder for the
        // *structural* round-trip; the typed-array leak test (above) is
        // what guards the strip behaviour.
        val tolerantJson = kotlinx.serialization.json.Json {
            ignoreUnknownKeys = true
            isLenient = true
        }
        val mapData = tolerantJson.decodeFromString(
            kotlinx.serialization.serializer<WorldgenMapData>(),
            raw
        )
        val cluster = WorldgenMapDataConverter.convert(mapData, gameVersion = 0)

        assertEquals(COORD, cluster.coordinate)
        assertTrue(cluster.asteroids.isNotEmpty(), "expected at least one asteroid in cluster")
    }
}
```

- [ ] **Step 2: Confirm it fails to compile (no `JavetWorldgenRuntime` yet)**

Run: `./gradlew --no-daemon test --tests JavetWorldgenRuntimeTest`
Expected: compile error — `Unresolved reference: JavetWorldgenRuntime`.

- [ ] **Step 3: Create the production file**

Create `src/main/kotlin/JavetWorldgenRuntime.kt`:

```kotlin
import com.caoccao.javet.interop.NodeRuntime
import com.caoccao.javet.interop.V8Host
import com.caoccao.javet.values.reference.V8ValueArrayBuffer
import com.caoccao.javet.values.reference.V8ValueFunction
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Owns one V8/Node runtime, the instantiated WASM module, and a cached
 * handle to the JS-side `__generate` function. All `generate` calls are
 * serialized by an internal mutex.
 *
 * Cold-start cost: ~1-3s while the constructor runs. Memory: ~150 MB at
 * idle, 300-500 MB under load.
 */
class JavetWorldgenRuntime : AutoCloseable {

    private val nodeRuntime: NodeRuntime = V8Host.getNodeInstance().createV8Runtime()
    private val generateFn: V8ValueFunction
    private val mutex = Mutex()

    init {
        try {
            // Log resolved native lib path early — if Javet fails to load
            // the platform native (musl/Alpine, missing arm64), this is
            // where the failure is most usefully visible.
            println(
                "[INIT] Javet native: " +
                    "reloadable=${V8Host.getNodeInstance().isLibraryReloadable}"
            )

            // 1. Bind the WASM bytes onto globalThis as a real V8
            //    ArrayBuffer (Javet's globalObject.set(String, ByteArray)
            //    does NOT auto-marshal to a JS BufferSource — passing a
            //    raw ByteArray leaves an opaque Java reference that
            //    `new WebAssembly.Module(...)` rejects).
            val wasmBytes = loadClasspathBytes("worldgen/oni_wasm_bg.wasm")
            nodeRuntime.createV8ValueArrayBuffer(wasmBytes.size).use { buf: V8ValueArrayBuffer ->
                buf.fromBytes(wasmBytes)
                nodeRuntime.globalObject.set("wasmBytes", buf)
            }

            // 2. Resolve `./<name>` ES-module specifiers from classpath.
            //    The resolver fires during the bootstrap module's
            //    compilation, when the bootstrap's `import` statements
            //    are encountered.
            nodeRuntime.setV8ModuleResolver { runtime, name, _ ->
                val basename = name.removePrefix("./")
                val src = loadClasspathString("worldgen/$basename")
                    ?: error("Module '$name' not found at classpath:worldgen/$basename")
                runtime.getExecutor(src)
                    .setResourceName(name)
                    .setModule(true)
                    .compileV8Module()
            }

            // 3. Compile and execute the bootstrap module. We compile
            //    explicitly (rather than relying on the executor's
            //    "compile + execute" shortcut) because the bootstrap uses
            //    top-level `await init(...)`. compileV8Module returns an
            //    IV8Module; executeVoid on the module evaluates it,
            //    leaving a pending Promise on the microtask queue.
            //    The JS strip inside __generate MUST run before
            //    JSON.stringify — otherwise typed-array fields serialize
            //    as {"0":v,"1":v,...} objects instead of being omitted.
            nodeRuntime.getExecutor(BOOTSTRAP_SRC)
                .setResourceName("./bootstrap.mjs")
                .setModule(true)
                .compileV8Module()
                .use { module -> module.executeVoid() }

            // 4. Drain the microtask queue and the Node event loop until
            //    `await init(...)` completes (or fails). Without this,
            //    __generate may not yet be installed on globalThis when
            //    we try to look it up below.
            nodeRuntime.await()

            // If WASM init rejected, the unhandled-rejection signal is
            // our only cue. Surface it as a hard failure.
            check(!nodeRuntime.isDead) {
                "NodeRuntime died during bootstrap (likely WASM init failure)"
            }

            // 5. Cache the `__generate` function so per-call invocation
            //    skips re-resolving the global. If init silently failed,
            //    this get() returns a non-V8ValueFunction and the cast
            //    throws — turning "function is undefined" into a clear
            //    classpath/bootstrap error.
            generateFn = nodeRuntime.globalObject.get("__generate")
                ?: error(
                    "Bootstrap did not install globalThis.__generate — " +
                        "WASM init likely failed silently. Check the WASM " +
                        "bundle and module resolver."
                )
        } catch (t: Throwable) {
            // Constructor failed — release native resources before
            // propagating, otherwise the NodeRuntime leaks.
            try {
                nodeRuntime.setPurgeEventLoopBeforeClose(true)
                nodeRuntime.close()
            } catch (_: Throwable) { /* swallow */ }
            throw t
        }
    }

    /** coord in, trimmed JSON out. Serialized via internal mutex. */
    suspend fun generate(coord: String): String =
        mutex.withLock { generateFn.invokeString(coord) }

    override fun close() {
        try { generateFn.close() } catch (_: Throwable) { /* swallow */ }
        nodeRuntime.setPurgeEventLoopBeforeClose(true)
        nodeRuntime.close()
    }

    private fun loadClasspathBytes(path: String): ByteArray {
        val cl = Thread.currentThread().contextClassLoader
            ?: JavetWorldgenRuntime::class.java.classLoader
        return cl.getResourceAsStream(path)
            ?.use { it.readBytes() }
            ?: error("Classpath resource not found: $path")
    }

    private fun loadClasspathString(path: String): String? {
        val cl = Thread.currentThread().contextClassLoader
            ?: JavetWorldgenRuntime::class.java.classLoader
        return cl.getResourceAsStream(path)
            ?.use { it.readBytes().decodeToString() }
    }
}

/**
 * The bootstrap module + the `__generate` function. Held as a constant
 * because (a) the JS is data, not control flow, and (b) keeping it next
 * to the runtime that loads it makes the relationship obvious.
 *
 * The field-strip list MUST stay in lockstep with the upstream
 * onimaxxing JS: see
 * `oni-seed-browser/app/src/wasmJsMain/resources/worldgen.worker.mjs`
 * for the canonical strip and bump in lockstep when the npm package
 * (`@tigin-backwards/oxygen-not-included-worldgen`) version changes.
 */
private const val BOOTSTRAP_SRC = """
import init, { worldgen } from './index.js';

await init({ module: new WebAssembly.Module(globalThis.wasmBytes) });

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
"""
```

- [ ] **Step 4: Delete the old Worldgen.kt and WorldgenTest.kt**

```bash
rm src/main/kotlin/Worldgen.kt
rm src/test/kotlin/WorldgenTest.kt
```

- [ ] **Step 5: Run the integration test**

Run: `./gradlew --no-daemon test --tests JavetWorldgenRuntimeTest`
Expected: PASS, 3 tests (locally on Windows where the Javet native is available).

If any assertion fails:

- **`generate returns a non-empty JSON string` fails with `JavetCompilationException` or "module not found":** the module resolver isn't finding `./oni_wasm.js` or `./index.js`. Verify those files exist at `src/main/resources/worldgen/` and that `loadClasspathString` builds the path as `worldgen/<basename>` (not `/worldgen/...`).
- **Test fails with "Bootstrap did not install globalThis.__generate":** the bootstrap module compiled but `await init(...)` rejected silently, OR `executeVoid()` returned before the microtask drained. Check that step 4 (`nodeRuntime.await()`) actually ran and that `nodeRuntime.isDead` is false. Wrap the bootstrap's WASM compile in `try { ... } catch (e) { console.error(e); throw e; }` to surface the real reason — Javet pipes JS console output to stderr by default.
- **Test fails with "TypeError: WebAssembly.Module: Argument 0 must be of type ArrayBuffer or Uint8Array":** the `createV8ValueArrayBuffer` + `fromBytes` binding above should prevent this. If it persists, you may be on a Javet build where `set(String, V8Value)` doesn't preserve the binding type — try `globalObject.set("wasmBytes", nodeRuntime.createV8ValueTypedArray(V8ValueReferenceType.Uint8Array, wasmBytes.size).apply { fromBytes(wasmBytes) })` instead.
- **`result round-trips through frontend WorldgenMapDataConverter` fails with "missing field" from kotlinx.serialization:** the WASM bundle has drifted from what `WorldgenMapData` expects (it's `ignoreUnknownKeys = false`). The test below has already been written to use a tolerant Json — but if it still fails, bump the vendored `WorldgenModels.kt` to match the upstream npm package version.

If you can't run the test locally (e.g., Javet native missing), set `SKIP_WASM_TESTS=1` to confirm the assume-skip works, then rely on CI / Docker for actual coverage.

- [ ] **Step 6: Commit**

```bash
git add src/main/kotlin/JavetWorldgenRuntime.kt src/test/kotlin/JavetWorldgenRuntimeTest.kt
git rm src/main/kotlin/Worldgen.kt src/test/kotlin/WorldgenTest.kt
git commit -m "Implement JavetWorldgenRuntime (V8 + WASM bootstrap, mutex, JS strip)"
```

---

## Task 6: Wire the composition root in Application.kt

**Files:**
- Modify: `src/main/kotlin/Application.kt`

The composition root: build the runtime, build the service with the
runtime's `generate` method as the lambda, register a shutdown hook, and
hand the service to `configureRouting`.

- [ ] **Step 1: Replace `Application.kt` contents**

Open `src/main/kotlin/Application.kt`. Replace the entire file with:

```kotlin
/*
 * ONI Contribitor service
 * Copyright (C) 2026 Stefan Oltmann
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import kotlin.time.Duration.Companion.seconds

fun main() {

    val runtime = JavetWorldgenRuntime()
    val service = WorldgenService(
        generator = runtime::generate,
        timeout = (System.getenv("WORLDGEN_TIMEOUT_SECONDS")?.toIntOrNull() ?: 30).seconds,
    )

    Runtime.getRuntime().addShutdownHook(Thread { runtime.close() })

    embeddedServer(
        factory = Netty,
        port = System.getenv("WORLDGEN_PORT")?.toIntOrNull() ?: 8080,
        host = "0.0.0.0",
    ) { configureRouting(service) }.start(wait = true)
}
```

Specifically removed:
- the side-effecting `Worldgen.generate("PRE-C-...")` call before
  `embeddedServer` (debug-only, would crash if WASM init failed and
  prevent the server from binding)
- the parameterless `Application.module()` overload AND the parameterized
  `Application.module(service)` shim — the design inlines
  `configureRouting(service)` directly into `embeddedServer { ... }`

- [ ] **Step 2: Verify build + all tests still pass**

Run: `./gradlew --no-daemon test`
Expected: all tests pass — `WorldgenServiceTest` (5), `RoutingsTest` (5), and `JavetWorldgenRuntimeTest` (3, or skipped via `SKIP_WASM_TESTS=1`).

- [ ] **Step 3: Smoke test the running server (skip if no Javet native locally)**

In one terminal: `./gradlew --no-daemon run`
Wait until you see `Application started`.

In another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
# expect: 200

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/generate/not-a-coord
# expect: 400

curl -s http://localhost:8080/generate/PRE-C-719330309-0-0-ZB937 | head -c 100
# expect: a JSON object starting with {"coordinate":"PRE-C-...
```

Stop the server with Ctrl+C; confirm it exits cleanly within a couple of
seconds (the shutdown hook + `setPurgeEventLoopBeforeClose(true)` should
close the NodeRuntime promptly).

- [ ] **Step 4: Commit**

```bash
git add src/main/kotlin/Application.kt
git commit -m "Wire composition root in Application.kt with env-driven config"
```

---

## Task 7: Switch the Docker runtime base off Alpine

**Files:**
- Modify: `Dockerfile`

Javet does not ship a musl-libc native, so the JAR will fail to load
`libnode` on the current `eclipse-temurin:25-jre-alpine` runtime. Switch
to Debian-slim (`eclipse-temurin:25-jre`).

- [ ] **Step 1: Update the Dockerfile**

Open `Dockerfile`. Change line 13 from:

```dockerfile
FROM --platform=$TARGETPLATFORM eclipse-temurin:25-jre-alpine
```

to:

```dockerfile
FROM --platform=$TARGETPLATFORM eclipse-temurin:25-jre
```

(The build stage `gradle:9-jdk25` is fine as-is; Javet isn't loaded
during build.)

- [ ] **Step 2: Verify locally if Docker is available**

If you have Docker available:

```bash
docker buildx build --platform linux/amd64 -t oni-seed-contributor:dev --load .
docker run --rm -p 8080:8080 oni-seed-contributor:dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
# expect: 200
docker kill $(docker ps -q --filter ancestor=oni-seed-contributor:dev)
```

If Docker isn't available locally, note that GitHub Actions
(`.github/workflows/build.yml`) runs the same `./gradlew test buildFatJar`
inside the build stage, so the integration test (which needs the Javet
native) will run there. The runtime-stage image change won't be exercised
until first deploy — flag this as a manual smoke test for the deploy.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "Switch Docker runtime base off Alpine (Javet needs glibc)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full test run**

Run: `./gradlew --no-daemon clean test`
Expected: PASS. Counts:
- `WorldgenServiceTest`: 5
- `RoutingsTest`: 5
- `JavetWorldgenRuntimeTest`: 3 (or skipped)

- [ ] **Step 2: Confirm the file map matches the design**

Run: `find src -name '*.kt' | sort`
Expected:
```
src/main/kotlin/Application.kt
src/main/kotlin/JavetWorldgenRuntime.kt
src/main/kotlin/Routings.kt
src/main/kotlin/WorldgenService.kt
src/test/kotlin/JavetWorldgenRuntimeTest.kt
src/test/kotlin/RoutingsTest.kt
src/test/kotlin/WorldgenMapDataConverter.kt
src/test/kotlin/WorldgenModels.kt
src/test/kotlin/WorldgenServiceTest.kt
```

No `Worldgen.kt`, no `WorldgenTest.kt`. Four production files in the
flat layout matching `oni-seed-browser-backend`'s house style.

- [ ] **Step 3: Confirm the fat-jar builds**

Run: `./gradlew --no-daemon buildFatJar`
Expected: success. Artifact at `build/libs/*-all.jar`.

- [ ] **Step 4: Sanity check the README matches reality**

Open `README.md`. It currently reads "Docker-based service to run onimaxxing worldgen." That's accurate. No README changes required for v1.

- [ ] **Step 5: Final commit (only if there are loose ends)**

If steps 1-4 pass cleanly with no further changes, no commit is needed —
all the work was committed in the prior tasks. Otherwise, address the
specific issue and commit it focused.

---

## What's deliberately not in this plan

- **Logging upgrade.** Spec mentions per-request log lines; current code
  uses `println`. Out of scope for v1; the `println` style matches the
  existing repo and the sibling backend.
- **Metrics endpoint.** Out of scope.
- **Multi-runtime pool.** Spec describes the v2 path; that's a separate
  plan when traffic justifies it.
- **README updates beyond the existing one-liner.** The owner can write
  the operator-facing README when the service is deployed; nothing the
  implementer needs to predict.
- **Pushing the branch / opening a PR.** The remote was switched to
  `raiscan/oni-seed-contributor` earlier; pushing is the user's call,
  not the implementer's.
