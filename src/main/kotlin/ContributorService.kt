/*
 * ONI Seed Contributor service
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
import de.stefan_oltmann.oni.model.Cluster
import io.ktor.http.HttpStatusCode
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import java.util.concurrent.atomic.AtomicReference
import kotlin.time.Duration.Companion.milliseconds

/**
 * The headless equivalent of oni-seed-browser's MapGenerationView loop:
 * pick a random coordinate, run the WASM, post the cluster to the
 * backend, react to the response. The throttling rules (delay growth on
 * 429, hard stop above 5s, 30 s back-off on unknown errors) match the
 * frontend exactly so the contributor presents the same load shape to
 * the backend as a browser tab.
 *
 * The work loop is injected (`worldgen`, `uploader`, `nextCoordinate`)
 * so tests can drive the state machine without spinning up V8 or
 * touching the network.
 */
class ContributorService(
    private val uploader: suspend (Cluster) -> UploadResult,
    private val gameVersion: Int,
    private val additionalDelayMillis: Int = 0,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
) {

    private val stateRef = AtomicReference(ContributorState())
    private var job: Job? = null

    fun start(): Boolean {
        synchronized(this) {
            if (job?.isActive == true) return false
            update { it.copy(running = true, startedAt = System.currentTimeMillis(), lastError = null) }
            job = scope.launch { runLoop() }
            return true
        }
    }

    fun stop(): Boolean {
        synchronized(this) {
            val current = job ?: return false
            current.cancel()
            job = null
            update { it.copy(running = false) }
            return true
        }
    }

    /**
     * Wait for any in-flight iteration to finish, then close the
     * underlying scope. Use only at process shutdown.
     */
    fun shutdown() {
        synchronized(this) { job?.cancel() }
        runBlocking { job?.join() }
        scope.coroutineContext[Job]?.cancel()
    }

    fun status(): ContributorState = stateRef.get()

    private suspend fun runLoop() {

        var delayMillis: Int = DEFAULT_DELAY_MS + additionalDelayMillis

        try {

            while (scope.isActive) {

                delay(delayMillis.milliseconds)

                val coordinate = RandomCoordinate.next()

                val cluster = try {

                    val json = WorldgenRuntime.generate(coordinate)

                    val mapData = WorldgenMapData.fromJson(json)

                    WorldgenMapDataConverter.convert(
                        mapData = mapData,
                        gameVersion = gameVersion
                    )

                } catch (ex: CancellationException) {
                    throw ex
                } catch (ex: Throwable) {
                    /*
                     * The WASM occasionally rejects coordinates — same shape
                     * as the browser sees. Mirror its behavior: count as a
                     * failure and move on rather than backing off, since
                     * the next random coord is probably fine.
                     */

                    recordFailure("worldgen", ex, coordinate)

                    update { it.copy(generated = it.generated + 1) }

                    continue
                }

                update { it.copy(generated = it.generated + 1) }

                val result = uploader(cluster)

                when (result) {

                    is UploadResult.NetworkFailure -> {

                        recordFailure("upload-network", result.cause, coordinate)

                        delay(LONG_BACKOFF_MILLIS.milliseconds)
                    }

                    is UploadResult.Responded -> when {

                        result.status.value == HttpStatusCode.Conflict.value -> {

                            /* Coordinate already known to the server. */
                            update {
                                it.copy(
                                    conflicted = it.conflicted + 1,
                                    lastStatus = result.status.toString(),
                                )
                            }
                        }

                        result.status.value == HttpStatusCode.TooManyRequests.value -> {

                            delayMillis += DELAY_STEP_MS

                            update {
                                it.copy(
                                    throttled = it.throttled + 1,
                                    currentDelayMs = delayMillis.toLong(),
                                    lastStatus = result.status.toString(),
                                )
                            }

                            if (delayMillis > MAX_DELAY_MS) {

                                System.err.println(
                                    "[CONTRIBUTOR] Server is under heavy load (delay reached ${delayMillis}ms). Taking a long break."
                                )

                                update { it.copy(lastError = "Throttled past max delay; taking a long break") }

                                /*
                                 * Wait a long time before starting again.
                                 */
                                delay(LONG_PAUSE_MILLIS.milliseconds)

                                /*
                                 * Reset the delay to the default.
                                 */
                                delayMillis = DEFAULT_DELAY_MS + additionalDelayMillis

                            } else {

                                println("[CONTRIBUTOR] Throttled; upload delay is now ${delayMillis}ms")

                                delay(THROTTLE_PAUSE_MILLIS.milliseconds)
                            }
                        }

                        result.status.isSuccess() -> {

                            println("[CONTRIBUTOR] Uploaded: $coordinate")

                            update {
                                it.copy(
                                    uploaded = it.uploaded + 1,
                                    lastStatus = result.status.toString(),
                                    lastError = null,
                                    lastSuccessAt = System.currentTimeMillis(),
                                )
                            }
                        }

                        else -> {

                            val message = "Upload failed: ${result.status} ${result.body}"

                            System.err.println("[CONTRIBUTOR] $message")

                            update {
                                it.copy(
                                    failed = it.failed + 1,
                                    lastStatus = result.status.toString(),
                                    lastError = message,
                                )
                            }

                            delay(LONG_BACKOFF_MILLIS.milliseconds)
                        }
                    }
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            /*
             * Defensive: never let the loop die silently. MapGenerationView
             * restarts itself after a 30s pause; we mirror that by stopping
             * and letting the operator (or a /start call) decide whether to
             * resume — the docker restart policy doesn't help here since the
             * process is still healthy from its perspective.
             */
            recordFailure("loop", e)
        } finally {
            update { it.copy(running = false) }
        }
    }

    private fun recordFailure(stage: String, cause: Throwable, coordinate: String? = null) {

        val location = coordinate?.let { " ($it)" } ?: ""

        val message = "[$stage]$location ${cause::class.simpleName}: ${cause.message}"

        System.err.println("[CONTRIBUTOR] $message")

        update { it.copy(failed = it.failed + 1, lastError = message) }
    }

    private inline fun update(transform: (ContributorState) -> ContributorState) {

        while (true) {

            val current = stateRef.get()

            val next = transform(current)

            if (stateRef.compareAndSet(current, next))
                return
        }
    }

    companion object {

        /*
         * Delays are slightly higher than the browser,
         * because as a server-running task we have more time.
         */

        const val DEFAULT_DELAY_MS: Int = 1000
        const val DELAY_STEP_MS: Int = 500
        const val MAX_DELAY_MS: Int = 60000
        const val THROTTLE_PAUSE_MILLIS: Long = 5_000
        const val LONG_BACKOFF_MILLIS: Long = 60_000
        const val LONG_PAUSE_MILLIS: Long = 60_000 * 60
    }
}

@Serializable
data class ContributorState(
    val running: Boolean = false,
    val generated: Long = 0,
    val uploaded: Long = 0,
    val conflicted: Long = 0,
    val throttled: Long = 0,
    val failed: Long = 0,
    val currentDelayMs: Long = ContributorService.DEFAULT_DELAY_MS.toLong(),
    val lastStatus: String? = null,
    val lastError: String? = null,
    val startedAt: Long? = null,
    val lastSuccessAt: Long? = null,
)


