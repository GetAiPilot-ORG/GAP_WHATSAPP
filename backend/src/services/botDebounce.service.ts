/**
 * Centralized bot debounce and sequential execution lock service.
 * Coordinates across Baileys socket, Meta Webhook, and Inbound Ingestion
 * so that any manual human agent response can instantly cancel pending bot replies.
 */

const botDebounceMap = new Map<string, NodeJS.Timeout>();
const botLockMap = new Map<string, Promise<any>>();

export function setBotDebounce(conversationId: string, timeout: NodeJS.Timeout): void {
  if (botDebounceMap.has(conversationId)) {
    clearTimeout(botDebounceMap.get(conversationId)!);
  }
  botDebounceMap.set(conversationId, timeout);
}

export function clearBotDebounce(conversationId: string): boolean {
  if (botDebounceMap.has(conversationId)) {
    clearTimeout(botDebounceMap.get(conversationId)!);
    botDebounceMap.delete(conversationId);
    return true;
  }
  return false;
}

export function hasBotDebounce(conversationId: string): boolean {
  return botDebounceMap.has(conversationId);
}

export function getBotLock(conversationId: string): Promise<any> {
  return botLockMap.get(conversationId) || Promise.resolve();
}

export function setBotLock(conversationId: string, promise: Promise<any>): void {
  botLockMap.set(conversationId, promise);
}

export function clearBotLock(conversationId: string): void {
  botLockMap.delete(conversationId);
}
