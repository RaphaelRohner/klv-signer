/*
 * protocol.js — the Signer protocol, JavaScript side
 * ==================================================
 *
 * The rules for requests from other apps and the answers the Signer sends
 * back. For developers, the same rules are written up in SIGNER-PROTOCOL.md;
 * the native side has the matching names in SignerProtocol.kt.
 *
 * Pure calculations only (no screens, no storage), so the automated tests
 * can check them on a computer.
 */

import { ACTIONS } from '../../modules/klv-signer-requests/actions.js';
import { NETWORKS } from '../klever/networks.js';

export { ACTIONS };

/** The protocol version this Signer speaks. */
export const PROTOCOL_VERSION = '1';

/** Answer statuses. */
export const STATUS = { OK: 'ok', REJECTED: 'rejected', ERROR: 'error' };

/**
 * Error codes the JavaScript side can send (the native side adds a few more,
 * see SignerProtocol.kt). Each comes with a plain-words message.
 */
export const ERRORS = {
  USER_REJECTED: 'USER_REJECTED',             // you tapped Reject
  USER_LEFT: 'USER_LEFT',                     // you left the Signer without deciding
  NOT_ALLOWED: 'NOT_ALLOWED',                 // you didn't allow this app to connect
  NO_WALLET: 'NO_WALLET',                     // no wallet set up in the Signer yet
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL', // missing or unknown protocolVersion
  INVALID_REQUEST: 'INVALID_REQUEST',         // required values missing
  INVALID_TRANSACTION: 'INVALID_TRANSACTION', // the Signer refused the transaction (see message)
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  UNSAFE_DEVICE: 'UNSAFE_DEVICE',             // signing is switched off: the phone looks rooted/unlocked
};

/** Plain-words names for the request types, for the screens. */
export function describeAction(action) {
  if (action === ACTIONS.GET_ADDRESS) return 'share your wallet address';
  if (action === ACTIONS.SIGN_TRANSACTION) return 'sign a transaction';
  return 'do something the Signer doesn\'t know';
}

/**
 * checkRequest — basic checks on an incoming request, before anything is shown.
 * @returns {null | { code: string, message: string }}  null = fine
 */
export function checkRequest(request) {
  const extras = request.extras || {};
  if (extras.protocolVersion !== PROTOCOL_VERSION) {
    return {
      code: ERRORS.UNSUPPORTED_PROTOCOL,
      message: `This Signer speaks protocol version ${PROTOCOL_VERSION}. The app sent "${extras.protocolVersion ?? 'nothing'}".`,
    };
  }
  if (request.action === ACTIONS.SIGN_TRANSACTION && !extras.transaction) {
    return { code: ERRORS.INVALID_REQUEST, message: 'The app asked for a signature but sent no transaction.' };
  }
  if (request.action !== ACTIONS.SIGN_TRANSACTION && request.action !== ACTIONS.GET_ADDRESS) {
    return { code: ERRORS.UNKNOWN_ACTION, message: `Unknown request type: ${request.action}` };
  }
  return null;
}

/** Adds the app's own requestId (if it sent one) to an answer, so it can match it up. */
function withRequestId(request, extras) {
  const requestId = request.extras && request.extras.requestId;
  return requestId ? { ...extras, requestId } : extras;
}

/** The answer to GET_ADDRESS. */
export function addressReply(request, address, network) {
  return withRequestId(request, {
    status: STATUS.OK,
    address,
    network,
    chainId: NETWORKS[network].chainId,
  });
}

/** The answer after signing. */
export function signedReply(request, address, reading, result) {
  return withRequestId(request, {
    status: STATUS.OK,
    address,
    network: reading.network,
    transactionHash: reading.hashHex,
    signature: result.signatureHex,
    signedTransaction: result.signedTransactionHex,
  });
}

/** An answer saying no (you rejected, or something was wrong). */
export function errorReply(request, code, message) {
  const rejected = code === ERRORS.USER_REJECTED || code === ERRORS.USER_LEFT || code === ERRORS.NOT_ALLOWED;
  return withRequestId(request, {
    status: rejected ? STATUS.REJECTED : STATUS.ERROR,
    error: code,
    message,
  });
}
