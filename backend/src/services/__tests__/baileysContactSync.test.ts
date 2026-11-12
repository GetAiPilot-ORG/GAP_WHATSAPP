import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_KEY_ROLE = 'test';

const {
    normalizeContactWaIdForStorage,
    normalizeLidForStorage,
    sanitizeContactDisplayName,
    isInvalidStoredContactName,
    extractBaileysContactNameWithSource,
    pickBestBaileysContactName,
    upsertContact,
} = await import('../contacts.service.js');

const {
    normalizeWaIdToPhone,
    derivePhoneForStorage,
} = await import('../../utils/format.js');

const {
    BaileysContactDirectory,
    extractBaileysContactSignals,
    syncMissingLidsForOrg,
} = await import('../baileysContactSync.service.js');

// Lightweight in-memory Supabase table mock supporting filters/updates/upserts/deletes needed by contacts.service.ts
function createInMemorySupabase(seed: {
    w_contacts?: any[];
    w_conversations?: any[];
    w_messages?: any[];
    w_conversation_notes?: any[];
    w_conversation_summaries?: any[];
    w_conversation_reads?: any[];
    w_flow_sessions?: any[];
    w_flow_runs?: any[];
    w_message_usage_logs?: any[];
    w_broadcast_recipients?: any[];
}) {
    const db: Record<string, any[]> = {
        w_contacts: (seed.w_contacts || []).map((r) => ({ ...r })),
        w_conversations: (seed.w_conversations || []).map((r) => ({ ...r })),
        w_messages: (seed.w_messages || []).map((r) => ({ ...r })),
        w_conversation_notes: (seed.w_conversation_notes || []).map((r) => ({ ...r })),
        w_conversation_summaries: (seed.w_conversation_summaries || []).map((r) => ({ ...r })),
        w_conversation_reads: (seed.w_conversation_reads || []).map((r) => ({ ...r })),
        w_flow_sessions: (seed.w_flow_sessions || []).map((r) => ({ ...r })),
        w_flow_runs: (seed.w_flow_runs || []).map((r) => ({ ...r })),
        w_message_usage_logs: (seed.w_message_usage_logs || []).map((r) => ({ ...r })),
        w_broadcast_recipients: (seed.w_broadcast_recipients || []).map((r) => ({ ...r })),
    };

    const getPathValue = (row: any, field: string) => {
        if (field.includes('->>')) {
            const [col, key] = field.split('->>');
            const obj = row?.[col];
            return obj && typeof obj === 'object' ? (obj[key] ?? null) : null;
        }
        return row?.[field] ?? null;
    };

    const matchCondition = (row: any, expr: string): boolean => {
        const dotParts = expr.split('.');
        if (dotParts.length < 2) return false;
        const field = dotParts[0];
        const op = dotParts[1];
        const valRaw = dotParts.slice(2).join('.');
        const val = valRaw.replace(/^"|"$/g, '');
        const actual = getPathValue(row, field);
        if (op === 'eq') return String(actual ?? '') === val;
        if (op === 'is' && val === 'null') return actual === null || actual === undefined;
        return false;
    };

    class QueryBuilder {
        private table: string;
        private action: 'select' | 'update' | 'delete' | 'upsert' = 'select';
        private payload: any = null;
        private upsertConflict: string | null = null;
        private predicates: Array<(row: any) => boolean> = [];
        private rowLimit: number | null = null;
        private rowRange: [number, number] | null = null;
        private expectSingle = false;

        constructor(table: string) {
            this.table = table;
        }

        select(_cols?: string) {
            if (this.action === 'select') this.action = 'select';
            return this;
        }

        update(vals: any) {
            this.action = 'update';
            this.payload = vals;
            return this;
        }

        delete() {
            this.action = 'delete';
            return this;
        }

        upsert(vals: any, opts?: { onConflict?: string }) {
            this.action = 'upsert';
            this.payload = vals;
            this.upsertConflict = opts?.onConflict || null;
            return this;
        }

        eq(field: string, value: any) {
            this.predicates.push((r) => getPathValue(r, field) === value);
            return this;
        }

        in(field: string, values: any[]) {
            const set = new Set(values);
            this.predicates.push((r) => set.has(getPathValue(r, field)));
            return this;
        }

        is(field: string, value: any) {
            this.predicates.push((r) => {
                const v = getPathValue(r, field);
                return value === null ? v === null || v === undefined : v === value;
            });
            return this;
        }

        like(field: string, pattern: string) {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
            const re = new RegExp(`^${escaped}$`);
            this.predicates.push((r) => re.test(String(getPathValue(r, field) || '')));
            return this;
        }

        or(expr: string) {
            const parts = expr.split(',').map((s) => s.trim()).filter(Boolean);
            this.predicates.push((r) => parts.some((p) => matchCondition(r, p)));
            return this;
        }

        limit(n: number) {
            this.rowLimit = n;
            return this;
        }

        range(from: number, to: number) {
            this.rowRange = [from, to];
            return this;
        }

        single() {
            this.expectSingle = true;
            return this.exec();
        }

        then(resolve: any, reject: any) {
            return this.exec().then(resolve, reject);
        }

        private async exec() {
            const rows = db[this.table] || [];
            const matches = rows.filter((r) => this.predicates.every((fn) => fn(r)));

            if (this.action === 'select') {
                let sliced = matches.map((r) => ({ ...r }));
                if (this.rowRange) sliced = sliced.slice(this.rowRange[0], this.rowRange[1] + 1);
                if (this.rowLimit !== null) sliced = sliced.slice(0, this.rowLimit);
                return {
                    data: this.expectSingle ? (sliced[0] || null) : sliced,
                    error: null,
                };
            }

            if (this.action === 'update') {
                const updatedRows: any[] = [];
                for (const row of matches) {
                    Object.assign(row, this.payload);
                    updatedRows.push({ ...row });
                }
                return {
                    data: this.expectSingle ? (updatedRows[0] || null) : updatedRows,
                    error: null,
                };
            }

            if (this.action === 'delete') {
                const matchIds = new Set(matches);
                db[this.table] = rows.filter((r) => !matchIds.has(r));
                return { data: matches, error: null };
            }

            if (this.action === 'upsert') {
                const cols = (this.upsertConflict || '').split(',').map((s) => s.trim()).filter(Boolean);
                let target = cols.length
                    ? rows.find((r) => cols.every((c) => r[c] === this.payload[c]))
                    : null;
                if (target) {
                    Object.assign(target, this.payload);
                } else {
                    target = { id: this.payload.id || `id-${rows.length + 1}`, ...this.payload };
                    rows.push(target);
                }
                return {
                    data: this.expectSingle ? { ...target } : [{ ...target }],
                    error: null,
                };
            }

            return { data: null, error: null };
        }
    }

    return {
        db,
        client: {
            from: (table: string) => new QueryBuilder(table),
        },
    };
}

function createMockIo() {
    const emitted: Array<{ room: string; event: string; payload: any }> = [];
    return {
        emitted,
        client: {
            to: (room: string) => ({
                emit: (event: string, payload: any) => {
                    emitted.push({ room, event, payload });
                },
            }),
        },
    };
}

test('normalization strips device suffixes without corrupting digits', () => {
    assert.equal(normalizeContactWaIdForStorage('919174222385:0@s.whatsapp.net'), '919174222385');
    assert.equal(normalizeContactWaIdForStorage('919174222385@s.whatsapp.net'), '919174222385');
    assert.equal(normalizeContactWaIdForStorage('180303062687893:12@lid'), '180303062687893@lid');
    assert.equal(normalizeContactWaIdForStorage('120363328515360800@newsletter'), '120363328515360800@newsletter');

    assert.equal(normalizeLidForStorage('180303062687893:0@lid'), '180303062687893@lid');
    assert.equal(normalizeLidForStorage('919174222385@s.whatsapp.net'), null);

    assert.equal(normalizeWaIdToPhone('919174222385:0@s.whatsapp.net'), '919174222385');
    assert.equal(derivePhoneForStorage('919174222385:0@s.whatsapp.net'), '919174222385');
    assert.equal(derivePhoneForStorage('180303062687893:0@lid'), null);
});

test('name sanitization rejects formatted phones, JIDs, and raw IDs', () => {
    assert.equal(sanitizeContactDisplayName('+44 7767 747899', '447767747899'), null);
    assert.equal(sanitizeContactDisplayName('(555) 123-4567', '15551234567'), null);
    assert.equal(sanitizeContactDisplayName('180303062687893', '919174222385', ['180303062687893@lid']), null);
    assert.equal(sanitizeContactDisplayName('Tanishhk Goswami', '919174222385', ['180303062687893@lid']), 'Tanishhk Goswami');

    assert.equal(isInvalidStoredContactName('+44 7767 747899', '447767747899'), true);
    assert.equal(isInvalidStoredContactName('Channel 120363328515360800', '120363328515360800@newsletter'), true);
    assert.equal(isInvalidStoredContactName('Shradha khapra', '120363328515360800@newsletter'), false);

    // Falls through when .name is just a formatted phone number
    const picked = extractBaileysContactNameWithSource(
        { name: '+91 91742 22385', notify: 'Tanishk' },
        '919174222385',
    );
    assert.deepEqual(picked, { name: 'Tanishk', preferIncomingName: false });
    assert.equal(
        pickBestBaileysContactName({ fullName: 'Tanishhk Goswami', notify: 'Tanu' }, '919174222385'),
        'Tanishhk Goswami',
    );
});

test('BaileysContactDirectory extracts LID-phone pairs and resolves fromMe @lid chats accurately', () => {
    const dir = new BaileysContactDirectory();

    // 1) Initial contact sync with lid even when name comes from a separate record or chat
    const contactSig = extractBaileysContactSignals({
        id: '919174222385@s.whatsapp.net',
        lid: '180303062687893:0@lid',
        name: 'Tanishhk Goswami',
    });
    assert.equal(contactSig?.targetWaId, '919174222385');
    assert.equal(contactSig?.phoneWaId, '919174222385');
    assert.equal(contactSig?.lid, '180303062687893@lid');
    assert.equal(contactSig?.name, 'Tanishhk Goswami');
    assert.equal(contactSig?.preferIncomingName, true);

    dir.record({
        waId: contactSig?.phoneWaId,
        lid: contactSig?.lid,
        name: contactSig?.name,
        preferIncomingName: contactSig?.preferIncomingName,
    });

    // 2) User texts Tanishk from their phone: Baileys fires fromMe=true on @lid, pushName="Priyansh", senderPn="919999999999" (own number)
    const outboundIdentity = dir.resolveMessageIdentity({
        remoteJid: '180303062687893@lid',
        senderPn: '919999999999@s.whatsapp.net',
        fromMe: true,
        myPhone: '919999999999:0@s.whatsapp.net',
        myLid: '218016918818978@lid',
        pushName: 'Priyansh',
    });

    assert.equal(outboundIdentity.contactWaId, '919174222385');
    assert.equal(outboundIdentity.lid, '180303062687893@lid');
    assert.equal(outboundIdentity.contactNameForUpsert, 'Tanishhk Goswami');
    assert.equal(outboundIdentity.preferIncomingName, true);
    assert.equal(outboundIdentity.needsLidLookup, false);

    // 3) Unmapped outbound @lid message never leaks sender's own pushName or phone
    const unknownOutbound = dir.resolveMessageIdentity({
        remoteJid: '999999999999@lid',
        senderPn: '919999999999@s.whatsapp.net',
        fromMe: true,
        myPhone: '919999999999',
        pushName: 'Priyansh',
    });
    assert.equal(unknownOutbound.contactWaId, '999999999999@lid');
    assert.equal(unknownOutbound.contactNameForUpsert, null);
    assert.equal(unknownOutbound.needsLidLookup, true);

    // 4) Inbound message from unsaved contact delivers senderPn + pushName, linking for subsequent fromMe messages
    const inboundUnsaved = dir.resolveMessageIdentity({
        remoteJid: '888888888888@lid',
        senderPn: '919876543210@s.whatsapp.net',
        fromMe: false,
        myPhone: '919999999999',
        pushName: 'Rahul Sharma',
    });
    assert.equal(inboundUnsaved.contactWaId, '919876543210');
    assert.equal(inboundUnsaved.lid, '888888888888@lid');
    assert.equal(inboundUnsaved.contactNameForUpsert, 'Rahul Sharma');
    assert.equal(inboundUnsaved.needsLidLookup, false);

    const followUpOutbound = dir.resolveMessageIdentity({
        remoteJid: '888888888888@lid',
        fromMe: true,
        myPhone: '919999999999',
        pushName: 'Priyansh',
    });
    assert.equal(followUpOutbound.contactWaId, '919876543210');
    assert.equal(followUpOutbound.contactNameForUpsert, 'Rahul Sharma');
});

test('syncMissingLidsForOrg backfills LIDs and merges orphan @lid conversation into canonical phone contact', async () => {
    const { db, client } = createInMemorySupabase({
        w_contacts: [
            {
                id: 'c-phone-1',
                organization_id: 'org-1',
                wa_account_id: 'acc-1',
                wa_id: '919174222385',
                wa_key: '919174222385',
                phone: '919174222385',
                name: 'Tanishhk Goswami',
                custom_fields: null,
                contact_type: 'individual',
                save_source: 'auto',
                created_at: '2026-11-11T09:55:13Z',
            },
            {
                id: 'c-phone-2',
                organization_id: 'org-1',
                wa_account_id: 'acc-1',
                wa_id: '919800000001',
                wa_key: '919800000001',
                phone: '919800000001',
                name: 'Other Contact',
                custom_fields: null,
                contact_type: 'individual',
                save_source: 'auto',
                created_at: '2026-11-11T09:55:14Z',
            },
            {
                id: 'c-lid-orphan',
                organization_id: 'org-1',
                wa_account_id: 'acc-1',
                wa_id: '180303062687893@lid',
                wa_key: null,
                phone: null,
                name: null,
                custom_fields: null,
                contact_type: 'individual',
                save_source: 'auto',
                created_at: '2026-11-11T10:44:22Z',
            },
        ],
        w_conversations: [
            {
                id: 'conv-orphan',
                organization_id: 'org-1',
                wa_account_id: 'acc-1',
                contact_id: 'c-lid-orphan',
                last_message_preview: 'Hello from phone',
                last_message_at: '2026-11-11T12:04:45Z',
                unread_count: 0,
                status: 'open',
            },
        ],
        w_messages: [
            { id: 'm-1', organization_id: 'org-1', conversation_id: 'conv-orphan', contact_id: 'c-lid-orphan' },
            { id: 'm-2', organization_id: 'org-1', conversation_id: 'conv-orphan', contact_id: 'c-lid-orphan' },
        ],
    });
    const mockIo = createMockIo();
    const dir = new BaileysContactDirectory();

    const mockSock = {
        user: { id: '919999999999:0@s.whatsapp.net' },
        onWhatsApp: async (...jids: string[]) =>
            jids.map((jid) =>
                jid === '919174222385@s.whatsapp.net'
                    ? { jid, exists: true, lid: '180303062687893@lid' }
                    : { jid, exists: true, lid: '222222222222@lid' },
            ),
    };

    const result = await syncMissingLidsForOrg({
        sock: mockSock,
        orgId: 'org-1',
        waAccountId: 'acc-1',
        directory: dir,
        forceFullSync: true,
        deps: {
            supabaseClient: client,
            ioClient: mockIo.client,
            getProfilePhotoUrlFn: async () => null,
        },
    });

    assert.equal(result.checkedCount, 2);
    assert.equal(result.matchedCount, 2);
    assert.equal(result.mergedCount, 1);

    // Orphan @lid contact deleted, canonical keeps saved name and persists lid
    assert.equal(db.w_contacts.some((c) => c.id === 'c-lid-orphan'), false);
    const canonical = db.w_contacts.find((c) => c.id === 'c-phone-1');
    assert.equal(canonical?.name, 'Tanishhk Goswami');
    assert.equal(canonical?.custom_fields?.lid, '180303062687893@lid');

    const other = db.w_contacts.find((c) => c.id === 'c-phone-2');
    assert.equal(other?.custom_fields?.lid, '222222222222@lid');

    // Conversation and messages reassigned to canonical contact
    assert.equal(db.w_conversations[0].contact_id, 'c-phone-1');
    assert.equal(db.w_messages.every((m) => m.contact_id === 'c-phone-1'), true);

    // Directory now knows the LID immediately for subsequent messages
    assert.equal(dir.lookupPhone('180303062687893@lid'), '919174222385');
    assert.equal(dir.lookupName('180303062687893@lid')?.name, 'Tanishhk Goswami');

    // LiveChat notification payload carries merged_from_contact_id & previous_wa_id
    const mergeEvent = mockIo.emitted.find((e) => e.payload?.merged_from_contact_id === 'c-lid-orphan');
    assert.ok(mergeEvent);
    assert.equal(mergeEvent.room, 'org:org-1');
    assert.equal(mergeEvent.payload.previous_wa_id, '180303062687893@lid');
    assert.equal(mergeEvent.payload.contact.id, 'c-phone-1');
});

test('upsertContact merges colliding conversations, protects manual names, and upgrades sole @lid rows in place', async () => {
    const { db, client } = createInMemorySupabase({
        w_contacts: [
            {
                id: 'c-manual',
                organization_id: 'org-2',
                wa_account_id: 'acc-2',
                wa_id: '919811111111',
                wa_key: '919811111111',
                phone: '919811111111',
                name: 'Vip Client',
                save_source: 'manual',
                saved_at: '2026-11-10T10:00:00Z',
                tags: ['vip'],
                custom_fields: { email: 'vip@example.com' },
                created_at: '2026-11-10T10:00:00Z',
            },
            {
                id: 'c-lid-dup',
                organization_id: 'org-2',
                wa_account_id: 'acc-2',
                wa_id: '777777777777@lid',
                wa_key: null,
                phone: null,
                name: null,
                tags: ['whatsapp'],
                custom_fields: null,
                created_at: '2026-11-11T10:00:00Z',
            },
            {
                id: 'c-sole-lid',
                organization_id: 'org-2',
                wa_account_id: 'acc-2',
                wa_id: '666666666666@lid',
                wa_key: null,
                phone: null,
                name: null,
                custom_fields: null,
                created_at: '2026-11-11T11:00:00Z',
            },
        ],
        w_conversations: [
            {
                id: 'conv-manual',
                organization_id: 'org-2',
                wa_account_id: 'acc-2',
                contact_id: 'c-manual',
                last_message_preview: 'Older note',
                last_message_at: '2026-11-11T08:00:00Z',
                unread_count: 1,
                status: 'closed',
            },
            {
                id: 'conv-dup',
                organization_id: 'org-2',
                wa_account_id: 'acc-2',
                contact_id: 'c-lid-dup',
                last_message_preview: 'Newer ping',
                last_message_at: '2026-11-11T12:00:00Z',
                unread_count: 2,
                status: 'open',
            },
            {
                id: 'conv-sole',
                organization_id: 'org-2',
                wa_account_id: 'acc-2',
                contact_id: 'c-sole-lid',
                last_message_preview: 'Hi',
                last_message_at: '2026-11-11T12:00:00Z',
                unread_count: 0,
                status: 'open',
            },
        ],
        w_messages: [
            { id: 'm-old', conversation_id: 'conv-manual', contact_id: 'c-manual' },
            { id: 'm-new', conversation_id: 'conv-dup', contact_id: 'c-lid-dup' },
        ],
    });
    const mockIo = createMockIo();
    const deps = {
        supabaseClient: client,
        ioClient: mockIo.client,
        getProfilePhotoUrlFn: async () => null,
    };

    // 1) Merge colliding conversation + preserve manual contact name despite preferIncomingName=true
    const merged = await upsertContact(
        'org-2',
        'acc-2',
        '919811111111',
        'Phonebook Different Name',
        { lid: '777777777777@lid', preferIncomingName: true, skipProfilePhoto: true },
        deps,
    );

    assert.equal(merged.id, 'c-manual');
    assert.equal(merged.name, 'Vip Client');
    assert.deepEqual(merged.tags, ['vip', 'whatsapp']);
    assert.equal(merged.custom_fields.email, 'vip@example.com');
    assert.equal(merged.custom_fields.lid, '777777777777@lid');
    assert.equal(db.w_contacts.some((c) => c.id === 'c-lid-dup'), false);
    assert.equal(db.w_conversations.some((c) => c.id === 'conv-dup'), false);

    const targetConv = db.w_conversations.find((c) => c.id === 'conv-manual');
    assert.equal(targetConv.last_message_preview, 'Newer ping');
    assert.equal(targetConv.unread_count, 3);
    assert.equal(targetConv.status, 'open');
    assert.equal(db.w_messages.find((m) => m.id === 'm-new')?.conversation_id, 'conv-manual');
    assert.equal(db.w_messages.find((m) => m.id === 'm-new')?.contact_id, 'c-manual');

    const convMergeEmit = mockIo.emitted.find((e) => e.payload?.merged_from_contact_id === 'c-lid-dup');
    assert.deepEqual(convMergeEmit?.payload?.merged_conversations, [
        { from_conversation_id: 'conv-dup', to_conversation_id: 'conv-manual' },
    ]);

    // 2) Upgrade a sole @lid contact in place once its phone + name become known
    const upgraded = await upsertContact(
        'org-2',
        'acc-2',
        '919822222222',
        'Aarav Verma',
        { lid: '666666666666@lid', preferIncomingName: true, skipProfilePhoto: true },
        deps,
    );
    assert.equal(upgraded.id, 'c-sole-lid');
    assert.equal(upgraded.wa_id, '919822222222');
    assert.equal(upgraded.phone, '919822222222');
    assert.equal(upgraded.name, 'Aarav Verma');
    assert.equal(upgraded.custom_fields.lid, '666666666666@lid');

    const upgradeEmit = mockIo.emitted.find((e) => e.payload?.contact?.id === 'c-sole-lid');
    assert.equal(upgradeEmit?.payload?.previous_wa_id, '666666666666@lid');
});

