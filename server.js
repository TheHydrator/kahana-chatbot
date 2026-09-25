import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKnowledgeBase } from './src/knowledgeSource.js';
import { answerQuestion, streamAnswer } from './src/chatbotService.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const uiDirectory = path.join(currentDirectory, 'ui');
const port = Number(process.env.CHATBOT_PORT || 4173);
const sourceRoot = process.env.KAHANA_KNOWLEDGE_SOURCE || path.resolve(currentDirectory, '../../kahana-homepage-public');
const geminiKey = process.env.GEMINI_API_KEY || null;

let records = [];

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

async function serveStatic(request, response) {
  const requestedPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = path.resolve(uiDirectory, `.${requestedPath}`);
  if (!filePath.startsWith(uiDirectory)) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const content = await fs.readFile(filePath);
    const contentType = filePath.endsWith('.css') ? 'text/css' : filePath.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/api/chat/stream') {
      const { question, history, userId, sessionId } = await readBody(request);
      if (typeof question !== 'string' || !question.trim()) return sendJson(response, 400, { error: 'Question is required' });
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      for await (const event of streamAnswer(records, question, { geminiKey, history, userId, sessionId })) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      response.end();
      return;
    }
    if (request.method === 'POST' && request.url === '/api/chat') {
      const { question, history, userId, sessionId } = await readBody(request);
      if (typeof question !== 'string' || !question.trim()) return sendJson(response, 400, { error: 'Question is required' });
      return sendJson(response, 200, await answerQuestion(records, question, { geminiKey, history, userId, sessionId }));
    }
    if (request.method === 'GET' && request.url === '/api/health') {
      return sendJson(response, 200, { ok: true, records: records.length, sourceRoot });
    }
    if (request.method === 'GET') return serveStatic(request, response);
    return sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

records = await loadKnowledgeBase({ sourceRoot });
server.listen(port, () => {
  console.log(`Chatbot UI: http://localhost:${port}`);
  console.log(`Knowledge records loaded: ${records.length}`);
});
