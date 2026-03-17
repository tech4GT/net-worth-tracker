# Net Worth Tracker

A personal net worth tracking app that runs entirely in the browser. All data is stored in localStorage — no server or account required.

## Building for offline use

Follow these steps to produce a self-contained bundle you can open directly by double-clicking `index.html`.

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer (includes `npm`)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Build the production bundle
npm run build
```

The output is written to the `dist/` folder. Open `dist/index.html` in any modern browser — no web server needed.

> **Note:** Live stock-price lookups (Yahoo Finance) require a running dev server and won't work when opening the file directly. Everything else — adding assets, liabilities, taking snapshots, viewing history — works fully offline.

## Development

```bash
npm run dev
```

Starts a local dev server at `http://localhost:5173` with hot reload. Use this if you want live price data or are actively modifying the source.
