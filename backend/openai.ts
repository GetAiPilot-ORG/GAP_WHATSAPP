// OpenAI Integration for Bot Agents
import fetch from 'node-fetch';

// In-memory storage for API keys (in production, use environment variables or Supabase)
let openaiApiKey = process.env.OPENAI_API_KEY || '';

/**
 * Call OpenAI ChatGPT API with context from knowledge base
 */
export async function getChatGPTResponse(params: {
    message: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    knowledgeContext?: string;
}) {
    if (!openaiApiKey) {
        throw new Error('OpenAI API key not configured');
    }

    const {
        message,
        systemPrompt = 'You are a helpful WhatsApp customer support assistant.',
        model = 'gpt-4o-mini',
        temperature = 0.7,
        knowledgeContext = '',
    } = params;

    const messages: any[] = [
        {
            role: 'system',
            content: systemPrompt + (knowledgeContext ? `\n\nKnowledge Base:\n${knowledgeContext}` : ''),
        },
        {
            role: 'user',
            content: message,
        },
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: 500,
            }),
        });

        const data: any = await response.json();

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`);
        }

        return data.choices[0].message.content;
    } catch (error: any) {
        console.error('ChatGPT API Error:', error);
        throw error;
    }
}

/**
 * Set OpenAI API key
 */
export function setOpenAIKey(key: string) {
    openaiApiKey = key;
}

/**
 * Get stored API key status (for verification)
 */
export function hasOpenAIKey(): boolean {
    return !!openaiApiKey;
}
