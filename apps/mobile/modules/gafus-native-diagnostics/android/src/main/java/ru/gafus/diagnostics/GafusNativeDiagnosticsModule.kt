package ru.gafus.diagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/** OS-confirmed exits only. Never read descriptions, traces, PID or memory
 * dumps into JS. Native crashes themselves remain owned by Expo Observe. */
class GafusNativeDiagnosticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GafusNativeDiagnostics")
    AsyncFunction("pending") {
      val context = appContext.reactContext?.applicationContext
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@AsyncFunction emptyList<Map<String, Any>>()
      pending(context)
    }
    AsyncFunction("acknowledge") { ids: List<String> ->
      val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction
      synchronized(lock) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val old = prefs.getString("ack", "")!!.split(",").filter { it.isNotBlank() }
        val safe = ids.take(64).filter { UUID_PATTERN.matches(it) }
        prefs.edit().putString("ack", (old + safe).distinct().takeLast(128).joinToString(",")).commit()
      }
    }
  }

  @android.annotation.TargetApi(30)
  private fun pending(context: Context): List<Map<String, Any>> = synchronized(lock) {
    val pm = context.packageManager
    @Suppress("DEPRECATION")
    val info = pm.getPackageInfo(context.packageName, 0)
    // The OS report does not contain a reliably attributable prior OTA ID.
    // Never attribute a report before the current package's installation/update.
    val now = System.currentTimeMillis()
    val oldest = maxOf(info.lastUpdateTime, now - 7L * 86400000L + 60000L)
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val seed = prefs.getString("seed", null) ?: UUID.randomUUID().toString().also {
      if (!prefs.edit().putString("seed", it).commit()) return emptyList()
    }
    val ack = prefs.getString("ack", "")!!.split(",").toHashSet()
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      ?: return emptyList()
    val records = manager.getHistoricalProcessExitReasons(context.packageName, 0, 32)
    records.filter { it.processName == context.packageName && it.timestamp in oldest..now }
      .mapNotNull { record ->
        val code = when(record.reason) {
          ApplicationExitInfo.REASON_ANR -> "ANDROID_ANR_EXIT"
          ApplicationExitInfo.REASON_LOW_MEMORY -> "ANDROID_LOW_MEMORY_EXIT"
          else -> return@mapNotNull null
        }
        // Stable across repeated reads; no raw device or process identifier exported.
        val id = UUID.nameUUIDFromBytes("$seed:$code:${record.timestamp}".toByteArray(Charsets.UTF_8)).toString()
        if (id in ack) return@mapNotNull null
        mapOf("id" to id, "code" to code, "timestampMs" to record.timestamp.toDouble(),
          "count" to 1, "appVersion" to (info.versionName ?: ""), "build" to info.longVersionCode.toString())
      }.distinctBy { it["id"] }
  }

  companion object {
    private const val PREFS = "gafus_native_diagnostics_v1"
    private val lock = Any()
    private val UUID_PATTERN = Regex("^[a-f0-9-]{36}$")
  }
}
