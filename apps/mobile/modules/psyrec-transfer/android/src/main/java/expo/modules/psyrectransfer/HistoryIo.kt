package expo.modules.psyrectransfer

import java.io.InputStream

internal object HistoryIo {
  fun readLimited(input: InputStream, limit: Int): ByteArray {
    require(limit >= 0)
    val buffer = ByteArray(limit + 1)
    val chunk = ByteArray(8192)
    var count = 0
    try {
      while (count <= limit) {
        val read = input.read(chunk, 0, minOf(chunk.size, limit + 1 - count))
        if (read < 0) break
        if (read == 0) throw java.io.IOException("History stream made no progress.")
        chunk.copyInto(buffer, count, 0, read)
        count += read
      }
      require(count <= limit) { "History file exceeds size limit." }
      return buffer.copyOf(count)
    } finally { chunk.fill(0); buffer.fill(0) }
  }
}
