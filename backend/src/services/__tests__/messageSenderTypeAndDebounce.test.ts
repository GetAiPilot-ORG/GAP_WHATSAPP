import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setBotDebounce, clearBotDebounce, hasBotDebounce, getBotLock, setBotLock } from '../botDebounce.service.js';

test('botDebounce.service sets, checks, and clears debounce timers reliably', () => {
  const convId = 'conv-debounce-test-1';
  assert.equal(hasBotDebounce(convId), false);

  let fired = false;
  const timeout = setTimeout(() => {
    fired = true;
  }, 5000);

  setBotDebounce(convId, timeout);
  assert.equal(hasBotDebounce(convId), true);

  const cleared = clearBotDebounce(convId);
  assert.equal(cleared, true);
  assert.equal(hasBotDebounce(convId), false);
  assert.equal(fired, false);
});

test('botDebounce.service replaces existing timer when set again', () => {
  const convId = 'conv-debounce-test-2';
  let firstFired = false;
  let secondFired = false;

  const timer1 = setTimeout(() => { firstFired = true; }, 5000);
  const timer2 = setTimeout(() => { secondFired = true; }, 5000);

  setBotDebounce(convId, timer1);
  setBotDebounce(convId, timer2);

  clearBotDebounce(convId);
  assert.equal(firstFired, false);
  assert.equal(secondFired, false);
  assert.equal(hasBotDebounce(convId), false);
});

test('botDebounce.service sequential lock chain resolves correctly', async () => {
  const convId = 'conv-lock-test-1';
  let order: number[] = [];

  const lock1 = getBotLock(convId).then(() => {
    order.push(1);
  });
  setBotLock(convId, lock1);

  const lock2 = getBotLock(convId).then(() => {
    order.push(2);
  });
  setBotLock(convId, lock2);

  await getBotLock(convId);
  assert.deepEqual(order, [1, 2]);
});
