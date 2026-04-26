import com.caoccao.javet.exceptions.JavetError
import com.caoccao.javet.exceptions.JavetException
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

private const val VALID = "PRE-C-719330309-0-0-ZB937"

class RoutingsTest {

    @Test
    fun `200 raw JSON on success`() = testApplication {
        val service = WorldgenService({ """{"hello":"world"}""" }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.OK, response.status)
        // Ktor 3 may emit "application/json" or "application/json; charset=UTF-8".
        assertTrue(response.headers["Content-Type"]!!.startsWith("application/json"))
        assertEquals("""{"hello":"world"}""", response.bodyAsText())
    }

    @Test
    fun `400 on invalid coordinate`() = testApplication {
        val service = WorldgenService({ error("must not be called") }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/generate/not-a-coord")
        assertEquals(HttpStatusCode.BadRequest, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("INVALID_COORDINATE", body["code"]!!.jsonPrimitive.content)
        assertEquals("not-a-coord",        body["coordinate"]!!.jsonPrimitive.content)
    }

    @Test
    fun `502 on WASM failure`() = testApplication {
        val service = WorldgenService({
            throw JavetException(
                JavetError.ExecutionFailure,
                mapOf(JavetError.PARAMETER_MESSAGE to "rust panic")
            )
        }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.BadGateway, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("WASM_FAILURE", body["code"]!!.jsonPrimitive.content)
    }

    @Test
    fun `504 on timeout`() = testApplication {
        val service = WorldgenService(
            generator = { delay(10_000); "never" },
            timeout = 50.milliseconds,
            onTimeout = { _ -> /* no-op so the test JVM survives */ },
        )
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.GatewayTimeout, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("TIMEOUT", body["code"]!!.jsonPrimitive.content)
    }

    @Test
    fun `root route serves a version banner`() = testApplication {
        val service = WorldgenService({ "" }, timeout = 5.seconds)
        application { configureRouting(service) }

        val response = client.get("/")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().startsWith("ONI seed contributor"))
    }

    @Test
    fun `500 on unexpected throwable does not leak the message`() = testApplication {
        // Anything that's not a WorldgenError + not a JavetException
        // falls through to the catch-all branch in respondWorldgenError.
        // The branch must NOT echo e.message (could leak file paths,
        // internal class names) — it should respond with a generic
        // string and log the real detail to stderr.
        val sensitive = "/etc/secret-config password=hunter2"
        val service = WorldgenService(
            generator = { throw IllegalStateException(sensitive) },
            timeout = 5.seconds,
        )
        application { configureRouting(service) }

        val response = client.get("/generate/$VALID")
        assertEquals(HttpStatusCode.InternalServerError, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("UNEXPECTED", body["code"]!!.jsonPrimitive.content)
        val clientMessage = body["message"]!!.jsonPrimitive.content
        assertTrue(
            !clientMessage.contains("secret-config") && !clientMessage.contains("hunter2"),
            "client-facing message must not echo the underlying exception detail; got: $clientMessage"
        )
    }
}
