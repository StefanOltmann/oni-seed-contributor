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
import de.stefan_oltmann.oni.model.server.Upload
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import java.io.Closeable

/**
 * Default backend URL — overridden via the MNI_SERVER_URL env var. Matches
 * the constant the oni-seed-browser frontend uses.
 */
const val DEFAULT_MNI_SERVER_URL: String = "https://mni.stefan-oltmann.de"

/**
 * Mod hash stamp. Matches the value the oni-seed-browser frontend
 * sends; bump in lockstep when the WASM npm package version changes.
 */
private const val MOD_HASH: String = "onimaxxing 2.0.1"

/**
 * Posts uploads to {MNI_SERVER_URL}/upload with the same headers and body
 * shape as the oni-seed-browser frontend. Returns the raw HTTP status —
 * the contributor loop is responsible for the back-off / retry policy
 * (matches the in-browser worldgen flow).
 */
class BackendClient(
    serverUrl: String,
    private val token: SteamAuthToken,
    private val installationId: String
) : Closeable {

    private val httpClient: HttpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(
                Json { ignoreUnknownKeys = false }
            )
        }
    }

    private val uploadUrl = "${serverUrl.trimEnd('/')}/upload"

    suspend fun upload(cluster: Cluster): UploadResult {

        val upload = Upload(
            userId = "Steam-${token.steamId}",
            installationId = installationId,
            gameVersion = cluster.gameVersion,
            fileHashes = mapOf("modHash" to MOD_HASH),
            cluster = UploadClusterConverter.convert(cluster),
        )

        val response = try {

            httpClient.post(uploadUrl) {
                header("MNI_TOKEN", token.raw)
                header("MNI_API_KEY_DOCKER", MNI_API_KEY_DOCKER)
                contentType(ContentType.Application.Json)
                setBody(upload)
            }

        } catch (ex: Throwable) {
            /* Connect timeouts, DNS, TLS, etc. — treat as transient. */
            return UploadResult.NetworkFailure(ex)
        }

        val body = if (!response.status.isSuccess())
            runCatching { response.bodyAsText() }.getOrNull()
        else
            null

        return UploadResult.Responded(response.status, body)
    }

    override fun close() = httpClient.close()
}
