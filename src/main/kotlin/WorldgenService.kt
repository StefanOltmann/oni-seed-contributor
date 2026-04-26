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
