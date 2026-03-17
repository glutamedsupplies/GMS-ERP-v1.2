(() => {
    if (window.GMS_AI_WIDGET_INITIALIZED) {
        return;
    }
    window.GMS_AI_WIDGET_INITIALIZED = true;

    const CONFIG = {
        endpoint: '/api/public/ai/chat',
        title: 'GMS AI Assistant',
        subtitle: 'Taglish help for GMS ERP steps, modules, and common issues.'
    };
    const STORAGE = {
        conversationKey: 'gmsAiConversationId:v2',
        historyPrefix: 'gmsAiHistory:v2:',
        maxMessages: 24
    };

    const state = {
        open: false,
        history: [],
        sending: false,
        conversationId: ''
    };

    function generateConversationId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        const rand = Math.random().toString(36).slice(2);
        const stamp = Date.now().toString(36);
        return `gms-${stamp}-${rand}`;
    }

    function loadConversationId() {
        try {
            const existing = localStorage.getItem(STORAGE.conversationKey);
            if (existing) {
                return existing;
            }
            const nextId = generateConversationId();
            localStorage.setItem(STORAGE.conversationKey, nextId);
            return nextId;
        } catch (_error) {
            return generateConversationId();
        }
    }

    function getHistoryStorageKey(conversationId) {
        return `${STORAGE.historyPrefix}${conversationId}`;
    }

    function loadStoredHistory(conversationId) {
        if (!conversationId) {
            return [];
        }
        try {
            const raw = localStorage.getItem(getHistoryStorageKey(conversationId));
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .map((entry) => ({
                    role: entry?.role === 'model' ? 'model' : 'user',
                    text: typeof entry?.text === 'string' ? entry.text : ''
                }))
                .filter((entry) => entry.text);
        } catch (_error) {
            return [];
        }
    }

    function persistHistory(conversationId, history) {
        if (!conversationId || !Array.isArray(history)) {
            return;
        }
        try {
            const trimmed = history.slice(-STORAGE.maxMessages).map((entry) => ({
                role: entry.role === 'model' ? 'model' : 'user',
                text: String(entry.text || '')
            }));
            localStorage.setItem(getHistoryStorageKey(conversationId), JSON.stringify(trimmed));
        } catch (_error) {
            // Ignore storage errors (quota or private mode)
        }
    }

    function saveConversationId(conversationId) {
        if (!conversationId) {
            return;
        }
        try {
            localStorage.setItem(STORAGE.conversationKey, conversationId);
        } catch (_error) {
            // Ignore storage errors
        }
    }

    function clearStoredHistory(conversationId) {
        if (!conversationId) {
            return;
        }
        try {
            localStorage.removeItem(getHistoryStorageKey(conversationId));
        } catch (_error) {
            // Ignore storage errors
        }
    }

    function createEl(tag, className, attrs = {}) {
        const el = document.createElement(tag);
        if (className) {
            el.className = className;
        }
        Object.entries(attrs).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (key === 'text') {
                el.textContent = String(value);
                return;
            }
            el.setAttribute(key, String(value));
        });
        return el;
    }

    function appendStyles() {
        if (document.getElementById('gmsAiStyles')) {
            return;
        }

        const style = createEl('style', '', { id: 'gmsAiStyles' });
        style.textContent = `
.gms-ai-launcher{
  position:fixed;
  right:18px;
  bottom:18px;
  z-index:9999;
  border:none;
  border-radius:999px;
  padding:12px 18px;
  font-weight:700;
  font-size:13px;
  color:#0f172a;
  background:linear-gradient(135deg,#2dd4bf 0%,#14b8a6 60%,#22c55e 100%);
  box-shadow:0 14px 30px rgba(2,6,23,0.3);
  cursor:pointer;
}
.gms-ai-panel{
  position:fixed;
  right:18px;
  bottom:78px;
  width:min(420px, calc(100vw - 24px));
  height:min(620px, calc(100vh - 96px));
  z-index:10000;
  border-radius:22px;
  background:linear-gradient(180deg,rgba(15,23,42,0.99) 0%,rgba(16,24,39,0.99) 100%);
  border:1px solid rgba(255,255,255,0.12);
  box-shadow:0 30px 70px rgba(2,6,23,0.5);
  display:none;
  overflow:hidden;
  flex-direction:column;
  color:#f8fafc;
  font-family:inherit;
}
.gms-ai-panel.is-open{display:flex;}
.gms-ai-header{
  padding:14px 16px 12px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  background:rgba(255,255,255,0.04);
  border-bottom:1px solid rgba(255,255,255,0.08);
}
.gms-ai-title{font-weight:800;font-size:14px;}
.gms-ai-subtitle{font-size:11px;color:rgba(226,232,240,0.7);}
.gms-ai-header-actions{
  display:flex;
  align-items:center;
  gap:8px;
}
.gms-ai-reset,
.gms-ai-close{
  border:1px solid rgba(255,255,255,0.1);
  background:rgba(255,255,255,0.04);
  color:#e2e8f0;
  font-size:12px;
  font-weight:700;
  border-radius:10px;
  min-height:32px;
  padding:0 10px;
  cursor:pointer;
}
.gms-ai-close{
  width:32px;
  padding:0;
  font-size:16px;
}
.gms-ai-messages{
  flex:1;
  padding:16px;
  overflow:auto;
  display:flex;
  flex-direction:column;
  gap:12px;
  scroll-behavior:smooth;
}
.gms-ai-bubble{
  width:fit-content;
  max-width:92%;
  padding:12px 14px;
  border-radius:18px;
  font-size:13px;
  line-height:1.55;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  word-break:break-word;
  box-shadow:0 10px 25px rgba(2,6,23,0.16);
}
.gms-ai-bubble.user{
  align-self:flex-end;
  background:rgba(45,212,191,0.2);
  border:1px solid rgba(45,212,191,0.35);
  border-bottom-right-radius:6px;
}
.gms-ai-bubble.assistant{
  align-self:flex-start;
  background:rgba(255,255,255,0.06);
  border:1px solid rgba(255,255,255,0.12);
  border-bottom-left-radius:6px;
}
.gms-ai-input{
  padding:12px;
  border-top:1px solid rgba(255,255,255,0.08);
  display:flex;
  align-items:flex-end;
  gap:8px;
  background:rgba(15,23,42,0.95);
}
.gms-ai-textarea{
  flex:1;
  min-height:44px;
  max-height:140px;
  resize:none;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.12);
  background:rgba(255,255,255,0.05);
  color:#f8fafc;
  padding:11px 12px;
  font-size:13px;
  line-height:1.45;
  font-family:inherit;
}
.gms-ai-send{
  border:none;
  border-radius:12px;
  min-height:44px;
  padding:0 16px;
  font-weight:700;
  font-size:12.5px;
  background:#22c55e;
  color:#0f172a;
  cursor:pointer;
}
.gms-ai-send:disabled{
  opacity:0.6;
  cursor:wait;
}
@media (max-width: 520px){
  .gms-ai-panel{
    right:8px;
    left:8px;
    bottom:74px;
    width:auto;
    height:min(76vh, 640px);
  }
  .gms-ai-launcher{right:12px;}
  .gms-ai-bubble{max-width:96%;}
}
        `;
        document.head.appendChild(style);
    }

    function getWelcomeMessage() {
        return 'Hi! Ako ang GMS AI Assistant. Pwede tayo mag-Taglish. Ask mo lang tungkol sa GMS ERP, at kapag kailangan ng tao, ibibigay ko ang Customer Service details.';
    }

    function normalizeAssistantReply(text = '') {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/^\s{0,3}#{1,6}\s*/gm, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
            .split('\n')
            .map((line) => line.replace(/[ \t]+/g, ' ').trim())
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function syncTextareaHeight() {
        if (!textarea) {
            return;
        }
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }

    function addMessage(role, text) {
        const bubble = createEl('div', `gms-ai-bubble ${role}`);
        bubble.textContent = role === 'assistant' ? normalizeAssistantReply(text) : text;
        messagesEl.appendChild(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return bubble;
    }

    function setOpen(nextOpen) {
        state.open = nextOpen;
        panel.classList.toggle('is-open', state.open);
        launcher.textContent = state.open ? 'Close AI' : 'Ask AI';
        if (state.open) {
            syncTextareaHeight();
            textarea.focus();
        }
    }

    function startNewConversation() {
        clearStoredHistory(state.conversationId);
        state.history = [];
        state.conversationId = generateConversationId();
        saveConversationId(state.conversationId);
        messagesEl.innerHTML = '';
        addMessage('assistant', getWelcomeMessage());
        persistHistory(state.conversationId, state.history);
        syncTextareaHeight();
        if (state.open) {
            textarea.focus();
        }
    }

    async function sendMessage() {
        if (state.sending) return;
        const raw = textarea.value.trim();
        if (!raw) return;

        textarea.value = '';
        syncTextareaHeight();
        state.sending = true;
        sendButton.disabled = true;

        state.history.push({ role: 'user', text: raw });
        addMessage('user', raw);
        persistHistory(state.conversationId, state.history);
        const typingBubble = addMessage('assistant', 'Typing...');

        try {
            const payload = {
                message: raw,
                history: state.history.slice(-4),
                threadId: state.conversationId
            };

            const response = await fetch(CONFIG.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json().catch(() => ({}));
            const reply = result?.data?.reply || result?.reply || '';

            if (!response.ok) {
                throw new Error(result?.error || result?.message || 'AI request failed.');
            }

            const finalReply = normalizeAssistantReply(reply || 'No response. Please try again.');
            typingBubble.textContent = finalReply;
            state.history.push({ role: 'model', text: finalReply });
            persistHistory(state.conversationId, state.history);
        } catch (error) {
            typingBubble.textContent = normalizeAssistantReply(error?.message || 'AI request failed.');
        } finally {
            state.sending = false;
            sendButton.disabled = false;
        }
    }

    function init() {
        appendStyles();
        state.conversationId = loadConversationId();

        launcher = createEl('button', 'gms-ai-launcher', { type: 'button', text: 'Ask AI' });
        panel = createEl('div', 'gms-ai-panel');

        const header = createEl('div', 'gms-ai-header');
        const titleWrap = createEl('div');
        const title = createEl('div', 'gms-ai-title', { text: CONFIG.title });
        const subtitle = createEl('div', 'gms-ai-subtitle', { text: CONFIG.subtitle });
        titleWrap.appendChild(title);
        titleWrap.appendChild(subtitle);
        const headerActions = createEl('div', 'gms-ai-header-actions');
        const resetBtn = createEl('button', 'gms-ai-reset', { type: 'button', text: 'New chat' });
        const closeBtn = createEl('button', 'gms-ai-close', { type: 'button', text: 'x' });
        headerActions.appendChild(resetBtn);
        headerActions.appendChild(closeBtn);
        header.appendChild(titleWrap);
        header.appendChild(headerActions);

        messagesEl = createEl('div', 'gms-ai-messages');
        const storedHistory = loadStoredHistory(state.conversationId);
        if (storedHistory.length) {
            state.history = storedHistory;
            storedHistory.forEach((entry) => {
                const role = entry.role === 'model' ? 'assistant' : 'user';
                addMessage(role, entry.text);
            });
        } else {
            addMessage('assistant', getWelcomeMessage());
        }

        const inputWrap = createEl('div', 'gms-ai-input');
        textarea = createEl('textarea', 'gms-ai-textarea', { placeholder: 'Type mo question mo...' });
        sendButton = createEl('button', 'gms-ai-send', { type: 'button', text: 'Send' });
        inputWrap.appendChild(textarea);
        inputWrap.appendChild(sendButton);

        panel.appendChild(header);
        panel.appendChild(messagesEl);
        panel.appendChild(inputWrap);

        document.body.appendChild(launcher);
        document.body.appendChild(panel);

        launcher.addEventListener('click', () => setOpen(!state.open));
        resetBtn.addEventListener('click', startNewConversation);
        closeBtn.addEventListener('click', () => setOpen(false));
        sendButton.addEventListener('click', sendMessage);
        textarea.addEventListener('input', syncTextareaHeight);
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
        syncTextareaHeight();
    }

    let launcher;
    let panel;
    let messagesEl;
    let textarea;
    let sendButton;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
