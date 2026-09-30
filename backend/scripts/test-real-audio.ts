import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { transcribeAudioBuffer } from '../src/services/voice.service.js';

async function testRealAudio() {
  const url = 'https://uklxlappjcuvdqjvecfh.supabase.co/storage/v1/object/public/wa-media/ee54ef4c-8541-4271-ac2e-791a35ed8886/13835b1f-7ff3-42ea-ad98-1e8a57af22b8/1790752712153-e665fa75-3f3d-49f7-aed3-2089c188b162.bin';
  
  console.log('Downloading real audio from supabase storage...');
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Failed to download audio from supabase:', res.status, res.statusText);
    return;
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`Downloaded ${buffer.length} bytes. Testing transcription...`);

  const result = await transcribeAudioBuffer({
    buffer,
    mimeType: 'audio/ogg; codecs=opus',
    fileName: 'voice-note.ogg',
    organization_id: 'ee54ef4c-8541-4271-ac2e-791a35ed8886',
  });

  console.log('TRANSCRIPTION RESULT:', result);
}

testRealAudio();
