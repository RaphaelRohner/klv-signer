/*
 * PasteTransactionScreen.js — Stage 2's test door: paste a transaction by hand
 * ============================================================================
 *
 * In Stage 3, other apps will hand transactions to the Signer through
 * Android. Until then, this screen lets you paste an unsigned transaction
 * code yourself, so the reading and signing can be tested on its own.
 * (TESTING.md explains how to make a test transaction on your Mac.)
 *
 * Tapping "Read transaction" runs the Signer's strict reader
 * (klever/readTransaction.js). If the transaction passes every check, the
 * approval screen opens. If not, you see the reason in plain words, and
 * nothing is signed.
 */

import React, { useState } from 'react';
import { Body, Button, Field, NetworkBadge, Notice, Screen, Title } from '../components/ui.js';
import { readTransaction, ReadProblem } from '../klever/readTransaction.js';
import { NETWORK } from '../config.js';

/**
 * @param {object} props
 * @param {string} props.address                 the wallet in this Signer
 * @param {(reading: object) => void} props.onRead called when the transaction passed all checks
 * @param {() => void} props.onCancel
 */
export default function PasteTransactionScreen({ address, onRead, onCancel }) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');

  function read() {
    try {
      onRead(readTransaction(code, { network: NETWORK, walletAddress: address }));
    } catch (error) {
      setProblem(error instanceof ReadProblem ? error.message : `Something went wrong while reading: ${error.message}`);
    }
  }

  return (
    <Screen>
      <NetworkBadge />
      <Title>Sign a test transaction</Title>
      <Body>
        Paste an unsigned transaction code (a long string of 0–9 and a–f). The Signer will read it and show you
        exactly what it does before anything is signed.
      </Body>
      <Body muted>In Stage 3, apps will send transactions here automatically. This screen is for testing.</Body>

      {problem ? <Notice kind="danger">{problem}</Notice> : null}

      <Field
        label="Unsigned transaction code"
        value={code}
        multiline
        noLearning
        onChangeText={(text) => { setCode(text); setProblem(''); }}
        placeholder="0a89010807…"
      />

      <Button title="Read transaction" onPress={read} disabled={!code.trim()} />
      <Button title="Cancel" kind="secondary" onPress={onCancel} />
    </Screen>
  );
}
