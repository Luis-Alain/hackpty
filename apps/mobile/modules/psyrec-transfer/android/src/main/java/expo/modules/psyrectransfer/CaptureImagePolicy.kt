package expo.modules.psyrectransfer

import java.io.OutputStream

internal class CaptureTooLargeException : IllegalArgumentException("Photo exceeds 8 MiB. Retake with only the note and a plain background. The app will not reduce image detail automatically.")

/** Capture preferences are not claims about the resolution selected by CameraX. */
internal object CaptureImagePolicy {
  const val requestedWidth = 2048
  const val requestedHeight = 1536
  const val cameraJpegQuality = 100
  const val emittedJpegQuality = 100
  const val maxEncodedBytes = 8 * 1024 * 1024
  fun rotatedSize(width: Int, height: Int, degrees: Int): Pair<Int, Int> {
    require(width > 0 && height > 0 && degrees in listOf(0, 90, 180, 270)) { "Invalid capture dimensions or orientation." }
    return if (degrees == 90 || degrees == 270) Pair(height, width) else Pair(width, height)
  }
}

/** Fixed capacity avoids leaving superseded plaintext arrays behind during buffer growth. */
internal class WipingImageBuffer(private val storage: ByteArray = ByteArray(CaptureImagePolicy.maxEncodedBytes)) : OutputStream() {
  private var count = 0
  private var closed = false
  var exceededLimit = false
    private set
  override fun write(value: Int) {
    check(!closed) { "Image buffer is closed." }
    if (count == storage.size) { exceededLimit = true; throw CaptureTooLargeException() }
    storage[count++] = value.toByte()
  }
  override fun write(bytes: ByteArray, offset: Int, length: Int) {
    check(!closed) { "Image buffer is closed." }
    require(offset >= 0 && length >= 0 && offset <= bytes.size - length) { "Invalid image buffer range." }
    if (length > storage.size - count) { exceededLimit = true; throw CaptureTooLargeException() }
    bytes.copyInto(storage, count, offset, offset + length); count += length
  }
  fun copyBytes(): ByteArray {
    check(!closed) { "Image buffer is closed." }
    if (exceededLimit) throw CaptureTooLargeException()
    check(count > 0) { "Camera returned an empty image." }
    return storage.copyOf(count)
  }
  override fun close() { storage.fill(0); count = 0; closed = true }
}
