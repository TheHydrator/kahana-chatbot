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

  let startIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    const words = new Set(sections[i].toLowerCase().split(/[^a-z0-9]+/));
    if ([...questionWords].some((w) => words.has(w))) { startIdx = i; break; }
  }

  let text = '';
  for (let i = startIdx; i < sections.length; i++) {
    const candidate = text ? `${text}\n\n${sections[i]}` : sections[i];
    if (candidate.length > MAX_CHARS && text) break;
    text = candidate;
  }

  return text || sections.slice(0, 4).join('\n\n');
}

async function generateWithGemini(question, matches, apiKey) {
  const context = matches.slice(0, 3).map((doc) =>
    `## ${doc.title}\n${doc.answer || doc.text.slice(0, 800)}`
  ).join('\n\n---\n\n');

  const prompt = `You are Kahana's helpful AI assistant. Answer the user's question using only the Kahana documentation provided below. Be concise (3–5 sentences max), friendly, and accurate. Do not mention Firebase, internal architecture, or anything not in the docs. If the docs don't fully cover the question, say so briefly and point the user to the Help centre.

--- KAHANA DOCS ---
${context}
--- END DOCS ---

User question: ${question}

Answer:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

export async function answerQuestion(records, question, options = {}) {
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

  const citations = matches.slice(0, 3).map((match) => ({
    label: match.title,
    href: match.href,
    type: match.type,
  }));

  if (options.geminiKey) {
    try {
      const text = await generateWithGemini(question, matches, options.geminiKey);
      if (text) return { responseType: 'ANSWER_FROM_KNOWLEDGE_BASE', text, citations };
    } catch (error) {
      console.error('Gemini error, falling back to keyword answer:', error.message);
    }
  }

  const bestMatch = matches[0];
  return {
    responseType: 'ANSWER_FROM_KNOWLEDGE_BASE',
    text: bestMatch.answer || answerFromHelpRecord(bestMatch, question),
    citations,
  };
}
