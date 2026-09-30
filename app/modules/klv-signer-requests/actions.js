/*
 * actions.js — the request type names (shared by the module and the app)
 * ======================================================================
 * Must match SignerProtocol.kt and SIGNER-PROTOCOL.md exactly.
 * Kept in its own file with no imports, so the automated tests can use it.
 */
export const ACTIONS = {
  GET_ADDRESS: 'com.raphaelrohner.klvsigner.action.GET_ADDRESS',
  SIGN_TRANSACTION: 'com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION',
};

/** The exact package and screen other apps must name when asking. */
export const SIGNER_PACKAGE = 'com.raphaelrohner.klvsigner';
export const SIGNER_ACTIVITY = 'com.raphaelrohner.klvsigner.requests.SignRequestActivity';
