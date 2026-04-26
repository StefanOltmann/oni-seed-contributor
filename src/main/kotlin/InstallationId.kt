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
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID

/**
 * Mirrors AppStorage.getInstallationId() in oni-seed-browser: a single
 * UUID per installation, persisted across restarts. The Dockerfile
 * declares /data as a VOLUME so the operator's bind-mount or named
 * volume keeps the same ID even if the container is recreated.
 *
 * If the file is missing, mint a fresh UUID and write it; otherwise
 * load the existing one. Whitespace tolerated for hand-edited values.
 */
object InstallationId {
    fun loadOrCreate(path: Path): String {
        if (Files.exists(path)) {
            val existing = Files.readString(path).trim()
            if (existing.isNotEmpty()) return existing
        }
        Files.createDirectories(path.parent ?: Path.of("."))
        val fresh = UUID.randomUUID().toString()
        Files.writeString(path, fresh)
        return fresh
    }
}
