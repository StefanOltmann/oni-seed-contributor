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
