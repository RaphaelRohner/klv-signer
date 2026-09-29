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
 *        "welcome"       "unlock" ◄───────────── "Lock now", or leaving the app
 *        │       │          │ right password
 *   Create│       │Restore   ▼
 *        ▼       ▼        "home"
 *  "showPhrase" "restore"
 *        ▼       │
 * "confirmPhrase"│
 *        ▼       ▼
 *       "setPassword" ──► wallet scrambled and saved ──► "home"
 *
 *   Removing the wallet (from "home" or "unlock") goes back to "welcome".
 *
 * WHAT'S KEPT IN MEMORY HERE, AND FOR HOW LONG
 *   draftPhrase  the recovery phrase, ONLY during setup. Cleared as soon as
 *                the wallet is saved, or when you back out to the welcome screen.
 *   address      the public klv1… address (not secret).
 *   unlockInfo   test info: how long the last password check took.
 * The private key is never kept here. It only exists for a moment inside
 * the setup and unlock steps, and is wiped right after.
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

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [draftPhrase, setDraftPhrase] = useState(null);
  const [setupOrigin, setSetupOrigin] = useState(null); // 'create' or 'restore'
  const [address, setAddress] = useState(null);
  const [unlockInfo, setUnlockInfo] = useState(null);
  const [justCreated, setJustCreated] = useState(false);

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
        setScreen((current) => (current === 'home' ? 'unlock' : current));
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
            onRemoved={afterRemoved}
          />
        );
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
