/*
 * modules/klv-signer-requests/index.js — JavaScript access to the Signer's "inbox"
 * =================================================================================
 *
 * The native Android part (android/src/main/java/…) receives requests from
 * other apps. This file lets the JavaScript side of the Signer:
 *
 *   getPendingRequest()               the request waiting for a decision, or null:
 *        { id, action, callerPackage, callerLabel, callerCertSha256, extras, receivedAt }
 *        Everything about the caller comes from Android itself.
 *   completeRequest(id, ok, extras)   send the answer back to the calling app
 *        (returns false if that app stopped waiting)
 *   addRequestListener(fn)            fn(id) when a new request arrives
 *   addClosedListener(fn)             fn(id) when a request goes away unanswered
 *                                     (e.g. you switched back to the calling app)
 *   getDeviceSecurity()               (async) facts about the phone's own protections:
 *        { suBinary, testKeys, rootApps, verifiedBootState, flashLocked, screenLockSet }
 *        see DeviceSecurity.kt; turned into words by src/security/deviceChecks.js
 *
 * If the native part isn't there (e.g. in the automated tests on a computer),
 * everything quietly does nothing.
 */

import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule('KlvSignerRequests');

export { ACTIONS, SIGNER_PACKAGE, SIGNER_ACTIVITY } from './actions.js';

export function getPendingRequest() {
  return native ? native.getPendingRequest() : null;
}

export function completeRequest(id, ok, extras) {
  return native ? native.completeRequest(id, ok, extras) : false;
}

export function addRequestListener(listener) {
  if (!native) return { remove() {} };
  return native.addListener('onRequest', (event) => listener(event.id));
}

export async function getDeviceSecurity() {
  return native ? native.getDeviceSecurity() : null;
}

/**
 * protectWindow — hide other apps' overlays, ignore taps through a covered
 * screen, hide the screens from non-accessibility-tool apps. See
 * android/.../WindowProtection.kt. Safe to call any time.
 */
export async function protectWindow() {
  return native ? native.protectWindow() : false;
}

export function addClosedListener(listener) {
  if (!native) return { remove() {} };
  return native.addListener('onRequestClosed', (event) => listener(event.id));
}
