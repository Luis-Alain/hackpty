package expo.modules.psyrectransfer

import android.util.JsonReader
import android.util.JsonToken
import org.json.JSONArray
import org.json.JSONObject
import java.io.StringReader
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

internal object HistoryJson {
  private const val MAX_DEPTH = 32

  fun parseStrict(source: String): JSONObject = parseString(source)

  fun parseStrict(bytes: ByteArray): JSONObject {
    val decoder = java.nio.charset.Charset.forName("UTF-8").newDecoder()
      .apply {
        onMalformedInput(CodingErrorAction.REPORT)
        onUnmappableCharacter(CodingErrorAction.REPORT)
      }
    val buffer = ByteBuffer.wrap(bytes)
    val chars = decoder.decode(buffer)
    return parseString(chars.toString())
  }

  private fun parseString(source: String): JSONObject {
    StringReader(source).use { stringReader ->
      JsonReader(stringReader).use { reader ->
        reader.isLenient = false
        val value = readValue(reader, 0)
        require(value is JSONObject) { "History payload must be a JSON object." }
        require(reader.peek() == JsonToken.END_DOCUMENT) { "Trailing data after history JSON." }
        return value
      }
    }
  }

  private fun readValue(reader: JsonReader, depth: Int): Any? {
    require(depth <= MAX_DEPTH) { "History JSON depth exceeded." }
    return when (reader.peek()) {
      JsonToken.BEGIN_OBJECT -> readObject(reader, depth + 1)
      JsonToken.BEGIN_ARRAY -> readArray(reader, depth + 1)
      JsonToken.STRING -> reader.nextString()
      JsonToken.NUMBER -> readNumber(reader)
      JsonToken.BOOLEAN -> reader.nextBoolean()
      JsonToken.NULL -> { reader.nextNull(); null }
      else -> throw IllegalStateException("Unexpected JSON token.")
    }
  }

  private fun readObject(reader: JsonReader, depth: Int): JSONObject {
    val obj = JSONObject()
    val names = mutableSetOf<String>()
    reader.beginObject()
    while (reader.hasNext()) {
      val name = reader.nextName()
      require(names.add(name)) { "Duplicate history JSON key." }
      val value = readValue(reader, depth)
      obj.put(name, value ?: JSONObject.NULL)
    }
    reader.endObject()
    return obj
  }

  private fun readArray(reader: JsonReader, depth: Int): JSONArray {
    val arr = JSONArray()
    reader.beginArray()
    while (reader.hasNext()) {
      val value = readValue(reader, depth)
      arr.put(value ?: JSONObject.NULL)
    }
    reader.endArray()
    return arr
  }

  private fun readNumber(reader: JsonReader): Number {
    val d = reader.nextDouble()
    return when {
      d.isFinite() && d == d.toLong().toDouble() && d >= Int.MIN_VALUE && d <= Int.MAX_VALUE -> d.toInt()
      d.isFinite() && d == d.toLong().toDouble() -> d.toLong()
      else -> d
    }
  }
}
