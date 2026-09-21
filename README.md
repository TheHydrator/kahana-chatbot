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
src/chatbotService.js   -> answer + citation contract  (LLM layer goes here next)
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
| Knowledge loader | `src/knowledgeSource.js` | Done — loads 26 help docs + optional FAQ JSON |
| Retrieval engine | `src/retrieval.js` | Done — token search, stop-word filter, intent boosts |
| Answer service | `src/chatbotService.js` | Done — returns `{ responseType, text, citations }` |
| HTTP server | `server.js` | Done — `POST /api/chat`, `GET /api/health`, static UI |
| Chat UI | `ui/` | Done — sidebar panel, citation links, open/close toggle |
| FAQ export | `data/faq-export.json` | Generated from `kahana-homepage-public/data/platformFaq.js` |

The chatbot runs fully locally with no external API calls. Answers come from
the 26 help docs and the 56 FAQ items loaded at startup.

### Known fix applied

The original `answerFromHelpRecord` cherry-picked the 3 highest-scoring
sections non-contiguously, which orphaned headings from their bodies and cut
answers mid-sentence. The fix starts at the first matching section and reads
forward in document order, stopping at a clean section boundary before
1 400 characters. Answers are now complete paragraphs.

---

## Running locally

### Prerequisites

- Node.js 18+
- `kahana-homepage-public` cloned as a sibling of `kahana-web`
  (`/path/to/Kahana/kahana-homepage-public`)

### Generate the FAQ export (one time)

```bash
node --input-type=module <<'EOF'
import { FAQ_SECTIONS } from '../../kahana-homepage-public/data/platformFaq.js';
import fs from 'node:fs';
const out = FAQ_SECTIONS.map(({ title, items }) => ({ title, items }));
fs.writeFileSync('./data/faq-export.json', JSON.stringify(out, null, 2));
console.log('FAQ items written:', out.reduce((n, s) => n + s.items.length, 0));
EOF
```

### Start the server

```bash
# From the chatbot/ folder
node server.js
```

Open **http://localhost:4173** in a browser.

### Environment variables (all optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `KAHANA_KNOWLEDGE_SOURCE` | `../../kahana-homepage-public` | Path to homepage checkout |
| `CHATBOT_FAQ_PATH` | _(not wired yet)_ | Path to FAQ JSON export |
| `CHATBOT_PORT` | `4173` | HTTP port |

### Health check

```bash
curl http://localhost:4173/api/health
# {"ok":true,"records":26,"sourceRoot":"..."}
```

### Chat API

```bash
curl -X POST http://localhost:4173/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"what is a hub"}'
```

Response contract:

```json
{
  "responseType": "ANSWER_FROM_KNOWLEDGE_BASE",
  "text": "...",
  "citations": [
    { "label": "Hubs", "href": "https://about.kahana.io/help/hubs", "type": "help" }
  ]
}
```

`responseType` is one of `ANSWER_FROM_KNOWLEDGE_BASE` or `I_DONT_UNDERSTAND`.

---

## What is next

### 1. LLM integration (next step)

Wire an API key (Claude or OpenAI) into `src/chatbotService.js`. The retrieval
layer already surfaces the best matching records — the plan is to pass those
records as context to the model so answers are natural language instead of raw
doc excerpts. The `{ responseType, text, citations }` contract stays the same;
only the text generation changes.

### 2. Wire in FAQ data at startup

Pass `faqPath` to `loadKnowledgeBase` in `server.js` so the 56 FAQ items are
loaded alongside the 26 help docs, giving the retrieval layer more coverage.

### 3. Action buttons

The Feedback / Support / Contact buttons in the UI currently call
`window.alert`. They should navigate to the real in-app routes
(`/support`, `/contact`, feedback modal).

### 4. Production integration

When the chatbot is ready, add a route and provider in `src/` and remove the
production boundary in this README. Until then, `src/` is untouched.

---

## Intended contents

- UI experiments
- Knowledge-base adapters
- Local prototypes
- Notes and test fixtures

The existing application remains unchanged while the chatbot is developed here.
