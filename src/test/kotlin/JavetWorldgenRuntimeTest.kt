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
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private const val COORDINATE = "PRE-C-719330309-0-0-ZB937"

class JavetWorldgenRuntimeTest {

    private val jsonTestData = JavetWorldgenRuntimeTest::class.java.getResourceAsStream("sample.json")!!
        .readAllBytes()
        .decodeToString()

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
    fun testGenerateForSample() = runTest {

        val raw = runtime.generate(COORDINATE) + "\n"

        assertEquals(
            expected = jsonTestData,
            actual = raw
        )
    }
}
