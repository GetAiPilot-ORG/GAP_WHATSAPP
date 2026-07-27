import { supabase } from '../config/supabase.js';
import crypto from 'crypto';
import path from 'path';

export const KNOWLEDGE_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const KNOWLEDGE_MAX_CONTEXT_CHARS = 12000;
export const KNOWLEDGE_ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
]);

export function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function normalizeFilename(filename: string) {
    return filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

export function normalizeKnowledgeDocument(doc: any) {
    return {
        id: String(doc?.id || crypto.randomUUID()),
        name: String(doc?.name || 'Untitled document'),
        mime_type: String(doc?.mime_type || 'application/octet-stream'),
        size: Number(doc?.size || 0),
        size_label: doc?.size_label || formatBytes(Number(doc?.size || 0)),
        status: doc?.status || 'INDEXED',
        content: String(doc?.content || '').slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS),
        created_at: doc?.created_at || new Date().toISOString(),
        updated_at: doc?.updated_at || doc?.created_at || new Date().toISOString(),
    };
}

export async function getOrganizationSettings(organizationId: string): Promise<any> {
    const { data, error } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', organizationId)
        .single();
    if (error) throw error;
    return data?.settings && typeof data.settings === 'object' ? data.settings : {};
}

export async function getKnowledgeDocuments(organizationId: string) {
    const settings = await getOrganizationSettings(organizationId);
    const docs = Array.isArray(settings.knowledge_base_documents) ? settings.knowledge_base_documents : [];
    return docs.map(normalizeKnowledgeDocument);
}

export async function saveKnowledgeDocuments(organizationId: string, documents: any[]) {
    const settings = await getOrganizationSettings(organizationId);
    const nextDocuments = documents.map(normalizeKnowledgeDocument);
    const nextSettings = {
        ...settings,
        knowledge_base_documents: nextDocuments,
        knowledge_base_updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
        .from('organizations')
        .update({ settings: nextSettings, updated_at: new Date().toISOString() })
        .eq('id', organizationId);
    if (error) throw error;
    return nextDocuments;
}

export async function extractKnowledgeText(file: Express.Multer.File): Promise<string> {
    const mimeType = file.mimetype || '';
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (['.txt', '.md', '.csv', '.json'].includes(ext) || mimeType.startsWith('text/') || mimeType === 'application/json') {
        return file.buffer.toString('utf8');
    }

    if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const mammoth: any = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result?.value || '';
    }

    if (ext === '.pdf' || mimeType === 'application/pdf') {
        const pdfModule: any = await import('pdf-parse/lib/pdf-parse.js');
        const pdfParse = pdfModule.default || pdfModule;
        const result = await pdfParse(file.buffer);
        return result?.text || '';
    }

    throw new Error('Unsupported file type. Upload PDF, DOCX, TXT, MD, CSV, or JSON.');
}

export async function getOrganizationKnowledgeContext(organizationId: string): Promise<string> {
    try {
        const docs = await getKnowledgeDocuments(organizationId);
        return docs
            .filter((doc: any) => doc.status === 'INDEXED' && doc.content)
            .map((doc: any) => `Source: ${doc.name}\n${doc.content}`)
            .join('\n\n')
            .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
    } catch (err: any) {
        console.warn('Failed to load organization knowledge base:', err?.message || err);
        return '';
    }
}
