# Chatbot Workspace

This folder is an isolated workspace for the Kahana chatbot.

## Production boundary

- Do not import files from this folder into `src/`.
- Do not add routes, providers, or build scripts here yet.
- The current production application does not read this folder.

## Architecture

```text
kahana-homepage-public checkout
    |
    v
src/knowledgeSource.js  -> normalized Help / FAQ records
    |
    v
src/retrieval.js        -> deterministic keyword retrieval + intent boosts
    |
    v
src/chatbotService.js   -> guardrails → retrieval → Gemini LLM → answer + citations
    |
    v
server.js               -> Node HTTP server  POST /api/chat  GET /api/health
    |
    v
ui/                     -> browser chat panel (index.html + app.js + styles.css)
```

The source adapter reads Help articles from `data/docs/*.json` in the
`kahana-homepage-public` checkout. FAQ records are generated from
`data/platformFaq.js` into `data/faq-export.json` so this workspace does not
import marketing-site code or depend on its build system.

---

## What is built and working

| Layer | File | Status |
|-------|------|--------|
| Knowledge loader | `src/knowledgeSource.js` | Done — loads 26 help docs + FAQ JSON |
| Retrieval engine | `src/retrieval.js` | Done — token search, stop-word filter, intent boosts |
| Guardrails | `src/chatbotService.js` | Done — blocks security / data-modification questions |
| LLM answer | `src/chatbotService.js` | Done — Gemini synthesizes natural-language answers from retrieved docs |
| Fallback | `src/chatbotService.js` | Done — falls back to keyword extraction if Gemini is unavailable |
| HTTP server | `server.js` | Done — `POST /api/chat`, `GET /api/health`, static UI |
| Chat UI | `ui/` | Done — sidebar panel, citation links, Enter to send, open/close toggle |
| FAQ export | `data/faq-export.json` | Generated from `kahana-homepage-public/data/platformFaq.js` |

---

## Setup (first time)

### 1. Prerequisites

- Node.js 18+
- `kahana-homepage-public` cloned as a sibling of `kahana-web`

```
Kahana/
  kahana-homepage-public/   ← clone this
  kahana-web/
    chatbot/                ← you are here
```

### 2. Get a free Gemini API key

1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with Google → click **Create API key**
3. Copy the key

### 3. Create a `.env` file

Create a file called `.env` inside the `chatbot/` folder (it is gitignored — never commit it):

```bash
GEMINI_API_KEY=your_key_here
```

### 4. Generate the FAQ export (one time only)

Run this from inside the `chatbot/` folder:

```bash
node --input-type=module <<'EOF'
import { FAQ_SECTIONS } from '../../kahana-homepage-public/data/platformFaq.js';
import fs from 'node:fs';
const out = FAQ_SECTIONS.map(({ title, items }) => ({ title, items }));
fs.mkdirSync('./data', { recursive: true });
fs.writeFileSync('./data/faq-export.json', JSON.stringify(out, null, 2));
console.log('FAQ items written:', out.reduce((n, s) => n + s.items.length, 0));
EOF
```

### 5. Start the server

```bash
npm run start:ui
```

Open **http://localhost:4173** in a browser.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | _(none)_ | Gemini API key — without it the chatbot falls back to keyword answers |
| `KAHANA_KNOWLEDGE_SOURCE` | `../../kahana-homepage-public` | Path to homepage checkout |
| `CHATBOT_PORT` | `4173` | HTTP port |

---

## Response types

| `responseType` | When |
|---|---|
| `ANSWER_FROM_KNOWLEDGE_BASE` | Matched a help doc or FAQ item — Gemini writes the answer |
| `I_DONT_UNDERSTAND` | No relevant match found |
| `REFUSE_AND_REDIRECT` | Security, architecture, credentials, or data-modification request |

---

## Health check

```bash
curl http://localhost:4173/api/health
# {"ok":true,"records":26,"sourceRoot":"..."}
```

## Chat API

```bash
curl -X POST http://localhost:4173/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"what is a hub"}'
```

---

## What is next

### 1. Wire in FAQ data at startup

Pass `faqPath` to `loadKnowledgeBase` in `server.js` so the 56 FAQ items are
loaded alongside the 26 help docs, giving the retrieval layer more coverage.

### 2. Action buttons

The Feedback / Support / Contact buttons in the UI currently call
`window.alert`. They should navigate to the real in-app routes
(`/support`, `/contact`, feedback modal).

### 3. Production integration

When the chatbot is ready, add a route and provider in `src/` and remove the
production boundary in this README. Until then, `src/` is untouched.

---

## Intended contents

- UI experiments
- Knowledge-base adapters
- Local prototypes
- Notes and test fixtures

The existing application remains unchanged while the chatbot is developed here.
