import { retrieve } from './retrieval.js';

const SECURITY_PATTERNS = [
  /\b(?:another|other)\s+user\b.{0,60}\b(?:data|profile|hub|information)\b/i,
  /\b(?:firebase|firestore)\b.{0,60}\b(?:data|security|architecture|credentials?|tokens?)\b/i,
  /\b(?:security|architecture|database)\b.{0,60}\b(?:details?|structure|credentials?|exploit)\b/i,
  /\b(?:tell me about|how does|what is)\b.{0,40}\barchitecture\b/i,
  /\b(?:bypass|circumvent)\b.{0,30}\bsecurity\b/i,
  /\bexploit\b/i,
  /\bransom\b/i,
  /\b(?:show|give|reveal)\b.{0,30}\b(?:credentials?|passwords?|api\s*keys?|secrets?)\b/i,
];

const DATA_MODIFICATION_PATTERNS = [
  /\b(?:delete|modify|change|update)\b.{0,40}\b(?:data|hub|account|information)\b/i,
  /\b(?:someone else'?s?|another user'?s?|other user'?s?)\b.{0,40}\b(?:data|hub|account|information)\b/i,
];

function checkGuardrails(question) {
  if (SECURITY_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      responseType: 'REFUSE_AND_REDIRECT',
      text: 'I can\'t provide private implementation or security details. For account-specific help, please use the Support form.',
      citations: [{ label: 'Contact support', href: 'https://app.kahana.io/support' }],
    };
  }
  if (DATA_MODIFICATION_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      responseType: 'REFUSE_AND_REDIRECT',
      text: 'I can\'t modify Kahana data from here. Use the relevant controls in the app, or reach out to support if you need help.',
      citations: [{ label: 'Contact support', href: 'https://app.kahana.io/support' }],
    };
  }
  return null;
}

function answerFromHelpRecord(record, question) {
  const MAX_CHARS = 1400;
  const questionWords = new Set(
    String(question).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  );
  const sections = record.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

  // Find the first section that contains a question word as the starting point
  let startIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    const words = new Set(sections[i].toLowerCase().split(/[^a-z0-9]+/));
    if ([...questionWords].some((w) => words.has(w))) { startIdx = i; break; }
  }

  // Build answer forward from startIdx, stopping at a section boundary before MAX_CHARS
  let text = '';
  for (let i = startIdx; i < sections.length; i++) {
    const candidate = text ? `${text}\n\n${sections[i]}` : sections[i];
    if (candidate.length > MAX_CHARS && text) break;
    text = candidate;
  }

  return text || sections.slice(0, 4).join('\n\n');
}

export function answerQuestion(records, question, options = {}) {
  const blocked = checkGuardrails(question);
  if (blocked) return blocked;

  const matches = retrieve(records, question, options);
  if (!matches.length) {
    return {
      responseType: 'I_DONT_UNDERSTAND',
      text: 'I could not find a relevant Kahana Help or FAQ answer. Try different wording or open Help for all articles.',
      citations: [{ label: 'Help', href: '/help' }, { label: 'FAQ', href: '/faq' }],
    };
  }

  const bestMatch = matches[0];
  return {
    responseType: 'ANSWER_FROM_KNOWLEDGE_BASE',
    text: bestMatch.answer || answerFromHelpRecord(bestMatch, question),
    citations: matches.slice(0, 3).map((match) => ({
      label: match.title,
      href: match.href,
      type: match.type,
    })),
  };
}
