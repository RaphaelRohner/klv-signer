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
import PasteTransactionScreen from './src/screens/PasteTransactionScreen.js';
import ApproveScreen from './src/screens/ApproveScreen.js';
import SignedScreen from './src/screens/SignedScreen.js';
import ConnectAppScreen from './src/screens/ConnectAppScreen.js';
import RequestProblemScreen from './src/screens/RequestProblemScreen.js';

// Requests from other apps (Stage 3)
import {
  addClosedListener, addRequestListener, completeRequest, getDeviceSecurity, getPendingRequest,
} from './modules/klv-signer-requests/index.js';
import { describeDeviceSecurity } from './src/security/deviceChecks.js';
import { ACTIONS, ERRORS, addressReply, checkRequest, errorReply, signedReply } from './src/requests/protocol.js';
import { trustStatus, withApp } from './src/requests/appTrust.js';
import { loadConnectedApps, saveConnectedApps } from './src/storage/connectedApps.js';
import { readTransaction, ReadProblem } from './src/klever/readTransaction.js';

/**
 * The screens that are only reachable while the Signer is unlocked. Leaving
 * the app on any of them locks it (and forgets any transaction in progress).
 */
const UNLOCKED_SCREENS = ['home', 'pasteTx', 'approve', 'signed'];

/** The screens used while answering a request from another app. */
const REQUEST_SCREENS = ['connectApp', 'requestApprove', 'requestProblem'];

/** Who is asking, for requests pasted by hand (Stage 2). */
const MANUAL_REQUESTER = { name: 'You (pasted by hand)', detail: 'Test request, not from another app' };

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [draftPhrase, setDraftPhrase] = useState(null);
  const [setupOrigin, setSetupOrigin] = useState(null); // 'create' or 'restore'
  const [address, setAddress] = useState(null);
  const [unlockInfo, setUnlockInfo] = useState(null);
  const [justCreated, setJustCreated] = useState(false);
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

  // Phone-safety warnings (root, unlocked bootloader, no screen lock), checked
  // once when the app starts. See src/security/deviceChecks.js.
  const [deviceFindings, setDeviceFindings] = useState([]);
  useEffect(() => {
    getDeviceSecurity()
      .then((report) => setDeviceFindings(describeDeviceSecurity(report).findings))
      .catch(() => setDeviceFindings([]));
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
        } else {
          setScreen((current) => (current === 'loading' ? 'welcome' : current));
        }
      } catch {
        setScreen((current) => (current === 'loading' ? 'welcome' : current));
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
    requestRef.current = null;
    setRequest(null);
    setRequestTrust(null);
    setRequestReading(null);
    setRequestProblem(null);
    setScreen(addressRef.current ? 'unlock' : 'welcome');
  }, []);

  /** Sends the answer to the waiting app, then clears everything. */
  const finishRequest = useCallback((ok, extras) => {
    const current = requestRef.current;
    if (!current) return;
    completeRequest(current.id, ok, extras); // also moves the Signer to the background
    clearRequest();
  }, [clearRequest]);

  const showRequestProblem = useCallback((code, message) => {
    setRequestProblem({ code, message });
    setScreen('requestProblem');
  }, []);

  /** Carries out a request from an app that's allowed. */
  const proceedWithRequest = useCallback((req, walletAddress) => {
    if (req.action === ACTIONS.GET_ADDRESS) {
      finishRequest(true, addressReply(req, walletAddress, NETWORK));
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

  /** A new request arrived: check it, then decide which screen to show. */
  const beginRequest = useCallback(async (req) => {
    if (!req || requestRef.current?.id === req.id) return;
    requestRef.current = req;
    setRequest(req);
    setReading(null);      // abandon any manual test in progress
    setSignResult(null);

    const problem = checkRequest(req);
    if (problem) {
      showRequestProblem(problem.code, problem.message);
      return;
    }
    const [walletAddress, vault] = await Promise.all([loadAddress(), loadVault()]);
    if (!walletAddress || !vault) {
      showRequestProblem(ERRORS.NO_WALLET, 'No wallet is set up in the Signer yet. Open the Signer, create or restore a wallet, then try again.');
      return;
    }
    setAddress(walletAddress);
    const trust = trustStatus(await loadConnectedApps(), req);
    if (trust !== 'allowed') {
      setRequestTrust(trust);
      setScreen('connectApp');
      return;
    }
    proceedWithRequest(req, walletAddress);
  }, [proceedWithRequest, showRequestProblem]);

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

  // --- Lock automatically when you leave the app ------------------------------
  // AppState tells us when the app goes to the background (you switched apps,
  // went to the home screen, or turned the screen off).
  useEffect(() => {
    if (!LOCK_WHEN_LEFT) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // Leaving the Signer while an app is waiting = no decision: tell the app.
        if (requestRef.current) {
          finishRequest(false, errorReply(requestRef.current, ERRORS.USER_LEFT, 'You left the Signer without deciding.'));
        }
        setReading(null);    // forget any transaction in progress
        setSignResult(null);
        setScreen((current) => (UNLOCKED_SCREENS.includes(current) || REQUEST_SCREENS.includes(current) ? 'unlock' : current));
      }
    });
    return () => subscription.remove();
  }, [finishRequest]);

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
      pasteTx: () => setScreen('home'),
      approve: () => { setReading(null); setScreen('home'); },  // back = reject
      signed: () => { setSignResult(null); setScreen('home'); },
      // For requests from other apps, "back" means "no".
      connectApp: () => finishRequest(false, errorReply(request, ERRORS.NOT_ALLOWED, 'You did not allow this app to use the Signer.')),
      requestApprove: () => finishRequest(false, errorReply(request, ERRORS.USER_REJECTED, 'You rejected the transaction.')),
      requestProblem: () => requestProblem && finishRequest(false, errorReply(request, requestProblem.code, requestProblem.message)),
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (previous[screen]) {
        previous[screen]();
        return true; // "we handled it, don't close the app"
      }
      return false; // default behaviour (leave the app)
    });
    return () => subscription.remove();
  }, [screen, setupOrigin, backToWelcome, finishRequest, request, requestProblem]);

  // --- The final setup step: scramble the key and save it ----------------------
  async function finishSetup(password) {
    const { privateKey, address: newAddress } = walletFromPhrase(draftPhrase);
    const started = Date.now();
    try {
      const vault = await lockKey(privateKey, password, newAddress, PASSWORD_STRETCHING);
      await saveVault(vault);
    } finally {
      wipeBytes(privateKey); // the key only lives on in scrambled form
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
            onUnlocked={(info) => {
              setUnlockInfo(info);
              setJustCreated(false);
              setScreen('home');
            }}
            onRemoved={afterRemoved}
          />
        );
      case 'home':
        return (
          <HomeScreen
            deviceFindings={deviceFindings}
            address={address}
            unlockInfo={unlockInfo}
            justCreated={justCreated}
            onLock={() => setScreen('unlock')}
            onSignTest={() => setScreen('pasteTx')}
            onRemoved={afterRemoved}
          />
        );
      case 'pasteTx':
        return (
          <PasteTransactionScreen
            address={address}
            onRead={(r) => { setReading(r); setScreen('approve'); }}
            onCancel={() => setScreen('home')}
          />
        );
      case 'approve':
        return (
          <ApproveScreen
            reading={reading}
            requester={MANUAL_REQUESTER}
            deviceFindings={deviceFindings}
            onSigned={(result) => { setReading(null); setSignResult(result); setScreen('signed'); }}
            onRejected={() => { setReading(null); setScreen('home'); }}
          />
        );
      case 'connectApp':
        return (
          <ConnectAppScreen
            request={request}
            trust={requestTrust}
            onAllow={async () => {
              await saveConnectedApps(withApp(await loadConnectedApps(), request));
              proceedWithRequest(request, address);
            }}
            onDeny={() => finishRequest(false, errorReply(request, ERRORS.NOT_ALLOWED, 'You did not allow this app to use the Signer.'))}
          />
        );
      case 'requestApprove':
        return (
          <ApproveScreen
            key={request.id}
            reading={requestReading}
            requester={{ name: request.callerLabel, detail: request.callerPackage }}
            deviceFindings={deviceFindings}
            onSigned={(result) => finishRequest(true, signedReply(request, address, requestReading, result))}
            onRejected={() => finishRequest(false, errorReply(request, ERRORS.USER_REJECTED, 'You rejected the transaction.'))}
          />
        );
      case 'requestProblem':
        return (
          <RequestProblemScreen
            request={request}
            message={requestProblem.message}
            onBack={() => finishRequest(false, errorReply(request, requestProblem.code, requestProblem.message))}
          />
        );
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
