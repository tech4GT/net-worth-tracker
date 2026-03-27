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
