import { io } from 'socket.io-client';
import { get, set } from 'idb-keyval';
import { BACKEND_URL as BACKEND_BASE } from '../config/api';

const SOCKET_OPTIONS = {
  autoConnect: false,
  transports: ['polling', 'websocket'],
  upgrade: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 10000,
};

class ChatSessionStore {
  constructor() {
    this.socket = null;
    this.state = {
      connected: false,
      organizationId: null,
      userId: null,
      activeConversationId: null,
      conversations: [],
      messagesByConv: {},
      optimisticQueue: [],
      onlineAgents: new Set(),
      qrState: null,
    };
    this.subscribers = new Set();
  }

  initSocket(orgId, userId, token) {
    if (this.socket && this.state.organizationId === orgId) {
      if (!this.socket.connected) this.socket.connect();
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.state.organizationId = orgId;
    this.state.userId = userId;

    this.socket = io(BACKEND_BASE, {
      ...SOCKET_OPTIONS,
      auth: { token },
      query: { organization_id: orgId, user_id: userId },
    });

    this.socket.on('connect', () => {
      this.setState({ connected: true });
      if (orgId) {
        this.socket.emit('join_org', { organization_id: orgId, user_id: userId });
      }
    });

    this.socket.on('disconnect', () => {
      this.setState({ connected: false });
    });

    this.socket.on('qr', (data) => {
      this.setState({ qrState: typeof data === 'string' ? data : data?.qr });
    });

    this.socket.on('ready', () => {
      this.setState({ qrState: null });
    });

    this.socket.on('agent_online', ({ user_id }) => {
      if (user_id) {
        const next = new Set(this.state.onlineAgents);
        next.add(user_id);
        this.setState({ onlineAgents: next });
      }
    });

    this.socket.on('agent_offline', ({ user_id }) => {
      if (user_id) {
        const next = new Set(this.state.onlineAgents);
        next.delete(user_id);
        this.setState({ onlineAgents: next });
      }
    });

    this.socket.on('new_message', (msg) => {
      this.handleIncomingSocketMessage(msg);
    });

    this.socket.on('message_reaction', ({ conversation_id, message_id, reactions }) => {
      this.handleReactionUpdate(conversation_id, message_id, reactions);
    });

    this.socket.on('message_deleted', ({ conversation_id, message_id, last_message_preview }) => {
      this.handleMessageDeleted(conversation_id, message_id, last_message_preview);
    });

    this.socket.connect();
    return this.socket;
  }

  handleIncomingSocketMessage(msg) {
    const convId = msg.conversation_id;
    if (!convId) return;

    // 1. Reconcile optimistic message if matching client_message_id
    const clientMsgId = msg.client_message_id || msg.content?.client_message_id;
    const currentMessages = this.state.messagesByConv[convId] || [];

    let nextMessages = [];
    if (clientMsgId) {
      const matchIndex = currentMessages.findIndex(
        (m) => m.client_message_id === clientMsgId || m.id === clientMsgId
      );
      if (matchIndex !== -1) {
        nextMessages = [...currentMessages];
        nextMessages[matchIndex] = { ...nextMessages[matchIndex], ...msg, status: 'delivered' };
      } else {
        nextMessages = [...currentMessages, msg];
      }
    } else {
      const exists = currentMessages.some((m) => m.id === msg.message_id || m.id === msg.id);
      if (!exists) {
        nextMessages = [...currentMessages, msg];
      } else {
        nextMessages = currentMessages;
      }
    }

    // 2. Update conversation preview and list order
    const nextConvs = this.state.conversations.map((c) => {
      if (c.id === convId) {
        const isCurrentActive = this.state.activeConversationId === convId;
        return {
          ...c,
          last_message_at: msg.created_at || new Date().toISOString(),
          last_message_preview: msg.text || c.last_message_preview,
          unread_count: isCurrentActive ? 0 : (c.unread_count || 0) + (msg.sender === 'customer' ? 1 : 0),
        };
      }
      return c;
    });

    // Reorder: most recently updated conversation to top
    nextConvs.sort(
      (a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
    );

    this.setState({
      messagesByConv: {
        ...this.state.messagesByConv,
        [convId]: nextMessages,
      },
      conversations: nextConvs,
    });

    // Persist to IndexedDB cache
    set(`gap_chat_messages_${convId}`, nextMessages).catch(() => {});
  }

  handleReactionUpdate(convId, messageId, reactions) {
    const current = this.state.messagesByConv[convId];
    if (!current) return;

    const next = current.map((m) => (m.id === messageId ? { ...m, reactions } : m));
    this.setState({
      messagesByConv: {
        ...this.state.messagesByConv,
        [convId]: next,
      },
    });
  }

  handleMessageDeleted(convId, messageId, lastPreview) {
    const current = this.state.messagesByConv[convId];
    if (!current) return;

    const next = current.filter((m) => m.id !== messageId);
    const nextConvs = this.state.conversations.map((c) =>
      c.id === convId ? { ...c, last_message_preview: lastPreview || c.last_message_preview } : c
    );

    this.setState({
      messagesByConv: {
        ...this.state.messagesByConv,
        [convId]: next,
      },
      conversations: nextConvs,
    });
  }

  setActiveConversation(convId) {
    this.setState({ activeConversationId: convId });

    // Mark as read locally in store
    if (convId) {
      const nextConvs = this.state.conversations.map((c) =>
        c.id === convId ? { ...c, unread_count: 0 } : c
      );
      this.setState({ conversations: nextConvs });
    }
  }

  setConversations(conversations) {
    this.setState({ conversations });
  }

  setMessages(convId, messages) {
    this.setState({
      messagesByConv: {
        ...this.state.messagesByConv,
        [convId]: messages,
      },
    });
    set(`gap_chat_messages_${convId}`, messages).catch(() => {});
  }

  async loadCachedMessages(convId) {
    try {
      const cached = await get(`gap_chat_messages_${convId}`);
      if (Array.isArray(cached) && cached.length > 0 && !this.state.messagesByConv[convId]) {
        this.setState({
          messagesByConv: {
            ...this.state.messagesByConv,
            [convId]: cached,
          },
        });
      }
    } catch {
      // cache miss
    }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  notify() {
    for (const listener of this.subscribers) {
      listener(this.state);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setState({ connected: false });
  }
}

export const chatSessionStore = new ChatSessionStore();
