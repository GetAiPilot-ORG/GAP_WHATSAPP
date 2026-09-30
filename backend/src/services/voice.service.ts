import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';

/**
 * Helper to fetch the active OpenAI API key for an organization (or global fallback).
 */
export async function getOpenAIKeyForOrg(organizationId?: string): Promise<string> {
  let apiKey = process.env.OPENAI_API_KEY || '';

  if (organizationId && supabase) {
    try {
      const { data: settings } = await supabase
        .from('openai_settings')
        .select('api_key_encrypted')
        .eq('organization_id', organizationId)
        .single();

      if (settings?.api_key_encrypted) {
        const decrypted = decryptToken(settings.api_key_encrypted);
        if (decrypted) {
          apiKey = decrypted;
        }
      }
    } catch (err) {
      console.warn(`[VoiceService] Failed to load org OpenAI settings for org ${organizationId}:`, err);
    }
  }

  return apiKey;
}

export interface TranscribeAudioParams {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  organization_id?: string;
  language?: string;
}

/**
 * Transcribes an audio buffer using Deepgram Nova-2 (fast, multilingual) with OpenAI Whisper fallback.
 * Supports WhatsApp voice notes (audio/ogg; codecs=opus, audio/mp4, audio/mpeg, audio/aac, etc.)
 */
export async function transcribeAudioBuffer(params: {
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  organization_id?: string;
  language?: string;
}): Promise<string | null> {
  const { buffer, mimeType = 'audio/ogg', organization_id, language } = params;

  if (!buffer || buffer.length === 0) {
    console.warn('[VoiceService] Cannot transcribe empty audio buffer');
    return null;
  }

  // 1. Check for Deepgram API Key
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY || '';

  if (deepgramApiKey) {
    try {
      const cleanMime = (mimeType || 'audio/ogg').split(';')[0].trim();
      const paramsQuery = new URLSearchParams({
        model: 'nova-2',
        smart_format: 'true',
        detect_language: language ? 'false' : 'true',
      });
      if (language) {
        paramsQuery.set('language', language);
      }

      const response = await fetch(`https://api.deepgram.com/v1/listen?${paramsQuery.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': cleanMime || 'application/octet-stream',
        },
        body: buffer,
      });

      const data: any = await response.json().catch(() => ({}));

      if (response.ok) {
        const transcript = (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
        if (transcript) {
          const detectedLang = data?.results?.channels?.[0]?.detected_language || language || 'auto';
          console.log(`[VoiceService] ⚡ Deepgram STT success (${buffer.length} bytes, lang=${detectedLang}) -> "${transcript.slice(0, 100)}"`);
          return transcript;
        }
        console.warn('[VoiceService] Deepgram returned empty transcript');
      } else {
        console.error('[VoiceService] Deepgram transcription error:', {
          status: response.status,
          error: data?.error || data?.err_msg || data,
        });
      }
    } catch (dgErr: any) {
      console.error('[VoiceService] Deepgram API exception:', dgErr?.message || dgErr);
    }
  }

  // 2. Fallback to OpenAI Whisper if Deepgram is not configured or failed
  const apiKey = await getOpenAIKeyForOrg(organization_id);
  if (!apiKey) {
    if (!deepgramApiKey) {
      console.warn('[VoiceService] No Deepgram or OpenAI API key configured. Skipping voice transcription.');
    }
    return null;
  }

  try {
    // Determine a valid file extension for Whisper API
    let ext = 'ogg';
    const lowerMime = (mimeType || '').toLowerCase();
    if (lowerMime.includes('mp4') || lowerMime.includes('m4a')) ext = 'm4a';
    else if (lowerMime.includes('mpeg') || lowerMime.includes('mp3')) ext = 'mp3';
    else if (lowerMime.includes('wav')) ext = 'wav';
    else if (lowerMime.includes('webm')) ext = 'webm';
    else if (lowerMime.includes('aac')) ext = 'aac';
    else if (lowerMime.includes('ogg') || lowerMime.includes('opus')) ext = 'ogg';

    const uploadFileName = params.fileName && params.fileName.includes('.')
      ? params.fileName
      : `audio-${Date.now()}.${ext}`;

    const form = new FormData();
    const uint8 = new Uint8Array(buffer);
    const audioBlob = new Blob([uint8], { type: mimeType });
    form.append('file', audioBlob, uploadFileName);
    form.append('model', 'whisper-1');

    if (language) {
      form.append('language', language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form as any,
    });

    const data: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[VoiceService] OpenAI Whisper transcription failed:', {
        status: response.status,
        error: data?.error || data,
      });
      return null;
    }

    const transcript = (data?.text || '').trim();
    console.log(`[VoiceService] 🎙️ OpenAI Whisper STT success (${buffer.length} bytes -> "${transcript.slice(0, 100)}...")`);
    return transcript || null;
  } catch (err: any) {
    console.error('[VoiceService] Exception during audio transcription:', err?.message || err);
    return null;
  }
}
