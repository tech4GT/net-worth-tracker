# Net Worth Tracker

## Project Overview
A personal net worth tracking and budgeting web application with Google OAuth login and a serverless AWS backend. Users track assets, liabilities, stock portfolios, and net worth over time with monthly snapshots. Includes AI-powered bank statement parsing for monthly budget tracking.

## Tech Stack
- **Frontend**: React 19 + Vite 6 + Tailwind CSS v4 + Zustand 5 + React Router 7 (HashRouter) + Recharts 2
- **Hosting**: GitHub Pages (static build deployed via `gh-pages`)
- **Backend**: AWS Lambda (single function, Node 20, arm64, 256MB, 60s timeout) + API Gateway HTTP API + DynamoDB (single table)
- **Auth**: AWS Cognito with Google OAuth (PKCE auth code flow via Hosted UI)
- **AI**: Anthropic API direct (Claude Haiku 4.5) for bank statement parsing
- **PDF Parsing**: pdfjs-dist (client-side, text extracted before upload)
- **Async Processing**: SQS queue for statement processing (avoids API Gateway 29s timeout) with DLQ
- **Infra**: AWS CDK (TypeScript) — Lambda, API Gateway, DynamoDB, Cognito, SQS
- **Testing**: Puppeteer E2E tests (82 tests across 15 files)
- **Local Dev**: Node.js dev server (`dev-server.js`, port 8246) with in-memory storage + disk persistence

## Commands
- `npm run dev` — Start Vite dev server (frontend only, needs API server separately)
- `npm run dev:api` — Start local API server on port 8246
- `npm run dev:full` — Start both API server and Vite together
- `npm run build` — Production build
- `npm run preview` — Preview production build
- `npm run test` — Run all 15 Puppeteer E2E test files (82 tests)
- `cd infra && npx cdk deploy --require-approval never` — Deploy AWS infrastructure
- `cd infra && npx cdk diff` — Preview infrastructure changes

## Architecture

### Frontend
- Single Zustand store (`src/store/store.js`) — NO persist middleware, all data loaded from API
- All store actions are async with optimistic updates + rollback on API failure
- `pendingIds` Set tracks items mid-API-flight (prevents editing during save)
- Auth context (`src/contexts/AuthContext.jsx`) wraps the app, `ProtectedRoute` guards all app routes
- Dev mode: when `VITE_COGNITO_DOMAIN` is empty, auth is bypassed with a mock "Dev User"
- Pages in `src/pages/`, components grouped by feature in `src/components/`
- Shared UI primitives in `src/components/ui/` (Button, Input, Select, Modal, EmptyState, ThemeToggle, Toast)
- Business logic helpers in `src/lib/` (api.js, auth.js, telemetry.js, currency.js, stocks.js, constants.js)
- Dark/light mode via Tailwind `darkMode: 'class'`
- Telemetry client (`src/lib/telemetry.js`) — batched events, sendBeacon, no-op in dev
- Budget feature: setup wizard, statement upload with client-side PDF parsing, transaction review with confidence scoring, YTD dashboard

### Backend (AWS)
- **Single Lambda** handles all 26+ API routes via path-based dispatch (`infra/lambda/api/index.mjs`)
- **DynamoDB single table** (`nwt`): PK=`USER#{userId}`, SK varies by entity type
- **API Gateway HTTP API** with Cognito JWT authorizer on all routes except `/api/telemetry`
- **SQS Queue** for async statement processing — Lambda reads from queue (batchSize: 1), DLQ with maxReceiveCount: 2
- **Anthropic API** (Claude Haiku 4.5) called from Lambda for statement parsing and category validation
- userId always extracted from JWT `sub` claim — never from client input
- No CloudFront, no S3 hosting bucket — frontend is on GitHub Pages

### Local Dev Server (`dev-server.js`)
- Mirrors the exact same API contract as the Lambda (same routes, same JSON shapes)
- In-memory storage with DynamoDB-like single-table structure
- Persists to `dev-data.json` on every write (survives restarts)
- Auth bypassed (always uses `dev-user-1`)
- Port 8246, Vite proxy forwards `/api/*` to it
- Zero dependencies (Node built-in modules only)

## DynamoDB Table Design

| PK | SK | Entity |
|---|---|---|
| `USER#{userId}` | `PROFILE` | User settings (baseCurrency, theme, exchangeRates, etc.) |
| `USER#{userId}` | `ITEM#{itemId}` | Asset or Liability |
| `USER#{userId}` | `CAT#{catId}` | Category |
| `USER#{userId}` | `SNAP#{YYYY-MM-01}` | Snapshot summary (totals, breakdown) |
| `USER#{userId}` | `SNAPDATA#{YYYY-MM-01}` | Snapshot item copies (loaded on demand) |
| `USER#{userId}` | `BACKUP#{timestamp}` | Import backup (TTL: 7-day auto-delete) |
| `USER#{userId}` | `BUDGETCFG` | Budget configuration (monthlyIncome, currency) |
| `USER#{userId}` | `BCAT#{catId}` | Budget category (name, color, icon, percentOfIncome) |
| `USER#{userId}` | `BMONTH#{YYYY-MM}` | Monthly budget summary (totals, category breakdown) |
| `USER#{userId}` | `BTX#{txId}` | Budget transaction (amount, description, category, date) |
| `USER#{userId}` | `BUDGETJOB#{jobId}` | Async statement processing job (status, result) |
| `USER#{userId}` | `BUDGETLEARN` | Per-user classification learning examples |

## API Routes

### Net Worth Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/state` | Yes | Load all user data (initial app load) |
| POST | `/api/items` | Yes | Add item |
| PUT | `/api/items/{id}` | Yes | Update item |
| DELETE | `/api/items/{id}` | Yes | Delete item |
| POST | `/api/items/batch` | Yes | Batch add items (CSV import) — body: `{ items: [...] }` |
| PUT | `/api/items/batch` | Yes | Batch update items (stock refresh) — body: `{ updates: [...] }` |
| POST | `/api/categories` | Yes | Add category |
| PUT | `/api/categories/{id}` | Yes | Update category |
| DELETE | `/api/categories/{id}` | Yes | Delete category + reassign items |
| POST | `/api/snapshots` | Yes | Take snapshot (server calculates) |
| GET | `/api/snapshots/{date}/items` | Yes | Load snapshot detail |
| DELETE | `/api/snapshots/{date}` | Yes | Delete snapshot |
| PUT | `/api/settings` | Yes | Update user preferences |
| POST | `/api/import` | Yes | Full JSON import (backup → delete → write) |
| GET | `/api/yahoo/{proxy+}` | Yes | Yahoo Finance proxy |
| POST | `/api/telemetry` | No | Telemetry events (logs to CloudWatch) |

### Budget Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/budget/state` | Yes | Load budget state (config, categories, months) |
| PUT | `/api/budget/config` | Yes | Update budget configuration (income, currency) |
| POST | `/api/budget/categories` | Yes | Create budget category |
| PUT | `/api/budget/categories/{id}` | Yes | Update budget category |
| DELETE | `/api/budget/categories/{id}` | Yes | Delete budget category (reassigns transactions) |
| POST | `/api/budget/submit-statement` | Yes | Submit statement for async AI processing (via SQS) |
| GET | `/api/budget/job-status` | Yes | Poll async processing job status |
| POST | `/api/budget/transactions/confirm` | Yes | Confirm transactions + compute month totals |
| GET | `/api/budget/months/{month}/transactions` | Yes | Load month's transactions |
| GET | `/api/budget/ytd-summary` | Yes | Year-to-date budget summary |
| DELETE | `/api/budget/months/{month}` | Yes | Delete month and its transactions |
| POST | `/api/budget/validate-categories` | Yes | AI validation of category names |
| POST | `/api/budget/parse-statement` | Yes | Legacy sync statement parsing (kept for dev server) |

## Monthly Budgeting Feature
- **Budget Setup Wizard**: 2-step flow — set monthly income, then customize budget categories (10 defaults seeded)
- **AI Statement Parsing**: Upload PDF/CSV/TXT bank statements; PDF text extracted client-side via pdfjs-dist, sent as text to Lambda
- **Async Processing**: Statements submitted via SQS to avoid API Gateway 29s timeout; frontend polls job status
- **Transaction Review**: AI-parsed transactions shown with confidence scores; user confirms/edits/removes before saving
- **Per-User Learning**: `BUDGETLEARN` entity stores confirmed description-to-category mappings, fed back into AI prompts
- **YTD Dashboard**: Actual vs expected spending comparison by category, monthly trend charts
- **Month Management**: View/delete individual months and their transactions

## Key Conventions
- All monetary values stored in original currency, converted at read time via `convertToBase()`
- IDs generated with `crypto.randomUUID()` (both client temp IDs and server permanent IDs)
- Snapshots split into summary (`SNAP#`) and detail (`SNAPDATA#`) to avoid DynamoDB 400KB limit
- Snapshot calculation happens server-side (uses stored exchange rates from PROFILE)
- Import uses backup-before-delete pattern for safety
- Category deletion reassigns orphaned items to a fallback default category
- Batch endpoints expect wrapped objects: `{ items: [...] }` or `{ updates: [...] }` — NOT raw arrays
- Validation allows `null` for optional stock fields (ticker, shares, pricePerShare)
- 15 default categories seeded on new user's first `GET /api/state`
- 10 default budget categories seeded on new user's first `GET /api/budget/state`
- Statement processing uses SQS with DLQ (maxReceiveCount: 2, 7-day DLQ retention)

## File Structure
```
src/
  lib/
    api.js              # Fetch wrapper with JWT auth token injection
    auth.js             # Cognito PKCE auth (login, logout, token refresh, dev bypass)
    telemetry.js        # Batched event tracking (sendBeacon)
    currency.js         # Exchange rate conversion + Frankfurter API fetch
    stocks.js           # Yahoo Finance stock search + price fetch
    constants.js        # Default categories, currencies, chart colors
    storage.js          # Legacy IDB adapter (no longer used by store)
  store/
    store.js            # Zustand store — async API-backed actions, optimistic updates
  contexts/
    AuthContext.jsx      # React auth context (user state, loading, login/logout)
  components/
    auth/
      LoginPage.jsx     # Google sign-in page
      ProtectedRoute.jsx # Route guard (redirect to /login if unauthenticated)
    layout/
      AppShell.jsx      # Main layout (sidebar + header + content + toast + loading states)
      Header.jsx        # Sticky header with title, theme toggle, user menu
      Sidebar.jsx       # Navigation sidebar with live net worth display
    dashboard/
      NetWorthCard.jsx, SummaryCards.jsx, AllocationChart.jsx, RecentActivity.jsx, NetWorthChart.jsx
    items/
      ItemList.jsx      # Item list with search/filter/sort + CRUD modals
      ItemForm.jsx      # Add/edit form with stock search + manual fund entry
    budget/             # 11 components: setup wizard, statement upload, transaction review,
                        # category management, month selector, YTD charts, summary cards
    ui/
      Button.jsx, Input.jsx, Select.jsx, Modal.jsx, EmptyState.jsx, ThemeToggle.jsx, Toast.jsx
  pages/
    DashboardPage.jsx, AssetsPage.jsx, LiabilitiesPage.jsx, HistoryPage.jsx, SettingsPage.jsx, BudgetPage.jsx
  hooks/
    useTheme.js         # Theme hook (system/light/dark)

infra/
  bin/infra.ts          # CDK app entry
  lib/nwt-stack.ts      # AWS stack (Cognito, API GW, Lambda, DynamoDB, SQS, monitoring)
  lambda/api/
    index.mjs           # Route dispatcher (also handles SQS events)
    package.json        # Lambda dependencies (@anthropic-ai/sdk)
    lib/auth.mjs        # Extract userId from JWT claims
    lib/db.mjs          # DynamoDB helpers (query, put, update, delete, batch)
    lib/validate.mjs    # Input validation (allows null for stock fields)
    lib/ai.mjs          # Anthropic API wrapper (parseStatementWithAI, validateCategoriesWithAI)
    routes/
      state.mjs         # GET /api/state (+ new user category seeding)
      items.mjs         # Item CRUD + batch operations
      categories.mjs    # Category CRUD with referential integrity
      snapshots.mjs     # Server-side snapshot calculation
      settings.mjs      # User preferences
      import.mjs        # JSON import with backup safety
      yahoo-proxy.mjs   # Yahoo Finance proxy
      telemetry.mjs     # Event ingestion to CloudWatch Logs
      budget.mjs        # All budget routes (config, categories, transactions, AI parsing, async jobs)

tests/
  helpers/
    test-utils.js       # Browser launch, IDB seed/clear, API mocking, assertions
    seed-data.js        # Pre-built state objects for seeding
  01-navigation.test.js through 15-multi-currency.test.js
  run-tests.js          # Test runner (starts Vite, runs all test files)

dev-server.js           # Local API server (port 8246, in-memory + dev-data.json)
.github/workflows/deploy.yml  # CI/CD pipeline
```

## Environment Variables

### Frontend (Vite)
- `VITE_API_URL` — API Gateway URL (empty in dev = Vite proxy)
- `VITE_COGNITO_DOMAIN` — Cognito Hosted UI URL (must include `https://` prefix)
- `VITE_COGNITO_CLIENT_ID` — Cognito app client ID
- `VITE_REDIRECT_URI` — OAuth callback URL

### Backend (Lambda)
- `TABLE_NAME` — DynamoDB table name (set by CDK)
- `ANTHROPIC_API_KEY` — Anthropic API key for AI features (set from SSM `/nwt/anthropic-api-key`)
- `PROCESSING_QUEUE_URL` — SQS queue URL for async statement processing (set by CDK)

## Known Issues / Tech Debt
- `src/lib/storage.js` (legacy IDB adapter) is no longer used by the store but still exists
- Puppeteer E2E tests were written against the old IDB-persisted store — they still pass but test against IDB seeding, not the API layer. Tests need migration to mock the API instead.
- The dev server seeds default categories only when zero CAT# entries exist. If a previous import wiped categories, they won't re-seed on restart (delete `dev-data.json` to reset).
- AWS account not verified for CloudFront or Bedrock (using GitHub Pages + Anthropic API direct instead)
- GitHub Pages caching can serve stale builds — use `?t=timestamp` query param or hard refresh after deploy

## Deployment

### Current Status: LIVE
- **Frontend**: https://tech4gt.github.io/net-worth-tracker/
- **Backend**: AWS (Lambda + API Gateway + DynamoDB + SQS + Cognito)
- **Users**: 3 active users
- **AWS Cost**: ~$0.03/month

### Deploy Backend
```bash
cd infra && npx cdk deploy --require-approval never
```

### Deploy Frontend
```bash
VITE_API_URL=https://ule94x7xbg.execute-api.us-east-1.amazonaws.com \
VITE_COGNITO_DOMAIN=https://nwt-auth-562537155893.auth.us-east-1.amazoncognito.com \
VITE_COGNITO_CLIENT_ID=6d69ej10tg5q8j2oi3fiags94s \
VITE_REDIRECT_URI=https://tech4gt.github.io/net-worth-tracker/ \
npm run build && npx gh-pages -d dist
```

### First-Time Setup
1. Configure AWS CLI (`aws configure`)
2. Create Google OAuth credentials in Google Cloud Console
3. Store in AWS SSM: `/nwt/google-client-id`, `/nwt/google-client-secret`, `/nwt/anthropic-api-key`
4. `cd infra && npx cdk bootstrap && npx cdk deploy`
5. Build and deploy frontend with prod env vars (see above)
