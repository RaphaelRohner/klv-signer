/*
 * SignerProtocol.kt — the fixed names used between client apps and the Signer
 * ===========================================================================
 *
 * These are the "words" of the Signer protocol: request types (actions),
 * the names of the values sent along (extras), and the answers. They're
 * documented for developers in SIGNER-PROTOCOL.md. Changing any of them
 * breaks every app that uses the Signer, so they only ever get added to.
 */
package com.raphaelrohner.klvsigner.requests

object SignerProtocol {
  const val PROTOCOL_VERSION = "1"

  // Request types
  const val ACTION_GET_ADDRESS = "com.raphaelrohner.klvsigner.action.GET_ADDRESS"
  const val ACTION_SIGN_TRANSACTION = "com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION"

  // Values a client app sends
  const val EXTRA_PROTOCOL_VERSION = "protocolVersion"
  const val EXTRA_TRANSACTION = "transaction"   // unsigned transaction, hex
  const val EXTRA_REQUEST_ID = "requestId"       // optional, echoed back unchanged

  /** The only extras we accept, with the longest length allowed for each. */
  val ACCEPTED_EXTRAS = mapOf(
    EXTRA_PROTOCOL_VERSION to 10,
    EXTRA_TRANSACTION to 65536,
    EXTRA_REQUEST_ID to 200,
  )

  // Values the Signer sends back
  const val EXTRA_STATUS = "status"                   // "ok", "rejected" or "error"
  const val EXTRA_ERROR = "error"                     // error code, see below
  const val EXTRA_MESSAGE = "message"                 // plain-words explanation
  const val EXTRA_SIGNER_REQUEST_ID = "signerRequestId"

  const val STATUS_REJECTED = "rejected"
  const val STATUS_ERROR = "error"

  // Error codes decided here in native code (the JavaScript side adds more)
  const val ERROR_USER_REJECTED = "USER_REJECTED"
  const val ERROR_NOT_FOR_RESULT = "NOT_FOR_RESULT"
  const val ERROR_UNKNOWN_ACTION = "UNKNOWN_ACTION"
  const val ERROR_INVALID_REQUEST = "INVALID_REQUEST"
  const val ERROR_BUSY = "BUSY"
  const val ERROR_INTERRUPTED = "INTERRUPTED"
  const val ERROR_INTERNAL = "INTERNAL"
}
