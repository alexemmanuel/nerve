# Nerve — Native P2P Dev Work Surface & Incident Response API

Nerve is an encrypted peer-to-peer (P2P) developer messenger, inline Codespaces pairing environment, mobile-ready incident triage workbench, and CORS-enabled REST/SDK integration platform.

---

## Core Features

### 1. Workspace & E2EE P2P Developer Messenger
- **Bilateral Mutual-Follow & Proof-of-Work Gate**: Unlocks P2P channels between developers after verifying mutual follow status and commit history (`>= 15` commits).
- **WebRTC `RTCDataChannel` + AES-GCM 256-bit Encryption**: Client-side PBKDF2-SHA256 key derivation (`100,000` iterations) and AES-GCM encryption over direct `nerve-e2ee-dc` data channels with `16 KB` chunked file transfers and `bufferedAmount` backpressure monitoring (`256 KB` high / `64 KB` low watermarks), plus Socket.IO relay fallback.
- **Universal Repository Deep-Linking**: Automatically parses `owner/repo#branch/path/to/file.ts:L42` references into interactive code preview cards and inline editor jumps.
- **Focus Switch Sovereignty**: Pause direct message notifications during deep work while keeping public PRs, CI webhooks, and `/bug` incident alerts active.
- **Live Network Signal & Offline Queue**: Real-time latency/signal observer with local `localStorage` action queuing and automatic sync on reconnect.

### 2. Inline Codespaces Terminal & Code Drawer
- **Interactive Multi-Terminal Shell**: Supports multiple terminal tabs, split-pane view, Build vs. Logs sub-tabs, command history suggestions, ANSI color schemes, line-numbered log output, and raw `.txt` session log export.
- **Nerve Shark Co-Pilot**: Server-side AI code triage and patch synthesis (`POST /api/v1/copilot/collaborate`) integrated directly into the editor and chat threads.
- **File Explorer & Diff Inspection**: Browse tracked GitHub repository files and preview patched vs. base code inline.

### 3. Incident Workflow & Triage Hub (`/bug`)
- **Zero-Friction `/bug` Dispatch**: File bug reports with repository, branch, file path, line number, and stack trace directly from the header or chat stream.
- **5-Stage Pipeline Visualization**: Tracks incidents from `Bug Reported` → `Triaged` → `In Progress` → `PR Open` → `PR Merged` with automated CI log triage, unified/split PR diff viewer, and one-click PR merge resolution.

### 4. Integration Console, Telemetry & Universal API Gateway
- **Security Re-Authentication Gate**: Automatically locks on tab switch, reload, or leaving the Integration tab; unlocks via Google OAuth, GitHub OAuth, or 6-digit email verification code.
- **CI/CD Telemetry & D3 Analytics**: Live build health feed (`Passing`, `Failing`, `Running`, `Pending`), 5-build hover history, Mean Time to Recovery (MTTR) calculation, and a 30-day D3.js deployment success rate & build duration chart.
- **API Keys & Post-Integration Sealing**: Issue Live (`nrve_live_...`) and Test (`nrve_test_...`) keys with granular ecosystem scopes; keys automatically seal after being copied for third-party integration.
- **SSH Key Configuration**:
  - Generate/register Ed25519 & RSA keys for local Git and third-party remotes (GitLab, Bitbucket, Azure DevOps, Gitea, Codeberg) with `~/.ssh/config` snippets.
  - Manage GitHub Account SSH authentication and commit-signing keys (`/api/v1/github/ssh-keys`).
- **Third-Party Engine Callout Gateway (`/api/v1/engine/call`)**: CORS-enabled REST gateway + interactive Endpoint Runner and SDK snippets for Node.js, WebRTC, AI Triage, VS Code, and mobile/third-party integrations.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, D3.js
- **Realtime & Crypto**: WebRTC (`RTCDataChannel`), Socket.IO, Web Crypto API (`PBKDF2`, `AES-GCM-256`)
- **Auth & Persistence**: Firebase Authentication (GitHub, Google, Email/Password) & Cloud Firestore (`users_public`, `github_peers`)
- **Backend & Serverless**: Express (`server.ts`) + Vercel Serverless adapter (`api/index.ts`), Nodemailer / Gmail API, `@google/genai`

---

## Project Structure

```text
├── api/
│   └── index.ts                  # Vercel serverless Express entry point
├── src/
│   ├── components/
│   │   ├── IncidentWorkflowView.tsx
│   │   ├── Integration.tsx       # CI/CD telemetry, API keys, SSH & endpoint runner
│   │   ├── MobilePocketView.tsx
│   │   ├── P2PWorkbenchPanel.tsx
│   │   └── PullRequestDiffViewer.tsx
│   ├── data/
│   │   ├── incidentReports.ts
│   │   └── mockWorkspaceData.ts
│   ├── hooks/
│   │   ├── useP2PEngine.ts
│   │   └── useWorkspacePersistence.ts
│   ├── utils/
│   │   ├── ansiParser.tsx
│   │   ├── cryptoEngine.ts
│   │   ├── offlineQueue.ts
│   │   ├── p2pStorage.ts
│   │   ├── securityEncoding.ts
│   │   ├── syntaxHighlighter.tsx
│   │   ├── terminalEvaluator.ts
│   │   └── thirdPartySsh.ts
│   ├── App.tsx
│   ├── firebase.ts               # Firebase Auth & Firestore helpers
│   └── index.css
├── server.ts                     # Express REST API, Socket.IO & Vite dev server
├── firestore.rules               # Firestore security rules
├── firebase-applet-config.json   # Firebase client configuration
└── vercel.json                   # Vercel build & /api/* rewrite rules
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file based on `.env.example` and configure optional server variables as needed:

```env
APP_URL="http://localhost:3000"
GEMINI_API_KEY=""              # Optional: enables live Gemini responses in Nerve Shark
NERVE_LIVE_API_KEY=""          # Optional: override default live key
NERVE_TEST_API_KEY=""          # Optional: override default test key
API_KEY_SECRET_SALT=""         # Optional: HMAC salt for key hashing
SMTP_HOST=""                   # Optional: SMTP host for verification emails
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
```

### Local Development

Runs the Express API, Socket.IO signaling server, and Vite frontend together on port `3000`:

```bash
npm run dev
```

### Type Check & Production Build

```bash
npm run lint
npm run build
```

---

## Deploying to Vercel

This repository includes `vercel.json` and `api/index.ts` for zero-config deployment:

1. Push your repository to GitHub.
2. Import the project in **Vercel** (`vite` framework preset, output directory `dist`).
3. Add any optional environment variables (`GEMINI_API_KEY`, `API_KEY_SECRET_SALT`, etc.) in Vercel Project Settings.
4. Ensure your Vercel domain (e.g. `your-app.vercel.app`) is added to **Firebase Console → Authentication → Settings → Authorized domains** for GitHub and Google OAuth popups.

---

## API Overview

All `/api/v1/*` endpoints accept `Authorization: Bearer nrve_live_...` (or `nrve_test_...`) and enable CORS for third-party integrations:

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/v1/engine/manifest` | List available Nerve engine modules |
| `POST /api/v1/engine/call` | Unified third-party callout gateway |
| `POST /api/v1/keys/create` | Issue a new Live or Test API key |
| `POST /api/v1/keys/seal` | Permanently seal a copied API key |
| `GET /api/v1/ci/status` & `GET /api/v1/ci/metrics-30d` | Real-time CI build health & 30-day telemetry |
| `POST /api/v1/webhooks/github` | Receive GitHub `issues` / `pull_request` webhooks |
| `POST /api/v1/incidents/dispatch` & `triage-logs` | Create `/bug` tickets & triage CI stack traces |
| `POST /api/v1/codespaces/execute` | Execute containerized build/test commands |
| `POST /api/v1/copilot/collaborate` | Invoke Nerve Shark AI patch synthesis |
| `GET/POST/DELETE /api/v1/ssh/keys` & `/api/v1/github/ssh-keys` | Manage local, third-party & GitHub SSH keys |
| `POST /api/v1/p2p/datachannel-stream` & `e2ee-verify` | Verify WebRTC 16KB DataChannel & AES-GCM state |
