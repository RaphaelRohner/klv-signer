/*
 * App.js — the Signer's "traffic controller"
 * ==========================================
 *
 * This file decides which screen you see, and holds the few things that
 * must be remembered while moving between screens. The screens themselves
 * live in src/screens/, one file each.
 *
 * THE SCREENS AND HOW YOU MOVE BETWEEN THEM
 *
 *   App opens ──► "loading" (checks: is a wallet saved on this phone?)
 *                   │
 *        no wallet ─┴─ wallet saved
 *            │              │
 *            ▼              ▼
 *        "welcome"       "unlock" ◄──────── "Lock now", or leaving the app
 *        │       │          │ right password
 *   Create│       │Restore   ▼
 *        ▼       ▼        "home" ──► "pasteTx" ──► "approve" ──► "signed"
 *  "showPhrase" "restore"    ▲                        │ Reject      │ Done
 *        ▼       │           └────────────────────────┴─────────────┘
 * "confirmPhrase"│
 *        ▼       ▼
 *       "setPassword" ──► wallet scrambled and saved ──► "home"
 *
 *   Requests from other apps (Stage 3) can arrive at any time. Android opens
 *   the Signer and one of these screens takes over:
 *     "connectApp"      first time only: "Allow this app?"
 *     "requestApprove"  the approval screen, showing which app is asking
 *     "requestProblem"  the request can't be done (reason shown), nothing signed
 *   Afterwards the answer goes back to the app and the Signer returns to "unlock".
 *
 *   Removing the wallet (from "home" or "unlock") goes back to "welcome".
 *   Stage 2: "pasteTx" → "approve" → "signed" is the test path for signing a
 *   transaction pasted by hand. In Stage 3, other apps' requests will open
 *   "approve" directly.
 *
 * WHAT'S KEPT IN MEMORY HERE, AND FOR HOW LONG
 *   draftPhrase  the recovery phrase, ONLY during setup. Cleared as soon as
 *                the wallet is saved, or when you back out to the welcome screen.
 *   address      the public klv1… address (not secret).
 *   unlockInfo   test info: how long the last password check took.
 *   reading      the transaction being approved. Forgotten on Reject, after
 *                signing, or when you leave the app.
 *   signResult   the signed transaction (not secret), until you tap Done.
 *   request…     the request from another app, until it's answered.
 * The private key is never kept here. It only exists for a moment inside
 * the setup step and the password check, and is wiped right after.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LOCK_WHEN_LEFT, NETWORK, PASSWORD_STRETCHING, RECOVERY_PHRASE_WORDS } from './src/config.js';
import { createRecoveryPhrase, walletFromPhrase, wipeBytes } from './src/crypto/wallet.js';
import { lockKey } from './src/crypto/vault.js';
import { engineName } from './src/crypto/passwordKey.js';
import { loadAddress, loadVault, saveVault } from './src/storage/secureStore.js';
import { colors } from './src/components/ui.js';

import WelcomeScreen from './src/screens/WelcomeScreen.js';
import ShowPhraseScreen from './src/screens/ShowPhraseScreen.js';
import ConfirmPhraseScreen from './src/screens/ConfirmPhraseScreen.js';
import RestoreScreen from './src/screens/RestoreScreen.js';
import SetPasswordScreen from './src/screens/SetPasswordScreen.js';
import UnlockScreen from './src/screens/UnlockScreen.js';
import HomeScreen from './src/screens/HomeScreen.js';
import SettingsScreen from './src/screens/SettingsScreen.js';
import ReceiveScreen from './src/screens/ReceiveScreen.js';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen.js';
import SigningRulesScreen from './src/screens/SigningRulesScreen.js';
import PasteTransactionScreen from './src/screens/PasteTransactionScreen.js';
import ApproveScreen from './src/screens/ApproveScreen.js';
import SignedScreen from './src/screens/SignedScreen.js';
import ConnectAppScreen from './src/screens/ConnectAppScreen.js';
import RequestProblemScreen from './src/screens/RequestProblemScreen.js';
import StorageProblemScreen from './src/screens/StorageProblemScreen.js';

// Requests from other apps (Stage 3)
import {
  addClosedListener, addRequestListener, cancelAutofill, completeRequest, getDeviceSecurity, getPendingRequest,
  hasSigningCertificate, protectWindow,
} from './modules/klv-signer-requests/index.js';
import {
  DEVICE_CHECK_FAILED, describeDeviceSecurity, isSigningBlocked, SIGNING_BLOCKED_TEXT,
} from './src/security/deviceChecks.js';
import { ACTIONS, ERRORS, addressReply, checkRequest, errorReply, signedReply } from './src/requests/protocol.js';
import { cleanLabel, trustStatus, withApp } from './src/requests/appTrust.js';
import { loadConnectedApps, saveConnectedApps } from './src/storage/connectedApps.js';
import { readTransaction, ReadProblem } from './src/klever/readTransaction.js';

/**
 * The screens that are only reachable while the Signer is unlocked. Leaving
 * the app on any of them locks it (and forgets any transaction in progress).
 */
const UNLOCKED_SCREENS = ['home', 'settings', 'receive', 'pasteTx', 'approve', 'signed', 'changePassword', 'signingRules'];

/** The screens used while answering a request from another app. */
const REQUEST_SCREENS = ['connectApp', 'requestApprove', 'requestProblem'];
/** Wallet setup screens: leaving the Signer here forgets the recovery words. */
const SETUP_SCREENS = ['showPhrase', 'confirmPhrase', 'restore', 'setPassword'];

/**
 * previousCertStillValid — the app's stored certificate isn't its current one,
 * but Android confirms the app was signed with it before (a legitimate key
 * change, "signing key rotation"). Then it's still the same app.
 */
function previousCertStillValid(apps, req) {
  const known = apps && apps[req.callerPackage];
  if (!known || !known.certSha256) return false;
  return known.certSha256.split(',').some((cert) => hasSigningCertificate(req.callerPackage, cert));
}

/** Who is asking, for requests pasted by hand (Stage 2). */
const MANUAL_REQUESTER = { name: 'You (pasted by hand)', detail: 'Test request, not from another app' };

/** The current "session" number (see `live` in App). Only one App exists. */
let latestSession = 0;

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [draftPhrase, setDraftPhrase] = useState(null);
  const [setupOrigin, setSetupOrigin] = useState(null); // 'create' or 'restore'
  const [address, setAddress] = useState(null);
  const [unlockInfo, setUnlockInfo] = useState(null);
  const [justCreated, setJustCreated] = useState(false);
  // A one-off message for Home, e.g. after changing the password ('' = none).
  const [homeNotice, setHomeNotice] = useState('');
  const [reading, setReading] = useState(null);       // the transaction being approved (Stage 2)
  const [signResult, setSignResult] = useState(null); // the signed result, until you tap Done

  // --- A request from another app (Stage 3) ---
  // `request` holds what Android told us: { id, action, callerPackage, callerLabel,
  // callerCertSha256, extras }. The ref mirrors it for use inside event handlers.
  const [request, setRequest] = useState(null);
  const [requestTrust, setRequestTrust] = useState(null);     // 'unknown' | 'certChanged'
  const [requestReading, setRequestReading] = useState(null); // the transaction, as read by the Signer
  const [requestProblem, setRequestProblem] = useState(null); // { code, message } if refused
  const requestRef = useRef(null);
  const addressRef = useRef(null);

  // --- "Sessions": no late surprises ------------------------------------------
  // Password checks and signing take a moment. If you leave the Signer, lock
  // it, or a new request arrives in the meantime, the slow step must NOT
  // change anything afterwards (e.g. open Home after you left, or hand a
  // signature to a request you never saw). Each of those events starts a new
  // "session"; `live(fn)` makes a callback that only runs if its session is
  // still the current one when it fires.
  // `latestSession` (outside App, below the imports) is read when a callback
  // FIRES; the state copy `session` is the number each screen was drawn with.
  const [session, setSession] = useState(latestSession);
  const newSession = useCallback(() => {
    latestSession += 1;
    setSession(latestSession);
  }, []);
  const live = (fn) => (...args) => (latestSession === session ? fn(...args) : undefined);

  // Phone-safety checks (root, unlocked bootloader, no screen lock, keyboard,
  // accessibility apps). Checked when the app starts AND every time it comes
  // back to the front, so a change in Android's settings (e.g. removing the
  // screen lock) shows up on the Unlock screen straight away.
  // Some findings switch signing off (see src/security/deviceChecks.js).
  // Until the first check has finished, "Approve" waits (deviceChecked).
  const [deviceFindings, setDeviceFindings] = useState([]);
  const [deviceChecked, setDeviceChecked] = useState(false);
  const signingBlocked = isSigningBlocked(deviceFindings);
  const signingBlockedRef = useRef(false);
  useEffect(() => { signingBlockedRef.current = signingBlocked; }, [signingBlocked]);
  useEffect(() => {
    // Hide other apps' overlays, ignore covered taps, hide the screens from
    // non-accessibility-tool apps (native WindowProtection.kt). The native side
    // also re-applies this whenever the Signer comes to the front.
    protectWindow().catch(() => {});
    const refresh = () => {
      getDeviceSecurity()
        .then((report) => {
          const findings = describeDeviceSecurity(report).findings;
          signingBlockedRef.current = isSigningBlocked(findings);
          setDeviceFindings(findings);
        })
        .catch(() => {
          // The check itself failed: be careful, not relaxed (signing off until it works).
          signingBlockedRef.current = true;
          setDeviceFindings([DEVICE_CHECK_FAILED]);
        })
        .finally(() => setDeviceChecked(true));
    };
    refresh();
    const active = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => active.remove();
  }, []);
  useEffect(() => { addressRef.current = address; }, [address]);

  // --- On start: is there a wallet on this phone? --------------------------
  useEffect(() => {
    (async () => {
      try {
        const [savedAddress, vault] = await Promise.all([loadAddress(), loadVault()]);
        // Only move on from "loading": a request from another app may already have
        // opened its own screen in the meantime.
        if (savedAddress && vault) {
          setAddress(savedAddress);
          setScreen((current) => (current === 'loading' ? 'unlock' : current));
        } else if (savedAddress || vault) {
          // Half a wallet: something went wrong with the phone's storage. Don't
          // offer a fresh start that could replace it; explain instead.
          setScreen((current) => (current === 'loading' ? 'storageProblem' : current));
        } else {
          setScreen((current) => (current === 'loading' ? 'welcome' : current));
        }
      } catch {
        setScreen((current) => (current === 'loading' ? 'storageProblem' : current));
      }
    })();
  }, []);

  // --- Requests from other apps (Stage 3) ---------------------------------------------
  //
  // The journey of a request (see HOW-IT-WORKS.md, section 4):
  //   Android → native "front door" → beginRequest() → (first time: "Allow this app?")
  //   → address: answer straight away / transaction: read it → approval screen
  //   → finishRequest() sends the answer back and returns you to the app.

  /** Clears all request state and returns to the locked Signer. */
  const clearRequest = useCallback(() => {
    newSession();
    requestRef.current = null;
    setDraftPhrase(null); // never keep half-finished setup words around
    setRequest(null);
    setRequestTrust(null);
    setRequestReading(null);
    setRequestProblem(null);
    setScreen(addressRef.current ? 'unlock' : 'welcome');
  }, [newSession]);

  /**
   * Sends the answer for THIS request (`req`) to the waiting app, then clears
   * everything. If `req` is no longer the current request (it was closed, or
   * another one replaced it), nothing is sent: an answer can never reach the
   * wrong app. Returns true if the answer was delivered.
   */
  const finishRequest = useCallback((req, ok, extras) => {
    const current = requestRef.current;
    if (!req || !current || current.id !== req.id) return false;
    const delivered = completeRequest(current.id, ok, extras); // also moves the Signer to the background
    clearRequest();
    return delivered !== false;
  }, [clearRequest]);

  const showRequestProblem = useCallback((code, message) => {
    setRequestProblem({ code, message });
    setScreen('requestProblem');
  }, []);

  /** Carries out a request from an app that's allowed. */
  const proceedWithRequest = useCallback((req, walletAddress) => {
    if (req.action === ACTIONS.GET_ADDRESS) {
      finishRequest(req, true, addressReply(req, walletAddress, NETWORK));
      return;
    }
    // Rooted or unlocked phone: sharing the address is fine, signing is not.
    if (signingBlockedRef.current) {
      showRequestProblem(ERRORS.UNSAFE_DEVICE, SIGNING_BLOCKED_TEXT);
      return;
    }
    try {
      // The same strict reader as in Stage 2: refuses anything it can't explain.
      setRequestReading(readTransaction(req.extras.transaction, { network: NETWORK, walletAddress }));
      setScreen('requestApprove');
    } catch (error) {
      const message = error instanceof ReadProblem ? error.message : `The transaction couldn't be read: ${error.message}`;
      showRequestProblem(ERRORS.INVALID_TRANSACTION, message);
    }
  }, [finishRequest, showRequestProblem]);

  /** Is `req` still the request being handled? (Checked after every wait.) */
  const stillCurrent = (req) => requestRef.current?.id === req.id;

  /** An allowed app: load the wallet, then answer or show the transaction. */
  const continueAllowedRequest = useCallback(async (req) => {
    const [walletAddress, vault] = await Promise.all([loadAddress(), loadVault()]);
    if (!stillCurrent(req)) return;
    if (!walletAddress || !vault) {
      showRequestProblem(ERRORS.NO_WALLET, 'No wallet is set up in the Signer yet. Open the Signer, create or restore a wallet, then try again.');
      return;
    }
    setAddress(walletAddress);
    proceedWithRequest(req, walletAddress);
  }, [proceedWithRequest, showRequestProblem]);

  /** A new request arrived: check it, then decide which screen to show. */
  const beginRequest = useCallback(async (req) => {
    if (!req || requestRef.current?.id === req.id) return;
    newSession();          // anything still running from before can't act any more
    requestRef.current = req;
    setScreen('loading');  // leave whatever was on screen at once
    setRequest(req);
    setReading(null);      // abandon any manual test in progress
    setSignResult(null);
    setDraftPhrase(null);

    const problem = checkRequest(req);
    if (problem) {
      showRequestProblem(problem.code, problem.message);
      return;
    }
    // Is this app allowed? Checked BEFORE anything about the wallet is revealed
    // (an unknown app doesn't even learn whether a wallet exists).
    const apps = await loadConnectedApps();
    if (!stillCurrent(req)) return;
    let trust = trustStatus(apps, req);
    if (trust === 'certChanged' && previousCertStillValid(apps, req)) {
      // The app legitimately moved to a new signing key (Android keeps the
      // history, and the old key is in it): accept and remember the new one.
      await saveConnectedApps(withApp(apps, req));
      if (!stillCurrent(req)) return;
      trust = 'allowed';
    }
    if (trust !== 'allowed') {
      setRequestTrust(trust);
      setScreen('connectApp');
      return;
    }
    continueAllowedRequest(req);
  }, [continueAllowedRequest, newSession, showRequestProblem]);

  // Listen for requests: when one arrives, when the app comes to the front, and at start.
  useEffect(() => {
    const check = () => {
      const pending = getPendingRequest();
      if (pending) beginRequest(pending);
    };
    check();
    const arrived = addRequestListener(() => check());
    const closed = addClosedListener((id) => {
      // You went back to the app without deciding: the native side already told it.
      if (requestRef.current && requestRef.current.id === id) clearRequest();
    });
    const active = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { arrived.remove(); closed.remove(); active.remove(); };
  }, [beginRequest, clearRequest]);

  // Every screen change ends any password-manager autofill session (nothing saved).
  useEffect(() => { cancelAutofill(); }, [screen]);

  // --- Lock automatically when you leave the app ------------------------------
  // AppState tells us when the app goes to the background (you switched apps,
  // went to the home screen, or turned the screen off).
  useEffect(() => {
    if (!LOCK_WHEN_LEFT) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        newSession(); // a password check or signature still running must not act later
        // Leaving the Signer while an app is waiting = no decision: tell the app.
        if (requestRef.current) {
          finishRequest(requestRef.current, false, errorReply(requestRef.current, ERRORS.USER_LEFT, 'You left the Signer without deciding.'));
        }
        setReading(null);    // forget any transaction in progress
        setSignResult(null);
        setScreen((current) => {
          if (UNLOCKED_SCREENS.includes(current) || REQUEST_SCREENS.includes(current)) return 'unlock';
          // Mid-setup: forget the recovery words, so nobody sees them on return.
          if (SETUP_SCREENS.includes(current)) {
            setDraftPhrase(null);
            setSetupOrigin(null);
            return 'welcome';
          }
          return current;
        });
      }
    });
    return () => subscription.remove();
  }, [finishRequest, newSession]);

  // The rules screen's own back handling (unsaved changes), see SigningRulesScreen.js.
  const rulesBackRef = useRef(null);
  const backToSettings = useCallback(() => setScreen('settings'), []);

  // --- Starting over: back to the welcome screen, forget the draft -----------
  const backToWelcome = useCallback(() => {
    setDraftPhrase(null);
    setSetupOrigin(null);
    setScreen('welcome');
  }, []);

  // --- Android's hardware "back" button -----------------------------------------
  // Without this, "back" would close the app from any screen. During setup it
  // should go one step back instead.
  useEffect(() => {
    const previous = {
      showPhrase: backToWelcome,
      restore: backToWelcome,
      confirmPhrase: () => setScreen('showPhrase'),
      setPassword: () => setScreen(setupOrigin === 'create' ? 'confirmPhrase' : 'restore'),
      settings: () => { setHomeNotice(''); setScreen('home'); },
      receive: () => setScreen('home'),
      // The rules screen asks "Save your changes?" first if something isn't saved.
      signingRules: () => (rulesBackRef.current ? rulesBackRef.current() : setScreen('settings')),
      changePassword: () => setScreen('settings'),
      pasteTx: () => setScreen('settings'),
      approve: () => { newSession(); setReading(null); setScreen('home'); },  // back = reject
      signed: () => { setSignResult(null); setScreen('home'); },
      // For requests from other apps, "back" means "no".
      connectApp: () => finishRequest(request, false, errorReply(request, ERRORS.NOT_ALLOWED, 'You did not allow this app to use the Signer.')),
      requestApprove: () => finishRequest(request, false, errorReply(request, ERRORS.USER_REJECTED, 'You rejected the transaction.')),
      requestProblem: () => requestProblem && finishRequest(request, false, errorReply(request, requestProblem.code, requestProblem.message)),
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (previous[screen]) {
        previous[screen]();
        return true; // "we handled it, don't close the app"
      }
      return false; // default behaviour (leave the app)
    });
    return () => subscription.remove();
  }, [screen, setupOrigin, backToWelcome, finishRequest, request, requestProblem, newSession]);

  // --- The final setup step: scramble the key and save it ----------------------
  async function finishSetup(password) {
    const session = latestSession;
    const { privateKey, address: newAddress } = walletFromPhrase(draftPhrase);
    const started = Date.now();
    try {
      const vault = await lockKey(privateKey, password, newAddress, PASSWORD_STRETCHING);
      await saveVault(vault, { isNewWallet: true }); // refuses to replace an existing wallet
    } finally {
      wipeBytes(privateKey); // the key only lives on in scrambled form
    }
    if (latestSession !== session) {
      // You left while it was saving: the wallet is saved, but the Signer
      // stays locked (unlock it with the new password).
      setDraftPhrase(null);
      setSetupOrigin(null);
      setAddress(newAddress);
      setScreen('unlock');
      return;
    }
    setUnlockInfo({ seconds: (Date.now() - started) / 1000, engine: engineName() });
    setDraftPhrase(null);
    setSetupOrigin(null);
    setAddress(newAddress);
    setJustCreated(true);
    setScreen('home');
  }

  // --- After removing the wallet ---------------------------------------------------
  function afterRemoved() {
    setAddress(null);
    setUnlockInfo(null);
    setJustCreated(false);
    backToWelcome();
  }

  // --- Which screen to show ---------------------------------------------------------
  function renderScreen() {
    switch (screen) {
      case 'welcome':
        return (
          <WelcomeScreen
            deviceFindings={deviceFindings}
            onCreate={() => {
              setDraftPhrase(createRecoveryPhrase(RECOVERY_PHRASE_WORDS));
              setSetupOrigin('create');
              setScreen('showPhrase');
            }}
            onRestore={() => {
              setSetupOrigin('restore');
              setScreen('restore');
            }}
          />
        );
      case 'showPhrase':
        return <ShowPhraseScreen phrase={draftPhrase} onContinue={() => setScreen('confirmPhrase')} onBack={backToWelcome} />;
      case 'confirmPhrase':
        return (
          <ConfirmPhraseScreen
            phrase={draftPhrase}
            onConfirmed={() => setScreen('setPassword')}
            onBack={() => setScreen('showPhrase')}
          />
        );
      case 'restore':
        return (
          <RestoreScreen
            onRestored={(phrase) => {
              setDraftPhrase(phrase);
              setScreen('setPassword');
            }}
            onBack={backToWelcome}
          />
        );
      case 'setPassword':
        return (
          <SetPasswordScreen
            onSubmit={finishSetup}
            onBack={() => setScreen(setupOrigin === 'create' ? 'confirmPhrase' : 'restore')}
          />
        );
      case 'unlock':
        return (
          <UnlockScreen
            address={address}
            deviceFindings={deviceFindings}
            onUnlocked={live((info) => {
              setUnlockInfo(info);
              setJustCreated(false);
              setScreen('home');
            })}
            onRemoved={afterRemoved}
          />
        );
      case 'home':
        return (
          <HomeScreen
            deviceFindings={deviceFindings}
            deviceChecked={deviceChecked}
            address={address}
            justCreated={justCreated}
            notice={homeNotice}
            onSettings={() => { setHomeNotice(''); setJustCreated(false); setScreen('settings'); }}
            onReceive={() => setScreen('receive')}
            onLock={() => { newSession(); setHomeNotice(''); setScreen('unlock'); }}
          />
        );
      case 'receive':
        return <ReceiveScreen address={address} onBack={() => setScreen('home')} />;
      case 'settings':
        return (
          <SettingsScreen
            deviceFindings={deviceFindings}
            unlockInfo={unlockInfo}
            notice={homeNotice}
            onBack={() => { setHomeNotice(''); setScreen('home'); }}
            onChangePassword={() => { setHomeNotice(''); setScreen('changePassword'); }}
            onSigningRules={() => { setHomeNotice(''); setScreen('signingRules'); }}
            onSignTest={() => { if (!signingBlocked) setScreen('pasteTx'); }}
            onRemoved={afterRemoved}
          />
        );
      case 'signingRules':
        return <SigningRulesScreen walletAddress={address} onDone={backToSettings} backRef={rulesBackRef} />;
      case 'changePassword':
        return (
          <ChangePasswordScreen
            address={address}
            onChanged={live(({ biometricWasOn }) => {
              setHomeNotice(biometricWasOn
                ? 'Password changed. Fingerprint or face was switched off: switch it on again below with the new password.'
                : 'Password changed. Use the new password from now on.');
              setScreen('settings');
            })}
            onBack={() => setScreen('settings')}
          />
        );
      case 'pasteTx':
        return (
          <PasteTransactionScreen
            address={address}
            onRead={(r) => { setReading(r); setScreen('approve'); }}
            onCancel={() => setScreen('settings')}
          />
        );
      case 'approve':
        return (
          <ApproveScreen
            reading={reading}
            requester={MANUAL_REQUESTER}
            appId={null}
            deviceFindings={deviceFindings}
            deviceChecked={deviceChecked}
            onSigned={live((result) => { setReading(null); setSignResult(result); setScreen('signed'); return true; })}
            onRejected={() => { newSession(); setReading(null); setScreen('home'); }}
          />
        );
      case 'connectApp':
        return (
          <ConnectAppScreen
            request={request}
            trust={requestTrust}
            onAllow={async () => {
              const req = request;
              await saveConnectedApps(withApp(await loadConnectedApps(), req));
              if (stillCurrent(req)) continueAllowedRequest(req);
            }}
            onDeny={() => finishRequest(request, false, errorReply(request, ERRORS.NOT_ALLOWED, 'You did not allow this app to use the Signer.'))}
          />
        );
      case 'requestApprove':
        return (
          <ApproveScreen
            key={request.id}
            reading={requestReading}
            requester={{ name: cleanLabel(request.callerLabel), detail: request.callerPackage }}
            appId={request.callerPackage}
            deviceFindings={deviceFindings}
            deviceChecked={deviceChecked}
            // Same as live(…), written out: only if this screen's session is still current.
            onSigned={(result) => (latestSession === session
              ? finishRequest(request, true, signedReply(request, address, requestReading, result))
              : false)}
            onRejected={() => finishRequest(request, false, errorReply(request, ERRORS.USER_REJECTED, 'You rejected the transaction.'))}
          />
        );
      case 'requestProblem':
        return (
          <RequestProblemScreen
            request={request}
            message={requestProblem.message}
            onBack={() => finishRequest(request, false, errorReply(request, requestProblem.code, requestProblem.message))}
          />
        );
      case 'storageProblem':
        return <StorageProblemScreen onRemoved={afterRemoved} />;
      case 'signed':
        return <SignedScreen result={signResult} onDone={() => { setSignResult(null); setScreen('home'); }} />;
      default: // 'loading'
        return (
          <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        );
    }
  }

  return (
    <SafeAreaProvider>
      {/* "light" = white clock/battery icons on our dark background */}
      <StatusBar style="light" />
      {renderScreen()}
    </SafeAreaProvider>
  );
}

