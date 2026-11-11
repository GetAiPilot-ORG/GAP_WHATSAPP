import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { supabase } from '../src/config/supabase.js';
import { transcribeAudioBuffer } from '../src/services/voice.service.js';
import { getBotAgentReply } from '../src/services/ai.service.js';

async function testLatestVoiceNote() {
  const msgId = '13bbdc3a-35c6-40eb-b439-e742ee028e4e';
  const { data: msg } = await supabase.from('w_messages').select('*').eq('id', msgId).single();
  if (!msg) return console.log('Message not found');

  console.log('Testing audio message:', msg.id);
  console.log('Media URL:', msg.content?.media_url);

  const res = await fetch(msg.content?.media_url);
  const buffer = Buffer.from(await res.arrayBuffer());

  const transcript = await transcribeAudioBuffer({
    buffer,
    mimeType: msg.content?.mime_type || 'audio/ogg',
    fileName: msg.content?.file_name,
    organization_id: msg.organization_id,
  });

  console.log('🎙️ Transcribed Speech:', `"${transcript}"`);

  if (transcript) {
    console.log('\n🤖 Sending to AI Bot Agent...');
    const botResult = await getBotAgentReply({
      organization_id: msg.organization_id,
      conversation_id: msg.conversation_id,
      text: transcript,
    });

    console.log('AI Bot Agent Reply:');
    console.log(botResult?.reply);
  }
}

testLatestVoiceNote();
