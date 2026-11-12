// Match the Cloud API number accounting used by the subscription backend.
export function getNumberCapacity(accounts, plan) {
    const raw = plan?.limits?.numbers
    const limit = raw === undefined || raw === null ? null : Number(raw)
    const known = limit !== null && Number.isFinite(limit)
    const used = accounts.filter(account => account.whatsapp_business_account_id && ['connected', 'active'].includes(account.status)).length
    return { used, limit: known ? limit : null, canConnect: known && (limit < 0 || used < limit), planName: plan?.name || 'Current plan' }
}
