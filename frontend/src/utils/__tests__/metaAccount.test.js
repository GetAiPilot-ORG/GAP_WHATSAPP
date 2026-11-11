import test from 'node:test'
import assert from 'node:assert/strict'
import {
    formatMetaAccountLabel,
    isMetaTemplateAccount,
    pickDefaultMetaAccount,
    resolveTemplateAccount,
} from '../metaAccount.js'

const qrAccount = {
    id: 'qr-1',
    display_phone_number: '917067612077',
    whatsapp_business_account_id: null,
    has_access_token: false,
    token_status: 'MISSING',
    status: 'connected',
}

const expiredMeta = {
    id: 'meta-expired',
    name: 'Old Meta',
    display_phone_number: '+1 555-000-0001',
    whatsapp_business_account_id: '111',
    has_access_token: true,
    token_status: 'EXPIRED',
    status: 'failed',
}

const validMeta = {
    id: 'meta-valid',
    name: "Priyansh's portfolio",
    display_phone_number: '+1 555-346-3352',
    whatsapp_business_account_id: '1389972205968686',
    has_access_token: true,
    token_status: 'VALID',
    status: 'connected',
}

test('resolveTemplateAccount selects valid Meta account when All is active (selectedAccount is null)', () => {
    const resolved = resolveTemplateAccount([qrAccount, expiredMeta, validMeta], null)
    assert.equal(resolved.accountId, 'meta-valid')
    assert.equal(resolved.fallbackReason, null)
    assert.equal(formatMetaAccountLabel(resolved.account), "Priyansh's portfolio (+1 555-346-3352)")
})

test('resolveTemplateAccount falls back cleanly when a QR-only account is selected', () => {
    const resolved = resolveTemplateAccount([qrAccount, validMeta], qrAccount)
    assert.equal(resolved.accountId, 'meta-valid')
    assert.equal(resolved.fallbackReason, 'non_meta_selected')
})

test('resolveTemplateAccount preserves explicitly selected Meta account even when another exists', () => {
    const secondMeta = { ...validMeta, id: 'meta-2', whatsapp_business_account_id: '999' }
    const resolved = resolveTemplateAccount([validMeta, secondMeta], secondMeta)
    assert.equal(resolved.accountId, 'meta-2')
    assert.equal(resolved.fallbackReason, null)
})

test('resolveTemplateAccount reports no_meta_account when only QR or disconnected accounts exist', () => {
    assert.equal(isMetaTemplateAccount({ ...validMeta, status: 'disconnected' }), false)
    assert.equal(pickDefaultMetaAccount([qrAccount]), null)
    const resolved = resolveTemplateAccount([qrAccount], null)
    assert.equal(resolved.accountId, '')
    assert.equal(resolved.account, null)
    assert.equal(resolved.fallbackReason, 'no_meta_account')
})

