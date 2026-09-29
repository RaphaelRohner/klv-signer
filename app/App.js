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
 * The private key is never kept here. It only exists for a moment inside
 * the setup step and the password check, and is wiped right after.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LOCK_WHEN_LEFT, PASSWORD_STRETCHING, RECOVERY_PHRASE_WORDS } from './src/config.js';
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

/**
 * The screens that are only reachable while the Signer is unlocked. Leaving
 * the app on any of them locks it (and forgets any transaction in progress).
 */
const UNLOCKED_SCREENS = ['home', 'pasteTx', 'approve', 'signed'];

/** Who is asking, for requests pasted by hand (Stage 2). Stage 3 adds real apps. */
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

  // --- On start: is there a wallet on this phone? --------------------------
  useEffect(() => {
    (async () => {
      try {
        const [savedAddress, vault] = await Promise.all([loadAddress(), loadVault()]);
        if (savedAddress && vault) {
          setAddress(savedAddress);
          setScreen('unlock');
        } else {
          setScreen('welcome');
        }
      } catch {
        setScreen('welcome');
      }
    })();
  }, []);

  // --- Lock automatically when you leave the app ------------------------------
  // AppState tells us when the app goes to the background (you switched apps,
  // went to the home screen, or turned the screen off).
  useEffect(() => {
    if (!LOCK_WHEN_LEFT) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        setReading(null);    // forget any transaction in progress
        setSignResult(null);
        setScreen((current) => (UNLOCKED_SCREENS.includes(current) ? 'unlock' : current));
      }
    });
    return () => subscription.remove();
  }, []);

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
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (previous[screen]) {
        previous[screen]();
        return true; // "we handled it, don't close the app"
      }
      return false; // default behaviour (leave the app)
    });
    return () => subscription.remove();
  }, [screen, setupOrigin, backToWelcome]);

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
            onSigned={(result) => { setReading(null); setSignResult(result); setScreen('signed'); }}
            onRejected={() => { setReading(null); setScreen('home'); }}
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
