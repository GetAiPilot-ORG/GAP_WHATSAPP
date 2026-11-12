import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingAction, needsBookingReview, renderBookingReview } from '../bookingReview.js';
const events = [{ id: 'workshop-1', title: 'Nova', start: { dateTime: '2099-11-13T12:00:00+05:30' }, end: { dateTime: '2099-11-13T13:00:00+05:30' } }];
const fields = { kind: 'student', action: 'review', event_id: 'workshop-1', name: 'Tanishk', participants: 1 };
test('complete details always produce review buttons', () => {
  const reply = JSON.parse(renderBookingReview(fields, events, [], 'Asia/Kolkata'));
  assert.deepEqual(reply.buttons.map((b: any) => b.id), ['Confirm booking request', 'Change booking details', 'Cancel booking request']);
});
test('missing fields and invented events cannot advance', () => {
  assert.match(renderBookingReview({ ...fields, name: null }, events, [], 'Asia/Kolkata'), /naam/);
  assert.match(renderBookingReview({ ...fields, participants: null }, events, [], 'Asia/Kolkata'), /Kitne participants/);
  assert.match(renderBookingReview({ ...fields, event_id: 'invented' }, events, [], 'Asia/Kolkata'), /exact workshop/);
});
test('confirmation requires matching review and never claims a saved booking', () => {
  const first = renderBookingReview({ ...fields, action: 'confirm' }, events, [], 'Asia/Kolkata');
  assert.ok(JSON.parse(first).buttons);
  assert.match(renderBookingReview({ ...fields, action: 'confirm' }, events, [{ role: 'assistant', content: first }], 'Asia/Kolkata'), /Final booking abhi pending/);
  assert.match(renderBookingReview({ ...fields, action: 'change' }, events, [], 'Asia/Kolkata'), /Nayi details/);
});
test('followups retain booking intent', () => {
  assert.equal(needsBookingReview([], 'Slot book kro'), true);
  assert.equal(needsBookingReview([{ role: 'user', content: 'booking karni hai' }], 'Name Tanishk'), true);
  assert.equal(needsBookingReview([], 'What is the address?'), false);
});

test('confirmation questions route to review rather than payment or consent', () => {
  assert.equal(bookingAction('Confirmation ??'), 'review');
  assert.equal(bookingAction('Conformation ??'), 'review');
  assert.equal(bookingAction('Review Krna hai !'), 'review');
  assert.equal(bookingAction('Confirm booking request'), 'confirm');
  assert.equal(bookingAction('Confirm'), 'confirm');
  assert.equal(bookingAction('Mujhe khuch info update karni h'), 'change');
  assert.equal(bookingAction('Change Details'), 'change');
  assert.equal(bookingAction('Payment link do'), null);
  assert.equal(bookingAction('Contact?'), null);
  assert.equal(needsBookingReview([], 'Confirmation ??'), true);
});
