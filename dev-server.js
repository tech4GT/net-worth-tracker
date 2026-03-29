/**
 * Net Worth Tracker — Local Development API Server
 *
 * A standalone Node.js HTTP server that mimics the AWS Lambda API using
 * in-memory storage backed by a JSON file on disk. Zero external dependencies.
 *
 * Usage:  node dev-server.js
 * Port:   8246 (matches the Vite proxy target in vite.config.js)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 8246;
const USER_ID = 'dev-user-1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'dev-data.json');

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';

const MAX_BATCH_SIZE = 100;
const MAX_ITEMS = 500;
const MAX_CATEGORIES = 100;
const MAX_SNAPSHOTS = 200;

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// ---------------------------------------------------------------------------
// ANSI color helpers (respects NO_COLOR / dumb terminal)
// ---------------------------------------------------------------------------

const supportsColor =
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb' &&
  (process.stdout.isTTY || false);

const c = {
  reset: supportsColor ? '\x1b[0m' : '',
  bold: supportsColor ? '\x1b[1m' : '',
  dim: supportsColor ? '\x1b[2m' : '',
  green: supportsColor ? '\x1b[32m' : '',
  yellow: supportsColor ? '\x1b[33m' : '',
  blue: supportsColor ? '\x1b[34m' : '',
  magenta: supportsColor ? '\x1b[35m' : '',
  cyan: supportsColor ? '\x1b[36m' : '',
  red: supportsColor ? '\x1b[31m' : '',
  gray: supportsColor ? '\x1b[90m' : '',
};

function methodColor(method) {
  switch (method) {
    case 'GET':    return c.green;
    case 'POST':   return c.blue;
    case 'PUT':    return c.yellow;
    case 'DELETE': return c.red;
    default:       return c.gray;
  }
}

function statusColor(code) {
  if (code < 300) return c.green;
  if (code < 400) return c.yellow;
  return c.red;
}

function logRequest(method, path, statusCode) {
  const mc = methodColor(method);
  const sc = statusColor(statusCode);
  const ts = new Date().toISOString().slice(11, 19);
  console.log(
    `${c.dim}${ts}${c.reset}  ${mc}${method.padEnd(7)}${c.reset} ${path}  ${sc}${statusCode}${c.reset}`
  );
}

// ---------------------------------------------------------------------------
// Default categories
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES = [
  { id: 'cat-cash', name: 'Cash & Checking', type: 'asset', icon: 'banknotes', color: '#22c55e', isDefault: true },
  { id: 'cat-savings', name: 'Savings', type: 'asset', icon: 'piggy-bank', color: '#10b981', isDefault: true },
  { id: 'cat-investments', name: 'Investments', type: 'asset', icon: 'chart', color: '#6366f1', isDefault: true },
  { id: 'cat-retirement', name: 'Retirement', type: 'asset', icon: 'shield', color: '#8b5cf6', isDefault: true },
  { id: 'cat-real-estate', name: 'Real Estate', type: 'asset', icon: 'home', color: '#f59e0b', isDefault: true },
  { id: 'cat-crypto', name: 'Crypto', type: 'asset', icon: 'bolt', color: '#f97316', isDefault: true },
  { id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true },
  { id: 'cat-vehicles', name: 'Vehicles', type: 'asset', icon: 'car', color: '#06b6d4', isDefault: true },
  { id: 'cat-other-assets', name: 'Other Assets', type: 'asset', icon: 'box', color: '#64748b', isDefault: true },
  { id: 'cat-credit-cards', name: 'Credit Cards', type: 'liability', icon: 'card', color: '#ef4444', isDefault: true },
  { id: 'cat-student-loans', name: 'Student Loans', type: 'liability', icon: 'academic', color: '#f87171', isDefault: true },
  { id: 'cat-mortgage', name: 'Mortgage', type: 'liability', icon: 'home', color: '#dc2626', isDefault: true },
  { id: 'cat-auto-loan', name: 'Auto Loan', type: 'liability', icon: 'car', color: '#fb923c', isDefault: true },
  { id: 'cat-personal-loan', name: 'Personal Loan', type: 'liability', icon: 'user', color: '#e11d48', isDefault: true },
  { id: 'cat-other-liabilities', name: 'Other Liabilities', type: 'liability', icon: 'box', color: '#9f1239', isDefault: true },
];

const DEFAULT_BUDGET_CATEGORIES = [
  { id: 'bcat-housing', name: 'Housing', color: '#6366f1', icon: 'home', percentOfIncome: 30, isDefault: true },
  { id: 'bcat-transportation', name: 'Transportation', color: '#f59e0b', icon: 'car', percentOfIncome: 10, isDefault: true },
  { id: 'bcat-food', name: 'Food & Dining', color: '#22c55e', icon: 'utensils', percentOfIncome: 15, isDefault: true },
  { id: 'bcat-utilities', name: 'Utilities', color: '#06b6d4', icon: 'bolt', percentOfIncome: 5, isDefault: true },
  { id: 'bcat-insurance', name: 'Insurance', color: '#8b5cf6', icon: 'shield', percentOfIncome: 5, isDefault: true },
  { id: 'bcat-healthcare', name: 'Healthcare', color: '#ec4899', icon: 'heart', percentOfIncome: 5, isDefault: true },
  { id: 'bcat-savings', name: 'Savings & Investing', color: '#10b981', icon: 'piggy-bank', percentOfIncome: 15, isDefault: true },
  { id: 'bcat-entertainment', name: 'Entertainment', color: '#f97316', icon: 'star', percentOfIncome: 5, isDefault: true },
  { id: 'bcat-personal', name: 'Personal', color: '#64748b', icon: 'user', percentOfIncome: 5, isDefault: true },
  { id: 'bcat-other', name: 'Other', color: '#9f1239', icon: 'box', percentOfIncome: 5, isDefault: true },
];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_BUDGET_CATEGORIES = 50;
const MAX_TRANSACTIONS = 500;

const DEFAULT_SETTINGS = {
  baseCurrency: 'USD',
  theme: 'system',
  exchangeRates: {},
  snapshotReminder: true,
  lastSnapshotDate: null,
  stocksLastRefreshed: null,
};

// ---------------------------------------------------------------------------
// In-memory store  (mimics DynamoDB single-table design)
// ---------------------------------------------------------------------------
//
// Structure:
//   store['USER#<userId>'] = {
//     'PROFILE':          { ...settings },
//     'CAT#<id>':         { ...category },
//     'ITEM#<id>':        { ...item },
//     'SNAP#<date>':      { ...snapshot summary },
//     'SNAPDATA#<date>':  { date, items: [...] },
//   }
// ---------------------------------------------------------------------------

let store = {};

function userPartition() {
  const pk = `USER#${USER_ID}`;
  if (!store[pk]) store[pk] = {};
  return store[pk];
}

// -- DB helper functions (mirror infra/lambda/api/lib/db.mjs) ---------------

function dbQueryUserData() {
  const partition = userPartition();
  return Object.entries(partition).map(([sk, data]) => ({
    PK: `USER#${USER_ID}`,
    SK: sk,
    ...data,
  }));
}

function dbGetItem(sk) {
  const partition = userPartition();
  const data = partition[sk];
  if (!data) return null;
  return { PK: `USER#${USER_ID}`, SK: sk, ...data };
}

function dbPutItem(sk, data) {
  const partition = userPartition();
  const now = new Date().toISOString();
  const item = {
    ...data,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
  // Strip PK/SK from data stored in partition value
  const { PK, SK, ...rest } = item;
  partition[sk] = rest;
  persistStore();
  return { PK: `USER#${USER_ID}`, SK: sk, ...rest };
}

function dbUpdateItem(sk, updates) {
  const partition = userPartition();
  const now = new Date().toISOString();
  const existing = partition[sk] || {};
  const { PK, SK, ...cleanUpdates } = updates;
  const merged = { ...existing, ...cleanUpdates, updatedAt: now };
  partition[sk] = merged;
  persistStore();
  return { PK: `USER#${USER_ID}`, SK: sk, ...merged };
}

function dbDeleteItem(sk) {
  const partition = userPartition();
  const data = partition[sk];
  if (!data) return null;
  const result = { PK: `USER#${USER_ID}`, SK: sk, ...data };
  delete partition[sk];
  persistStore();
  return result;
}

// ---------------------------------------------------------------------------
// Persistence — save/load store to dev-data.json
// ---------------------------------------------------------------------------

function persistStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error(`${c.red}Failed to persist store:${c.reset}`, err.message);
  }
}

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      store = JSON.parse(raw);
      console.log(`${c.cyan}Loaded data from ${DATA_FILE}${c.reset}`);
      return;
    }
  } catch (err) {
    console.error(`${c.yellow}Warning: could not load ${DATA_FILE}, starting fresh.${c.reset}`, err.message);
  }
  // Initialize fresh store with defaults
  store = {};
  seedDefaults();
}

function seedDefaults() {
  const partition = userPartition();

  // Seed profile/settings
  if (!partition['PROFILE']) {
    const now = new Date().toISOString();
    partition['PROFILE'] = { ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now };
  }

  // Seed default categories
  const hasCats = Object.keys(partition).some((sk) => sk.startsWith('CAT#'));
  if (!hasCats) {
    const now = new Date().toISOString();
    for (const cat of DEFAULT_CATEGORIES) {
      partition[`CAT#${cat.id}`] = { ...cat, createdAt: now, updatedAt: now };
    }
  }

  // Seed default budget categories
  const hasBudgetCats = Object.keys(partition).some((sk) => sk.startsWith('BCAT#'));
  if (!hasBudgetCats) {
    const now = new Date().toISOString();
    for (const bcat of DEFAULT_BUDGET_CATEGORIES) {
      partition[`BCAT#${bcat.id}`] = { ...bcat, createdAt: now, updatedAt: now };
    }
  }

  persistStore();
}

// ---------------------------------------------------------------------------
// Validation helpers (mirror infra/lambda/api/lib/validate.mjs)
// ---------------------------------------------------------------------------

function isString(v) { return typeof v === 'string'; }
function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isBoolean(v) { return typeof v === 'boolean'; }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function validateItem(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }
  const errors = [];
  if (!isString(body.name) || body.name.length < 1 || body.name.length > 200) {
    errors.push('name is required and must be a string between 1 and 200 characters');
  }
  if (body.type !== 'asset' && body.type !== 'liability') {
    errors.push("type is required and must be 'asset' or 'liability'");
  }
  if (!isString(body.categoryId) || body.categoryId.length === 0) {
    errors.push('categoryId is required and must be a non-empty string');
  }
  if (!isNumber(body.value) || body.value <= 0) {
    errors.push('value is required and must be a positive number');
  }
  if (!isString(body.currency) || body.currency.length < 2 || body.currency.length > 5) {
    errors.push('currency is required and must be a string between 2 and 5 characters');
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      errors.push('tags must be an array of strings');
    } else if (body.tags.length > 20) {
      errors.push('tags may contain at most 20 items');
    } else {
      for (const tag of body.tags) {
        if (!isString(tag) || tag.length > 50) {
          errors.push('each tag must be a string of at most 50 characters');
          break;
        }
      }
    }
  }
  if (body.notes !== undefined) {
    if (!isString(body.notes) || body.notes.length > 2000) {
      errors.push('notes must be a string of at most 2000 characters');
    }
  }
  if (body.isStock !== undefined && !isBoolean(body.isStock)) {
    errors.push('isStock must be a boolean');
  }
  if (body.ticker !== undefined && body.ticker !== null) {
    if (!isString(body.ticker) || body.ticker.length > 20) {
      errors.push('ticker must be a string of at most 20 characters');
    }
  }
  if (body.shares !== undefined && body.shares !== null) {
    if (!isNumber(body.shares) || body.shares <= 0) {
      errors.push('shares must be a positive number');
    }
  }
  if (body.pricePerShare !== undefined && body.pricePerShare !== null) {
    if (!isNumber(body.pricePerShare) || body.pricePerShare < 0) {
      errors.push('pricePerShare must be a non-negative number');
    }
  }
  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }
  const data = { name: body.name, type: body.type, categoryId: body.categoryId, value: body.value, currency: body.currency };
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.isStock !== undefined) data.isStock = body.isStock;
  if (body.ticker !== undefined) data.ticker = body.ticker;
  if (body.shares !== undefined) data.shares = body.shares;
  if (body.pricePerShare !== undefined) data.pricePerShare = body.pricePerShare;
  return { valid: true, data };
}

function validateCategory(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }
  const errors = [];
  if (!isString(body.name) || body.name.length < 1 || body.name.length > 100) {
    errors.push('name is required and must be a string between 1 and 100 characters');
  }
  if (body.type !== 'asset' && body.type !== 'liability' && body.type !== 'both') {
    errors.push("type is required and must be 'asset', 'liability', or 'both'");
  }
  if (body.icon !== undefined) {
    if (!isString(body.icon) || body.icon.length > 50) {
      errors.push('icon must be a string of at most 50 characters');
    }
  }
  if (body.color !== undefined) {
    if (!isString(body.color) || !HEX_COLOR_RE.test(body.color)) {
      errors.push('color must be a valid hex color (e.g. #ff0000)');
    }
  }
  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }
  const data = { name: body.name, type: body.type };
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.color !== undefined) data.color = body.color;
  return { valid: true, data };
}

function validateSettings(body) {
  if (!isObject(body)) {
    return { valid: false, error: 'Request body must be a JSON object' };
  }
  const errors = [];
  if (body.baseCurrency !== undefined) {
    if (!isString(body.baseCurrency) || body.baseCurrency.length < 2 || body.baseCurrency.length > 5) {
      errors.push('baseCurrency must be a string between 2 and 5 characters');
    }
  }
  if (body.theme !== undefined) {
    if (body.theme !== 'system' && body.theme !== 'light' && body.theme !== 'dark') {
      errors.push("theme must be 'system', 'light', or 'dark'");
    }
  }
  if (body.snapshotReminder !== undefined) {
    if (!isBoolean(body.snapshotReminder)) {
      errors.push('snapshotReminder must be a boolean');
    }
  }
  if (body.exchangeRates !== undefined) {
    if (!isObject(body.exchangeRates)) {
      errors.push('exchangeRates must be an object');
    } else {
      for (const [key, val] of Object.entries(body.exchangeRates)) {
        if (!isString(key)) { errors.push('exchangeRates keys must be strings'); break; }
        if (!isNumber(val) || val <= 0) { errors.push(`exchangeRates["${key}"] must be a positive number`); break; }
      }
    }
  }
  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }
  const data = {};
  if (body.baseCurrency !== undefined) data.baseCurrency = body.baseCurrency;
  if (body.theme !== undefined) data.theme = body.theme;
  if (body.snapshotReminder !== undefined) data.snapshotReminder = body.snapshotReminder;
  if (body.exchangeRates !== undefined) data.exchangeRates = body.exchangeRates;
  return { valid: true, data };
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function convertToBase(value, fromCurrency, baseCurrency, exchangeRates) {
  if (fromCurrency === baseCurrency) return value;
  const rate = exchangeRates[fromCurrency];
  if (!rate || rate <= 0) return 0;
  return value / rate;
}

function snapshotTimestamp() {
  return new Date().toISOString();
}

function monthPrefix(isoTimestamp) {
  return isoTimestamp.slice(0, 7); // "YYYY-MM"
}

function dbQueryByPrefix(skPrefix) {
  const partition = userPartition();
  return Object.entries(partition)
    .filter(([sk]) => sk.startsWith(skPrefix))
    .map(([sk, data]) => ({ PK: `USER#${USER_ID}`, SK: sk, ...data }));
}

// ---------------------------------------------------------------------------
// Helper to strip DynamoDB PK/SK from responses
// ---------------------------------------------------------------------------

function stripKeys(record) {
  if (!record) return record;
  const { PK, SK, ...rest } = record;
  return rest;
}

function idFromSK(sk) {
  const idx = sk.indexOf('#');
  return idx !== -1 ? sk.slice(idx + 1) : sk;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function parseUrl(reqUrl) {
  // e.g. "/api/items/abc-123?foo=bar"
  const qIdx = reqUrl.indexOf('?');
  const pathname = qIdx !== -1 ? reqUrl.slice(0, qIdx) : reqUrl;
  const queryString = qIdx !== -1 ? reqUrl.slice(qIdx + 1) : '';
  return { pathname, queryString };
}

function parseQueryString(qs) {
  if (!qs) return {};
  const params = {};
  for (const pair of qs.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      params[decodeURIComponent(pair)] = '';
    } else {
      params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
    }
  }
  return params;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function parseJsonBody(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(json);
}

function sendRaw(res, statusCode, headers, body) {
  const mergedHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers,
  };
  res.writeHead(statusCode, mergedHeaders);
  res.end(body);
}

function extractIdFromPath(pathname) {
  const segments = pathname.split('/');
  return segments[segments.length - 1];
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// GET /api/state
function handleGetState() {
  const allRecords = dbQueryUserData();

  const items = [];
  const categories = [];
  const snapshots = [];
  let settings = null;

  for (const record of allRecords) {
    const sk = record.SK;
    // Skip budget entities — they are served via /api/budget/* routes
    if (sk === 'BUDGETCFG' || sk.startsWith('BCAT#') || sk.startsWith('BMONTH#') || sk.startsWith('BTX#')) {
      continue;
    }
    if (sk.startsWith('ITEM#')) {
      const cleaned = stripKeys(record);
      cleaned.id = idFromSK(sk);
      items.push(cleaned);
    } else if (sk.startsWith('CAT#')) {
      const cleaned = stripKeys(record);
      cleaned.id = idFromSK(sk);
      categories.push(cleaned);
    } else if (sk.startsWith('SNAP#') && !sk.startsWith('SNAPDATA#')) {
      const cleaned = stripKeys(record);
      cleaned.date = idFromSK(sk);
      snapshots.push(cleaned);
    } else if (sk === 'PROFILE') {
      settings = stripKeys(record);
    }
  }

  if (!settings) {
    settings = { ...DEFAULT_SETTINGS };
  }

  // Seed default categories for new users
  if (categories.length === 0) {
    const now = new Date().toISOString();
    for (const cat of DEFAULT_CATEGORIES) {
      dbPutItem(`CAT#${cat.id}`, { ...cat, createdAt: now, updatedAt: now });
      categories.push({ ...cat, createdAt: now, updatedAt: now });
    }
  }

  return { status: 200, body: { items, categories, snapshots, settings } };
}

// POST /api/items
function handleCreateItem(body) {
  if (!body) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  const validation = validateItem(body);
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } };
  }
  const id = crypto.randomUUID();
  const saved = dbPutItem(`ITEM#${id}`, { ...validation.data, id });
  const item = stripKeys(saved);
  return { status: 201, body: item };
}

// PUT /api/items/:id
function handleUpdateItem(pathname, body) {
  const id = extractIdFromPath(pathname);
  const sk = `ITEM#${id}`;
  const existing = dbGetItem(sk);
  if (!existing) {
    return { status: 404, body: { error: 'Item not found' } };
  }
  if (!body) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  const merged = {
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    categoryId: body.categoryId ?? existing.categoryId,
    value: body.value ?? existing.value,
    currency: body.currency ?? existing.currency,
  };
  const optionalFields = ['tags', 'notes', 'isStock', 'ticker', 'shares', 'pricePerShare'];
  for (const field of optionalFields) {
    if (body[field] !== undefined) {
      merged[field] = body[field];
    } else if (existing[field] !== undefined) {
      merged[field] = existing[field];
    }
  }
  const validation = validateItem(merged);
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } };
  }
  const updated = dbUpdateItem(sk, validation.data);
  const item = stripKeys(updated);
  item.id = id;
  return { status: 200, body: item };
}

// DELETE /api/items/:id
function handleDeleteItem(pathname) {
  const id = extractIdFromPath(pathname);
  const sk = `ITEM#${id}`;
  const deleted = dbDeleteItem(sk);
  if (!deleted) {
    return { status: 404, body: { error: 'Item not found' } };
  }
  const item = stripKeys(deleted);
  item.id = id;
  return { status: 200, body: item };
}

// POST /api/items/batch
function handleBatchCreateItems(body) {
  if (!body || !Array.isArray(body.items)) {
    return { status: 400, body: { error: 'Request body must contain an "items" array' } };
  }
  if (body.items.length > MAX_BATCH_SIZE) {
    return { status: 400, body: { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items` } };
  }
  if (body.items.length === 0) {
    return { status: 400, body: { error: 'Items array must not be empty' } };
  }
  const validatedItems = [];
  const errors = [];
  for (let i = 0; i < body.items.length; i++) {
    const validation = validateItem(body.items[i]);
    if (!validation.valid) {
      errors.push(`items[${i}]: ${validation.error}`);
    } else {
      validatedItems.push(validation.data);
    }
  }
  if (errors.length > 0) {
    return { status: 400, body: { error: errors.join('; ') } };
  }
  const now = new Date().toISOString();
  const createdItems = [];
  for (const data of validatedItems) {
    const id = crypto.randomUUID();
    dbPutItem(`ITEM#${id}`, { ...data, id, createdAt: now, updatedAt: now });
    createdItems.push({ ...data, id, createdAt: now, updatedAt: now });
  }
  return { status: 201, body: createdItems };
}

// PUT /api/items/batch
function handleBatchUpdateItems(body) {
  if (!body || !Array.isArray(body.updates)) {
    return { status: 400, body: { error: 'Request body must contain an "updates" array' } };
  }
  if (body.updates.length > MAX_BATCH_SIZE) {
    return { status: 400, body: { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} updates` } };
  }
  if (body.updates.length === 0) {
    return { status: 400, body: { error: 'Updates array must not be empty' } };
  }
  for (let i = 0; i < body.updates.length; i++) {
    if (!body.updates[i].id || typeof body.updates[i].id !== 'string') {
      return { status: 400, body: { error: `updates[${i}]: id is required and must be a string` } };
    }
  }
  const updatedItems = [];
  for (const entry of body.updates) {
    const { id, ...fields } = entry;
    const sk = `ITEM#${id}`;
    const existing = dbGetItem(sk);
    if (!existing) {
      return { status: 404, body: { error: `Item not found: ${id}` } };
    }
    const merged = {
      name: fields.name ?? existing.name,
      type: fields.type ?? existing.type,
      categoryId: fields.categoryId ?? existing.categoryId,
      value: fields.value ?? existing.value,
      currency: fields.currency ?? existing.currency,
    };
    const optionalFields = ['tags', 'notes', 'isStock', 'ticker', 'shares', 'pricePerShare'];
    for (const field of optionalFields) {
      if (fields[field] !== undefined) {
        merged[field] = fields[field];
      } else if (existing[field] !== undefined) {
        merged[field] = existing[field];
      }
    }
    const validation = validateItem(merged);
    if (!validation.valid) {
      return { status: 400, body: { error: `Item ${id}: ${validation.error}` } };
    }
    const updated = dbUpdateItem(sk, validation.data);
    const item = stripKeys(updated);
    item.id = id;
    updatedItems.push(item);
  }
  return { status: 200, body: updatedItems };
}

// POST /api/categories
function handleCreateCategory(body) {
  if (!body) {
    return { status: 400, body: { error: 'Invalid or missing JSON body' } };
  }
  const validation = validateCategory(body);
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } };
  }
  const id = crypto.randomUUID();
  const data = { ...validation.data, id, isDefault: false };
  const item = dbPutItem(`CAT#${id}`, data);
  return { status: 201, body: stripKeys(item) };
}

// PUT /api/categories/:id
function handleUpdateCategory(pathname, body) {
  const id = extractIdFromPath(pathname);
  if (!id) {
    return { status: 400, body: { error: 'Missing category id in path' } };
  }
  if (!body) {
    return { status: 400, body: { error: 'Invalid or missing JSON body' } };
  }
  const validation = validateCategory(body);
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } };
  }
  const existing = dbGetItem(`CAT#${id}`);
  if (!existing) {
    return { status: 404, body: { error: 'Category not found' } };
  }
  const updated = dbUpdateItem(`CAT#${id}`, validation.data);
  return { status: 200, body: stripKeys(updated) };
}

// DELETE /api/categories/:id
function handleDeleteCategory(pathname) {
  const id = extractIdFromPath(pathname);
  if (!id) {
    return { status: 400, body: { error: 'Missing category id in path' } };
  }
  const category = dbGetItem(`CAT#${id}`);
  if (!category) {
    return { status: 404, body: { error: 'Category not found' } };
  }
  if (category.isDefault === true) {
    return { status: 400, body: { error: 'Cannot delete a default category' } };
  }
  const allRecords = dbQueryUserData();
  // Find fallback: same type, isDefault: true
  const fallback = allRecords.find((r) => {
    if (!r.SK.startsWith('CAT#')) return false;
    if (r.SK === `CAT#${id}`) return false;
    if (r.isDefault !== true) return false;
    return r.type === category.type || r.type === 'both';
  });
  if (!fallback) {
    return { status: 400, body: { error: 'No fallback default category found for this type' } };
  }
  const fallbackId = fallback.SK.slice(4);
  // Find all items belonging to the deleted category
  const affectedItems = allRecords.filter(
    (r) => r.SK.startsWith('ITEM#') && r.categoryId === id
  );
  let reassignedCount = 0;
  for (const item of affectedItems) {
    if (item.categoryId === id) {
      dbUpdateItem(item.SK, { categoryId: fallbackId });
      reassignedCount++;
    }
  }
  dbDeleteItem(`CAT#${id}`);
  return { status: 200, body: { deleted: id, reassigned: reassignedCount } };
}

// POST /api/snapshots
function handleCreateSnapshot() {
  const allRecords = dbQueryUserData();

  const items = [];
  const categoriesById = {};
  let profile = null;

  for (const record of allRecords) {
    const sk = record.SK;
    if (sk.startsWith('ITEM#')) {
      items.push(record);
    } else if (sk.startsWith('CAT#')) {
      const catId = sk.slice(4);
      categoriesById[catId] = record;
    } else if (sk === 'PROFILE') {
      profile = record;
    }
  }

  const baseCurrency = profile?.baseCurrency || 'USD';
  const exchangeRates = profile?.exchangeRates || {};

  const breakdownMap = {};
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const item of items) {
    const convertedValue = convertToBase(
      item.value,
      item.currency,
      baseCurrency,
      exchangeRates
    );
    if (item.type === 'asset') {
      totalAssets += convertedValue;
    } else if (item.type === 'liability') {
      totalLiabilities += convertedValue;
    }
    if (!breakdownMap[item.categoryId]) {
      const cat = categoriesById[item.categoryId];
      breakdownMap[item.categoryId] = {
        categoryId: item.categoryId,
        name: cat?.name || 'Unknown',
        total: 0,
        type: item.type,
      };
    }
    breakdownMap[item.categoryId].total += convertedValue;
  }

  const netWorth = totalAssets - totalLiabilities;
  const breakdown = Object.values(breakdownMap);
  const date = snapshotTimestamp();

  // Enforce 10-per-month limit
  const prefix = monthPrefix(date);
  const existingSnaps = dbQueryByPrefix(`SNAP#${prefix}`);
  const snapCount = existingSnaps.filter((r) => !r.SK.startsWith('SNAPDATA#')).length;
  if (snapCount >= 10) {
    return { status: 429, body: { error: 'Monthly snapshot limit reached (10 per month)' } };
  }

  const summary = {
    date,
    totalAssets,
    totalLiabilities,
    netWorth,
    breakdown,
    itemCount: items.length,
    baseCurrency,
  };

  dbPutItem(`SNAP#${date}`, summary);

  // Write SNAPDATA with full item copies
  const itemCopies = items.map((item) => {
    const { PK, SK, ...rest } = item;
    return { ...rest, id: SK.slice(5) };
  });
  dbPutItem(`SNAPDATA#${date}`, { date, items: itemCopies });

  // Update PROFILE: set lastSnapshotDate
  dbUpdateItem('PROFILE', { lastSnapshotDate: date });

  return { status: 201, body: summary };
}

// GET /api/snapshots/:date/items
function handleGetSnapshotItems(pathname) {
  // /api/snapshots/{date}/items
  const segments = pathname.split('/');
  const date = segments[3] ? decodeURIComponent(segments[3]) : null;
  if (!date) {
    return { status: 400, body: { error: 'Missing date in path' } };
  }
  const record = dbGetItem(`SNAPDATA#${date}`);
  if (!record) {
    return { status: 404, body: { error: 'Snapshot data not found' } };
  }
  return { status: 200, body: { items: record.items || [] } };
}

// DELETE /api/snapshots/:date
function handleDeleteSnapshot(pathname) {
  const segments = pathname.split('/');
  const date = segments[3] ? decodeURIComponent(segments[3]) : null;
  if (!date) {
    return { status: 400, body: { error: 'Missing date in path' } };
  }
  dbDeleteItem(`SNAP#${date}`);
  dbDeleteItem(`SNAPDATA#${date}`);
  return { status: 200, body: { deleted: date } };
}

// PUT /api/settings
function handleUpdateSettings(body) {
  if (!body) {
    return { status: 400, body: { error: 'Invalid or missing JSON body' } };
  }
  const validation = validateSettings(body);
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } };
  }
  const existing = dbGetItem('PROFILE');
  let result;
  if (existing) {
    result = dbUpdateItem('PROFILE', validation.data);
  } else {
    const merged = { ...DEFAULT_SETTINGS, ...validation.data };
    result = dbPutItem('PROFILE', merged);
  }
  return { status: 200, body: stripKeys(result) };
}

// POST /api/import
function handleImport(body) {
  if (!body) {
    return { status: 400, body: { error: 'Invalid or missing JSON body' } };
  }
  const { items = [], categories = [], snapshots = [], settings = null } = body;

  if (!Array.isArray(items) || items.length > MAX_ITEMS) {
    return { status: 400, body: { error: `items must be an array with at most ${MAX_ITEMS} entries` } };
  }
  if (!Array.isArray(categories) || categories.length > MAX_CATEGORIES) {
    return { status: 400, body: { error: `categories must be an array with at most ${MAX_CATEGORIES} entries` } };
  }
  if (!Array.isArray(snapshots) || snapshots.length > MAX_SNAPSHOTS) {
    return { status: 400, body: { error: `snapshots must be an array with at most ${MAX_SNAPSHOTS} entries` } };
  }

  // Delete all existing ITEM#, CAT#, SNAP#, SNAPDATA# entities
  const partition = userPartition();
  for (const sk of Object.keys(partition)) {
    if (sk.startsWith('ITEM#') || sk.startsWith('CAT#') || sk.startsWith('SNAP#') || sk.startsWith('SNAPDATA#')) {
      delete partition[sk];
    }
  }

  const now = new Date().toISOString();
  let importedItems = 0;
  let importedCategories = 0;
  let importedSnapshots = 0;

  // Default categories indexed by id for merging
  const defaultCatMap = Object.fromEntries(DEFAULT_CATEGORIES.map((cc) => [cc.id, cc]));

  // Categories
  for (const cat of categories) {
    const id = cat.id || crypto.randomUUID();
    const defaultCat = defaultCatMap[id];
    const merged = defaultCat
      ? { ...defaultCat, ...cat, id }
      : { ...cat, id, isDefault: cat.isDefault || false };
    partition[`CAT#${id}`] = { ...merged, createdAt: cat.createdAt || now, updatedAt: now };
  }
  importedCategories = categories.length;

  // Items
  for (const item of items) {
    const id = item.id || crypto.randomUUID();
    const { id: _stripId, ...itemData } = item;
    partition[`ITEM#${id}`] = { ...itemData, id, createdAt: item.createdAt || now, updatedAt: now };
  }
  importedItems = items.length;

  // Snapshots
  for (const snap of snapshots) {
    const date = snap.date;
    if (!date) continue;
    const { items: snapItems, ...summaryData } = snap;
    partition[`SNAP#${date}`] = { ...summaryData, date, createdAt: snap.createdAt || now, updatedAt: now };
    if (Array.isArray(snapItems)) {
      partition[`SNAPDATA#${date}`] = { date, items: snapItems, createdAt: now, updatedAt: now };
    }
    importedSnapshots++;
  }

  // Settings
  if (settings && typeof settings === 'object') {
    const existingProfile = partition['PROFILE'];
    if (existingProfile) {
      partition['PROFILE'] = { ...existingProfile, ...settings, updatedAt: now };
    } else {
      partition['PROFILE'] = {
        baseCurrency: 'USD', theme: 'system', exchangeRates: {},
        snapshotReminder: true, lastSnapshotDate: null, stocksLastRefreshed: null,
        ...settings, createdAt: now, updatedAt: now,
      };
    }
  }

  persistStore();

  return {
    status: 200,
    body: { imported: { items: importedItems, categories: importedCategories, snapshots: importedSnapshots } },
  };
}

// GET /api/yahoo/* — proxy to Yahoo Finance
async function handleYahooProxy(pathname, queryString) {
  const proxyPrefix = '/api/yahoo/';
  const prefixIndex = pathname.indexOf(proxyPrefix);
  if (prefixIndex === -1) {
    return { status: 400, body: { error: 'Invalid proxy path' } };
  }
  const yahooPath = pathname.slice(prefixIndex + proxyPrefix.length);
  if (!yahooPath) {
    return { status: 400, body: { error: 'Missing Yahoo Finance path' } };
  }
  const targetUrl = queryString
    ? `${YAHOO_BASE}/${yahooPath}?${queryString}`
    : `${YAHOO_BASE}/${yahooPath}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'User-Agent': YAHOO_USER_AGENT },
    });
    const body = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json';
    return {
      status: response.status,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=60' },
      rawBody: body,
    };
  } catch (err) {
    return {
      status: 502,
      body: { error: 'Failed to fetch from Yahoo Finance', message: err?.message || 'Unknown error' },
    };
  }
}

// POST /api/telemetry
function handleTelemetry(body) {
  if (body && Array.isArray(body.events)) {
    console.log(
      `${c.magenta}[telemetry]${c.reset} Received ${body.events.length} event(s):`,
      body.events.map((e) => e.event || '(unnamed)').join(', ')
    );
  }
  return { status: 204, body: null };
}

// ---------------------------------------------------------------------------
// Budget route handlers
// ---------------------------------------------------------------------------

// GET /api/budget/state
function handleGetBudgetState() {
  const partition = userPartition();

  let config = null;
  const categories = [];
  const months = [];

  for (const [sk, data] of Object.entries(partition)) {
    if (sk === 'BUDGETCFG') {
      config = { ...data };
    } else if (sk.startsWith('BCAT#')) {
      const cleaned = { ...data };
      cleaned.id = sk.slice(5);
      categories.push(cleaned);
    } else if (sk.startsWith('BMONTH#')) {
      const cleaned = { ...data };
      cleaned.month = sk.slice(7);
      months.push(cleaned);
    }
  }

  // Seed default budget categories if none exist
  if (categories.length === 0) {
    const now = new Date().toISOString();
    for (const bcat of DEFAULT_BUDGET_CATEGORIES) {
      dbPutItem(`BCAT#${bcat.id}`, { ...bcat, createdAt: now, updatedAt: now });
      categories.push({ ...bcat, createdAt: now, updatedAt: now });
    }
  }

  return { status: 200, body: { config, categories, months } };
}

// PUT /api/budget/config
function handleUpdateBudgetConfig(body) {
  if (!body || !isObject(body)) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  const errors = [];
  if (body.monthlyIncome !== undefined && (!isNumber(body.monthlyIncome) || body.monthlyIncome < 0)) {
    errors.push('monthlyIncome must be a non-negative number');
  }
  if (body.currency !== undefined) {
    if (!isString(body.currency) || body.currency.length < 2 || body.currency.length > 5) {
      errors.push('currency must be a string between 2 and 5 characters');
    }
  }
  if (errors.length > 0) {
    return { status: 400, body: { error: errors.join('; ') } };
  }
  const existing = dbGetItem('BUDGETCFG');
  let result;
  if (existing) {
    result = dbUpdateItem('BUDGETCFG', body);
  } else {
    result = dbPutItem('BUDGETCFG', body);
  }
  return { status: 200, body: stripKeys(result) };
}

// POST /api/budget/categories
function handleCreateBudgetCategory(body) {
  if (!body || !isObject(body)) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  const errors = [];
  if (!isString(body.name) || body.name.length < 1 || body.name.length > 100) {
    errors.push('name is required and must be a string between 1 and 100 characters');
  }
  if (body.color !== undefined && (!isString(body.color) || !HEX_COLOR_RE.test(body.color))) {
    errors.push('color must be a valid hex color');
  }
  if (body.icon !== undefined && (!isString(body.icon) || body.icon.length > 50)) {
    errors.push('icon must be a string of at most 50 characters');
  }
  if (body.percentOfIncome !== undefined && (!isNumber(body.percentOfIncome) || body.percentOfIncome < 0 || body.percentOfIncome > 100)) {
    errors.push('percentOfIncome must be a number between 0 and 100');
  }
  if (errors.length > 0) {
    return { status: 400, body: { error: errors.join('; ') } };
  }

  // Check limit
  const existingCats = dbQueryByPrefix('BCAT#');
  if (existingCats.length >= MAX_BUDGET_CATEGORIES) {
    return { status: 400, body: { error: `Maximum of ${MAX_BUDGET_CATEGORIES} budget categories reached` } };
  }

  const id = crypto.randomUUID();
  const data = {
    id,
    name: body.name,
    color: body.color || '#64748b',
    icon: body.icon || 'box',
    percentOfIncome: body.percentOfIncome ?? 0,
    isDefault: false,
  };
  const saved = dbPutItem(`BCAT#${id}`, data);
  return { status: 201, body: stripKeys(saved) };
}

// PUT /api/budget/categories/:id
function handleUpdateBudgetCategory(pathname, body) {
  const id = extractIdFromPath(pathname);
  if (!id) {
    return { status: 400, body: { error: 'Missing category id in path' } };
  }
  if (!body || !isObject(body)) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  const existing = dbGetItem(`BCAT#${id}`);
  if (!existing) {
    return { status: 404, body: { error: 'Budget category not found' } };
  }
  const errors = [];
  if (body.name !== undefined && (!isString(body.name) || body.name.length < 1 || body.name.length > 100)) {
    errors.push('name must be a string between 1 and 100 characters');
  }
  if (body.color !== undefined && (!isString(body.color) || !HEX_COLOR_RE.test(body.color))) {
    errors.push('color must be a valid hex color');
  }
  if (body.icon !== undefined && (!isString(body.icon) || body.icon.length > 50)) {
    errors.push('icon must be a string of at most 50 characters');
  }
  if (body.percentOfIncome !== undefined && (!isNumber(body.percentOfIncome) || body.percentOfIncome < 0 || body.percentOfIncome > 100)) {
    errors.push('percentOfIncome must be a number between 0 and 100');
  }
  if (errors.length > 0) {
    return { status: 400, body: { error: errors.join('; ') } };
  }
  const updates = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.percentOfIncome !== undefined) updates.percentOfIncome = body.percentOfIncome;
  const updated = dbUpdateItem(`BCAT#${id}`, updates);
  return { status: 200, body: stripKeys(updated) };
}

// DELETE /api/budget/categories/:id
function handleDeleteBudgetCategory(pathname) {
  const id = extractIdFromPath(pathname);
  if (!id) {
    return { status: 400, body: { error: 'Missing category id in path' } };
  }
  const category = dbGetItem(`BCAT#${id}`);
  if (!category) {
    return { status: 404, body: { error: 'Budget category not found' } };
  }
  if (category.isDefault === true) {
    return { status: 400, body: { error: 'Cannot delete a default budget category' } };
  }

  // Reassign BTX# entries from this category to bcat-other
  const partition = userPartition();
  let reassignedCount = 0;
  for (const [sk, data] of Object.entries(partition)) {
    if (sk.startsWith('BTX#') && data.categoryId === id) {
      dbUpdateItem(sk, { categoryId: 'bcat-other' });
      reassignedCount++;
    }
  }

  dbDeleteItem(`BCAT#${id}`);
  return { status: 200, body: { deleted: id, reassigned: reassignedCount } };
}

// POST /api/budget/parse-statement — MOCK AI parsing for dev
function handleParseStatement(body) {
  if (!body || !isObject(body)) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  if (!body.month || !isString(body.month) || !MONTH_RE.test(body.month)) {
    return { status: 400, body: { error: 'month is required and must be in YYYY-MM format' } };
  }
  if (!body.statementText || !isString(body.statementText)) {
    return { status: 400, body: { error: 'statementText is required and must be a non-empty string' } };
  }

  const lines = body.statementText.split('\n').filter((l) => l.trim().length > 0);

  // Keyword-to-category mapping
  const keywordMap = [
    { keywords: ['rent', 'mortgage'], categoryId: 'bcat-housing' },
    { keywords: ['grocery', 'food', 'restaurant', 'dining', 'cafe', 'coffee'], categoryId: 'bcat-food' },
    { keywords: ['gas', 'uber', 'lyft', 'transit', 'parking', 'fuel'], categoryId: 'bcat-transportation' },
    { keywords: ['netflix', 'spotify', 'hulu', 'disney', 'movie', 'concert', 'game'], categoryId: 'bcat-entertainment' },
    { keywords: ['doctor', 'pharmacy', 'medical', 'hospital', 'dental', 'health'], categoryId: 'bcat-healthcare' },
    { keywords: ['electric', 'water', 'internet', 'phone', 'utility', 'cable'], categoryId: 'bcat-utilities' },
    { keywords: ['insurance', 'premium', 'policy'], categoryId: 'bcat-insurance' },
    { keywords: ['savings', 'invest', '401k', 'ira', 'deposit'], categoryId: 'bcat-savings' },
    { keywords: ['clothing', 'haircut', 'gym', 'personal'], categoryId: 'bcat-personal' },
  ];

  // Regex patterns for extracting transaction data from a line
  // Tries: "DATE  DESCRIPTION  AMOUNT" or "DESCRIPTION  AMOUNT" patterns
  const dateAmountRe = /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+\$?([\d,]+\.?\d*)\s*$/;
  const amountOnlyRe = /^(.+?)\s+\$?([\d,]+\.?\d*)\s*$/;

  const transactions = [];
  let detectedIncome = null;

  for (const line of lines) {
    const trimmed = line.trim();
    let date = null;
    let description = '';
    let amount = 0;

    // Try date+description+amount
    const m1 = dateAmountRe.exec(trimmed);
    if (m1) {
      date = m1[1];
      description = m1[2].trim();
      amount = parseFloat(m1[3].replace(/,/g, ''));
    } else {
      // Try description+amount
      const m2 = amountOnlyRe.exec(trimmed);
      if (m2) {
        description = m2[1].trim();
        amount = parseFloat(m2[2].replace(/,/g, ''));
      } else {
        // Unparseable line — skip
        continue;
      }
    }

    if (isNaN(amount) || amount <= 0) continue;

    // Detect income lines
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('salary') || lowerDesc.includes('paycheck') || lowerDesc.includes('income') || lowerDesc.includes('payroll')) {
      if (detectedIncome === null) detectedIncome = 0;
      detectedIncome += amount;
      continue; // Don't add income as an expense transaction
    }

    // Categorize by keyword matching
    let categoryId = 'bcat-other';
    let confidence = 0.5;
    for (const mapping of keywordMap) {
      if (mapping.keywords.some((kw) => lowerDesc.includes(kw))) {
        categoryId = mapping.categoryId;
        confidence = 0.95;
        break;
      }
    }

    transactions.push({
      tempId: crypto.randomUUID(),
      date: date || `${body.month}-01`,
      description,
      amount,
      categoryId,
      confidence,
    });
  }

  // --- Apply learning context to improve categorization ---
  const learnRecord = dbGetItem('BUDGETLEARN');
  if (learnRecord && Array.isArray(learnRecord.examples)) {
    for (const tx of transactions) {
      const lowerDesc = tx.description.toLowerCase();
      // Check if any learning example pattern matches this transaction
      for (const ex of learnRecord.examples) {
        if (lowerDesc.includes(ex.pattern.toLowerCase()) || ex.pattern.toLowerCase().includes(lowerDesc)) {
          tx.categoryId = ex.categoryId;
          tx.confidence = 0.95;
          break;
        }
      }
    }
  }

  // Use client-provided income if present, otherwise use detected
  const finalIncome = body.actualIncome != null ? body.actualIncome : detectedIncome;

  return {
    status: 200,
    body: {
      month: body.month,
      transactions,
      detectedIncome: finalIncome,
    },
  };
}

// POST /api/budget/submit-statement — Async mock for dev (simulates async processing)
function handleSubmitStatement(body) {
  if (!body || !isObject(body)) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  if (!body.month || !isString(body.month) || !MONTH_RE.test(body.month)) {
    return { status: 400, body: { error: 'month is required and must be in YYYY-MM format' } };
  }
  if (!body.statementText || !isString(body.statementText)) {
    return { status: 400, body: { error: 'statementText is required and must be a non-empty string' } };
  }

  // Check for existing active job
  const existingJobs = dbQueryByPrefix('BUDGETJOB#');
  const activeJob = existingJobs.find((j) => j.status === 'processing');
  if (activeJob) {
    return {
      status: 409,
      body: { error: 'A statement is already being processed', jobId: activeJob.jobId },
    };
  }

  // Clean up old completed/failed jobs
  const oldJobs = existingJobs.filter((j) => j.status !== 'processing');
  for (const j of oldJobs) {
    dbDeleteItem(`BUDGETJOB#${j.jobId}`);
  }

  // Create new job
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  dbPutItem(`BUDGETJOB#${jobId}`, {
    jobId,
    month: body.month,
    statementText: body.statementText,
    actualIncome: body.actualIncome ?? null,
    status: 'processing',
    createdAt: now,
  });

  // Simulate async processing: parse the statement after a short delay
  setTimeout(() => {
    try {
      const result = handleParseStatement({
        month: body.month,
        statementText: body.statementText,
        actualIncome: body.actualIncome,
      });

      if (result.status === 200 && result.body) {
        dbUpdateItem(`BUDGETJOB#${jobId}`, {
          status: 'completed',
          transactions: result.body.transactions || [],
          detectedIncome: result.body.detectedIncome ?? null,
          statementText: null,
          completedAt: new Date().toISOString(),
        });
      } else {
        dbUpdateItem(`BUDGETJOB#${jobId}`, {
          status: 'failed',
          error: result.body?.error || 'Processing failed',
          statementText: null,
        });
      }
    } catch (err) {
      dbUpdateItem(`BUDGETJOB#${jobId}`, {
        status: 'failed',
        error: err.message || 'Processing failed unexpectedly',
        statementText: null,
      });
    }
    persistStore();
  }, 3000); // 3 second delay to simulate async processing

  return {
    status: 202,
    body: { jobId, status: 'processing' },
  };
}

// GET /api/budget/job-status — Poll job status for dev
function handleGetJobStatus(queryString) {
  const params = new URLSearchParams(queryString);
  const jobId = params.get('jobId');
  if (!jobId) {
    return { status: 400, body: { error: 'jobId query parameter is required' } };
  }

  const job = dbGetItem(`BUDGETJOB#${jobId}`);
  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const response = {
    jobId: job.jobId,
    status: job.status,
    month: job.month,
  };

  if (job.status === 'completed') {
    response.transactions = job.transactions || [];
    response.detectedIncome = job.detectedIncome ?? null;
  }

  if (job.status === 'failed') {
    response.error = job.error || 'Unknown error';
  }

  return { status: 200, body: response };
}

// POST /api/budget/transactions/confirm
function handleConfirmTransactions(body) {
  if (!body || !isObject(body)) {
    return { status: 400, body: { error: 'Invalid or missing request body' } };
  }
  if (!body.month || !isString(body.month) || !MONTH_RE.test(body.month)) {
    return { status: 400, body: { error: 'month is required and must be in YYYY-MM format' } };
  }
  if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
    return { status: 400, body: { error: 'transactions must be a non-empty array' } };
  }
  if (body.transactions.length > MAX_TRANSACTIONS) {
    return { status: 400, body: { error: `transactions exceeds maximum of ${MAX_TRANSACTIONS}` } };
  }

  const now = new Date().toISOString();
  const categoryTotals = {};
  let totalSpent = 0;

  // Write each transaction as BTX#
  for (const tx of body.transactions) {
    const id = crypto.randomUUID();
    const txData = {
      id,
      month: body.month,
      date: tx.date || `${body.month}-01`,
      description: tx.description || '',
      amount: tx.amount || 0,
      categoryId: tx.categoryId || 'bcat-other',
      confidence: tx.confidence,
    };
    dbPutItem(`BTX#${id}`, txData);

    // Accumulate category totals
    const catId = txData.categoryId;
    if (!categoryTotals[catId]) {
      categoryTotals[catId] = 0;
    }
    categoryTotals[catId] += txData.amount;
    totalSpent += txData.amount;
  }

  // Upsert BMONTH#{month}
  const monthData = {
    month: body.month,
    actualIncome: body.actualIncome ?? null,
    totalSpent,
    categoryTotals,
    transactionCount: body.transactions.length,
  };
  const existingMonth = dbGetItem(`BMONTH#${body.month}`);
  let result;
  if (existingMonth) {
    result = dbUpdateItem(`BMONTH#${body.month}`, monthData);
  } else {
    result = dbPutItem(`BMONTH#${body.month}`, monthData);
  }

  // --- Update classification learning context ---
  try {
    // Build category name lookup
    const bcatRecords = dbQueryByPrefix('BCAT#');
    const catNameMap = {};
    for (const r of bcatRecords) {
      const catId = r.id || r.SK.slice(5);
      catNameMap[catId] = r.name;
    }

    // Extract learning examples from confirmed transactions (expenses and refunds only)
    const newExamples = body.transactions
      .filter((tx) => {
        const type = tx.type || 'expense';
        return type === 'expense' || type === 'refund';
      })
      .map((tx) => ({
        pattern: tx.description || '',
        categoryId: tx.budgetCategoryId || tx.categoryId || 'bcat-other',
        categoryName: catNameMap[tx.budgetCategoryId || tx.categoryId] || 'Other',
        type: tx.type || 'expense',
      }))
      .filter((ex) => ex.pattern.trim().length > 0);

    if (newExamples.length > 0) {
      const learnRecord = dbGetItem('BUDGETLEARN');
      const existingExamples = (learnRecord && learnRecord.examples) || [];

      // Merge: index existing by lowercase pattern, then overlay new examples
      const exampleMap = new Map();
      for (const ex of existingExamples) {
        exampleMap.set(ex.pattern.toLowerCase(), ex);
      }
      for (const ex of newExamples) {
        exampleMap.set(ex.pattern.toLowerCase(), ex);
      }

      // Cap at 100 examples — keep most recent
      const merged = Array.from(exampleMap.values());
      const capped = merged.length > 100 ? merged.slice(merged.length - 100) : merged;

      dbPutItem('BUDGETLEARN', { examples: capped });
    }
  } catch (learnErr) {
    console.error('Failed to update learning context:', learnErr);
  }

  const cleaned = stripKeys(result);
  cleaned.month = body.month;
  return { status: 201, body: cleaned };
}

// GET /api/budget/months/:month/transactions
function handleGetMonthTransactions(pathname) {
  // /api/budget/months/{month}/transactions
  const segments = pathname.split('/');
  const month = segments[4] ? decodeURIComponent(segments[4]) : null;
  if (!month || !MONTH_RE.test(month)) {
    return { status: 400, body: { error: 'Invalid or missing month in path' } };
  }

  const allTx = dbQueryByPrefix('BTX#');
  const transactions = allTx
    .filter((tx) => tx.month === month)
    .map((tx) => {
      const cleaned = stripKeys(tx);
      cleaned.id = idFromSK(tx.SK);
      return cleaned;
    });

  return { status: 200, body: { transactions } };
}

// GET /api/budget/ytd-summary
function handleGetYtdSummary(queryString) {
  const params = parseQueryString(queryString);
  const year = params.year || new Date().getFullYear().toString();

  // Load config
  const configRecord = dbGetItem('BUDGETCFG');
  const config = configRecord ? stripKeys(configRecord) : null;
  const monthlyIncome = config?.monthlyIncome || 0;

  // Load all budget categories
  const catRecords = dbQueryByPrefix('BCAT#');
  const categoriesById = {};
  for (const cat of catRecords) {
    const id = idFromSK(cat.SK);
    categoriesById[id] = stripKeys(cat);
    categoriesById[id].id = id;
  }

  // Load all months for this year
  const monthRecords = dbQueryByPrefix('BMONTH#');
  const yearMonths = monthRecords.filter((m) => {
    const monthStr = idFromSK(m.SK);
    return monthStr.startsWith(year);
  });

  // How many months have passed in this year (or months with data)
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear().toString();
  let monthsElapsed;
  if (year === currentYear) {
    monthsElapsed = currentDate.getMonth() + 1;
  } else if (parseInt(year) < parseInt(currentYear)) {
    monthsElapsed = 12;
  } else {
    monthsElapsed = 0;
  }

  const ytdExpectedIncome = monthlyIncome * monthsElapsed;
  let ytdActualIncome = 0;
  let ytdTotalSpent = 0;
  const ytdCategoryTotals = {};

  for (const monthRecord of yearMonths) {
    const data = stripKeys(monthRecord);
    ytdActualIncome += data.actualIncome || 0;
    ytdTotalSpent += data.totalSpent || 0;
    if (data.categoryTotals) {
      for (const [catId, total] of Object.entries(data.categoryTotals)) {
        if (!ytdCategoryTotals[catId]) {
          ytdCategoryTotals[catId] = 0;
        }
        ytdCategoryTotals[catId] += total;
      }
    }
  }

  // Build per-category summary
  const categoryBreakdown = [];
  for (const [catId, cat] of Object.entries(categoriesById)) {
    const expectedMonthly = monthlyIncome * (cat.percentOfIncome || 0) / 100;
    const expectedYtd = expectedMonthly * monthsElapsed;
    const actualYtd = ytdCategoryTotals[catId] || 0;
    categoryBreakdown.push({
      categoryId: catId,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      expectedYtd,
      actualYtd,
      difference: expectedYtd - actualYtd,
      percentUsed: expectedYtd > 0 ? (actualYtd / expectedYtd) * 100 : 0,
    });
  }

  // Debt detection: spending > income
  const inDebt = ytdTotalSpent > (ytdActualIncome || ytdExpectedIncome);

  return {
    status: 200,
    body: {
      year,
      monthsElapsed,
      monthsWithData: yearMonths.length,
      ytdExpectedIncome,
      ytdActualIncome,
      ytdTotalSpent,
      ytdSavings: (ytdActualIncome || ytdExpectedIncome) - ytdTotalSpent,
      inDebt,
      categoryBreakdown,
    },
  };
}

// DELETE /api/budget/months/:month
function handleDeleteBudgetMonth(pathname) {
  const segments = pathname.split('/');
  const month = segments[4] ? decodeURIComponent(segments[4]) : null;
  if (!month || !MONTH_RE.test(month)) {
    return { status: 400, body: { error: 'Invalid or missing month in path' } };
  }

  // Delete BMONTH# record
  dbDeleteItem(`BMONTH#${month}`);

  // Delete all BTX# entries for this month
  const partition = userPartition();
  let deletedTx = 0;
  for (const [sk, data] of Object.entries(partition)) {
    if (sk.startsWith('BTX#') && data.month === month) {
      delete partition[sk];
      deletedTx++;
    }
  }
  if (deletedTx > 0) {
    persistStore();
  }

  return { status: 200, body: { deleted: month, deletedTransactions: deletedTx } };
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const { pathname, queryString } = parseUrl(req.url);
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    logRequest(method, pathname, 204);
    sendRaw(res, 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }, '');
    return;
  }

  // Read body for POST/PUT
  let body = null;
  if (method === 'POST' || method === 'PUT') {
    try {
      const raw = await readBody(req);
      body = parseJsonBody(raw);
    } catch {
      logRequest(method, pathname, 400);
      sendJson(res, 400, { error: 'Failed to read request body' });
      return;
    }
  }

  let result;

  try {
    // POST /api/telemetry (no auth required)
    if (method === 'POST' && pathname === '/api/telemetry') {
      result = handleTelemetry(body);
    }
    // GET /api/state
    else if (method === 'GET' && pathname === '/api/state') {
      result = handleGetState();
    }
    // POST /api/items/batch (must be before POST /api/items)
    else if (method === 'POST' && pathname === '/api/items/batch') {
      result = handleBatchCreateItems(body);
    }
    // PUT /api/items/batch (must be before PUT /api/items/:id)
    else if (method === 'PUT' && pathname === '/api/items/batch') {
      result = handleBatchUpdateItems(body);
    }
    // POST /api/items
    else if (method === 'POST' && pathname === '/api/items') {
      result = handleCreateItem(body);
    }
    // PUT /api/items/:id
    else if (method === 'PUT' && /^\/api\/items\/[^/]+$/.test(pathname)) {
      result = handleUpdateItem(pathname, body);
    }
    // DELETE /api/items/:id
    else if (method === 'DELETE' && /^\/api\/items\/[^/]+$/.test(pathname)) {
      result = handleDeleteItem(pathname);
    }
    // POST /api/categories
    else if (method === 'POST' && pathname === '/api/categories') {
      result = handleCreateCategory(body);
    }
    // PUT /api/categories/:id
    else if (method === 'PUT' && /^\/api\/categories\/[^/]+$/.test(pathname)) {
      result = handleUpdateCategory(pathname, body);
    }
    // DELETE /api/categories/:id
    else if (method === 'DELETE' && /^\/api\/categories\/[^/]+$/.test(pathname)) {
      result = handleDeleteCategory(pathname);
    }
    // POST /api/snapshots
    else if (method === 'POST' && pathname === '/api/snapshots') {
      result = handleCreateSnapshot();
    }
    // GET /api/snapshots/:date/items
    else if (method === 'GET' && /^\/api\/snapshots\/[^/]+\/items$/.test(pathname)) {
      result = handleGetSnapshotItems(pathname);
    }
    // DELETE /api/snapshots/:date
    else if (method === 'DELETE' && /^\/api\/snapshots\/[^/]+$/.test(pathname)) {
      result = handleDeleteSnapshot(pathname);
    }
    // PUT /api/settings
    else if (method === 'PUT' && pathname === '/api/settings') {
      result = handleUpdateSettings(body);
    }
    // POST /api/import
    else if (method === 'POST' && pathname === '/api/import') {
      result = handleImport(body);
    }
    // GET /api/yahoo/*
    else if (method === 'GET' && pathname.startsWith('/api/yahoo/')) {
      result = await handleYahooProxy(pathname, queryString);
    }
    // --- Budget routes ---
    // GET /api/budget/state
    else if (method === 'GET' && pathname === '/api/budget/state') {
      result = handleGetBudgetState();
    }
    // PUT /api/budget/config
    else if (method === 'PUT' && pathname === '/api/budget/config') {
      result = handleUpdateBudgetConfig(body);
    }
    // GET /api/budget/ytd-summary
    else if (method === 'GET' && pathname === '/api/budget/ytd-summary') {
      result = handleGetYtdSummary(queryString);
    }
    // POST /api/budget/submit-statement (async)
    else if (method === 'POST' && pathname === '/api/budget/submit-statement') {
      result = handleSubmitStatement(body);
    }
    // GET /api/budget/job-status (poll async job)
    else if (method === 'GET' && pathname === '/api/budget/job-status') {
      result = handleGetJobStatus(queryString);
    }
    // POST /api/budget/parse-statement (legacy sync)
    else if (method === 'POST' && pathname === '/api/budget/parse-statement') {
      result = handleParseStatement(body);
    }
    // POST /api/budget/transactions/confirm
    else if (method === 'POST' && pathname === '/api/budget/transactions/confirm') {
      result = handleConfirmTransactions(body);
    }
    // POST /api/budget/categories
    else if (method === 'POST' && pathname === '/api/budget/categories') {
      result = handleCreateBudgetCategory(body);
    }
    // PUT /api/budget/categories/:id
    else if (method === 'PUT' && /^\/api\/budget\/categories\/[^/]+$/.test(pathname)) {
      result = handleUpdateBudgetCategory(pathname, body);
    }
    // DELETE /api/budget/categories/:id
    else if (method === 'DELETE' && /^\/api\/budget\/categories\/[^/]+$/.test(pathname)) {
      result = handleDeleteBudgetCategory(pathname);
    }
    // GET /api/budget/months/:month/transactions
    else if (method === 'GET' && /^\/api\/budget\/months\/[^/]+\/transactions$/.test(pathname)) {
      result = handleGetMonthTransactions(pathname);
    }
    // DELETE /api/budget/months/:month
    else if (method === 'DELETE' && /^\/api\/budget\/months\/[^/]+$/.test(pathname)) {
      result = handleDeleteBudgetMonth(pathname);
    }
    // 404
    else {
      result = { status: 404, body: { error: 'Not found' } };
    }
  } catch (err) {
    console.error(`${c.red}Unhandled error:${c.reset}`, err);
    result = { status: 500, body: { error: 'Internal error' } };
  }

  logRequest(method, pathname, result.status);

  // Handle 204 No Content (telemetry)
  if (result.status === 204) {
    sendRaw(res, 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }, '');
    return;
  }

  // Handle raw body responses (Yahoo proxy)
  if (result.rawBody !== undefined) {
    sendRaw(res, result.status, result.headers || {}, result.rawBody);
    return;
  }

  sendJson(res, result.status, result.body);
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

loadStore();

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log('');
  console.log(`${c.bold}${c.cyan}  Net Worth Tracker — Dev API Server${c.reset}`);
  console.log(`${c.dim}  ────────────────────────────────────${c.reset}`);
  console.log(`  ${c.green}Listening on${c.reset}  http://localhost:${PORT}`);
  console.log(`  ${c.yellow}Auth${c.reset}          disabled for local development`);
  console.log(`  ${c.yellow}User ID${c.reset}       ${USER_ID}`);
  console.log(`  ${c.yellow}Data file${c.reset}     ${DATA_FILE}`);
  console.log(`${c.dim}  ────────────────────────────────────${c.reset}`);
  console.log('');
});
