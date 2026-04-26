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
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun fakeJwt(payloadJson: String): String {
    fun b64(s: String) = Base64.getUrlEncoder().withoutPadding().encodeToString(s.toByteArray())
    return "${b64("{\"alg\":\"none\"}")}.${b64(payloadJson)}.signature-not-checked"
}

class SteamAuthTokenTest {

    @Test
    fun `parses sub claim`() {
        val future = System.currentTimeMillis() / 1000 + 3600
        val token = SteamAuthToken.parse(fakeJwt("""{"sub":"76561198000000000","exp":$future}"""))
        assertEquals("76561198000000000", token.steamId)
        assertEquals(future, token.expiresAt)
    }

    @Test
    fun `falls back to steamId claim when sub missing`() {
        val token = SteamAuthToken.parse(fakeJwt("""{"steamId":"76561198000000001"}"""))
        assertEquals("76561198000000001", token.steamId)
        assertNull(token.expiresAt)
    }

    @Test
    fun `rejects malformed token (wrong segment count)`() {
        val e = assertFailsWith<IllegalArgumentException> {
            SteamAuthToken.parse("only.two")
        }
        assertTrue(e.message!!.contains("3 segments"))
    }

    @Test
    fun `rejects token without sub or steamId`() {
        val e = assertFailsWith<IllegalStateException> {
            SteamAuthToken.parse(fakeJwt("""{"foo":"bar"}"""))
        }
        assertTrue(e.message!!.contains("sub"))
    }

    @Test
    fun `rejects expired token`() {
        val past = System.currentTimeMillis() / 1000 - 3600
        val e = assertFailsWith<IllegalArgumentException> {
            SteamAuthToken.parse(fakeJwt("""{"sub":"x","exp":$past}"""))
        }
        assertTrue(e.message!!.contains("expired"))
    }

    @Test
    fun `rejects non-JSON payload`() {
        val token = "${Base64.getUrlEncoder().withoutPadding().encodeToString("{}".toByteArray())}.${
            Base64.getUrlEncoder().withoutPadding().encodeToString("not json".toByteArray())
        }.sig"
        assertFailsWith<IllegalArgumentException> { SteamAuthToken.parse(token) }
    }
}
