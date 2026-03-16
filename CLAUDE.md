# Net Worth Tracker

## Project Overview
A personal net worth tracking web application. Runs locally as a webpage with localStorage for data persistence.

## Tech Stack
- React 19 + Vite 6
- Tailwind CSS v4 (via @tailwindcss/vite plugin)
- Zustand 5 (state management with persist middleware)
- React Router 7
- Recharts 2 (charts)

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run preview` — Preview production build

## Architecture
- Single Zustand store (`src/store/store.js`) with persist middleware → localStorage key `nwt-store`
- Pages in `src/pages/`, components grouped by feature in `src/components/`
- Shared UI primitives in `src/components/ui/`
- Business logic helpers in `src/lib/`
- Dark/light mode via Tailwind `darkMode: 'class'`

## Key Conventions
- All monetary values stored in original currency, converted at read time via `convertToBase()`
- IDs generated with `crypto.randomUUID()`
- Snapshots store full item copies (self-contained historical data)
- No backend — all data in localStorage
