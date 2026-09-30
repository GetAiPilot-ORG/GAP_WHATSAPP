import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { encryptToken } from '../utils/crypto.js';
import crypto from 'crypto';
import path from 'path';
import { 
    KNOWLEDGE_MAX_FILE_SIZE, 
    KNOWLEDGE_ALLOWED_MIME_TYPES, 
    getKnowledgeDocuments, 
    extractKnowledgeText, 
    normalizeKnowledgeDocument, 
    normalizeFilename, 
    formatBytes, 
    saveKnowledgeDocuments 
} from '../services/settings.service.js';

export async function getKnowledgeBase(req: any, res: Response) {
    try {
        const documents = await getKnowledgeDocuments(req.organization_id);
        res.json({
            documents: documents.map((doc: any) => ({
                ...doc,
                content_preview: doc.content ? doc.content.slice(0, 220) : '',
                character_count: String(doc.content || '').length,
                content: undefined,
            })),
            total_documents: documents.length,
            total_characters: documents.reduce((sum: number, doc: any) => sum + String(doc.content || '').length, 0),
        });
    } catch (err: any) {
        console.error('Knowledge base list error:', err);
        res.status(500).json({ error: err.message || 'Failed to load knowledge base' });
    }
}

export async function uploadKnowledgeBase(req: any, res: Response) {
    try {
        const file = req.file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ error: 'File is required' });
        if (file.size > KNOWLEDGE_MAX_FILE_SIZE) {
            return res.status(400).json({ error: 'File must be 10MB or smaller' });
        }

        const ext = path.extname(file.originalname || '').toLowerCase();
        const isAllowedExt = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json'].includes(ext);
        const isAllowedMime = KNOWLEDGE_ALLOWED_MIME_TYPES.has(file.mimetype || '') || (file.mimetype || '').startsWith('text/');
        if (!isAllowedExt && !isAllowedMime) {
            return res.status(400).json({ error: 'Unsupported file type. Upload PDF, DOCX, TXT, MD, CSV, or JSON.' });
        }

        const extracted = (await extractKnowledgeText(file)).replace(/\r/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
        if (!extracted) {
            return res.status(400).json({ error: 'No readable text found in this file' });
        }

        const existing = await getKnowledgeDocuments(req.organization_id);
        const now = new Date().toISOString();
        const doc = normalizeKnowledgeDocument({
            id: crypto.randomUUID(),
            name: normalizeFilename(file.originalname || 'knowledge-document'),
            mime_type: file.mimetype || 'application/octet-stream',
            size: file.size,
            size_label: formatBytes(file.size),
            status: 'INDEXED',
            content: extracted,
            created_at: now,
            updated_at: now,
        });

        const documents = await saveKnowledgeDocuments(req.organization_id, [doc, ...existing].slice(0, 50));
        res.status(201).json({
            document: {
                ...doc,
                content_preview: doc.content.slice(0, 220),
                content: undefined,
            },
            total_documents: documents.length,
        });
    } catch (err: any) {
        console.error('Knowledge base upload error:', err);
        res.status(500).json({ error: err.message || 'Failed to upload knowledge document' });
    }
}

export async function deleteKnowledgeBase(req: any, res: Response) {
    try {
        const existing = await getKnowledgeDocuments(req.organization_id);
        const next = existing.filter((doc: any) => doc.id !== req.params.id);
        if (next.length === existing.length) return res.status(404).json({ error: 'Document not found' });
        await saveKnowledgeDocuments(req.organization_id, next);
        res.json({ success: true });
    } catch (err: any) {
        console.error('Knowledge base delete error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete knowledge document' });
    }
}

export async function getOpenAISettings(req: any, res: Response) {
    const organization_id = req.organization_id;
    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        const { data, error } = await supabase
            .from('openai_settings')
            .select('id, organization_id, created_at, updated_at')
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (error) throw error;

        res.json({
            configured: !!data,
            hasEnvKey: !!process.env.OPENAI_API_KEY
        });
    } catch (err: any) {
        console.error('Error fetching OpenAI settings:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch settings' });
    }
}

export async function saveOpenAISettings(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { api_key, model } = req.body;

    try {
        if (!organization_id) {
            return res.status(400).json({ error: 'organization_id is required' });
        }

        if (!api_key) {
            return res.status(400).json({ error: 'API key is required' });
        }

        const { data, error } = await supabase
            .from('openai_settings')
            .upsert({
                organization_id,
                api_key_encrypted: encryptToken(api_key),
                model: model || 'gpt-4o-mini',
                updated_at: new Date().toISOString()
            }, { onConflict: 'organization_id' })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true });
    } catch (err: any) {
        console.error('Error saving OpenAI settings:', err);
        res.status(500).json({ error: err.message || 'Failed to save settings' });
    }
}

export async function getAutoAssignSettings(req: any, res: Response) {
    const organization_id = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('settings')
            .eq('id', organization_id)
            .single();

        if (error) throw error;

        const autoAssignSettings = data?.settings?.auto_assign || {
            enabled: false,
            batch_size: 1,
            paused_agents: [],
            state: { last_agent_id: null, current_batch_count: 0 }
        };

        res.json(autoAssignSettings);
    } catch (err: any) {
        console.error('Error fetching auto assign settings:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch settings' });
    }
}

export async function saveAutoAssignSettings(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { enabled, batch_size, paused_agents } = req.body;

    try {
        const { data: orgData, error: fetchErr } = await supabase
            .from('organizations')
            .select('settings')
            .eq('id', organization_id)
            .single();

        if (fetchErr) throw fetchErr;

        const currentSettings = orgData?.settings || {};
        const currentAutoAssign = currentSettings.auto_assign || {};

        const newAutoAssign = {
            ...currentAutoAssign,
            enabled: enabled !== undefined ? enabled : currentAutoAssign.enabled || false,
            batch_size: batch_size !== undefined ? Math.max(1, batch_size) : currentAutoAssign.batch_size || 1,
            paused_agents: paused_agents !== undefined ? paused_agents : currentAutoAssign.paused_agents || []
        };

        const { data, error } = await supabase
            .from('organizations')
            .update({ settings: { ...currentSettings, auto_assign: newAutoAssign } })
            .eq('id', organization_id)
            .select('settings')
            .single();

        if (error) throw error;

        res.json(data.settings.auto_assign);
    } catch (err: any) {
        console.error('Error updating auto assign settings:', err);
        res.status(500).json({ error: err.message || 'Failed to update settings' });
    }
}
