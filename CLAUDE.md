# Net Worth Tracker

## Project Overview
A personal net worth tracking web application with Google OAuth login and a serverless AWS backend. Users track assets, liabilities, stock portfolios, and net worth over time with monthly snapshots.

## Tech Stack
- **Frontend**: React 19 + Vite 6 + Tailwind CSS v4 + Zustand 5 + React Router 7 (HashRouter) + Recharts 2
- **Backend**: AWS Lambda (single function, Node 20, arm64) + API Gateway HTTP API + DynamoDB (single table)
- **Auth**: AWS Cognito with Google OAuth (PKCE auth code flow via Hosted UI)
- **Infra**: AWS CDK (TypeScript), CloudFront + S3 for static hosting
- **Testing**: Puppeteer E2E tests (82 tests across 15 files)
- **Local Dev**: Node.js dev server (`dev-server.js`, port 8246) with in-memory storage + disk persistence

## Commands
- `npm run dev` — Start Vite dev server (frontend only, needs API server separately)
- `npm run dev:api` — Start local API server on port 8246
- `npm run dev:full` — Start both API server and Vite together
- `npm run build` — Production build
- `npm run preview` — Preview production build
- `npm run test` — Run all 15 Puppeteer E2E test files (82 tests)
- `cd infra && npx cdk deploy` — Deploy AWS infrastructure
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

### Backend (AWS)
- **Single Lambda** handles all 16 API routes via path-based dispatch (`infra/lambda/api/index.mjs`)
- **DynamoDB single table** (`nwt`): PK=`USER#{userId}`, SK varies by entity type
- **API Gateway HTTP API** with Cognito JWT authorizer on all routes except `/api/telemetry`
- **CloudFront** in front of S3 (required for HTTPS — Google OAuth needs it)
- userId always extracted from JWT `sub` claim — never from client input

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

## API Routes

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
    ui/
      Button.jsx, Input.jsx, Select.jsx, Modal.jsx, EmptyState.jsx, ThemeToggle.jsx, Toast.jsx
  pages/
    DashboardPage.jsx, AssetsPage.jsx, LiabilitiesPage.jsx, HistoryPage.jsx, SettingsPage.jsx
  hooks/
    useTheme.js         # Theme hook (system/light/dark)

infra/
  bin/infra.ts          # CDK app entry
  lib/nwt-stack.ts      # Full AWS stack (S3, CloudFront, Cognito, API GW, Lambda, DynamoDB, monitoring)
  lambda/api/
    index.mjs           # Route dispatcher
    lib/auth.mjs        # Extract userId from JWT claims
    lib/db.mjs          # DynamoDB helpers (query, put, update, delete, batch)
    lib/validate.mjs    # Input validation (allows null for stock fields)
    routes/
      state.mjs         # GET /api/state (+ new user category seeding)
      items.mjs         # Item CRUD + batch operations
      categories.mjs    # Category CRUD with referential integrity
      snapshots.mjs     # Server-side snapshot calculation
      settings.mjs      # User preferences
      import.mjs        # JSON import with backup safety
      yahoo-proxy.mjs   # Yahoo Finance proxy
      telemetry.mjs     # Event ingestion to CloudWatch Logs

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
- `VITE_API_URL` — API Gateway URL (empty in dev = Vite proxy)
- `VITE_COGNITO_DOMAIN` — Cognito Hosted UI URL (empty = dev mode auth bypass)
- `VITE_COGNITO_CLIENT_ID` — Cognito app client ID
- `VITE_REDIRECT_URI` — OAuth callback URL

## Known Issues / Tech Debt
- `src/lib/storage.js` (legacy IDB adapter) is no longer used by the store but still exists
- Puppeteer E2E tests were written against the old IDB-persisted store — they still pass but test against IDB seeding, not the API layer. Tests need migration to mock the API instead.
- The dev server seeds default categories only when zero CAT# entries exist. If a previous import wiped categories, they won't re-seed on restart (delete `dev-data.json` to reset).

## Deployment Status
- **Local dev**: Fully working. `npm run dev:full` starts both servers.
- **AWS**: Infrastructure code is written (CDK stack) but NOT YET DEPLOYED. Requires:
  1. Fix AWS CLI (`brew install awscli` or `pip3 install awscli`)
  2. Configure AWS CLI (`aws configure`)
  3. Create Google OAuth credentials in Google Cloud Console
  4. Store in AWS SSM: `/nwt/google-client-id` and `/nwt/google-client-secret`
  5. `cd infra && npx cdk bootstrap && npx cdk deploy`
  6. Build with prod env vars and upload to S3
  See `infra/lib/nwt-stack.ts` for full stack definition.
