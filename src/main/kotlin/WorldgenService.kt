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
        } catch (e: Throwable) {
            // Catch-all so generate() upholds the "never throws, always
            // returns Result" contract. The route's respondWorldgenError
            // maps non-WorldgenError throwables to 500/UNEXPECTED with a
            // generic body and logs the real detail to stderr.
            //
            // Catches Throwable (not just Exception) so Errors like
            // OutOfMemoryError become a 500 instead of crashing the
            // request thread silently — they're propagated via Result
            // not swallowed; the orchestrator will see them in stderr.
            Result.failure(e)
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
// Idempotent: the first timeout schedules termination; any further
// timeouts in the ~2s window before exitProcess fires are no-ops, so
// we don't spawn duplicate "worldgen-self-termination" threads or emit
// duplicate FATAL log lines for what is logically one shutdown.
private val terminationScheduled = java.util.concurrent.atomic.AtomicBoolean(false)

private fun scheduleSelfTermination(coord: String) {
    if (!terminationScheduled.compareAndSet(false, true)) return
    Thread {
        // 2s safety margin. The 504 is typically on the wire in <50 ms
        // (Ktor's Netty backend writes synchronously inside `call.respond`),
        // so the long delay is headroom against a temporarily congested
        // write queue or a very slow network. There is no in-process way
        // to *confirm* the response has flushed before we exit; this delay
        // is the entire defense against truncating the 504 in flight.
        Thread.sleep(2_000)
        System.err.println(
            "[FATAL] Worldgen timeout for '$coord' — exiting (70). Orchestrator should restart."
        )
        kotlin.system.exitProcess(70)
    }.apply {
        // isDaemon = false is deliberate: a daemon thread would be killed
        // by the JVM shutdown that exitProcess triggers, defeating the
        // entire point. We need this thread to outlive any pending shutdown.
        isDaemon = false
        name = "worldgen-self-termination"
        start()
    }
}
