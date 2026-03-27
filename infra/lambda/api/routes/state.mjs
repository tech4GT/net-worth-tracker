/**
 * State route handler.
 *
 * GET /api/state — Returns the full user state in a single query.
 * Assembles items, categories, snapshots, and settings into a
 * frontend-friendly shape. Seeds default categories for new users.
 */

import { queryUserData, batchWrite, putItem } from '../lib/db.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const DEFAULT_SETTINGS = {
  baseCurrency: 'USD',
  theme: 'system',
  exchangeRates: {},
  snapshotReminder: true,
  lastSnapshotDate: null,
  stocksLastRefreshed: null,
};

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove PK and SK keys from a DynamoDB record.
 */
function stripKeys(record) {
  const { PK, SK, ...rest } = record;
  return rest;
}

/**
 * Extract the id portion after the `#` in a sort key.
 * e.g. "ITEM#abc-123" → "abc-123"
 */
function idFromSK(sk) {
  const idx = sk.indexOf('#');
  return idx !== -1 ? sk.slice(idx + 1) : sk;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleGetState(event, userId) {
  try {
    const allRecords = await queryUserData(userId);

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
      } else if (sk.startsWith('SNAP#')) {
        // Only SNAP# summaries, not SNAPDATA#
        const cleaned = stripKeys(record);
        cleaned.date = idFromSK(sk);
        snapshots.push(cleaned);
      } else if (sk === 'PROFILE') {
        settings = stripKeys(record);
      }
      // SNAPDATA#, BACKUP#, etc. are intentionally excluded
    }

    // Use defaults if no profile exists
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS };
    }

    // Seed default categories for new users
    if (categories.length === 0) {
      const now = new Date().toISOString();
      const tableName = process.env.TABLE_NAME;
      const operations = DEFAULT_CATEGORIES.map((cat) => ({
        PutRequest: {
          Item: {
            PK: `USER#${userId}`,
            SK: `CAT#${cat.id}`,
            ...cat,
            createdAt: now,
            updatedAt: now,
          },
        },
      }));

      await batchWrite(tableName, operations);

      // Return the seeded categories (with id, without PK/SK)
      for (const cat of DEFAULT_CATEGORIES) {
        categories.push({ ...cat, createdAt: now, updatedAt: now });
      }
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ items, categories, snapshots, settings }),
    };
  } catch (err) {
    console.error('handleGetState error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to load state' }),
    };
  }
}
