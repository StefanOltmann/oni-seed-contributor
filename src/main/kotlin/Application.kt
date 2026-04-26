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
    // Hard guard: if someone runs the stub by accident (Docker image built
    // from a mid-implementation branch), the process refuses to start. The
    // stub returns 200 OK with plausible-looking JSON, so a silent
    // misdeployment would otherwise be hard to notice.
    check(System.getenv("WORLDGEN_STUB_OK") == "1") {
        "Application.kt is a temporary stub (Task 3 of the implementation plan). " +
            "DO NOT run this in production — Task 6 replaces main(). " +
            "Set WORLDGEN_STUB_OK=1 only in controlled test environments."
    }

    val service = WorldgenService(generator = { """{"stub":"runtime not wired yet"}""" })

    embeddedServer(
        factory = Netty,
        port = 8080,
        host = "0.0.0.0",
    ) { configureRouting(service) }.start(wait = true)
}
