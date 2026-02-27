package com.anonymous.androMolt.agent

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.google.gson.Gson
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

data class TestStep(
    val step: Int,
    val action: String,
    val params: String,
    val reasoning: String,
    val outcome: String,
    val passed: Boolean
)

data class TestRun(
    val id: String = UUID.randomUUID().toString(),
    val goal: String,
    val targetApp: String?,
    val timestamp: String,
    val overallPassed: Boolean,
    val totalSteps: Int,
    val passedSteps: Int,
    val failedSteps: Int,
    val steps: List<TestStep>,
    val summary: String
)

object QaReportWriter {
    fun write(context: Context, testRun: TestRun): String {
        val gson = Gson()
        val json = gson.toJson(testRun)
        val ts = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val filename = "qa_report_$ts.json"

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, filename)
                put(MediaStore.Downloads.MIME_TYPE, "application/json")
                put(MediaStore.Downloads.RELATIVE_PATH, "Download/AndroMolt")
            }
            val uri = context.contentResolver.insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
            ) ?: return "error:insert_failed"
            
            val stream = context.contentResolver.openOutputStream(uri)
            if (stream == null) {
                context.contentResolver.delete(uri, null, null)
                return "error:open_stream_failed"
            }
            stream.use { it.write(json.toByteArray()) }
            "Download/AndroMolt/$filename"
        } else {
            try {
                val dir = File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "AndroMolt"
                ).also { it.mkdirs() }
                
                File(dir, filename).writeText(json)
                "Download/AndroMolt/$filename"
            } catch (e: Exception) {
                "error:write_failed"
            }
        }
    }
}
