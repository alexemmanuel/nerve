https://nerve-tz8t.vercel.app/

# Nerve — Encrypted P2P Dev Workspace & Incident Response Platform

Nerve is an encrypted peer-to-peer (P2P) developer workspace with a built-in **Nerve Shark** chatbox and code assistant, inline Codespaces code viewer and terminal, incident triage and pull request diff workflow, and a 5-tab REST/SDK Integration console.

- **Live App**: https://nerve-tz8t.vercel.app/
- **Platform Contact & Integration Profile**: `nervep2p@gmail.com`
- **Engine Version**: `v1.7.0`

---

## Core Features

### 1. GitHub-Style Workspace & E2EE P2P Messaging
- **3-Pane Layout**: Clean navigation sidebar (repo & peer search, Nerve Shark chatbox, Direct Messages, Tracked Repositories, Focus Mode, and Code & Terminal toggle), central chat stream, and resizable Code Viewer / Terminal panel.
- **Nerve Shark Chatbox & Code Assistant**: Dual-mode assistant powered by `gemini-4-hydrogen` (`POST /api/v1/copilot/collaborate`). Ask everyday questions about how to use Nerve (chat mode) or debug stack traces, review diffs, and synthesize fixes (code mode)—available in Workspace, peer threads (`@shark`), and Integration.
- **WebRTC `RTCDataChannel` + AES-GCM 256-bit Encryption**: Client-side PBKDF2-SHA256 key derivation (`100,000` iterations) and AES-GCM encryption over direct `nerve-e2ee-dc` data channels with `16 KB` chunked file transfers and `bufferedAmount` backpressure monitoring (`256 KB` high / `64 KB` low watermarks), plus Socket.IO relay fallback.
- **Universal Repository Deep-Linking**: Automatically parses `owner/repo#branch/path/to/file.ts:L42` references into interactive code preview cards and inline editor jumps.
- **Focus Mode & Offline Queue**: Pause direct message notifications during deep work while keeping incident alerts active, with local `localStorage` action queuing and automatic sync on reconnect.

### 2. Inline Codespaces Terminal & Code Viewer
- **Interactive Multi-Terminal Shell**: Supports multiple terminal tabs, split-pane view, Build vs. Logs sub-tabs, command history suggestions, ANSI color schemes, line-numbered log output, and raw `.txt` session log export.
- **File Explorer & Diff Inspection**: Browse tracked GitHub repository files and preview patched vs. base code inline.

### 3. Incidents & Pull Request Diff Workflow
- **New Issue & Webhook Dispatch**: Create issues with repository, branch, file path, line number, and stack trace from the header (`New Issue`) or chat (`/bug`), or trigger live GitHub `issues` / `pull_request` webhooks.
- **Resolution Pipeline & Log Analysis**: Interactive D3.js pipeline tracker, **Nerve Shark Log Analysis** (`gemini-4-hydrogen`), unified/split Pull Request Diff viewer with inline line comments and `.patch` export, and one-click `Approve & Merge`.

### 4. GitHub Settings-Style Integration Console (5 Tabs)
- **Security Verification Gate**: Automatically locks on tab switch, reload, or leaving Integration; unlocks via Google OAuth, GitHub OAuth, or 6-digit email verification code.
- **Overview**: Real-time CI/CD build health feed (`Passing`, `Failing`, `Running`, `Pending`), MTTR stats, 30-day D3.js telemetry chart, and a one-click **Verify Live Gemini** health check (`GET /api/v1/health`).
- **API Keys**: Manage Live (`nrve_live_...`) and Test (`nrve_test_...`) Bearer keys with granular scopes, copy-once post-integration sealing, and key rotation (`X-Integrator-Email` defaults to `nervep2p@gmail.com`).
- **SSH Keys**:
  - Generate/register Ed25519 & RSA keys for local Git and third-party remotes (GitLab, Bitbucket, Azure DevOps, Gitea, Codeberg) with `~/.ssh/config` snippets.
  - Manage GitHub Account SSH authentication and commit-signing keys (`/api/v1/github/ssh-keys`).
- **API & SDKs**: CORS-enabled `/api/v1/engine/call` gateway, interactive Endpoint Runner, and copy-ready SDK snippets.
- **Ask Nerve Shark**: Embedded chat assistant inside Integration for testing endpoints, keys, SSH setup, and webhooks.

### 5. Legal & Privacy Pages
- Built-in **Privacy Policy** (`/privacy`) and **Terms & Conditions** (`/terms`) accessible from the site footer and navigation menu, covering Google API Limited Use compliance, E2EE messaging, and `nervep2p@gmail.com` data requests.

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
│   └── index.ts                       # Vercel serverless Express entry point
├── src/
│   ├── components/
│   │   ├── ConnectedEmailUsersModal.tsx
│   │   ├── IncidentWorkflowView.tsx   # Pipeline, Nerve Shark log analysis & issue queue
│   │   ├── Integration.tsx            # 5-tab Integration console (Overview, Keys, SSH, API, Shark)
│   │   ├── IntegrationUnlockOverlay.tsx
│   │   ├── LegalDocumentView.tsx      # Privacy Policy & Terms & Conditions
│   │   ├── P2PWorkbenchPanel.tsx
│   │   └── PullRequestDiffViewer.tsx  # Unified & split PR diff reviewer
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
│   ├── App.tsx                        # GitHub-style Workspace shell & global navigation
│   ├── firebase.ts                    # Firebase Auth & Firestore helpers
│   └── index.css
├── server.ts                          # Express REST API, Socket.IO & Vite dev server
├── firestore.rules                    # Firestore security rules
├── firebase-applet-config.json        # Firebase client configuration
└── vercel.json                        # Vercel build & /api/* rewrite rules
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

## Deploying to Vercel & Public Sign-In

This repository includes `vercel.json` and `api/index.ts` for zero-config deployment:

1. Push your repository to GitHub.
2. Import the project in **Vercel** (`vite` framework preset, output directory `dist`).
3. Add environment variables (`GEMINI_API_KEY`, `API_KEY_SECRET_SALT`, etc.) in Vercel Project Settings.
4. Add your deployment domain (e.g. `nerve-tz8t.vercel.app`) to **Firebase Console → Authentication → Settings → Authorized domains** for GitHub and Google OAuth popups.
5. To allow general public Google sign-in without manually adding test users, publish your OAuth consent screen to **In production** in **Google Cloud Console → Google Auth Platform → Audience** (using standard sign-in scopes; no `nervep2p@gmail.com` Firebase user entry is required).

---

## API Overview

All `/api/v1/*` endpoints accept `Authorization: Bearer nrve_live_...` (or `nrve_test_...`) and optional `X-Integrator-Email: nervep2p@gmail.com`, with CORS enabled for third-party integrations:

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/v1/health` | Verify Vercel runtime, `v1.7.0` profile (`nervep2p@gmail.com`) & live Gemini status |
| `GET /api/v1/engine/manifest` | List available Nerve engine modules |
| `POST /api/v1/engine/call` | Unified third-party callout gateway |
| `POST /api/v1/keys/create` & `seal` | Issue or permanently seal Live / Test API keys |
| `GET /api/v1/ci/status` & `metrics-30d` | Real-time CI build health & 30-day telemetry |
| `POST /api/v1/webhooks/github` | Receive GitHub `issues` / `pull_request` webhooks |
| `POST /api/v1/incidents/dispatch` & `triage-logs` | Create issues & analyze CI stack traces |
| `POST /api/v1/codespaces/execute` | Execute containerized build/test commands |
| `POST /api/v1/copilot/collaborate` | Invoke Nerve Shark (`mode: "chat"` or `"code"`) |
| `GET/POST/DELETE /api/v1/ssh/keys` & `/api/v1/github/ssh-keys` | Manage local, third-party & GitHub SSH keys |
| `POST /api/v1/p2p/datachannel-stream` & `e2ee-verify` | Verify WebRTC 16KB DataChannel & AES-GCM state |

---

## Contact

For support, integration inquiries, or privacy requests: **nervep2p@gmail.com**
