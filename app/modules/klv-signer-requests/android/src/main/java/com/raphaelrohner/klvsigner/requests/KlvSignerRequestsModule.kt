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

    Function("completeRequest") { id: String, ok: Boolean, extras: Map<String, String> ->
      val delivered = SignerRequests.complete(id, ok, extras)
      // Step aside so the person lands back in the app that asked.
      val activity = appContext.currentActivity
      activity?.runOnUiThread { activity.moveTaskToBack(true) }
      delivered
    }
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
