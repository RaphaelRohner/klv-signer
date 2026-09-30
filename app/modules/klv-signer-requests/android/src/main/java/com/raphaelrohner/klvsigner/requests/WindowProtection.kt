/*
 * WindowProtection.kt — nothing may sit on top of the Signer or watch it
 * ======================================================================
 *
 * Applied to the Signer's window whenever it comes to the front (see
 * KlvSignerRequestsModule.kt). Three protections, all built into Android:
 *
 *   1. HIDE OTHER APPS' OVERLAYS (Android 12+)
 *      Other apps can draw floating windows over everything ("display over
 *      other apps": chat bubbles, screen-dimmer apps, and also harmful apps
 *      trying to trick you). While a Signer screen is showing, Android hides
 *      them. They come back when you leave the Signer. This needs the
 *      HIDE_OVERLAY_WINDOWS permission, which Android grants without asking.
 *
 *   2. IGNORE TAPS THROUGH A COVERED SCREEN
 *      If Android reports that another app's window was covering the spot you
 *      tapped, the tap is thrown away. That's the classic "tapjacking" trick:
 *      a fake see-through message on top, the real "Approve" button below.
 *      With (1) this should never happen; it's the second safety net.
 *
 *   3. HIDDEN FROM ACCESSIBILITY APPS THAT AREN'T REAL ACCESSIBILITY TOOLS
 *      (Android 14+) Harmful apps misuse Android's accessibility access to
 *      read screens and press buttons. Marking the window "sensitive" means
 *      only apps that declare themselves genuine accessibility tools (like
 *      the screen reader TalkBack) can read or use it. Android 16 enforces
 *      this more strictly.
 *
 * Everything is set on the window's top view, so it covers every Signer
 * screen at once. None of it changes anything for you in normal use.
 */
package com.raphaelrohner.klvsigner.requests

import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.view.View

object WindowProtection {

  /**
   * Applies all three protections to this screen's window. Must run on the
   * main (UI) thread. Returns what was switched on, for the tests screen.
   */
  fun apply(activity: Activity): Map<String, Boolean> {
    val window = activity.window ?: return mapOf("overlaysHidden" to false, "obscuredTapsIgnored" to false, "accessibilitySensitive" to false)
    val decor = window.decorView

    // 1. Hide other apps' overlays
    var overlaysHidden = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      activity.checkSelfPermission("android.permission.HIDE_OVERLAY_WINDOWS") == PackageManager.PERMISSION_GRANTED
    ) {
      try {
        window.setHideOverlayWindows(true)
        overlaysHidden = true
      } catch (e: Exception) {
        // Never let a protection crash the app; the other two still apply.
      }
    }

    // 2. Ignore taps while another app's window covers the tapped spot
    decor.filterTouchesWhenObscured = true

    // 3. Only genuine accessibility tools may read or press anything
    var accessibilitySensitive = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      decor.setAccessibilityDataSensitive(View.ACCESSIBILITY_DATA_SENSITIVE_YES)
      accessibilitySensitive = true
    }

    return mapOf(
      "overlaysHidden" to overlaysHidden,
      "obscuredTapsIgnored" to decor.filterTouchesWhenObscured,
      "accessibilitySensitive" to accessibilitySensitive,
    )
  }
}
