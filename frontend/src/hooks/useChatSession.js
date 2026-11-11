import { useSyncExternalStore, useEffect, useCallback } from 'react';
import { chatSessionStore } from '../services/chatSessionStore';

/**
 * Headless custom hook providing a reactive interface to the deep Chat Session Store.
 * Decouples real-time Socket.io subscriptions and IndexedDB cache from the 4,600-line LiveChat view.
 */
export function useChatSession(params = {}) {
  const { organizationId, userId, token, conversationId } = params;

  const state = useSyncExternalStore(
    chatSessionStore.subscribe.bind(chatSessionStore),
    chatSessionStore.getState.bind(chatSessionStore)
  );

  useEffect(() => {
    if (organizationId) {
      chatSessionStore.initSocket(organizationId, userId, token);
    }
  }, [organizationId, userId, token]);

  useEffect(() => {
    if (conversationId) {
      chatSessionStore.setActiveConversation(conversationId);
      chatSessionStore.loadCachedMessages(conversationId);
    }
  }, [conversationId]);

  const selectConversation = useCallback((convId) => {
    chatSessionStore.setActiveConversation(convId);
    if (convId) {
      chatSessionStore.loadCachedMessages(convId);
    }
  }, []);

  const activeMessages = conversationId
    ? state.messagesByConv[conversationId] || []
    : [];

  return {
    connected: state.connected,
    conversations: state.conversations,
    messages: activeMessages,
    activeConversationId: state.activeConversationId,
    onlineAgents: state.onlineAgents,
    qrState: state.qrState,
    selectConversation,
    setConversations: (convs) => chatSessionStore.setConversations(convs),
    setMessages: (convId, msgs) => chatSessionStore.setMessages(convId, msgs),
  };
}
