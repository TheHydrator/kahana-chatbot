const panel = document.querySelector('#agentPanel');
const closeButton = document.querySelector('#closeButton');
const clearButton = document.querySelector('#clearButton');
const reopenButton = document.querySelector('#reopenButton');
const backdrop = document.querySelector('#panelBackdrop');
const resizeHandle = document.querySelector('#resizeHandle');
const thread = document.querySelector('#messageThread');
const composer = document.querySelector('#composer');
const input = document.querySelector('#messageInput');

const DEFAULT_WELCOME_TEXT = "Hi! I'm **Kahana's AI assistant**. Ask me anything about **hubs**, **Aura**, **earning**, **clubs**, or **getting started**.";

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(rawText, options = {}) {
  if (!rawText) return '';
  const { isStreaming = false } = options;

  let text = String(rawText);

  // During streaming, handle incomplete markdown syntax gracefully so formatting appears immediately
  if (isStreaming) {
    const codeBlockMatches = text.match(/```/g);
    if (codeBlockMatches && codeBlockMatches.length % 2 === 1) {
      text += '\n```';
    }
    const boldMatches = text.match(/\*\*/g);
    if (boldMatches && boldMatches.length % 2 === 1) {
      text += '**';
    }
    const inlineCodeMatches = text.match(/(?<!`)`(?!`)/g);
    if (inlineCodeMatches && inlineCodeMatches.length % 2 === 1) {
      text += '`';
    }
  }

  // 1. Protect code blocks
  const codeBlocks = [];
  text = text.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre class="chat-code-block"><code>${escapeHtml(code.trim())}</code></pre>`);
    return `@@CODEBLOCK_${idx}@@`;
  });

  // 2. Escape HTML
  text = escapeHtml(text);

  // 3. Inline code
  text = text.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

  // 4. Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 5. Italic: *text* (not bold) or _text_
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

  // 6. Split by double newlines into blocks
  const rawBlocks = text.split(/\n{2,}/);
  const formattedBlocks = rawBlocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('@@CODEBLOCK_')) {
      return trimmed;
    }

    if (/^#{1,4}\s+(.+)$/.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,4}\s+/, '');
      return `<div class="chat-heading">${heading}</div>`;
    }

    const lines = trimmed.split('\n');
    const hasListItems = lines.some((l) => /^\s*(?:[*•\-+]+\s*|\d+\.)\s*/.test(l));
    if (hasListItems) {
      let html = '';
      let inList = false;
      let isOrdered = false;

      for (const line of lines) {
        const itemMatch = line.match(/^\s*(?:([*•\-+]+)\s*|(\d+\.))\s*(.+)$/);
        if (itemMatch) {
          const isNum = Boolean(itemMatch[2]);
          if (!inList || isOrdered !== isNum) {
            if (inList) html += isOrdered ? '</ol>' : '</ul>';
            inList = true;
            isOrdered = isNum;
            html += isOrdered ? '<ol class="chat-list">' : '<ul class="chat-list">';
          }
          const itemText = itemMatch[3].replace(/^[•\-*+]\s*/, '').trim();
          html += `<li>${itemText}</li>`;
        } else {
          if (inList) {
            html += isOrdered ? '</ol>' : '</ul>';
            inList = false;
          }
          if (line.trim()) {
            html += `<p>${line.trim()}</p>`;
          }
        }
      }
      if (inList) {
        html += isOrdered ? '</ol>' : '</ul>';
      }
      return html;
    }

    const pContent = lines.join('<br/>');
    return `<p>${pContent}</p>`;
  });

  let result = formattedBlocks.filter(Boolean).join('');
  result = result.replace(/@@CODEBLOCK_(\d+)@@/g, (_, idx) => codeBlocks[Number(idx)] || '');

  return result;
}

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
  const content = document.createElement('div');
  content.className = 'agent-content';
  content.innerHTML = renderMarkdown(DEFAULT_WELCOME_TEXT);
  bubble.append(content);
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
  document.body.classList.remove('agent-open');
  if (reopenButton) {
    reopenButton.classList.remove('active');
    reopenButton.setAttribute('aria-expanded', 'false');
  }
  if (backdrop) {
    backdrop.classList.remove('visible');
  }
}

function openPanel() {
  panel.classList.remove('closed');
  document.body.classList.add('agent-open');
  if (reopenButton) {
    reopenButton.classList.add('active');
    reopenButton.setAttribute('aria-expanded', 'true');
  }
  if (backdrop && window.innerWidth < 1200) {
    backdrop.classList.add('visible');
  }
}

function addMessage(text, role, citations = [], scroll = true) {
  const isUser = role === 'user';
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user-row' : 'agent-row'}`;
  const bubble = document.createElement('div');
  bubble.className = isUser ? 'user-bubble' : 'agent-bubble live-answer';
  if (isUser) {
    bubble.textContent = text;
  } else {
    const icon = document.createElement('div');
    icon.className = 'mini-agent';
    icon.textContent = 'AI';
    row.append(icon);
    const content = document.createElement('div');
    content.className = 'agent-content';
    content.innerHTML = renderMarkdown(text);
    bubble.append(content);
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
if (backdrop) {
  backdrop.addEventListener('click', closePanel);
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
  let contentDiv = null;
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
          if (!contentDiv) {
            bubble.querySelector('.typing-indicator')?.remove();
            icon.classList.remove('thinking');
            contentDiv = document.createElement('div');
            contentDiv.className = 'agent-content';
            bubble.append(contentDiv);
          }
          accumulatedText += event.text;
          contentDiv.innerHTML = renderMarkdown(accumulatedText, { isStreaming: true });
          thread.scrollTop = thread.scrollHeight;
        } else if (event.type === 'done') {
          if (contentDiv) {
            contentDiv.innerHTML = renderMarkdown(accumulatedText, { isStreaming: false });
          }
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
    if (!contentDiv) {
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

// Resize handle for customizable width on desktop/large screens
function setupResizeHandle() {
  if (!resizeHandle) return;

  const savedWidth = localStorage.getItem('kahana_chatbot_panel_width');
  if (savedWidth && window.innerWidth >= 1200) {
    const num = Number(savedWidth);
    if (num >= 320 && num <= 700) {
      document.documentElement.style.setProperty('--panel-width', `${num}px`);
    }
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 390;

  resizeHandle.addEventListener('mousedown', (e) => {
    if (window.innerWidth < 1200) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizeHandle.classList.add('active');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = startX - e.clientX;
    const maxAllowed = Math.min(720, Math.floor(window.innerWidth * 0.5));
    const newWidth = Math.max(320, Math.min(maxAllowed, startWidth + delta));
    document.documentElement.style.setProperty('--panel-width', `${newWidth}px`);
    localStorage.setItem('kahana_chatbot_panel_width', String(newWidth));
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      resizeHandle.classList.remove('active');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  });

  // Double click resets to default 390px
  resizeHandle.addEventListener('dblclick', () => {
    document.documentElement.style.setProperty('--panel-width', '390px');
    localStorage.removeItem('kahana_chatbot_panel_width');
  });
}

function updateResponsiveState() {
  const width = window.innerWidth;
  const isMobile = width <= 768;
  const isTablet = width > 768 && width < 1200;
  const isDesktop = width >= 1200;

  document.body.dataset.screen = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  if (!panel.classList.contains('closed')) {
    document.body.classList.add('agent-open');
    if (backdrop) {
      if (isDesktop) {
        backdrop.classList.remove('visible');
      } else {
        backdrop.classList.add('visible');
      }
    }
  } else {
    document.body.classList.remove('agent-open');
    if (backdrop) backdrop.classList.remove('visible');
  }
}

window.addEventListener('resize', updateResponsiveState);

loadHistory();

// Multi-screen boot state: on mobile phones start with FAB visible and drawer closed;
// on desktop & tablet start opened for immediate interaction.
if (window.innerWidth <= 768) {
  closePanel();
} else {
  openPanel();
}
updateResponsiveState();
setupResizeHandle();
