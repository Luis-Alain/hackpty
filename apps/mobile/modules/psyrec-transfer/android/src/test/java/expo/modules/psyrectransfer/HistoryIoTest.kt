package expo.modules.psyrectransfer

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.ByteArrayInputStream

class HistoryIoTest {
  @Test fun readLimitedReturnsDataWithinLimit() {
    val data = "abc".toByteArray(Charsets.UTF_8)
    assertArrayEquals(data, HistoryIo.readLimited(ByteArrayInputStream(data), 10))
  }

  @Test fun readLimitedRejectsDataExceedingLimit() {
    val data = "x".repeat(100).toByteArray(Charsets.UTF_8)
    assertThrows(Exception::class.java) { HistoryIo.readLimited(ByteArrayInputStream(data), 10) }
  }

  @Test fun readLimitedRejectsExactLimitPlusOneByte() {
    val data = ByteArray(11) { 'y'.toByte() }
    assertThrows(Exception::class.java) { HistoryIo.readLimited(ByteArrayInputStream(data), 10) }
  }

  @Test fun readLimitedAcceptsExactLimit() {
    val data = ByteArray(10) { 'z'.toByte() }
    assertArrayEquals(data, HistoryIo.readLimited(ByteArrayInputStream(data), 10))
  }
}
