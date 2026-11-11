import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestInboundMessage } from '../inboundIngestion.service.js';

test('ingestInboundMessage throws when required fields are missing', async () => {
  await assert.rejects(
    () => ingestInboundMessage({
      transport: 'meta',
      organizationId: '',
      phoneNumberId: '123456',
      contactWaId: '919876543210',
      waMessageId: 'wamid.123',
      type: 'text',
      text: 'hello',
    }),
    /organizationId is required/
  );

  await assert.rejects(
    () => ingestInboundMessage({
      transport: 'meta',
      organizationId: 'org_123',
      phoneNumberId: '123456',
      contactWaId: '',
      waMessageId: 'wamid.123',
      type: 'text',
      text: 'hello',
    }),
    /contactWaId is required/
  );

  await assert.rejects(
    () => ingestInboundMessage({
      transport: 'meta',
      organizationId: 'org_123',
      phoneNumberId: '123456',
      contactWaId: '919876543210',
      waMessageId: '',
      type: 'text',
      text: 'hello',
    }),
    /waMessageId is required/
  );
});
