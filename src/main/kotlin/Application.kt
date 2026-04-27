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
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

@OptIn(ExperimentalUuidApi::class)
fun main() {

    val token = SteamAuthToken.parse(
        System.getenv("MNI_STEAM_AUTH_TOKEN")
            ?: error("Missing MNI_STEAM_AUTH_TOKEN environment variable")
    )

    val installationId = System.getenv("MNI_INSTALLATION_ID")
        ?: error("Missing MNI_API_KEY_BROWSER environment variable (baked into the official image)")

    try {
        Uuid.parse(installationId)
    } catch (_: IllegalArgumentException) {
        error("MNI_INSTALLATION_ID is not a valid UUID: $installationId")
    }

    val controlApiKey: String? = System.getenv("CONTROL_API_KEY")?.takeIf { it.isNotBlank() }
    val autoStart: Boolean = System.getenv("AUTO_START")?.lowercase() != "false"

    val serverUrl = System.getenv("MNI_SERVER_URL")?.takeIf { it.isNotBlank() } ?: DEFAULT_MNI_SERVER_URL

    val additionalDelayMillis = System.getenv("MNI_ADDITIONAL_DELAY_MS")?.takeIf { it.isNotBlank() }?.toIntOrNull() ?: 0

    println("[INIT] Autostart: $autoStart")
    println("[INIT] Server URL: $serverUrl")

    val backendClient = BackendClient(
        serverUrl = serverUrl,
        token = token,
        installationId = installationId
    )

    /*
     * Touching `WorldgenRuntime.version` triggers the (~1-3s) V8/WASM
     * bootstrap and surfaces any startup failure here rather than on
     * the first /generate call. Cache the result so we pass the same
     * value to both the loop and the debug route.
     */
    val gameVersion = WorldgenRuntime.version

    val service = ContributorService(
        uploader = backendClient::upload,
        gameVersion = gameVersion,
        additionalDelayMillis = additionalDelayMillis
    )

    Runtime.getRuntime().addShutdownHook(
        Thread {
            service.shutdown()
            backendClient.close()
            WorldgenRuntime.close()
        }
    )

    if (autoStart) {
        println("[INIT] Auto-starting contributor loop (set AUTO_START=false to disable)")
        service.start()
    } else {
        println("[INIT] AUTO_START=false; waiting for /start with CONTROL_API_KEY")
    }

    val port = System.getenv("WORLDGEN_PORT")?.toIntOrNull() ?: 8080

    embeddedServer(
        factory = Netty,
        port = port,
        host = "0.0.0.0",
    ) { configureRouting(service, controlApiKey, gameVersion) }.start(wait = true)
}
