import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_KEY_ROLE = 'test';
const { supabase } = await import('../../config/supabase.js');
const { getAppointments } = await import('../../controllers/appointments.controller.js');

async function listing(query: Record<string, string> = {}, snapshotOnly = false) {
  const original = supabase.from;
  const scopes: Array<[string, string, string]> = [];
  const sessions = [
    { id: 'booking-rental', flow_id: 'flow-rental', contact_id: 'contact-a', state_data: { name: 'Customer A', phone: '919000000001', appointment_date: '2026-11-13', selected_time_raw: '10:00', appointment_time: '10:00 AM', appointment_status: 'confirmed', appointment_flow_name: 'Studio Rental' } },
    { id: 'booking-class', flow_id: 'flow-class', contact_id: 'contact-a', state_data: { name: 'Customer A', phone: '919000000001', appointment_date: '2026-11-13', selected_time_raw: '12:00', appointment_time: '12:00 PM', appointment_status: 'confirmed' } },
  ];
  supabase.from = (table: string) => {
    const fixtures: any = {
      w_integrations: null, w_flow_sessions: sessions,
      w_flows: snapshotOnly ? [] : [{ id: 'flow-rental', name: 'Studio Rental' }, { id: 'flow-class', name: 'Dance Class' }],
      w_contacts: [{ id: 'contact-a', custom_name: 'Customer A', phone: '919000000001' }],
      w_conversations: [{ id: 'conversation-a', contact_id: 'contact-a' }],
    };
    const result = { data: fixtures[table] || null, error: null };
    const chain: any = {};
    for (const method of ['select', 'in', 'order', 'limit']) chain[method] = () => chain;
    chain.eq = (key: string, value: string) => { scopes.push([table, key, value]); return chain; };
    chain.single = chain.maybeSingle = async () => result;
    chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  let body: any;
  const response: any = { json: (value: any) => { body = value; return response; }, status: () => response };
  try {
    await getAppointments({ query: { organization_id: 'org-a', ...query }, headers: {} } as any, response);
    assert.equal(body.success, true, body.error);
    return { body, scopes };
  } finally { supabase.from = original; }
}

test('two services for the same customer remain distinct and expose flow names', async () => {
  const { body, scopes } = await listing();
  assert.equal(body.data.length, 2);
  assert.deepEqual(body.data.map((row: any) => row.flow_name), ['Studio Rental', 'Dance Class']);
  assert.equal(body.services.length, 2);
  assert.ok(scopes.some(([table, key, value]) => table === 'w_flows' && key === 'organization_id' && value === 'org-a'));
});
test('service selection filters bookings and totals while keeping both service options', async () => {
  const { body } = await listing({ flow_id: 'flow-class' });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].flow_name, 'Dance Class');
  assert.equal(body.summary.totalBookings, 1);
  assert.equal(body.services.length, 2);
});
test('service names are searchable and a missing flow uses the saved name', async () => {
  const { body } = await listing({ search: 'rental' });
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].flow_id, 'flow-rental');
  assert.equal((await listing({ flow_id: 'flow-rental' }, true)).body.data[0].flow_name, 'Studio Rental');
});
