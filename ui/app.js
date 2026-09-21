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

closeButton.addEventListener('click', closePanel);
reopenButton.addEventListener('click', () => {
  panel.classList.remove('closed');
  reopenButton.classList.remove('visible');
});

input.addEventListener('input', () => {
  document.querySelector('.send-button').classList.toggle('ready', Boolean(input.value.trim()));
});

async function askKnowledgeBase(message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: message }),
  });
  if (!response.ok) throw new Error(`Chat request failed: ${response.status}`);
  return response.json();
}

function addAnswer(answer) {
  const row = document.createElement('div');
  row.className = 'message-row agent-row';
  const icon = document.createElement('div');
  icon.className = 'mini-agent';
  icon.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'agent-bubble live-answer';
  bubble.textContent = answer.text;
  if (answer.citations?.length) {
    const citations = document.createElement('div');
    citations.className = 'answer-citations';
    citations.textContent = 'Sources: ';
    answer.citations.forEach((citation, index) => {
      const link = document.createElement('a');
      link.href = citation.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = citation.label;
      citations.append(link);
      if (index < answer.citations.length - 1) citations.append(' | ');
    });
    bubble.append(citations);
  }
  row.append(icon, bubble);
  thread.append(row);
  thread.scrollTop = thread.scrollHeight;
}

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, 'user');
  input.value = '';
  document.querySelector('.send-button').classList.remove('ready');
  try {
    const answer = await askKnowledgeBase(message);
    addAnswer(answer);
  } catch {
    addMessage('The local knowledge service is not running yet. Please use Blogs, Docs, or Contact support below for now.', 'agent');
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
