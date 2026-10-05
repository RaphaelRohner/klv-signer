/*
 * KlvSignerRequestsModule.kt — the bridge between the inbox and JavaScript
 * ========================================================================
 *
 * Gives the Signer's JavaScript side three things:
 *   getPendingRequest()         → the request waiting for a decision (or null)
 *   completeRequest(id, ok, extras) → send the answer back to the calling app
 *   events "onRequest" / "onRequestClosed" → a request arrived / went away
 *   getDeviceSecurity()         → signs that the phone's protections are off
 *                                 (root, unlocked bootloader, no screen lock;
 *                                 see DeviceSecurity.kt)
 *   protectWindow()             → hides other apps' overlays, ignores taps
 *                                 through a covered screen, and hides the
 *                                 screens from non-accessibility-tool apps
 *                                 (see WindowProtection.kt). Also done
 *                                 automatically each time the Signer comes
 *                                 to the front.
 *   allowScreenshots() / blockScreenshots()
 *                               → allowed only on the QR code screen; the
 *                                 screenshot block is re-applied natively
 *                                 every time the Signer comes to the front.
 *   getElapsedRealtime()        → milliseconds since the phone started (can't
 *                                 be changed by the user; for waiting times).
 *   cancelAutofill()            → ends any password-manager autofill session
 *                                 for the Signer's window, saving nothing.
 *   hasSigningCertificate(p, c) → was app p ever signed with certificate c?
 *   getBootCount()              → how many times the phone has started up.
 *                                 The fingerprint/face option asks for the
 *                                 password again after every phone restart.
 *
 * After answering, it moves the Signer to the background, so you land back
 * in the app that asked.
 */
package com.raphaelrohner.klvsigner.requests

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KlvSignerRequestsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KlvSignerRequests")

    Events("onRequest", "onRequestClosed")

    OnCreate {
      SignerRequests.onRequest = { id -> sendEvent("onRequest", mapOf("id" to id)) }
      SignerRequests.onClosed = { id -> sendEvent("onRequestClosed", mapOf("id" to id)) }
    }

    // Each time the Signer comes to the front, (re)apply the window protections.
    OnActivityEntersForeground {
      applyWindowProtection()
    }

    OnDestroy {
      SignerRequests.onRequest = null
      SignerRequests.onClosed = null
    }

    Function("getPendingRequest") {
      pendingRequestAsMap()
    }

    // Runs off the main thread (it starts the small `getprop` tool twice).
    AsyncFunction("getDeviceSecurity") {
      deviceSecurityReport()
    }

    // Called by App.js at start too (the first "foreground" can happen before
    // this module exists). Runs on the UI thread, as Android requires.
    AsyncFunction("protectWindow") {
      applyWindowProtection()
      true
    }

    // The QR code screen allows screenshots while it's open (true), and
    // blocks them again when it closes (false). See WindowProtection.kt, point 5.
    Function("allowScreenshots") {
      WindowProtection.screenshotsAllowed = true
      applyWindowProtection()
      true
    }
    Function("blockScreenshots") {
      WindowProtection.screenshotsAllowed = false
      applyWindowProtection()
      true
    }

    // Android's own counter of phone start-ups (Settings.Global.BOOT_COUNT).
    // -1 if Android won't say.
    Function("getBootCount") {
      val context = appContext.reactContext
      if (context == null) {
        -1
      } else {
        try {
          android.provider.Settings.Global.getInt(context.contentResolver, android.provider.Settings.Global.BOOT_COUNT)
        } catch (e: Exception) {
          -1
        }
      }
    }

    // A stopwatch since the phone started (ms). Unlike the clock, it can't be
    // changed in Settings, so wrong-password waiting times can't be skipped.
    Function("getElapsedRealtime") {
      android.os.SystemClock.elapsedRealtime().toDouble()
    }

    // Ends Android's autofill "session" for the Signer's window without
    // saving anything. Called whenever you type or move between screens, so
    // a password manager never gets to the point of asking "Save password?"
    // (marking the window as not-for-autofill alone didn't stop Google's).
    Function("cancelAutofill") {
      val activity = appContext.currentActivity
      activity?.runOnUiThread {
        try {
          activity.getSystemService(android.view.autofill.AutofillManager::class.java)?.cancel()
        } catch (e: Exception) {
          // Never let this crash the app.
        }
      }
      activity != null
    }

    // Was this app ever signed with this certificate (SHA-256 hex)? Covers
    // legitimate signing-key changes, where Android keeps the key history.
    Function("hasSigningCertificate") { packageName: String, certSha256Hex: String ->
      val context = appContext.reactContext
      if (context == null || !certSha256Hex.matches(Regex("^[0-9a-fA-F]{64}$"))) {
        false
      } else {
        try {
          val bytes = ByteArray(32) { i -> certSha256Hex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
          context.packageManager.hasSigningCertificate(packageName, bytes, android.content.pm.PackageManager.CERT_INPUT_SHA256)
        } catch (e: Exception) {
          false
        }
      }
    }

    Function("completeRequest") { id: String, ok: Boolean, extras: Map<String, String> ->
      val delivered = SignerRequests.complete(id, ok, extras)
      // Step aside so the person lands back in the app that asked.
      val activity = appContext.currentActivity
      activity?.runOnUiThread { activity.moveTaskToBack(true) }
      delivered
    }
  }

  /** Applies WindowProtection to the Signer's current screen, on the UI thread. */
  private fun applyWindowProtection() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread { WindowProtection.apply(activity) }
  }

  /** The phone-safety facts (DeviceSecurity.kt), or null if the app isn't fully started. */
  private fun deviceSecurityReport(): Map<String, Any?>? {
    val context = appContext.reactContext ?: return null
    return DeviceSecurity.check(context)
  }

  /** The waiting request as a plain object for JavaScript, or null if there is none. */
  private fun pendingRequestAsMap(): Map<String, Any?>? {
    val r = SignerRequests.current() ?: return null
    return mapOf(
      "id" to r.id,
      "action" to r.action,
      "callerPackage" to r.callerPackage,
      "callerLabel" to r.callerLabel,
      "callerCertSha256" to r.callerCertSha256,
      "extras" to r.extras,
      "receivedAt" to r.receivedAt.toDouble(),
    )
  }
}
