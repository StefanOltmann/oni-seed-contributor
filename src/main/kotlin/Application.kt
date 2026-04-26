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
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import kotlin.time.Duration.Companion.seconds

fun main() {

    val runtime = JavetWorldgenRuntime()
    val service = WorldgenService(
        generator = runtime::generate,
        timeout = (System.getenv("WORLDGEN_TIMEOUT_SECONDS")?.toIntOrNull() ?: 30).seconds,
    )

    Runtime.getRuntime().addShutdownHook(Thread { runtime.close() })

    embeddedServer(
        factory = Netty,
        port = System.getenv("WORLDGEN_PORT")?.toIntOrNull() ?: 8080,
        host = "0.0.0.0",
    ) { configureRouting(service) }.start(wait = true)
}
