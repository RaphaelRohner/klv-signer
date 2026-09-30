/*
 * SignerRequests.kt — the Signer's in-memory "inbox" for requests
 * ================================================================
 *
 * Holds the ONE request currently waiting for your decision, and a link to
 * the invisible SignRequestActivity that will carry the answer back to the
 * calling app. Nothing here is saved to storage: if the Signer is closed,
 * the request is simply gone (and the calling app gets "cancelled").
 *
 * The JavaScript side talks to this through KlvSignerRequestsModule.kt.
 */
package com.raphaelrohner.klvsigner.requests

import java.lang.ref.WeakReference

object SignerRequests {

  /** One request from a client app. Everything about the caller comes from Android, not from the caller. */
  data class Request(
    val id: String,
    val action: String,
    val callerPackage: String,
    val callerLabel: String,
    val callerCertSha256: String?,
    val extras: Map<String, String>,
    val receivedAt: Long = System.currentTimeMillis(),
  )

  private var current: Request? = null
  private var carrier: WeakReference<SignRequestActivity>? = null

  /** Called when a new request arrives (the JS side listens). */
  var onRequest: ((String) -> Unit)? = null
  /** Called when a request disappears without an answer from JS (e.g. user went back to the app). */
  var onClosed: ((String) -> Unit)? = null

  /** Stores a new request. Returns false if another request is still waiting. */
  @Synchronized
  fun start(request: Request, activity: SignRequestActivity): Boolean {
    val existing = carrier?.get()
    if (current != null && existing != null && !existing.isFinishing) return false
    current = request
    carrier = WeakReference(activity)
    onRequest?.invoke(request.id)
    return true
  }

  /** The request waiting for a decision, or null. */
  @Synchronized
  fun current(): Request? = current

  /**
   * complete — the JS side's decision. Sends the answer back to the calling app.
   * Returns false if that request is no longer waiting (e.g. the caller gave up).
   */
  fun complete(id: String, ok: Boolean, extras: Map<String, String>): Boolean {
    val activity: SignRequestActivity?
    synchronized(this) {
      if (current?.id != id) return false
      activity = carrier?.get()
      current = null
      carrier = null
    }
    if (activity == null || activity.isFinishing) return false
    activity.runOnUiThread { activity.answer(ok, extras) }
    return true
  }

  /** Forget a request without answering (the carrier screen answers on its own). */
  @Synchronized
  fun finish(id: String) {
    if (current?.id == id) {
      current = null
      carrier = null
    }
  }

  /** The request ended outside the JS side's control (user went back, screen closed). */
  fun closedByUser(id: String) {
    var wasCurrent = false
    synchronized(this) {
      if (current?.id == id) {
        current = null
        carrier = null
        wasCurrent = true
      }
    }
    if (wasCurrent) onClosed?.invoke(id)
  }
}
