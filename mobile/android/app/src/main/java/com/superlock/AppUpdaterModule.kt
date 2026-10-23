package com.superlock

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

// In-app updater for the sideloaded APK: reports the installed version, downloads
// a release APK via the system DownloadManager, and hands it to the package
// installer. Android always shows the installer's confirmation UI — there is no
// silent replace for a non-device-owner app.
class AppUpdaterModule(private val reactCtx: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactCtx) {

  override fun getName() = "AppUpdater"

  private val dm: DownloadManager
    get() = reactCtx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  @ReactMethod
  fun getVersionInfo(promise: Promise) {
    try {
      val pm = reactCtx.packageManager
      val pkg = reactCtx.packageName
      val info = pm.getPackageInfo(pkg, 0)
      val code =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
          else @Suppress("DEPRECATION") info.versionCode.toLong()
      val map = Arguments.createMap()
      map.putString("versionName", info.versionName ?: "")
      map.putDouble("versionCode", code.toDouble())
      map.putString("packageName", pkg)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("version_info_failed", e)
    }
  }

  @ReactMethod
  fun canInstallPackages(promise: Promise) {
    val ok =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            reactCtx.packageManager.canRequestPackageInstalls()
        else true
    promise.resolve(ok)
  }

  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent =
            Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + reactCtx.packageName))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactCtx.startActivity(intent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("open_settings_failed", e)
    }
  }

  @ReactMethod
  fun downloadApk(url: String, versionLabel: String, promise: Promise) {
    try {
      val fileName = "super-lock-$versionLabel.apk"
      // Clear any stale copy so the installer never picks up a half-written file.
      File(reactCtx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName).delete()

      val req =
          DownloadManager.Request(Uri.parse(url))
              .setTitle("Super Lock $versionLabel")
              .setDescription("Downloading update")
              .setMimeType("application/vnd.android.package-archive")
              .setAllowedOverMetered(true)
              .setAllowedOverRoaming(true)
              .setNotificationVisibility(
                  DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
              .setDestinationInExternalFilesDir(
                  reactCtx, Environment.DIRECTORY_DOWNLOADS, fileName)

      val id = dm.enqueue(req)
      trackDownload(id, fileName, promise)
    } catch (e: Exception) {
      promise.reject("download_failed", e)
    }
  }

  // Poll the download row until it settles, emitting AppUpdaterProgress events so
  // JS can render a percentage, then settle the promise from the final status.
  // Polling instead of waiting on ACTION_DOWNLOAD_COMPLETE means a missed
  // broadcast can't leave the update hanging forever.
  private fun trackDownload(id: Long, fileName: String, promise: Promise) {
    val handler = Handler(Looper.getMainLooper())
    val poll =
        object : Runnable {
          override fun run() {
            val q = DownloadManager.Query().setFilterById(id)
            val cur = dm.query(q)
            if (cur == null) {
              promise.reject("download_failed", "download row missing")
              return
            }
            cur.use {
              if (!it.moveToFirst()) {
                promise.reject("download_failed", "download was cancelled")
                return
              }
              val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
              val reason = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
              val bytes =
                  it.getLong(
                      it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
              val total =
                  it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
              when (status) {
                DownloadManager.STATUS_SUCCESSFUL -> {
                  emitProgress(total, total, null)
                  val local =
                      File(reactCtx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
                          .absolutePath
                  promise.resolve(local)
                  return
                }
                DownloadManager.STATUS_FAILED -> {
                  promise.reject("download_failed", "download failed (reason=$reason)")
                  return
                }
                DownloadManager.STATUS_PAUSED -> emitProgress(bytes, total, pausedReason(reason))
                else -> emitProgress(bytes, total, null)
              }
            }
            handler.postDelayed(this, 400)
          }
        }
    handler.post(poll)
  }

  private fun pausedReason(reason: Int) =
      when (reason) {
        DownloadManager.PAUSED_WAITING_FOR_NETWORK -> "waiting for network"
        DownloadManager.PAUSED_QUEUED_FOR_WIFI -> "waiting for Wi-Fi"
        DownloadManager.PAUSED_WAITING_TO_RETRY -> "retrying"
        else -> "paused"
      }

  private fun emitProgress(bytes: Long, total: Long, paused: String?) {
    val map: WritableMap = Arguments.createMap()
    map.putDouble("bytesDownloaded", bytes.toDouble())
    map.putDouble("bytesTotal", total.toDouble())
    if (paused != null) map.putString("paused", paused) else map.putNull("paused")
    reactCtx
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("AppUpdaterProgress", map)
  }

  @ReactMethod
  fun installApk(path: String, promise: Promise) {
    try {
      val file = File(path)
      val uri =
          FileProvider.getUriForFile(reactCtx, reactCtx.packageName + ".updateprovider", file)
      val intent =
          Intent(Intent.ACTION_VIEW)
              .setDataAndType(uri, "application/vnd.android.package-archive")
              .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactCtx.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("install_failed", e)
    }
  }

  // Needed for NativeEventEmitter on the JS side (no-op listener bookkeeping).
  @ReactMethod fun addListener(eventName: String) {}

  @ReactMethod fun removeListeners(count: Int) {}
}
