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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.util.Base64

/**
 * A locally validated Steam auth token. The server is the only authority
 * for signature validity — these checks just mirror what oni-seed-browser
 * does before it bothers calling /upload, so a misconfigured contributor
 * fails at startup with an actionable error rather than getting silently
 * rejected by the backend on every request.
 *
 * Validation: must parse as a 3-segment JWT, must carry a `sub` or
 * `steamId` claim, and `exp` (if present) must be in the future.
 */
class SteamAuthToken private constructor(
    val raw: String,
    val steamId: String,
    val expiresAt: Long?,
) {
    companion object {
        fun parse(raw: String): SteamAuthToken {

            val segments = raw.split('.')

            require(segments.size == 3) {
                "MNI_STEAM_AUTH_TOKEN is not a JWT (expected 3 segments, got ${segments.size})"
            }

            val payloadJson = try {
                Base64.getUrlDecoder().decode(padBase64(segments[1])).decodeToString()
            } catch (e: IllegalArgumentException) {
                throw IllegalArgumentException("MNI_STEAM_AUTH_TOKEN payload is not valid base64url", e)
            }

            val claims = try {
                Json.parseToJsonElement(payloadJson) as? JsonObject
                    ?: error("MNI_STEAM_AUTH_TOKEN payload is not a JSON object")
            } catch (e: Exception) {
                throw IllegalArgumentException("MNI_STEAM_AUTH_TOKEN payload is not valid JSON: ${e.message}", e)
            }

            val steamId = claims["sub"]?.jsonPrimitive?.contentOrNull
                ?: claims["steamId"]?.jsonPrimitive?.contentOrNull
                ?: error("MNI_STEAM_AUTH_TOKEN has no 'sub' or 'steamId' claim — backend will reject it")

            val expiresAt = claims["exp"]?.jsonPrimitive?.longOrNull

            if (expiresAt != null) {

                val nowSeconds = System.currentTimeMillis() / 1000

                require(expiresAt > nowSeconds) {
                    "MNI_STEAM_AUTH_TOKEN has already expired (exp=$expiresAt, now=$nowSeconds) — refresh it from the oni-seed-browser frontend"
                }
            }

            return SteamAuthToken(raw, steamId, expiresAt)
        }

        private fun padBase64(s: String): String {
            val pad = (4 - s.length % 4) % 4
            return s + "=".repeat(pad)
        }
    }
}
