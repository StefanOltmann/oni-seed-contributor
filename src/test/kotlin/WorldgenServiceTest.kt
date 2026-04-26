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
import com.caoccao.javet.exceptions.JavetError
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
        // JavetException's constructors take a JavetError, not a free String.
        // ExecutionFailure has format "${message}", so the resulting
        // exception.message is exactly "boom".
        val svc = WorldgenService(generator = {
            throw JavetException(
                JavetError.ExecutionFailure,
                mapOf(JavetError.PARAMETER_MESSAGE to "boom")
            )
        })
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
