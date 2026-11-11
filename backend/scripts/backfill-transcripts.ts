import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { supabase } from '../src/config/supabase.js';
import { transcribeAudioBuffer } from '../src/services/voice.service.js';

async function backfillAudioTranscripts() {
  const { data: messages, error } = await supabase
    .from('w_messages')
    .select('id, organization_id, content')
    .eq('type', 'audio')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !messages) {
    console.error('Error fetching messages:', error);
    return;
  }

  for (const m of messages) {
    const mediaUrl = m.content?.media_url;
    if (!mediaUrl) {
      console.log(`Msg ${m.id} has no media_url`);
      continue;
    }

    console.log(`Fetching audio for Msg ${m.id} from ${mediaUrl}...`);
    try {
      const res = await fetch(mediaUrl);
      if (!res.ok) {
        console.error(`Failed to fetch media for msg ${m.id}: ${res.status}`);
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const transcript = await transcribeAudioBuffer({
        buffer,
        mimeType: m.content?.mime_type || 'audio/ogg',
        fileName: m.content?.file_name || 'voice-note.ogg',
        organization_id: m.organization_id,
      });

      console.log(`Msg ${m.id} transcript:`, transcript);

      if (transcript) {
        const updatedContent = {
          ...m.content,
          text: `[Voice Note]: "${transcript}"`,
          transcript: transcript,
        };

        const { error: updateErr } = await supabase
          .from('w_messages')
          .update({ content: updatedContent })
          .eq('id', m.id);

        if (updateErr) {
          console.error(`Failed to update msg ${m.id}:`, updateErr);
        } else {
          console.log(`✅ Successfully updated msg ${m.id} with transcript!`);
        }
      }
    } catch (err) {
      console.error(`Error processing msg ${m.id}:`, err);
    }
  }
}

backfillAudioTranscripts();
