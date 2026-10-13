import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForBaileys, resolveBaileysSocket } from '../outboundDispatch.service.js';
import { sessions } from '../whatsapp.service.js';

test('normalizeForBaileys formats raw phone numbers into WhatsApp JIDs', () => {
  assert.equal(normalizeForBaileys('919876543210'), '919876543210@s.whatsapp.net');
  assert.equal(normalizeForBaileys('+91 98765-43210'), '919876543210@s.whatsapp.net');
  assert.equal(normalizeForBaileys('120363025123456789@g.us'), '120363025123456789@g.us');
  assert.equal(normalizeForBaileys(''), null);
});

test('resolveBaileysSocket finds matching session by phone or display phone', () => {
  const dummySocket = { user: { id: '919876543210:1@s.whatsapp.net' } };
  sessions.set('session_test_1', dummySocket);

  try {
    const resolvedByPhone = resolveBaileysSocket({ phoneOrId: '919876543210' });
    assert.equal(resolvedByPhone, dummySocket);

    const resolvedByDisplay = resolveBaileysSocket({ displayPhone: '+91 98765 43210' });
    assert.equal(resolvedByDisplay, dummySocket);

    const resolvedBySession = resolveBaileysSocket({ sessionId: 'session_test_1' });
    assert.equal(resolvedBySession, dummySocket);
  } finally {
    sessions.delete('session_test_1');
  }
});
