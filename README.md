# Kahana Chatbot Workspace

This folder is an isolated workspace for the Kahana AI chatbot.

**Authors:** Rohit Goutam Maity , Kunal Jatin Tamhane

**GitHub Repository:** [https://github.com/TheHydrator/kahana-chatbot](https://github.com/TheHydrator/kahana-chatbot)

## Production boundary

- Do not import files from this folder into `src/`.
- Do not add routes, providers, or build scripts here yet.
- The current production application does not read this folder.

---

## Architecture

```text
kahana-homepage-public checkout
    |
    v
src/knowledgeSource.js   -> normalizes 26 help docs + 56 FAQ items into records
    |
    v
src/retrieval.js         -> keyword search, stop-word filter, intent boosts, score threshold
    |
    v
src/chatbotService.js    -> greetings → guardrails → retrieval → Gemini stream → citations
    |                       (retries Gemini once; fallback streams keyword answer in chunks)
    v
server.js                -> Node HTTP server
                            POST /api/chat/stream  (SSE — used by UI)
                            POST /api/chat         (JSON — backwards compat)
                            GET  /api/health
    |
    v
ui/                      -> browser sidebar chat panel
                            index.html  app.js  styles.css
```

---

## What is built and working

| Layer | File | Status |
|-------|------|--------|
| Knowledge loader | `src/knowledgeSource.js` | Done — loads 26 help docs + 56 FAQ items |
| Retrieval engine | `src/retrieval.js` | Done — token search, stop-word filter, score threshold, intent boosts, pronoun/contextual query expansion |
| Multi-turn session memory | `src/chatbotService.js` + `src/retrieval.js` + `ui/app.js` | Done — maintains conversational context across turns, persists in session/local storage by user ID, with header Clear button |
| Structured "How-to" steps | `src/chatbotService.js` | Done — questions starting with "How" automatically generate numbered step-by-step bulleted instructions |
| Off-topic rejection | `src/retrieval.js` | Done — off-topic questions (weather, pizza) correctly return no match |
| Greetings | `src/chatbotService.js` | Done — hi / hello / hey / whatsup etc. get a friendly reply |
| Guardrails | `src/chatbotService.js` | Done — blocks security, credentials, data-modification questions |
| LLM answers | `src/chatbotService.js` | Done — Gemini Flash Lite synthesizes natural answers from retrieved docs |
| Retry logic | `src/chatbotService.js` | Done — retries Gemini once (300ms delay, 6s timeout) before falling back |
| Streaming (TTFT) | `src/chatbotService.js` + `server.js` | Done — SSE stream, first token visible immediately |
| Fallback streaming | `src/chatbotService.js` | Done — keyword answer streamed in 40-char chunks if Gemini fails |
| HTTP server | `server.js` | Done — SSE + JSON endpoints, static UI, health check |
| Live website overlay | `ui/index.html` + `ui/styles.css` | Done — embeds live `kahana.io` in full-bleed background behind sidebar |
| Sidebar Ribbon AI Launcher | `ui/index.html` + `ui/styles.css` | Done — 4-edged star AI button positioned in bottom-left ribbon next to Translate (`文A`) with calibrated equal spacing |
| Pretty-printed outputs & bolding | `src/chatbotService.js` + `ui/app.js` + `ui/styles.css` | Done — intent understanding, smart bolding of key concepts/rules/actions, markdown parser with streaming bold support |
| Multi-screen responsive layout | `ui/styles.css` + `ui/app.js` + `ui/index.html` | Done — desktop side-by-side reflow, tablet 64px rail docking + backdrop, mobile thumb FAB + full-screen drawer |
| Draggable panel resize handle | `ui/app.js` + `ui/styles.css` + `ui/index.html` | Done — drag to resize panel (320px–700px), double-click to reset, persisted to localStorage |
| Thread scrolling & flex containment | `ui/styles.css` | Done — scrollable message thread with flex containment, pinned header and composer, right-aligned user speech bubbles |
| Loading & thinking state | `ui/app.js` + `ui/styles.css` | Done — instant thinking bubble, spinning loader, animated dots, pulsing avatar, disabled composer |
| Enter to send | `ui/app.js` | Done — Enter sends, Shift+Enter creates new line |
| FAQ export | `data/faq-export.json` | Generated from `kahana-homepage-public/data/platformFaq.js` |

---

## Response types

| `responseType` | When |
|---|---|
| `GREETING` | Recognised greeting (hi, hello, hey, whatsup…) |
| `ANSWER_FROM_KNOWLEDGE_BASE` | Matched a help doc or FAQ item |
| `I_DONT_UNDERSTAND` | No relevant Kahana match found |
| `REFUSE_AND_REDIRECT` | Security, credentials, or data-modification request |

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

Create a file called `.env` inside the `chatbot/` folder (gitignored — never commit it):

```
GEMINI_API_KEY=your_key_here
```

### 4. Generate the FAQ export (one time only)

Run from inside the `chatbot/` folder:

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
| `GEMINI_API_KEY` | _(none)_ | Free Gemini key — without it answers fall back to keyword extraction |
| `KAHANA_KNOWLEDGE_SOURCE` | `../../kahana-homepage-public` | Path to homepage checkout |
| `CHATBOT_PORT` | `4173` | HTTP port |

---

## API reference

### Health check

```bash
curl http://localhost:4173/api/health
# {"ok":true,"records":26,"sourceRoot":"..."}
```

### Streaming chat (used by UI)

```bash
curl -N -X POST http://localhost:4173/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How do I earn from it?",
    "history": [
      { "role": "user", "text": "What is Aura?" },
      { "role": "model", "text": "Aura is Kahana’s engagement reward system..." }
    ],
    "userId": "optional-user-id"
  }'
```

SSE event stream — each line is `data: <json>`:

```
data: {"type":"chunk","text":"To earn Aura"}
data: {"type":"chunk","text":" in Kahana, follow these steps:..."}
data: {"type":"done","responseType":"ANSWER_FROM_KNOWLEDGE_BASE","citations":[...]}
```

### JSON chat (backwards compat)

```bash
curl -X POST http://localhost:4173/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "what is a hub",
    "history": []
  }'
```

---

## Multi-screen responsive layout & output formatting

### 1. Multi-Screen Layout Support

| Screen Size | Left Navigation Pane | AI Launcher Button | Chatbot Panel Behavior |
| :--- | :--- | :--- | :--- |
| **Desktop**<br/>(`≥ 1200px`) | **Expanded** (`~260px`) | Docks in the bottom footer ribbon next to Translate (`文A`) with calibrated equal spacing. | Opens side-by-side: automatically adjusts page width (`body.agent-open .original-site`) so cards are never covered. Includes a drag-to-resize handle (320px–700px, double-click to reset). |
| **Tablet / Compact**<br/>(`769px` – `1199px`) | **Collapsed Rail** (`64px`) | Repositions inside the 64px rail (`left: 16px; bottom: 116px;`), stacking above gear, theme, and language controls. | Acts as an overlay panel (`width: min(390px, 45vw)`). Includes a dimmed backdrop (`.panel-backdrop`) for tap-outside dismissal. |
| **Mobile**<br/>(`≤ 768px`) | **Hidden** (off-screen drawer) | Transforms into a thumb-friendly Floating Action Button (FAB) (`52px` circle at `bottom: 20px; right: 18px;`). Automatically hides when panel is open. | Opens as a native full-height drawer (`100vw`, `100dvh`) with safe-area insets, touch-sized buttons, and 16px composer text to prevent iOS auto-zoom. |
| **Small Phones**<br/>(`≤ 380px`) | Hidden | FAB in bottom-right corner. | Compact header that hides subtitle and shrinks button labels to prevent header overflowing. |

### 2. Pretty-Printed Outputs & Smart Bolding

- **Intent Understanding:** The AI analyzes the user's question, directly highlights the core answer in the opening sentence, and bolds critical takeaways (`**Aura**`, `**5 Aura**`, `**Help centre**`, `**Step 1:**`).
- **Markdown & Streaming Parser:** Renders bold, italics, code, headings, and clean structured lists (`<ul>`/`<ol>`). Supports unclosed markdown auto-closing during SSE streaming for zero visual flicker.
- **Contained Scrolling:** Thread container uses flexbox containment (`flex: 1 1 0%`, `min-height: 0`, `overflow-y: auto`) with pinned header and composer, preventing off-screen displacement.

---

## What is next

### 1. Wire in FAQ data at startup

Pass `faqPath` to `loadKnowledgeBase` in `server.js` so the 56 FAQ items load
alongside the 26 help docs at boot, giving retrieval broader coverage.

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
