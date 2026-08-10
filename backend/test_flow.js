import { processFlowEngine } from './src/services/flows.service.js';
import { supabase } from './src/config/supabase.js';

async function test() {
  console.log('--- STARTING FLOW ENGINE MOCK RUN ---');
  
  const organization_id = 'a5666f0d-ebcf-4ca6-b567-4fb5ef10df48'; // Or any valid org
  // Let's query an active contact/conversation to use
  const { data: contacts } = await supabase.from('w_contacts').select('*').limit(1);
  if (!contacts || contacts.length === 0) {
    console.error('No contacts found in DB');
    return;
  }
  const contact = contacts[0];
  const { data: convs } = await supabase.from('w_conversations').select('*').eq('contact_id', contact.id).limit(1);
  const conv = convs?.[0];
  if (!conv) {
    console.error('No conversation found');
    return;
  }

  const flow_id = '606a0008-5743-40f9-895e-b5980d27a890';
  
  // Clean up any existing active sessions first
  await supabase
    .from('w_flow_sessions')
    .update({ status: 'completed' })
    .eq('conversation_id', conv.id);

  console.log(`Using Contact: ${contact.phone}, Conversation: ${conv.id}`);
  
  // Run 1: Keyword "Node" trigger (New Session)
  console.log('\n>> STEP 1: Sending keyword "Node"');
  const res1 = await processFlowEngine({
    organization_id: conv.organization_id,
    conversation_id: conv.id,
    contact_id: contact.id,
    text: 'Node',
    isResuming: false,
    triggerMessageId: null,
    currentFlowId: flow_id,
  });
  
  console.log('Result 1:', JSON.stringify(res1, null, 2));

  // Let's check the created session
  const { data: session } = await supabase
    .from('w_flow_sessions')
    .select('*')
    .eq('conversation_id', conv.id)
    .in('status', ['active', 'waiting'])
    .maybeSingle();

  if (!session) {
    console.log('No active/waiting session found after step 1!');
    return;
  }
  console.log('Active Session created:', { id: session.id, node: session.current_node_id, state: session.state_data });
}

test().catch(console.error);
