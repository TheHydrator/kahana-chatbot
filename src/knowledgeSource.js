import fs from 'node:fs/promises';
import path from 'node:path';

function stripHtml(value = '') {
  return value
    .replace(/<(p|h[1-6]|li|tr|table|ol|ul)\b[^>]*>/gi, '\n\n')
    .replace(/<\/(p|h[1-6]|li|tr|table|ol|ul)>/gi, '\n\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function normalizeHelpDocument(document) {
  return {
    id: `help:${document.slug}`,
    type: 'help',
    title: document.title || document.slug,
    question: document.title || document.slug,
    text: [document.title, document.description, stripHtml(document.content)].filter(Boolean).join('\n\n'),
    href: `https://about.kahana.io/help/${document.slug}`,
    tags: Array.isArray(document.tags) ? document.tags : [],
  };
}

function normalizeFaqItem(item, sectionTitle) {
  return {
    id: `faq:${item.id}`,
    type: 'faq',
    title: item.question,
    question: item.question,
    text: [item.question, item.answer].filter(Boolean).join('\n\n'),
    answer: item.answer,
    href: 'https://about.kahana.io/faq',
    tags: sectionTitle ? [sectionTitle] : [],
  };
}

async function readJsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  return Promise.all(files.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  }));
}

export async function loadKnowledgeBase({ sourceRoot, faqPath } = {}) {
  const root = sourceRoot || process.env.KAHANA_KNOWLEDGE_SOURCE;
  if (!root) {
    throw new Error('Set KAHANA_KNOWLEDGE_SOURCE to the kahana-homepage-public checkout.');
  }

  const helpDocuments = await readJsonFiles(path.join(root, 'data', 'docs'));
  const records = helpDocuments.map(normalizeHelpDocument);

  if (faqPath) {
    const faqSections = JSON.parse(await fs.readFile(faqPath, 'utf8'));
    faqSections.forEach((section) => {
      (section.items || []).forEach((item) => {
        records.push(normalizeFaqItem(item, section.title));
      });
    });
  }

  return records;
}
