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

// TEMPORARY stub — Tasks 3 and 6 of the implementation plan: the route layer
// (Routings.kt) now requires a WorldgenService, but the real wiring with
// JavetWorldgenRuntime lands in Task 6 once the runtime exists (Task 5).
// In the meantime, a no-op generator keeps the build green so the route
// tests can run. DO NOT ship this — Task 6 replaces the body of main().
fun main() {
    val service = WorldgenService(generator = { """{"stub":"runtime not wired yet"}""" })

    embeddedServer(
        factory = Netty,
        port = 8080,
        host = "0.0.0.0",
    ) { configureRouting(service) }.start(wait = true)
}
