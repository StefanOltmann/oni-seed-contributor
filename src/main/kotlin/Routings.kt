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
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing

fun Application.configureRouting() {

    println("[INIT] Starting Server at version $VERSION")

    install(ContentNegotiation) { json() }

    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Get)
        allowHeader(HttpHeaders.ContentType)
        anyHost()
    }

    routing {

        get("/") {
            call.respondText("ONI seed contributor $VERSION")
        }

        /*
         * For debug purposes, return a generated cluster.
         */
        get("/generate/{coordinate}") {

            val coordinate = call.parameters["coordinate"]!!

            val json  = WorldgenRuntime.generate(coordinate)

            val mapData = WorldgenMapData.fromJson(json)

            val cluster = WorldgenMapDataConverter.convert(
                mapData = mapData,
                gameVersion = 42 // FIXME
            )

            call.respond(cluster)
        }

        get("/status") {

            // TODO Report what the ContributorService is doing.
        }

        get("/start") {

            val apiKey: String? = this.call.request.headers["API_KEY"]

            // TODO check API key & start the worldgen
        }

        get("/stop") {

            val apiKey: String? = this.call.request.headers["API_KEY"]

            // TODO check API key & stop the worldgen
        }
    }
}
