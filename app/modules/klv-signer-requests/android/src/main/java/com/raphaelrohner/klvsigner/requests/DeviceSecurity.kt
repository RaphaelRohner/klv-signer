/*
 * DeviceSecurity.kt — "is this phone safe enough for a wallet?"
 * ===============================================================
 *
 * Collects a few signs that the phone's own protections have been switched
 * off. The Signer shows a warning when it finds any (see
 * src/security/deviceChecks.js for the plain-words version). Most are
 * warnings only (your phone, your decision); signs of root, an unlocked
 * bootloader, a failed startup check or an internet permission switch
 * signing off, because then the Signer can't protect the key.
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
 *   - Keyboard: which keyboard app you're typing with, and whether it came with
 *     the phone (or is a well-known one from the Play Store). A keyboard sees
 *     every letter you type, including passwords.
 *   - Accessibility apps: which apps have Android's accessibility access
 *     switched on. That access lets an app read the screen and press buttons,
 *     which is exactly what banking trojans misuse.
 *   (Android shows keyboards and accessibility apps to every app, so no
 *   special permission or <queries> entry is needed for these two.)
 *   - Seal: which signing certificate THIS installed copy carries (Android
 *     reports it; compared with the official one in deviceChecks.js).
 *   - Wallet lock: where Android keeps the key that encrypts the stored
 *     wallet (expo-secure-store's Keystore key): a separate security chip
 *     ("StrongBox"), the phone's secure area ("TEE"), or only software. In
 *     hardware the key can be used but never copied out, so a copy of the
 *     wallet file is useless off this phone.
 *   - Internet: whether THIS copy of the Signer is allowed to use the
 *     internet. The Signer is built without that permission on purpose
 *     (app.json, blockedPermissions), so Android itself stops it from ever
 *     going online. A copy that has it was built wrongly or changed.
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

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.KeyguardManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.view.accessibility.AccessibilityManager
import android.view.inputmethod.InputMethodInfo
import android.view.inputmethod.InputMethodManager
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
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

  /**
   * Well-known keyboards. Counted as trusted when they came with the phone OR
   * were installed from the Play Store (so a look-alike from elsewhere isn't).
   */
  private val KNOWN_KEYBOARDS = listOf(
    "com.google.android.inputmethod.latin",  // Gboard
    "com.samsung.android.honeyboard",        // Samsung Keyboard
    "com.touchtype.swiftkey",                // Microsoft SwiftKey
  )

  private const val PLAY_STORE = "com.android.vending"

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
      "keyboard" to activeKeyboard(context),
      "accessibilityApps" to accessibilityApps(context),
      "internetPermission" to (context.checkSelfPermission(android.Manifest.permission.INTERNET) == PackageManager.PERMISSION_GRANTED),
      "signingCertificates" to ownSigningCertificates(context),
      "keyStorage" to walletKeyStorage(),
      // Android version: from 14 (API 34) the Signer's screens are hidden
      // from accessibility apps that aren't declared tools.
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }

  /**
   * The seal (signing certificate) THIS installed copy of the Signer carries,
   * as Android reports it: SHA-256 fingerprints in capitals, no colons.
   * Compared with the official one in deviceChecks.js. Empty if Android
   * wouldn't say.
   */
  /**
   * The Keystore name ("alias") under which expo-secure-store keeps the key
   * that encrypts everything the Signer stores without fingerprint, the
   * wallet vault included. Taken from expo-secure-store's source
   * (AESEncryptor: "<cipher>:<keychainService>:keystoreUnauthenticated",
   * default keychainService "key_v1"). If a future expo-secure-store renames
   * it, this check answers "none" and Settings shows "Couldn't check" (see
   * DEPENDENCIES.md).
   */
  private const val VAULT_KEY_ALIAS = "AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"

  /** Where that key lives: "strongbox" | "tee" | "secure" | "software" | "none" | "unknown". */
  private fun walletKeyStorage(): String {
    return try {
      val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val key = keyStore.getKey(VAULT_KEY_ALIAS, null) as? SecretKey ?: return "none"
      val info = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
        .getKeySpec(key, KeyInfo::class.java) as KeyInfo
      when (info.securityLevel) { // Android 12+, which the Signer requires
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
        KeyProperties.SECURITY_LEVEL_UNKNOWN_SECURE -> "secure"
        KeyProperties.SECURITY_LEVEL_SOFTWARE -> "software"
        else -> "unknown"
      }
    } catch (e: Exception) {
      "unknown"
    }
  }

  private fun ownSigningCertificates(context: Context): List<String> = try {
    val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
    val signers = info.signingInfo?.apkContentsSigners ?: emptyArray()
    signers.map { sig ->
      MessageDigest.getInstance("SHA-256").digest(sig.toByteArray()).joinToString("") { b -> "%02X".format(b) }
    }
  } catch (e: Exception) {
    emptyList()
  }

  /**
   * The keyboard in use: { package, label, trusted } — or null if Android
   * wouldn't say. trusted = came with the phone, or a known keyboard from Play.
   */
  private fun activeKeyboard(context: Context): Map<String, Any?>? = try {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
    var info: InputMethodInfo? = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      info = imm?.currentInputMethodInfo
    }
    if (info == null) {
      val id = Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
      info = imm?.enabledInputMethodList?.firstOrNull { it.id == id }
    }
    if (info == null) {
      null
    } else {
      val pm = context.packageManager
      val app = info.serviceInfo.applicationInfo
      val pkg = info.packageName
      mapOf(
        "package" to pkg,
        "label" to info.loadLabel(pm).toString(),
        "trusted" to (cameWithPhone(app) || (pkg in KNOWN_KEYBOARDS && installedFrom(pm, pkg) == PLAY_STORE)),
      )
    }
  } catch (e: Exception) {
    null
  }

  /**
   * Apps with accessibility access switched on: [{ package, label, cameWithPhone, isTool }].
   * isTool = the app declares itself a genuine accessibility tool (screen
   * readers etc.); Android 16 only lets those read "sensitive" screens.
   */
  private fun accessibilityApps(context: Context): List<Map<String, Any?>> = try {
    val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
    val pm = context.packageManager
    (am?.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK) ?: emptyList())
      .mapNotNull { service ->
        val serviceInfo = service.resolveInfo?.serviceInfo ?: return@mapNotNull null
        mapOf(
          "package" to serviceInfo.packageName,
          "label" to (service.resolveInfo.loadLabel(pm)?.toString() ?: serviceInfo.packageName),
          "cameWithPhone" to cameWithPhone(serviceInfo.applicationInfo),
          "isTool" to service.isAccessibilityTool,
          // Installed from Google Play? (Known tools like TalkBack count as
          // trusted only from there; see deviceChecks.js.)
          "fromPlayStore" to (installedFrom(pm, serviceInfo.packageName) == PLAY_STORE),
        )
      }
      .distinctBy { it["package"] }
  } catch (e: Exception) {
    emptyList()
  }

  /** True for apps that are part of the phone's system (preinstalled, maybe updated since). */
  private fun cameWithPhone(app: ApplicationInfo): Boolean =
    (app.flags and (ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0

  /** Which app store installed this app (package id), or null if unknown. */
  private fun installedFrom(pm: PackageManager, pkg: String): String? = try {
    pm.getInstallSourceInfo(pkg).installingPackageName
  } catch (e: Exception) {
    null
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
    // Wait at most 2 seconds FIRST (the answer is one short line), so a stuck
    // getprop can never hang the check; then read what it printed.
    if (!process.waitFor(2, TimeUnit.SECONDS)) {
      process.destroyForcibly()
      null
    } else {
      process.inputStream.bufferedReader().use { it.readText() }.trim().ifEmpty { null }
    }
  } catch (e: Exception) {
    null
  }
}
