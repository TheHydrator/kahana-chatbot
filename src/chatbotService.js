import { retrieve } from './retrieval.js';

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
