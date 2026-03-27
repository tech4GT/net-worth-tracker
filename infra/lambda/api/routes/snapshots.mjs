/**
 * Snapshot route handlers.
 *
 * POST   /api/snapshots             — create (or upsert) a snapshot for the current month
 * GET    /api/snapshots/{date}/items — get the full item data for a snapshot
 * DELETE /api/snapshots/{date}       — delete a snapshot and its item data
 */

import { getItem, putItem, updateItem, queryUserData, deleteItem, queryByPrefix } from '../lib/db.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripKeys(record) {
  const { PK, SK, ...rest } = record;
  return rest;
}

/**
 * Replicate the frontend convertToBase logic:
 *   exchangeRates stores: 1 baseCurrency = X foreignCurrency
 *   To convert foreign -> base: value / rate
 */
function convertToBase(value, fromCurrency, baseCurrency, exchangeRates) {
  if (fromCurrency === baseCurrency) return value;
  const rate = exchangeRates[fromCurrency];
  if (!rate || rate <= 0) return 0;
  return value / rate;
}

/**
 * Return a full ISO timestamp for the current moment, e.g. "2026-03-27T17:30:00.000Z".
 */
function snapshotTimestamp() {
  return new Date().toISOString();
}

/**
 * Return the YYYY-MM prefix for a given ISO timestamp.
 */
function monthPrefix(isoTimestamp) {
  return isoTimestamp.slice(0, 7); // "2026-03"
}

function extractDateFromPath(rawPath) {
  // /api/snapshots/{date}/items → segments[3] = date
  // /api/snapshots/{date}       → segments[3] = date
  const segments = rawPath.split('/');
  return segments[3] ? decodeURIComponent(segments[3]) : undefined;
}

// ---------------------------------------------------------------------------
// POST /api/snapshots
// ---------------------------------------------------------------------------

/**
 * Server-side snapshot calculation. Upserts for the current month.
 *
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleCreateSnapshot(event, userId) {
  try {
    // 1. Query all ITEM#, CAT#, and PROFILE entities
    const allRecords = await queryUserData(userId);

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

    // 2. Extract settings from profile (or use defaults)
    const baseCurrency = profile?.baseCurrency || 'USD';
    const exchangeRates = profile?.exchangeRates || {};

    // 3. Calculate per-category breakdown and totals
    const breakdownMap = {}; // categoryId -> { categoryId, name, total, type }
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

      // Accumulate breakdown by category
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

    // 4. Date = full ISO timestamp; enforce 10-per-month limit
    const date = snapshotTimestamp();
    const prefix = monthPrefix(date); // "YYYY-MM"
    const existingSnaps = await queryByPrefix(userId, `SNAP#${prefix}`);
    // Filter out SNAPDATA# entries that also match the prefix
    const snapCount = existingSnaps.filter((r) => !r.SK.startsWith('SNAPDATA#')).length;
    if (snapCount >= 10) {
      return {
        statusCode: 429,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Monthly snapshot limit reached (10 per month)' }),
      };
    }

    // 5. Write SNAP#{date} summary
    const summary = {
      date,
      totalAssets,
      totalLiabilities,
      netWorth,
      breakdown,
      itemCount: items.length,
      baseCurrency,
    };

    await putItem(userId, `SNAP#${date}`, summary);

    // 6. Write SNAPDATA#{date} with full item copies (deep copy, strip DDB keys)
    const itemCopies = items.map((item) => {
      const { PK, SK, ...rest } = item;
      return { ...rest, id: SK.slice(5) }; // strip "ITEM#"
    });

    await putItem(userId, `SNAPDATA#${date}`, { date, items: itemCopies });

    // 7. Update PROFILE: set lastSnapshotDate
    await updateItem(userId, 'PROFILE', { lastSnapshotDate: date });

    // 8. Return summary (not item data)
    return {
      statusCode: 201,
      headers: JSON_HEADERS,
      body: JSON.stringify(summary),
    };
  } catch (err) {
    console.error('handleCreateSnapshot error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to create snapshot' }),
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/snapshots/{date}/items
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleGetSnapshotItems(event, userId) {
  try {
    const date = extractDateFromPath(event.rawPath);
    if (!date) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing date in path' }),
      };
    }

    const record = await getItem(userId, `SNAPDATA#${date}`);
    if (!record) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Snapshot data not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ items: record.items || [] }),
    };
  } catch (err) {
    console.error('handleGetSnapshotItems error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to get snapshot items' }),
    };
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/snapshots/{date}
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleDeleteSnapshot(event, userId) {
  try {
    const date = extractDateFromPath(event.rawPath);
    if (!date) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing date in path' }),
      };
    }

    // Delete both the summary and the item data
    await Promise.all([
      deleteItem(userId, `SNAP#${date}`),
      deleteItem(userId, `SNAPDATA#${date}`),
    ]);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ deleted: date }),
    };
  } catch (err) {
    console.error('handleDeleteSnapshot error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete snapshot' }),
    };
  }
}
