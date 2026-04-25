import de.stefanoltmann.onised.contributor.Worldgen
import kotlin.test.Test
import kotlin.test.assertEquals

class WorldgenTest {

    private val expectedJson = WorldgenTest::class.java.getResourceAsStream("sample.json")!!
        .readAllBytes()
        .decodeToString()

    @Test
    fun testGenerate() {

        val actualJson = Worldgen.generate("PRE-C-719330309-0-0-ZB937")

        println(actualJson)

//        assertEquals(
//            expected = expectedJson,
//            actual = actualJson
//        )
    }
}
