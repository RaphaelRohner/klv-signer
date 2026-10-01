/*
 * DeviceWarning.js — the "this phone may not be safe" box
 * ======================================================
 *
 * Shows the findings from security/deviceChecks.js, if there are any.
 *   - full (default): every finding with its explanation, plus the honest
 *     limit of these checks. Used on the Welcome, Unlock and Home screens.
 *   - compact: one short line. Used on the approval screen, so it's visible
 *     at the moment of signing without pushing the transaction down.
 *
 * Two looks:
 *   - red, "Signing is switched off": at least one finding blocks signing
 *     (signs of root, unlocked bootloader, failed startup check).
 *   - orange, "may not be safe": only warnings (no screen lock, a keyboard
 *     you installed, apps with accessibility access). The Signer keeps working.
 * Shows nothing when nothing was found.
 */

import React from 'react';
import { Body, Notice, Strong } from './ui.js';
import { DEVICE_CHECK_LIMIT, isSigningBlocked, SIGNING_BLOCKED_TEXT } from '../security/deviceChecks.js';

/**
 * @param {object} props
 * @param {{id:string, title:string, text:string, blocks?:boolean}[]} props.findings
 * @param {boolean} [props.compact]
 */
export default function DeviceWarning({ findings, compact }) {
  if (!findings || findings.length === 0) return null;
  const blocked = isSigningBlocked(findings);
  const titles = findings.map((f) => f.title).join('; ');

  if (compact) {
    return (
      <Notice kind={blocked ? 'danger' : 'warning'}>
        <Body>
          <Strong>{blocked ? 'Signing is switched off on this phone:' : 'This phone may not be safe for a wallet:'}</Strong>{' '}
          {titles}. Details in Settings → This phone.
        </Body>
      </Notice>
    );
  }

  return (
    <Notice kind={blocked ? 'danger' : 'warning'}>
      <Body>
        <Strong>{blocked ? 'Signing is switched off on this phone' : 'This phone may not be safe for a wallet'}</Strong>
      </Body>
      {blocked ? <Body>{SIGNING_BLOCKED_TEXT}</Body> : null}
      {findings.map((f) => (
        <Body key={f.id}>
          <Strong>{f.title}.</Strong> {f.text}
        </Body>
      ))}
      <Body muted>
        {blocked
          ? 'If you rooted or unlocked this phone on purpose, undoing that switches signing back on. If you didn\'t, something may be wrong with the phone (or with this copy of the Signer).'
          : 'The Signer still works, but please sort these out before keeping real funds on this phone.'}{' '}
        {DEVICE_CHECK_LIMIT}
      </Body>
    </Notice>
  );
}
