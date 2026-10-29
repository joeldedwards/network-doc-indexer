# Folio — Network Drive Search & Discovery (Electron + SQLite FTS5)

Folio is a native desktop document search and discovery client built on Electron, React, and embedded SQLite FTS5. It indexes mapped network drives, UNC shares, or local directories in a background Node.js Worker Thread so teams can search, preview, share, and email documents locally without external database dependencies.

## Run & Operate

- `npm run build` — build the React UI (`artifacts/document-discovery/dist/public`) and bundle Electron (`dist-electron/`)
- `npm run dev` — build the Electron scripts and launch the desktop client (`npx electron .`)
- `npm run dev:ui` — start the Vite dev server for standalone UI development
- `npm test` — build Electron and run the end-to-end SQLite FTS5 pipeline and worker thread tests
- `npm run typecheck` — typecheck all workspace packages, React UI, and Electron TypeScript modules

## Stack

- Runtime: Electron (Main, Preload with `contextIsolation: true`, Renderer)
- Background Indexer: Node.js `worker_threads` (`electron/indexer-worker.ts`) + `chokidar` real-time file watcher (`electron/watcher.ts`)
- Embedded Database: `better-sqlite3` in WAL mode with `FTS5` virtual table (`porter unicode61` tokenizer) and automatic sync triggers
- Frontend: React 19, Vite, Wouter, TanStack Query, Tailwind CSS
- Document Extraction & Preview: `pdf-parse` (PDF text extraction + inline base64 PDF viewer), `mammoth` + `sanitize-html` (DOCX text & sanitized HTML conversion), UTF-8 stream reader with in-preview search for plaintext/code/logs
- Sharing & Email: Normalized UNC path (`\\Server\Share\...`), `file://` URL, Markdown link formatting, native `mailto:` launcher, and optional `nodemailer` SMTP dispatcher with a 25 MB attachment safeguard

## Where things live

- `electron/main.ts` — Electron application lifecycle, BrowserWindow management, CSP headers, and IPC handlers
- `electron/preload.ts` — Secure `contextBridge` exposing `window.electronAPI` to the renderer
- `electron/database.ts` — Embedded SQLite schema, FTS5 virtual table, triggers, BM25 ranking, and `<mark>` snippet queries
- `electron/indexer-worker.ts` — Background `worker_threads` directory crawler, parser, and batch SQLite indexer with velocity & log reporting
- `electron/watcher.ts` — `chokidar` real-time filesystem watcher for incremental updates
- `electron/preview-service.ts` — Timeout-guarded inline preview generator for PDF, DOCX, and text formats
- `electron/network-utils.ts` — UNC path detection, normalization, `file://` URL generation, and 3.5s timeout-guarded target ping
- `electron/mailer.ts` — Native `mailto:` generator and Nodemailer SMTP client with 25 MB size safeguard
- `artifacts/document-discovery/src/App.tsx` — Split-pane search UI, 3-step setup wizard, live log drawer, inline preview pane, and settings
- `scripts/test-desktop-pipeline.mjs` & `scripts/test-indexer-worker.mjs` — Automated verification suites
