package expo.modules.psyrectransfer

import org.junit.Assert.*
import org.junit.Test

class CaptureImagePolicyTest {
  @Test fun normalizationPreservesPixelCountForAllSupportedOrientations() {
    for (rotation in listOf(0, 90, 180, 270)) {
      val size = CaptureImagePolicy.rotatedSize(2048, 1536, rotation)
      assertEquals(2048 * 1536, size.first * size.second)
      assertEquals(if (rotation == 90 || rotation == 270) Pair(1536, 2048) else Pair(2048, 1536), size)
    }
    assertThrows(IllegalArgumentException::class.java) { CaptureImagePolicy.rotatedSize(2048, 1536, 45) }
    assertThrows(IllegalArgumentException::class.java) { CaptureImagePolicy.rotatedSize(0, 1536, 0) }
  }
  @Test fun overLimitEncodingFailsWithoutDownscalingAndOwnedBytesAreWiped() {
    val storage = ByteArray(8)
    val output = WipingImageBuffer(storage)
    output.write(byteArrayOf(1, 2, 3, 4), 0, 4)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), output.copyBytes())
    assertThrows(CaptureTooLargeException::class.java) { output.write(byteArrayOf(5, 6, 7, 8, 9), 0, 5) }
    assertTrue(output.exceededLimit)
    assertThrows(CaptureTooLargeException::class.java) { output.copyBytes() }
    output.close()
    assertTrue(storage.all { it == 0.toByte() })
    assertThrows(IllegalStateException::class.java) { output.copyBytes() }
  }
  @Test fun exactByteLimitSucceedsWithoutGrowingBuffer() {
    val storage = ByteArray(4)
    WipingImageBuffer(storage).use { output ->
      output.write(byteArrayOf(10, 20, 30, 40), 0, 4)
      assertFalse(output.exceededLimit)
      assertArrayEquals(byteArrayOf(10, 20, 30, 40), output.copyBytes())
    }
    assertTrue(storage.all { it == 0.toByte() })
  }
}
