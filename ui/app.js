const panel = document.querySelector('#agentPanel');
const closeButton = document.querySelector('#closeButton');
const clearButton = document.querySelector('#clearButton');
const reopenButton = document.querySelector('#reopenButton');
const thread = document.querySelector('#messageThread');
const composer = document.querySelector('#composer');
const input = document.querySelector('#messageInput');

const DEFAULT_WELCOME_TEXT = "Hi! I'm Kahana's AI assistant. Ask me anything about hubs, Aura, earning, clubs, or getting started.";

// Session memory state: list of { role: 'user' | 'model', text: string, citations?: Array }
let sessionHistory = [];

function getKahanaUser() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('firebase:authUser:')) {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.uid) return { uid: data.uid, email: data.email };
      }
    }
    const raw = localStorage.getItem('userData') || localStorage.getItem('user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.uid || parsed.id)) return { uid: parsed.uid || parsed.id, email: parsed.email };
    }
  } catch {}
  return null;
}

function getStorage() {
  const user = getKahanaUser();
  if (user) {
    return {
      storage: localStorage,
      key: `kahana_chat_history_${user.uid}`,
      userId: user.uid,
    };
  }
  return {
    storage: sessionStorage,
    key: 'kahana_chat_session_history',
    userId: null,
  };
}

function saveHistory() {
  try {
    const { storage, key } = getStorage();
    storage.setItem(key, JSON.stringify(sessionHistory));
  } catch {}
}

function loadHistory() {
  try {
    const { storage, key } = getStorage();
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        sessionHistory = parsed;
        renderSavedHistory(parsed);
        return;
      }
    }
  } catch {}
  sessionHistory = [];
  renderWelcome();
}

function renderWelcome() {
  thread.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'message-row agent-row';
  const icon = document.createElement('div');
  icon.className = 'mini-agent';
  icon.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble welcome';
  bubble.textContent = DEFAULT_WELCOME_TEXT;
  row.append(icon, bubble);
  thread.append(row);
}

function renderSavedHistory(history) {
  thread.innerHTML = '';
  for (const item of history) {
    addMessage(item.text, item.role, item.citations, false);
  }
  thread.scrollTop = thread.scrollHeight;
}

function clearChat() {
  sessionHistory = [];
  try {
    const { storage, key } = getStorage();
    storage.removeItem(key);
    sessionStorage.removeItem('kahana_chat_session_history');
  } catch {}
  renderWelcome();
  input.focus();
}

function closePanel() {
  panel.classList.add('closed');
  if (reopenButton) {
    reopenButton.classList.remove('active');
  }
}

function openPanel() {
  panel.classList.remove('closed');
  if (reopenButton) {
    reopenButton.classList.add('active');
  }
}

function addMessage(text, role, citations = [], scroll = true) {
  const isUser = role === 'user';
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user-row' : 'agent-row'}`;
  const bubble = document.createElement('div');
  bubble.className = isUser ? 'user-bubble' : 'agent-bubble live-answer';
  bubble.textContent = text;
  if (!isUser) {
    const icon = document.createElement('div');
    icon.className = 'mini-agent';
    icon.textContent = 'AI';
    row.append(icon);
    if (citations && citations.length) {
      appendCitations(bubble, citations);
    }
  }
  row.append(bubble);
  thread.append(row);
  if (scroll) {
    thread.scrollTop = thread.scrollHeight;
  }
}

function createStreamingBubble() {
  const row = document.createElement('div');
  row.className = 'message-row agent-row';
  const icon = document.createElement('div');
  icon.className = 'mini-agent thinking';
  icon.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble live-answer';

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';

  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';

  const text = document.createElement('span');
  text.className = 'thinking-text';
  text.textContent = 'Kahana AI is thinking';

  const dots = document.createElement('div');
  dots.className = 'dots';
  for (let i = 0; i < 3; i++) dots.append(document.createElement('span'));

  indicator.append(spinner, text, dots);
  bubble.append(indicator);
  row.append(icon, bubble);
  thread.append(row);
  thread.scrollTop = thread.scrollHeight;
  return { row, bubble, icon };
}

function appendCitations(bubble, citations) {
  if (!citations?.length) return;
  const div = document.createElement('div');
  div.className = 'answer-citations';
  div.textContent = 'Sources: ';
  citations.forEach((citation, index) => {
    const link = document.createElement('a');
    link.href = citation.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = citation.label;
    div.append(link);
    if (index < citations.length - 1) div.append(' | ');
  });
  bubble.append(div);
}

closeButton.addEventListener('click', closePanel);
if (clearButton) {
  clearButton.addEventListener('click', clearChat);
}
if (reopenButton) {
  reopenButton.addEventListener('click', () => {
    if (panel.classList.contains('closed')) {
      openPanel();
    } else {
      closePanel();
    }
  });
}

// Event listeners for open/close and composer
input.addEventListener('input', () => {
  document.querySelector('.send-button').classList.toggle('ready', Boolean(input.value.trim()));
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

async function streamQuestion(message, history = []) {
  const sendButton = document.querySelector('.send-button');
  sendButton.classList.add('loading');
  sendButton.disabled = true;
  input.disabled = true;
  input.placeholder = 'Kahana AI is thinking...';

  const { row, bubble, icon } = createStreamingBubble();
  let textNode = null;
  let accumulatedText = '';
  let finalCitations = [];

  const { userId } = getStorage();

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: message, history, userId }),
    });
    if (!response.ok) throw new Error(`Stream failed: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.type === 'chunk') {
          if (!textNode) {
            bubble.querySelector('.typing-indicator')?.remove();
            icon.classList.remove('thinking');
            textNode = document.createTextNode('');
            bubble.append(textNode);
          }
          textNode.textContent += event.text;
          accumulatedText += event.text;
          thread.scrollTop = thread.scrollHeight;
        } else if (event.type === 'done') {
          finalCitations = event.citations || [];
          appendCitations(bubble, finalCitations);
          thread.scrollTop = thread.scrollHeight;
        }
      }
    }

    sessionHistory.push({
      role: 'model',
      text: accumulatedText,
      citations: finalCitations,
    });
    saveHistory();
  } catch (error) {
    if (!textNode) {
      row.remove();
    }
    sessionHistory.pop();
    saveHistory();
    throw error;
  } finally {
    sendButton.classList.remove('loading');
    sendButton.disabled = false;
    input.disabled = false;
    input.placeholder = 'Ask anything about Kahana...';
    input.focus();
  }
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || input.disabled) return;

  addMessage(message, 'user');
  const historyForRequest = [...sessionHistory];
  sessionHistory.push({ role: 'user', text: message });
  saveHistory();

  input.value = '';
  document.querySelector('.send-button').classList.remove('ready');

  try {
    await streamQuestion(message, historyForRequest);
  } catch {
    addMessage('Could not reach the chatbot server. Make sure it is running on port 4173.', 'agent');
  }
});

document.querySelectorAll('[data-url]').forEach((link) => {
  link.addEventListener('click', () => {
    window.open(link.dataset.url, '_blank', 'noopener,noreferrer');
  });
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const labels = { feedback: 'Feedback form opened', support: 'Support form opened', contact: 'Contact form opened' };
    window.alert(labels[button.dataset.action]);
  });
});

loadHistory();
