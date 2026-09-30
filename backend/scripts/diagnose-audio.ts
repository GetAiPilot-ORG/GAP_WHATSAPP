import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { supabase } from '../src/config/supabase.js';

async function diagnose() {
  const { data: messages, error } = await supabase
    .from('w_messages')
    .select('id, wa_message_id, direction, type, content, status, created_at')
    .eq('type', 'audio')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }

  console.log('--- AUDIO MESSAGES ---');
  for (const m of messages || []) {
    console.log(`[${m.created_at}] ID: ${m.id} | Type: ${m.type} | Direction: ${m.direction}`);
    console.log('Content:', JSON.stringify(m.content, null, 2));
    console.log('--------------------------------------------------');
  }
}

diagnose();
