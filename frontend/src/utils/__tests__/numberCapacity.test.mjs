import test from 'node:test'
import assert from 'node:assert/strict'
import { getNumberCapacity } from '../numberCapacity.js'
const connected = { whatsapp_business_account_id: 'waba', status: 'connected' }
for (const [name, limit, used, canConnect] of [
    ['Starter first number', 1, 0, true], ['Starter full', 1, 1, false],
    ['Pro second number', 2, 1, true], ['Pro full', 2, 2, false],
]) test(name, () => assert.equal(getNumberCapacity(Array(used).fill(connected), { limits: { numbers: limit } }).canConnect, canConnect))
test('Unknown plan never flashes connection controls', () => assert.equal(getNumberCapacity([], null).canConnect, false))
test('Disconnected and QR accounts match backend Cloud number accounting', () => {
    const result = getNumberCapacity([{ ...connected, status: 'disconnected' }, { status: 'connected', connection_type: 'qr_session' }], { limits: { numbers: 1 } })
    assert.equal(result.used, 0)
    assert.equal(result.canConnect, true)
})
test('Unlimited plan retains number management', () => assert.equal(getNumberCapacity([connected], { limits: { numbers: -1 } }).canConnect, true))
