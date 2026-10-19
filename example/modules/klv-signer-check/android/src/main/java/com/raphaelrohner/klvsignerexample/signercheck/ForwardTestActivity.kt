/*
 * ForwardTestActivity.kt — test helper: pass a request on, like a harmful app would
 * ==================================================================================
 *
 * The KLV Signer refuses requests that one app passes on from another
 * (Android's "forward result" flag): otherwise an app opened by an allowed
 * app could borrow that app's name. Real client apps never do this, so the
 * refused case can't be seen with them (TESTING.md F25, F30).
 *
 * This invisible screen is that "passing on" app. The example app opens it
 * "for result" (Test button at the bottom); it immediately hands a harmless
 * GET_ADDRESS request on to the Signer with the forward flag and closes.
 * Android then sends the Signer's answer straight back to the example app,
 * which shows whether it was refused (it must be: INVALID_REQUEST).
 *
 * Nothing is signed: GET_ADDRESS only asks which address is in the Signer.
 */

package com.raphaelrohner.klvsignerexample.signercheck

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class ForwardTestActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val forward = Intent("com.raphaelrohner.klvsigner.action.GET_ADDRESS")
        .setClassName("com.raphaelrohner.klvsigner", "com.raphaelrohner.klvsigner.requests.SignRequestActivity")
        .putExtra("protocolVersion", "1")
        .putExtra("requestId", "forward-test")
        .addFlags(Intent.FLAG_ACTIVITY_FORWARD_RESULT)
      startActivity(forward) // NOT "for result": the forward flag passes our caller's result on
    } catch (e: Exception) {
      // Signer not installed (or Android refused): report it to the example app.
      setResult(RESULT_CANCELED, Intent().putExtra("status", "error").putExtra("error", "FORWARD_TEST_FAILED")
        .putExtra("message", "The test couldn't pass the request on: ${e.message}"))
    }
    finish()
  }
}
