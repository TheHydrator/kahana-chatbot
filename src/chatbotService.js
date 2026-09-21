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

const GREETING_PATTERN = /^\s*(?:hi(?:\s+there)?|hello(?:\s+there)?|hey(?:\s+there)?|howdy|hiya|sup|whatsup|wassup|what'?s\s*up|good\s(?:morning|afternoon|evening|day))[!?,.\s]*$/i;

function checkGreeting(question) {
  if (!GREETING_PATTERN.test(question)) return null;
  return {
    responseType: 'GREETING',
    text: 'Hi! I\'m Kahana\'s AI assistant. Ask me anything about hubs, Aura, earning, clubs, or getting started.',
    citations: [],
  };
}

function checkGuardrails(question) {
  if (SECURITY_PATTERNS.some((p) => p.test(question))) {
    return {
      responseType: 'REFUSE_AND_REDIRECT',
      text: 'I can\'t provide private implementation or security details. For account-specific help, please use the Support form.',
      citations: [{ label: 'Contact support', href: 'https://app.kahana.io/support' }],
    };
  }
  if (DATA_MODIFICATION_PATTERNS.some((p) => p.test(question))) {
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

function buildPrompt(question, matches) {
  const context = matches.slice(0, 3).map((doc) =>
    `## ${doc.title}\n${doc.answer || doc.text.slice(0, 800)}`
  ).join('\n\n---\n\n');

  return `You are Kahana's helpful AI assistant. Answer the user's question using only the Kahana documentation provided below. Be concise (3–5 sentences max), friendly, and accurate. Do not mention Firebase, internal architecture, or anything not in the docs. If the docs don't fully cover the question, say so briefly and point the user to the Help centre.

--- KAHANA DOCS ---
${context}
--- END DOCS ---

User question: ${question}

Answer:`;
}

async function* geminiStream(question, matches, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(question, matches) }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.2 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

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
      try {
        const data = JSON.parse(line.slice(6));
        const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunk) yield chunk;
      } catch {}
    }
  }
}

// Streaming entry point — yields { type:'chunk', text } then { type:'done', responseType, citations }
export async function* streamAnswer(records, question, options = {}) {
  const greeting = checkGreeting(question);
  if (greeting) {
    yield { type: 'chunk', text: greeting.text };
    yield { type: 'done', responseType: greeting.responseType, citations: [] };
    return;
  }

  const blocked = checkGuardrails(question);
  if (blocked) {
    yield { type: 'chunk', text: blocked.text };
    yield { type: 'done', responseType: blocked.responseType, citations: blocked.citations };
    return;
  }

  const matches = retrieve(records, question, options);
  if (!matches.length) {
    yield { type: 'chunk', text: 'I could not find a relevant Kahana Help or FAQ answer. Try different wording or open Help for all articles.' };
    yield { type: 'done', responseType: 'I_DONT_UNDERSTAND', citations: [{ label: 'Help', href: '/help' }, { label: 'FAQ', href: '/faq' }] };
    return;
  }

  const citations = matches.slice(0, 3).map((m) => ({ label: m.title, href: m.href, type: m.type }));

  if (options.geminiKey) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        for await (const chunk of geminiStream(question, matches, options.geminiKey)) {
          yield { type: 'chunk', text: chunk };
        }
        yield { type: 'done', responseType: 'ANSWER_FROM_KNOWLEDGE_BASE', citations };
        return;
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 700));
        } else {
          console.error('Gemini failed after retry, using fallback:', error.message);
        }
      }
    }
  }

  // Fallback: stream in small chunks so TTFT still feels smooth
  const text = (matches[0].answer || answerFromHelpRecord(matches[0], question));
  const CHUNK = 40;
  for (let i = 0; i < text.length; i += CHUNK) {
    yield { type: 'chunk', text: text.slice(i, i + CHUNK) };
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
  yield { type: 'done', responseType: 'ANSWER_FROM_KNOWLEDGE_BASE', citations };
}

// Non-streaming fallback kept for /api/chat
export async function answerQuestion(records, question, options = {}) {
  let text = '';
  let last = null;
  for await (const event of streamAnswer(records, question, options)) {
    if (event.type === 'chunk') text += event.text;
    else last = event;
  }
  return { responseType: last.responseType, text, citations: last.citations };
}
