export function isMetaTemplateAccount(account) {
    return Boolean(
        account &&
        account.status !== 'disconnected' &&
        account.whatsapp_business_account_id
    )
}

export function pickDefaultMetaAccount(accounts = []) {
    const metaAccounts = (Array.isArray(accounts) ? accounts : []).filter(isMetaTemplateAccount)
    if (!metaAccounts.length) return null

    return (
        metaAccounts.find(
            acc => acc.has_access_token && acc.token_status !== 'EXPIRED' && acc.token_status !== 'INVALID'
        ) ||
        metaAccounts.find(acc => acc.has_access_token) ||
        metaAccounts[0]
    )
}

export function resolveTemplateAccount(accounts = [], selectedAccount = null) {
    const fallbackMeta = pickDefaultMetaAccount(accounts)

    if (selectedAccount && isMetaTemplateAccount(selectedAccount)) {
        return {
            account: selectedAccount,
            accountId: selectedAccount.id,
            fallbackReason: null,
        }
    }

    if (fallbackMeta) {
        return {
            account: fallbackMeta,
            accountId: fallbackMeta.id,
            fallbackReason: selectedAccount ? 'non_meta_selected' : null,
        }
    }

    return {
        account: null,
        accountId: '',
        fallbackReason: 'no_meta_account',
    }
}

export function formatMetaAccountLabel(account) {
    if (!account) return 'Meta Cloud API account'
    const name = String(account.name || '').trim()
    const phone = String(account.display_phone_number || account.phone_number_id || '').trim()
    if (name && phone && name !== phone) return `${name} (${phone})`
    return name || phone || 'Meta Cloud API account'
}

