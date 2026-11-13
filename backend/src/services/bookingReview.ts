import { parseInteractiveReply } from './agentButtons.js';

type Message = { role: string; content: string };
const bookingIntent = /\b(book(?:ing)?|reserve|registration|join|enroll)\b|बुक|बुकिंग/i;

export function bookingAction(text: string): 'review' | 'confirm' | 'change' | 'cancel' | null {
  const value = text.trim().toLowerCase().replace(/[!?।.]+$/g, '').trim();
  if (/^(confirm booking request|confirm|haan confirm|haa confirm|yes confirm)$/.test(value)) return 'confirm';
  if (/^(cancel booking request|cancel request)$/.test(value)) return 'cancel';
  if (/^(change booking details|change details)$/.test(value) || /(?:info|details).*(?:update|change)|(?:update|change).*(?:info|details)/.test(value)) return 'change';
  // Asking for confirmation/status is not consent and must never become payment intent.
  if (/^(?:confirmation|conformation|booking status|booking confirmation|booking review)$/.test(value) || /^review\b/.test(value)) return 'review';
  return null;
}

export function needsBookingReview(history: Message[], text: string) {
  const users = [...history.filter(m => m.role === 'user').map(m => m.content), text];
  return bookingAction(text) !== null || users.some(value => bookingIntent.test(value));
}

// The model extracts fields only. Code owns the stage, summary and buttons.
export function renderBookingReview(fields: any, events: any[], history: Message[], timezone: string, now = Date.now()): string {
  if (fields?.action === 'cancel') return 'Booking request rok di hai. Koi confirmed booking cancel nahi ki gayi hai.';
  if (fields?.action === 'other') return '';
  if (fields?.action === 'change') return 'Kya badalna hai—workshop/date, naam ya participants? Nayi details batayein; phir review buttons bhejunga.';
  if (fields?.kind === 'artist') return JSON.stringify({ text: 'Studio rental ya collaboration request ke liye apni preferred date, time, duration aur requirements batayein. Final approval studio team degi.', buttons: [{ id: 'Studio rental request', text: 'Studio Rental' }, { id: 'Studio collab request', text: 'Collaboration' }] });
  const event = events.find(e => String(e.id) === fields?.event_id);
  if (!event || event.status === 'cancelled' || !event.start?.dateTime || !event.end?.dateTime || Date.parse(event.end.dateTime) <= now) {
    return 'Booking request ke liye exact workshop aur date batayein. Session verify hone ke baad details review karenge.';
  }
  const name = typeof fields.name === 'string' ? fields.name.trim().slice(0, 100) : '';
  const count = Number(fields.participants);
  if (!name || !Number.isInteger(count) || count < 1 || count > 100) {
    return !name ? 'Booking request ke liye aapka naam aur kitne participants hain, batayein. Final booking studio approval ke baad hogi.' : 'Kitne participants ke liye booking request chahiye?';
  }
  const format = (value: string) => new Intl.DateTimeFormat('en-IN', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const summary = `Workshop: ${event.title || event.summary}\nDate/time: ${format(event.start.dateTime)} – ${format(event.end.dateTime)} (${timezone})\nName: ${name}\nParticipants: ${count}`;
  const lastAssistant = history.filter(m => m.role === 'assistant').at(-1)?.content || '';
  const previous = parseInteractiveReply(lastAssistant);
  // A yes is valid only after the matching review, never after an unrelated question.
  const reviewed = (previous?.text || lastAssistant).includes(summary) && (previous?.text || lastAssistant).includes('Booking request review');
  if (fields.action === 'confirm' && reviewed) {
    return `Aapne ye details approve ki hain:\n${summary}\n\nFinal booking abhi pending hai. Request studio ko automatically forward ya reserve nahi hui hai. Final confirmation ke liye studio team se contact karein.`;
  }
  return JSON.stringify({ text: `Booking request review\n${summary}\n\nKya ye details sahi hain? Final booking studio approval ke baad hogi.`, buttons: [{ id: 'Confirm booking request', text: 'Confirm' }, { id: 'Change booking details', text: 'Change Details' }, { id: 'Cancel booking request', text: 'Cancel Request' }] });
}
