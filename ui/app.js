const panel = document.querySelector('#agentPanel');
const closeButton = document.querySelector('#closeButton');
const reopenButton = document.querySelector('#reopenButton');
const thread = document.querySelector('#messageThread');
const composer = document.querySelector('#composer');
const input = document.querySelector('#messageInput');

function closePanel() {
  panel.classList.add('closed');
  reopenButton.classList.add('visible');
}

function addMessage(text, role) {
  const row = document.createElement('div');
  row.className = `message-row ${role === 'user' ? 'user-row' : 'agent-row'}`;
  const bubble = document.createElement('div');
  bubble.className = role === 'user' ? 'user-bubble' : 'agent-bubble';
  bubble.textContent = text;
  if (role !== 'user') {
    const icon = document.createElement('div');
    icon.className = 'mini-agent';
    icon.textContent = 'AI';
    row.append(icon);
  }
  row.append(bubble);
  thread.append(row);
  thread.scrollTop = thread.scrollHeight;
}

function createStreamingBubble() {
  const row = document.createElement('div');
  row.className = 'message-row agent-row';
  const icon = document.createElement('div');
  icon.className = 'mini-agent';
  icon.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble live-answer';
  const dots = document.createElement('div');
  dots.className = 'typing-indicator';
  for (let i = 0; i < 3; i++) dots.append(document.createElement('span'));
  bubble.append(dots);
  row.append(icon, bubble);
  thread.append(row);
  thread.scrollTop = thread.scrollHeight;
  return bubble;
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
reopenButton.addEventListener('click', () => {
  panel.classList.remove('closed');
  reopenButton.classList.remove('visible');
});

input.addEventListener('input', () => {
  document.querySelector('.send-button').classList.toggle('ready', Boolean(input.value.trim()));
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

async function streamQuestion(message) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: message }),
  });
  if (!response.ok) throw new Error(`Stream failed: ${response.status}`);

  const bubble = createStreamingBubble();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let textNode = null;

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
          textNode = document.createTextNode('');
          bubble.append(textNode);
        }
        textNode.textContent += event.text;
        thread.scrollTop = thread.scrollHeight;
      } else if (event.type === 'done') {
        appendCitations(bubble, event.citations);
        thread.scrollTop = thread.scrollHeight;
      }
    }
  }
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, 'user');
  input.value = '';
  document.querySelector('.send-button').classList.remove('ready');
  try {
    await streamQuestion(message);
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
