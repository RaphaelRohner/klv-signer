/*
 * SignRequestActivity.kt — the Signer's "front door" for other apps
 * ===================================================================
 *
 * WHAT THIS IS
 * When another app (a "client app", e.g. the Devikins Legacy Hub) wants the
 * Signer to do something, it asks Android to open THIS screen "for a result"
 * (see SIGNER-PROTOCOL.md). This screen is invisible (transparent). It:
 *
 *   1. asks Android WHO is calling. Android fills this in itself
 *      (getCallingPackage), so the calling app can't fake it. We also read
 *      the caller's signing certificate fingerprint and its visible name.
 *   2. copies the request (action + text extras) into SignerRequests, the
 *      in-memory "inbox" that the JavaScript side reads,
 *   3. opens the Signer's normal screens (the React Native app), where you
 *      see the request and decide,
 *   4. when the JavaScript side answers, hands the answer back to the calling
 *      app with setResult() and closes. Android delivers it ONLY to the app
 *      that asked.
 *
 * If you switch back to the calling app without deciding, this screen
 * becomes visible again (it lives in the caller's task), notices, and
 * answers "rejected" so the caller isn't left waiting forever.
 *
 * WHY NATIVE (KOTLIN) CODE
 * Only native Android code can see who called and send a result back to
 * them. Everything else (checks, screens, signing) stays in JavaScript.
 * This file never sees the private key.
 */
package com.raphaelrohner.klvsigner.requests

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import java.security.MessageDigest
import java.util.UUID

class SignRequestActivity : Activity() {

  /** True once the Signer's own screens have covered this one. */
  private var hasBeenHidden = false

  /** The id of the request this screen is carrying, or null if it was refused right away. */
  private var requestId: String? = null

  /** True once an answer has been sent, so we never answer twice. */
  private var answered = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Android recreated this screen after the Signer was closed in the background:
    // the original request is gone, so tell the caller it was cancelled.
    if (savedInstanceState != null) {
      answer(false, errorExtras(SignerProtocol.ERROR_INTERRUPTED, "The Signer was interrupted. Please try again."))
      return
    }

    // 1. Who is calling? Only set by Android when the caller used "start activity for result".
    val caller = callingPackage
    if (caller == null) {
      answer(false, errorExtras(SignerProtocol.ERROR_NOT_FOR_RESULT,
        "Call the Signer with startActivityForResult (e.g. expo-intent-launcher), so it can answer."))
      return
    }

    // 1b. Passed on by another app? With Android's "forward result" flag, an
    //     app that was itself opened by an allowed app (e.g. a file picker the
    //     Hub opened) can hand a request on, and Android then names the ALLOWED
    //     app as the caller. Real client apps never do this, so such requests
    //     are refused (weekly check, 6 Oct 2026).
    if (((intent?.flags ?: 0) and Intent.FLAG_ACTIVITY_FORWARD_RESULT) != 0) {
      answer(false, errorExtras(SignerProtocol.ERROR_INVALID_REQUEST,
        "Requests passed on from another app aren't accepted. The app must ask the Signer directly."))
      return
    }

    val action = intent?.action
    if (action != SignerProtocol.ACTION_GET_ADDRESS && action != SignerProtocol.ACTION_SIGN_TRANSACTION) {
      answer(false, errorExtras(SignerProtocol.ERROR_UNKNOWN_ACTION, "Unknown request type: $action"))
      return
    }

    // 2. Copy the text extras we understand (and nothing else), with size limits.
    //    Reading extras unpacks the whole bundle Android received, and a
    //    harmful app could put something in it that can't be unpacked. That
    //    must not crash the Signer (and with it another app's request), so
    //    any problem here is answered as an invalid request.
    val extras = mutableMapOf<String, String>()
    try {
      for ((key, maxLength) in SignerProtocol.ACCEPTED_EXTRAS) {
        val value = intent?.getStringExtra(key) ?: continue
        if (value.length > maxLength) {
          answer(false, errorExtras(SignerProtocol.ERROR_INVALID_REQUEST, "The '$key' value is too long."))
          return
        }
        extras[key] = value
      }
    } catch (e: Throwable) {
      answer(false, errorExtras(SignerProtocol.ERROR_INVALID_REQUEST, "The request couldn't be read."))
      return
    }

    val request = SignerRequests.Request(
      id = UUID.randomUUID().toString(),
      action = action,
      callerPackage = caller,
      callerLabel = appLabel(caller),
      callerCertSha256 = signingCertSha256(caller),
      extras = extras,
    )

    // One request at a time. A second app asking while you're deciding gets "busy".
    if (!SignerRequests.start(request, this)) {
      answer(false, errorExtras(SignerProtocol.ERROR_BUSY, "The Signer is already handling another request."))
      return
    }
    requestId = request.id

    // 3. Open the Signer's normal screens. (NEW_TASK: they live in the Signer's own task.)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch == null) {
      SignerRequests.finish(request.id)
      answer(false, errorExtras(SignerProtocol.ERROR_INTERNAL, "The Signer could not open its screens."))
      return
    }
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    startActivity(launch)
  }

  override fun onStop() {
    super.onStop()
    hasBeenHidden = true
  }

  override fun onResume() {
    super.onResume()
    // Visible again after being covered, without an answer = the user went back
    // to the calling app without deciding.
    if (hasBeenHidden && !answered) {
      requestId?.let { SignerRequests.closedByUser(it) }
      answer(false, rejectedExtras("You went back without approving."))
    }
  }

  override fun onDestroy() {
    // If Android closes this screen before an answer was sent, the request is gone too.
    if (!answered) requestId?.let { SignerRequests.closedByUser(it) }
    super.onDestroy()
  }

  /**
   * answer — sends the result back to the calling app and closes this screen.
   * Called from here, or (via SignerRequests.complete) when you approve or reject.
   */
  fun answer(ok: Boolean, extras: Map<String, String>) {
    if (answered) return
    answered = true
    val data = Intent()
    requestId?.let { data.putExtra(SignerProtocol.EXTRA_SIGNER_REQUEST_ID, it) }
    for ((key, value) in extras) data.putExtra(key, value)
    // The caller's own requestId goes back unchanged on EVERY answer, also on
    // the errors produced here before the JS side ever saw the request
    // (SIGNER-PROTOCOL.md 3; third review R12). Only if it's within the limit.
    if (!extras.containsKey(SignerProtocol.EXTRA_REQUEST_ID)) {
      callerRequestId()?.let { data.putExtra(SignerProtocol.EXTRA_REQUEST_ID, it) }
    }
    data.putExtra(SignerProtocol.EXTRA_PROTOCOL_VERSION, SignerProtocol.PROTOCOL_VERSION)
    setResult(if (ok) RESULT_OK else RESULT_CANCELED, data)
    finish()
  }

  // ---- Helpers --------------------------------------------------------------------

  /** The requestId the calling app sent (≤ 200 characters), or null. Never throws. */
  private fun callerRequestId(): String? = try {
    intent?.getStringExtra(SignerProtocol.EXTRA_REQUEST_ID)?.takeIf { it.length <= 200 }
  } catch (e: Exception) {
    null
  }

  /** The calling app's visible name (e.g. "DLH"). Note: any app can pick any name; the package id is what's unique. */
  private fun appLabel(pkg: String): String = try {
    packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
  } catch (e: Exception) {
    pkg
  }

  /**
   * The SHA-256 fingerprint of the certificate the calling app was signed with.
   * An app's certificate can't be copied by another developer, so if this ever
   * changes for a known app, it's a different app pretending to be it.
   */
  private fun signingCertSha256(pkg: String): String? = try {
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      packageManager.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
        .signingInfo?.apkContentsSigners
    } else {
      @Suppress("DEPRECATION")
      packageManager.getPackageInfo(pkg, PackageManager.GET_SIGNATURES).signatures
    }
    signatures
      ?.map { sig -> MessageDigest.getInstance("SHA-256").digest(sig.toByteArray()).joinToString("") { "%02x".format(it) } }
      ?.sorted()
      ?.joinToString(",")
  } catch (e: Exception) {
    null
  }

  private fun errorExtras(code: String, message: String) = mapOf(
    SignerProtocol.EXTRA_STATUS to SignerProtocol.STATUS_ERROR,
    SignerProtocol.EXTRA_ERROR to code,
    SignerProtocol.EXTRA_MESSAGE to message,
  )

  private fun rejectedExtras(message: String) = mapOf(
    SignerProtocol.EXTRA_STATUS to SignerProtocol.STATUS_REJECTED,
    SignerProtocol.EXTRA_ERROR to SignerProtocol.ERROR_USER_REJECTED,
    SignerProtocol.EXTRA_MESSAGE to message,
  )
}
