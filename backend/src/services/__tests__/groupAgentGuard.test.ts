import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_KEY_ROLE = 'test';

const {
  isGroupOrChannelWaId,
  isNonIndividualThreadContact,
  shouldRunBaileysBotAutomation,
} = await import('../../utils/format.js');
const { supabase } = await import('../../config/supabase.js');
const { getBotAgentReply } = await import('../ai.service.js');
const { processFlowEngine } = await import('../flows.service.js');
const { upsertConversation } = await import('../messages.service.js');

test('isGroupOrChannelWaId and isNonIndividualThreadContact identify groups, channels, and broadcasts', () => {
  assert.equal(isGroupOrChannelWaId('120363012345678901@g.us'), true);
  assert.equal(isGroupOrChannelWaId('120363328515360800@newsletter'), true);
  assert.equal(isGroupOrChannelWaId('status@broadcast'), true);
  assert.equal(isGroupOrChannelWaId('919876543210@s.whatsapp.net'), false);
  assert.equal(isGroupOrChannelWaId('99465193275790@lid'), false);
  assert.equal(isGroupOrChannelWaId(null), false);

  assert.equal(isNonIndividualThreadContact({ contact_type: 'group', wa_id: '123@g.us' }), true);
  assert.equal(isNonIndividualThreadContact({ contact_type: 'channel', wa_id: '123@newsletter' }), true);
  assert.equal(isNonIndividualThreadContact({ contact_type: 'individual', wa_id: '123@g.us' }), true);
  assert.equal(isNonIndividualThreadContact({ contact_type: 'individual', wa_id: '919876543210@s.whatsapp.net' }), false);
  assert.equal(isNonIndividualThreadContact({ contact_type: null, wa_id: '99465193275790@lid' }), false);
  assert.equal(isNonIndividualThreadContact(undefined), false);
});

test('shouldRunBaileysBotAutomation blocks groups, channels, outbound, and empty/non-text payloads', () => {
  const individualContact = { contact_type: 'individual', wa_id: '919876543210@s.whatsapp.net' };

  assert.equal(
    shouldRunBaileysBotAutomation({
      isOutbound: false,
      isGroup: true,
      isNewsletter: false,
      remoteJid: '120363012345678901@g.us',
      contact: { contact_type: 'group', wa_id: '120363012345678901@g.us' },
      normalizedType: 'text',
      captionText: 'Hello bot',
    }),
    false,
  );

  assert.equal(
    shouldRunBaileysBotAutomation({
      isOutbound: false,
      isGroup: false,
      isNewsletter: true,
      remoteJid: '120363328515360800@newsletter',
      contact: { contact_type: 'channel', wa_id: '120363328515360800@newsletter' },
      normalizedType: 'text',
      captionText: 'Company : CGI',
    }),
    false,
  );

  assert.equal(
    shouldRunBaileysBotAutomation({
      isOutbound: false,
      isGroup: false,
      isNewsletter: false,
      remoteJid: '120363012345678901@g.us',
      contact: null,
      normalizedType: 'audio',
      captionText: 'transcribed voice',
    }),
    false,
  );

  assert.equal(
    shouldRunBaileysBotAutomation({
      isOutbound: true,
      isGroup: false,
      isNewsletter: false,
      remoteJid: '919876543210@s.whatsapp.net',
      contact: individualContact,
      normalizedType: 'text',
      captionText: 'outbound text',
    }),
    false,
  );

  assert.equal(
    shouldRunBaileysBotAutomation({
      isOutbound: false,
      isGroup: false,
      isNewsletter: false,
      remoteJid: '919876543210@s.whatsapp.net',
      contact: individualContact,
      normalizedType: 'image',
      captionText: 'image caption',
    }),
    false,
  );

  assert.equal(
    shouldRunBaileysBotAutomation({
      isOutbound: false,
      isGroup: false,
      isNewsletter: false,
      remoteJid: '99465193275790@lid',
      contact: { contact_type: 'individual', wa_id: '99465193275790@lid' },
      normalizedType: 'text',
      captionText: 'Hi',
    }),
    true,
  );
});

test('getBotAgentReply skips groups and channels even for stop keywords without calling OpenAI or updating conversation', async () => {
  const previous = { fetch: globalThis.fetch, from: supabase.from, key: process.env.OPENAI_API_KEY };
  process.env.OPENAI_API_KEY = 'synthetic-key';

  let openAiCalls = 0;
  let conversationUpdates = 0;
  let activeCase: 'group' | 'channel_lookup' = 'group';

  supabase.from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => {
        if (table === 'w_conversations') conversationUpdates++;
        return chain;
      },
      single: async () => chain._resolve(),
      maybeSingle: async () => chain._resolve(),
      then: (resolve: any, reject: any) => Promise.resolve(chain._resolve()).then(resolve, reject),
      _resolve: () => {
        if (table === 'w_conversations') {
          if (activeCase === 'group') {
            return {
              data: {
                bot_enabled: true,
                assigned_bot_id: 'agent-1',
                contact_id: 'contact-group-1',
                contact: { contact_type: 'group', wa_id: '120363012345678901@g.us' },
              },
              error: null,
            };
          }
          return {
            data: {
              bot_enabled: true,
              assigned_bot_id: 'agent-1',
              contact_id: 'contact-channel-1',
              contact: null,
            },
            error: null,
          };
        }
        if (table === 'w_contacts') {
          return {
            data: { contact_type: 'channel', wa_id: '120363328515360800@newsletter' },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  globalThis.fetch = (async () => {
    openAiCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Should not reply' } }] }));
  }) as any;

  try {
    const groupReply = await getBotAgentReply({
      organization_id: 'org-1',
      conversation_id: 'conv-group-1',
      text: 'human',
    });
    assert.equal(groupReply, null);

    activeCase = 'channel_lookup';
    const channelReply = await getBotAgentReply({
      organization_id: 'org-1',
      conversation_id: 'conv-channel-1',
      text: 'talk to human',
    });
    assert.equal(channelReply, null);

    assert.equal(openAiCalls, 0);
    assert.equal(conversationUpdates, 0);
  } finally {
    globalThis.fetch = previous.fetch;
    supabase.from = previous.from;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
  }
});

test('processFlowEngine skips group and channel conversations before loading flows', async () => {
  const previousFrom = supabase.from;
  let flowTableQueried = false;

  supabase.from = (table: string) => {
    if (table === 'w_flows') flowTableQueried = true;
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === 'w_conversations') {
          return {
            data: {
              assigned_bot_id: null,
              contact_id: 'contact-group-1',
              contact: { contact_type: 'group', wa_id: '120363012345678901@g.us' },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  try {
    const result = await processFlowEngine('org-1', 'contact-group-1', 'conv-group-1', 'hello');
    assert.deepEqual(result, { consumed: false, output: null });
    assert.equal(flowTableQueried, false);
  } finally {
    supabase.from = previousFrom;
  }
});

test('upsertConversation forces bot_enabled=false for group/channel inserts and legacy updates', async () => {
  const previousFrom = supabase.from;
  const insertedPayloads: any[] = [];
  const updatedPayloads: any[] = [];
  let mode: 'insert_group' | 'update_legacy_channel' = 'insert_group';

  supabase.from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      insert: (payload: any) => {
        insertedPayloads.push(payload);
        return chain;
      },
      update: (payload: any) => {
        updatedPayloads.push(payload);
        return chain;
      },
      single: async () => ({
        data: { id: 'conv-1', organization_id: 'org-1', wa_account_id: 'acc-1', contact_id: 'c-1', bot_enabled: false },
        error: null,
      }),
      maybeSingle: async () => {
        if (table === 'w_conversations') {
          if (mode === 'insert_group') return { data: null, error: null };
          
          return {
            data: { id: 'conv-legacy', unread_count: 1, bot_enabled: true },
            error: null,
          };
        }
        if (table === 'w_contacts') {
          return {
            data: mode === 'insert_group'
              ? { contact_type: 'group', wa_id: '120363012345678901@g.us' }
              : { contact_type: 'channel', wa_id: '120363328515360800@newsletter' },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  try {
    await upsertConversation('org-1', 'acc-1', 'contact-group', {
      direction: 'inbound',
      preview: 'Group msg',
      isNonIndividual: true,
    });
    assert.equal(insertedPayloads.length, 1);
    assert.equal(insertedPayloads[0].bot_enabled, false);

    mode = 'update_legacy_channel';
    await upsertConversation('org-1', 'acc-1', 'contact-channel', {
      direction: 'inbound',
      preview: 'Channel post',
    });
    assert.equal(updatedPayloads.length, 1);
    assert.equal(updatedPayloads[0].bot_enabled, false);
  } finally {
    supabase.from = previousFrom;
  }
});

