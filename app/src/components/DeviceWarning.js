/*
 * DeviceWarning.js — the "this phone may not be safe" warning box
 * ===============================================================
 *
 * Shows the warnings from security/deviceChecks.js, if there are any.
 *   - full (default): every warning with its explanation, plus the honest
 *     limit of these checks. Used on the Welcome, Unlock and Home screens.
 *   - compact: one short line. Used on the approval screen, so the warning is
 *     visible at the moment of signing without pushing the transaction down.
 * Shows nothing when no warnings were found.
 */

import React from 'react';
import { Body, Notice, Strong } from './ui.js';
import { DEVICE_CHECK_LIMIT } from '../security/deviceChecks.js';

/**
 * @param {object} props
 * @param {{id:string, title:string, text:string}[]} props.findings
 * @param {boolean} [props.compact]
 */
export default function DeviceWarning({ findings, compact }) {
  if (!findings || findings.length === 0) return null;

  if (compact) {
    return (
      <Notice kind="warning">
        <Body>
          <Strong>This phone may not be safe for a wallet:</Strong> {findings.map((f) => f.title).join('; ')}.
          Details on the Home screen.
        </Body>
      </Notice>
    );
  }

  return (
    <Notice kind="danger">
      <Body>
        <Strong>This phone may not be safe for a wallet</Strong>
      </Body>
      {findings.map((f) => (
        <Body key={f.id}>
          <Strong>{f.title}.</Strong> {f.text}
        </Body>
      ))}
      <Body muted>
        The Signer still works, but don't keep real funds on this phone until this is fixed. {DEVICE_CHECK_LIMIT}
      </Body>
    </Notice>
  );
}
