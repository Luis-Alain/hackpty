package expo.modules.psyrectransfer

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HistoryJsonTest {
  @Test fun rejectsDuplicateKeys() {
    assertThrows(Exception::class.java) { HistoryJson.parseStrict("""{"a":1,"a":2}""") }
  }

  @Test fun rejectsTrailingGarbage() {
    assertThrows(Exception::class.java) { HistoryJson.parseStrict("""{"a":1} trailing""") }
  }

  @Test fun rejectsMalformed() {
    assertThrows(Exception::class.java) { HistoryJson.parseStrict("""{not json}""") }
  }

  @Test fun rejectsNonObjectRoot() {
    assertThrows(Exception::class.java) { HistoryJson.parseStrict("[1,2]") }
  }

  @Test fun acceptsValidObject() {
    val obj = HistoryJson.parseStrict("""{"version":1,"nested":{"x":true}}""")
    assertEquals(1, obj.getInt("version"))
    assertTrue(obj.getJSONObject("nested").getBoolean("x"))
  }

  @Test fun rejectsMalformedUtf8() {
    val malformed = byteArrayOf(0xC0.toByte(), 0x80.toByte())
    assertThrows(Exception::class.java) { HistoryJson.parseStrict(malformed) }
  }
}
