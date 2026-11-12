import test from 'node:test';
import assert from 'node:assert/strict';
import { DisconnectReason } from '@whiskeysockets/baileys';
import {
  classifyBaileysDisconnect,
  findLiveBaileysSessionForAccount,
  sessions,
  sessionPhoneMap,
} from '../whatsapp.service.js';
import {
  isMetaCloudAccount,
  buildAccountReadinessSummary,
  getQrAccountDiagnostics,
  getMetaAccountDiagnostics,
  toSafeWhatsappAccount,
} from '../meta.service.js';
import { AccountHealthService } from '../accountHealth.service.js';

test('classifyBaileysDisconnect reconnects without clearing credentials on 428 Connection Closed', () => {
  const decision = classifyBaileysDisconnect({
    statusCode: DisconnectReason.connectionClosed,
    errorMessage: 'Connection Closed',
    attempt: 0,
  });

  assert.equal(decision.action, 'reconnect');
  assert.equal(decision.clearCredentials, false);
  assert.equal(decision.delayMs, 3000);

  const highAttempt = classifyBaileysDisconnect({
    statusCode: 428,
    errorMessage: 'Stream Errored (Connection Closed)',
    attempt: 25,
    maxAttempts: 20,
  });
  assert.equal(highAttempt.action, 'reconnect');
  assert.equal(highAttempt.clearCredentials, false);
  assert.equal(highAttempt.delayMs, 60000);
});

test('classifyBaileysDisconnect handles 515 restartRequired immediately without wiping credentials', () => {
  const decision = classifyBaileysDisconnect({
    statusCode: DisconnectReason.restartRequired,
    errorMessage: 'Stream Errored (restart required)',
    attempt: 4,
  });

  assert.equal(decision.action, 'reconnect');
  assert.equal(decision.clearCredentials, false);
  assert.equal(decision.resetRetries, true);
  assert.equal(decision.delayMs, 1000);
});

test('classifyBaileysDisconnect clears credentials only on loggedOut / badSession and stops on 440 conflict', () => {
  const loggedOut = classifyBaileysDisconnect({
    statusCode: DisconnectReason.loggedOut,
    errorMessage: 'Intentional Logout',
  });
  assert.equal(loggedOut.action, 'clear_and_stop');
  assert.equal(loggedOut.clearCredentials, true);

  const badMac = classifyBaileysDisconnect({
    statusCode: DisconnectReason.badSession,
    errorMessage: 'Bad MAC',
  });
  assert.equal(badMac.action, 'clear_and_stop');
  assert.equal(badMac.clearCredentials, true);

  const conflict = classifyBaileysDisconnect({
    statusCode: DisconnectReason.connectionReplaced,
    errorMessage: 'Stream Errored (conflict)',
  });
  assert.equal(conflict.action, 'stop_conflict');
  assert.equal(conflict.clearCredentials, false);
});

test('findLiveBaileysSessionForAccount matches live QR session by phone number across session IDs', () => {
  const sessionsMap = new Map<string, any>([
    [
      'session_iezuvfzvc',
      {
        user: { id: '917067612077:12@s.whatsapp.net' },
        ws: { isOpen: true, isClosed: false },
      },
    ],
  ]);

  const found = findLiveBaileysSessionForAccount(
    { id: 'wa-row-1', phone_number_id: '917067612077', display_phone_number: '917067612077' },
    { sessionsMap },
  );
  assert.equal(found.connected, true);
  assert.equal(found.reconnecting, false);
  assert.equal(found.sessionId, 'session_iezuvfzvc');
  assert.equal(found.phone, '917067612077');

  const closedMap = new Map<string, any>([
    [
      'session_iezuvfzvc',
      {
        user: { id: '917067612077:12@s.whatsapp.net' },
        ws: { isOpen: false, isClosed: true },
      },
    ],
  ]);
  const closed = findLiveBaileysSessionForAccount(
    { id: 'wa-row-1', phone_number_id: '917067612077' },
    {
      sessionsMap: closedMap,
      initializingSet: new Set(['session_iezuvfzvc']),
    },
  );
  assert.equal(closed.connected, false);
  assert.equal(closed.reconnecting, true);
});

test('QR account diagnostics and readiness report CONNECTED (never token_missing) when live Baileys socket is active', async () => {
  sessions.set('session_test_live', {
    user: { id: '917067612077:8@s.whatsapp.net' },
    ws: { isOpen: true, isClosed: false },
  });
  sessionPhoneMap.set('session_test_live', '917067612077');

  try {
    const staleQrRow = {
      id: 'qr-acc-1',
      phone_number_id: '917067612077',
      display_phone_number: '917067612077',
      whatsapp_business_account_id: null,
      access_token_encrypted: null,
      status: 'pending',
      connection_status: 'TOKEN_INVALID',
      token_status: 'MISSING',
      last_health_check_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    };

    assert.equal(isMetaCloudAccount(staleQrRow), false);

    const readiness = buildAccountReadinessSummary(staleQrRow);
    assert.equal(readiness.connection_type, 'qr_session');
    assert.equal(readiness.send_ready, true);

    const safe = toSafeWhatsappAccount(staleQrRow);
    assert.equal(safe.connection_type, 'qr_session');
    assert.equal(safe.send_ready, true);
    assert.equal(safe.health.connection, 'CONNECTED');
    assert.equal(safe.health.messaging, 'SEND_READY');

    const qrDiag = getQrAccountDiagnostics(staleQrRow, undefined, true);
    assert.equal(qrDiag.connection_type, 'qr_session');
    assert.equal(qrDiag.send_ready, true);
    assert.equal(qrDiag.reconnect_required, false);
    assert.deepEqual(qrDiag.issue_codes, []);

    const delegatedDiag = await getMetaAccountDiagnostics(staleQrRow);
    assert.equal(delegatedDiag.connection_type, 'qr_session');
    assert.equal(delegatedDiag.send_ready, true);
    assert.equal(delegatedDiag.issue_codes.includes('token_missing'), false);
  } finally {
    sessions.delete('session_test_live');
    sessionPhoneMap.delete('session_test_live');
  }
});

test('QR account reports qr_session_disconnected when no live session exists, while Meta Cloud account still reports token_missing', async () => {
  const qrAccount = {
    id: 'qr-acc-down',
    phone_number_id: '917067612077',
    display_phone_number: '917067612077',
    whatsapp_business_account_id: null,
    access_token_encrypted: null,
    status: 'connected',
  };

  const qrDiag = getQrAccountDiagnostics(
    qrAccount,
    { connected: false, reconnecting: false, sessionId: null, phone: null },
    true,
  );
  assert.equal(qrDiag.send_ready, false);
  assert.equal(qrDiag.reconnect_required, false);
  assert.deepEqual(qrDiag.issue_codes, ['qr_session_disconnected']);
  assert.equal(qrDiag.issue_codes.includes('token_missing'), false);

  const metaMissingToken = {
    id: 'meta-acc-1',
    phone_number_id: '1234567890',
    whatsapp_business_account_id: 'waba-123',
    access_token_encrypted: null,
    status: 'connected',
  };
  assert.equal(isMetaCloudAccount(metaMissingToken), true);
  const metaDiag = await getMetaAccountDiagnostics(metaMissingToken);
  assert.equal(metaDiag.send_ready, false);
  assert.deepEqual(metaDiag.issue_codes, ['token_missing']);
});

test('AccountHealthService.buildHealthSummary does not mark QR accounts as TOKEN_INVALID when connection_type is omitted', () => {
  const health = AccountHealthService.buildHealthSummary({
    phone_number_id: '917067612077',
    whatsapp_business_account_id: null,
    access_token_encrypted: null,
    status: 'connected',
  });
  assert.equal(health.connection, 'CONNECTED');
  assert.equal(health.messaging, 'SEND_READY');
});

