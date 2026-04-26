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
        // Access-Control-Allow-Origin is a *response* header set by the
        // server; only request headers belong in allowHeader().
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
            val started = System.currentTimeMillis()
            service.generate(coord)
                .onSuccess {
                    call.respondText(it, ContentType.Application.Json)
                    println("[OK] $coord (${System.currentTimeMillis() - started}ms)")
                }
                .onFailure { e ->
                    respondWorldgenError(call, e)
                    println("[${(e as? WorldgenError)?.code ?: "UNEXPECTED"}] $coord (${System.currentTimeMillis() - started}ms)")
                }
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
        else -> {
            // Catch-all for unexpected throwables (bugs, V8 native errors,
            // Javet wrappers we didn't anticipate). Log the full detail
            // server-side; do NOT echo e.message to the client — it can
            // contain file paths, internal class names, or other state we
            // don't want to leak.
            System.err.println(
                "[ERROR] Unexpected throwable in worldgen route: " +
                    "${e::class.qualifiedName}: ${e.message}"
            )
            e.printStackTrace(System.err)
            HttpStatusCode.InternalServerError to
                ErrorBody("UNEXPECTED", "An unexpected server error occurred")
        }
    }
    call.respond(status, body)
}
