const STOP_WORDS = new Set([
  'about', 'after', 'also', 'does', 'from', 'have', 'how', 'that', 'the',
  'this', 'what', 'when', 'where', 'which', 'with', 'would', 'you', 'can', 'do',
  // generic meta-verbs that carry no Kahana-specific signal
  'tell', 'show', 'give', 'explain', 'describe', 'find', 'get', 'see', 'use', 'make',
]);

const PRONOUN_FOLLOWUP = /\b(it|its|one|ones|that|this|these|those|they|them|there|same|too|also|another)\b/i;

function extractHistoryTokens(history = []) {
  if (!Array.isArray(history) || !history.length) return [];
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item && item.role === 'user' && typeof item.text === 'string') {
      const t = tokens(item.text);
      if (t.length) return t.slice(0, 3);
    }
  }
  return [];
}

function addIntentBoost(question, title, score, historyTokens = []) {
  const normalizedQuestion = String(question || '').toLowerCase();
  const normalizedTitle = String(title || '').toLowerCase();
  const isHubDefinition = /\bwhat is (a )?hub\b/.test(normalizedQuestion);
  const mentionsHub = /\bhub\b/.test(normalizedQuestion) || historyTokens.includes('hub');
  const isHubCreation = /\b(create|creating|make|making|start)\b/.test(normalizedQuestion)
    && mentionsHub;

  if (isHubDefinition && normalizedTitle === 'hubs') return score + 30;
  if (isHubCreation && normalizedTitle === 'get started (creators)') return score + 30;
  if (isHubCreation && normalizedTitle === 'hubs') return score + 18;
  if (isHubCreation && normalizedTitle.includes('list a hub')) return score - 12;
  return score;
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => {
      if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
      if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
      if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
      return token;
    })
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function retrieve(records, question, { limit = 5, history = [] } = {}) {
  const rawTokens = tokens(question);
  const questionTokens = new Set(rawTokens);
  let prevTokens = [];

  if (PRONOUN_FOLLOWUP.test(question) || rawTokens.length <= 2) {
    prevTokens = extractHistoryTokens(history);
    for (const token of prevTokens) {
      questionTokens.add(token);
    }
  }

  if (!questionTokens.size) return [];

  return records
    .map((record) => {
      const recordTokens = new Set(tokens(record.text));
      const titleTokens = new Set(tokens(record.title));
      const matches = [...questionTokens].filter((token) => recordTokens.has(token));
      const titleMatches = [...questionTokens].filter((token) => titleTokens.has(token));
      const score = addIntentBoost(question, record.title, matches.length + titleMatches.length * 6, prevTokens);
      return { record, score };
    })
    .filter((result) => result.score >= (questionTokens.size >= 2 ? 2 : 1))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ record, score }) => ({ ...record, score }));
}
