/*
 * DeviceSecurity.kt — "is this phone safe enough for a wallet?"
 * ===============================================================
 *
 * Collects a few signs that the phone's own protections have been switched
 * off. The Signer shows a warning when it finds any (see
 * src/security/deviceChecks.js for the plain-words version). It never blocks
 * you: it's your phone and your decision.
 *
 * WHAT IT LOOKS FOR
 *   - Root: a "su" program in the usual places, or a known rooting app
 *     installed (Magisk, KernelSU, APatch, SuperSU, …). Rooting gives apps full
 *     control of the phone, so harmful apps could read the Signer's memory.
 *   - Test keys: the Android system was built with public test keys, typical
 *     of homemade Android versions.
 *   - Verified boot / bootloader: whether Android's startup check is on and
 *     locked ("green"), locked to a custom system ("yellow"), or switched off
 *     ("orange", an unlocked bootloader).
 *   - Screen lock: whether a PIN, pattern, password or biometric lock is set.
 *
 * AN HONEST LIMIT
 * Rooting tools can hide from apps (Magisk's "DenyList", for example). So a
 * warning means "something is wrong", but NO warning does not prove the phone
 * is safe. That's true for every app that does this kind of check locally,
 * and the Signer says so on screen.
 *
 * Reading "ro.boot.*" values uses Android's normal `getprop` tool. Everything
 * here only reads; nothing is changed and nothing leaves the phone.
 */
package com.raphaelrohner.klvsigner.requests

import android.app.KeyguardManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.util.concurrent.TimeUnit

object DeviceSecurity {

  /** Where a "su" (superuser) program usually sits on a rooted phone. */
  private val SU_PATHS = listOf(
    "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/su", "/su/bin/su",
    "/system/sbin/su", "/vendor/bin/su", "/data/local/su", "/data/local/bin/su",
    "/data/local/xbin/su", "/system/app/Superuser.apk",
  )

  /**
   * Package ids of well-known rooting apps. (They're also listed under
   * <queries> in this module's AndroidManifest.xml; otherwise Android 11+
   * would hide them from us.)
   */
  val ROOT_APPS = listOf(
    "com.topjohnwu.magisk", "io.github.huskydg.magisk", "io.github.vvb2060.magisk",
    "me.weishu.kernelsu", "com.rifsxd.ksunext", "me.bmax.apatch",
    "eu.chainfire.supersu", "com.koushikdutta.superuser", "com.noshufou.android.su",
    "com.thirdparty.superuser", "com.kingroot.kinguser",
  )

  /** Runs all checks. Each value is a plain fact; deviceChecks.js turns them into words. */
  fun check(context: Context): Map<String, Any?> {
    val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return mapOf(
      "suBinary" to SU_PATHS.any { path -> safeExists(path) },
      "testKeys" to (Build.TAGS?.contains("test-keys") == true),
      "rootApps" to ROOT_APPS.filter { pkg -> isInstalled(context.packageManager, pkg) },
      "verifiedBootState" to systemProperty("ro.boot.verifiedbootstate"),
      "flashLocked" to systemProperty("ro.boot.flash.locked"),
      "screenLockSet" to (keyguard?.isDeviceSecure ?: true),
    )
  }

  private fun safeExists(path: String): Boolean = try {
    File(path).exists()
  } catch (e: Exception) {
    false
  }

  private fun isInstalled(pm: PackageManager, pkg: String): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      pm.getPackageInfo(pkg, 0)
    }
    true
  } catch (e: Exception) {
    false
  }

  /** Reads one Android system value with `getprop`. Null if empty or unreadable. */
  private fun systemProperty(key: String): String? = try {
    val process = ProcessBuilder("getprop", key).redirectErrorStream(true).start()
    val output = process.inputStream.bufferedReader().use { it.readText() }.trim()
    process.waitFor(2, TimeUnit.SECONDS)
    output.ifEmpty { null }
  } catch (e: Exception) {
    null
  }
}
