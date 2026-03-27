/**
 * Import route handler.
 *
 * POST /api/import — Full JSON data import with backup-before-delete safety.
 *
 * Expects: { items, categories, snapshots, settings }
 * Creates a BACKUP entity with TTL, deletes all existing data, writes new data.
 * If the write fails mid-way, attempts to restore from backup.
 */

import crypto from 'node:crypto';
import { queryUserData, putItem, updateItem, batchWrite, getItem } from '../lib/db.mjs';
import { parseBody } from '../lib/validate.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const MAX_ITEMS = 500;
const MAX_CATEGORIES = 100;
const MAX_SNAPSHOTS = 200;
const BACKUP_TTL_DAYS = 7;

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

// Default categories indexed by id for merging
const DEFAULT_CAT_MAP = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.id, c])
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter records to only those with SK prefixes that should be cleared on import.
 */
function isDeletableEntity(sk) {
  return (
    sk.startsWith('ITEM#') ||
    sk.startsWith('CAT#') ||
    sk.startsWith('SNAP#') ||
    sk.startsWith('SNAPDATA#')
  );
}

// ---------------------------------------------------------------------------
// POST /api/import
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleImport(event, userId) {
  try {
    // 1. Parse body
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const {
      items = [],
      categories = [],
      snapshots = [],
      settings = null,
    } = body;

    // 2. Validate sizes
    if (!Array.isArray(items) || items.length > MAX_ITEMS) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: `items must be an array with at most ${MAX_ITEMS} entries` }),
      };
    }

    if (!Array.isArray(categories) || categories.length > MAX_CATEGORIES) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: `categories must be an array with at most ${MAX_CATEGORIES} entries` }),
      };
    }

    if (!Array.isArray(snapshots) || snapshots.length > MAX_SNAPSHOTS) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: `snapshots must be an array with at most ${MAX_SNAPSHOTS} entries` }),
      };
    }

    // 3. Query all existing user data
    const existingRecords = await queryUserData(userId);

    // 4. Create backup of existing data before deleting
    const backupTimestamp = new Date().toISOString();
    const backupSK = `BACKUP#${backupTimestamp}`;
    const ttl = Math.floor(Date.now() / 1000) + BACKUP_TTL_DAYS * 86400;

    const backupData = {
      timestamp: backupTimestamp,
      ttl,
      recordCount: existingRecords.length,
      data: existingRecords,
    };

    await putItem(userId, backupSK, backupData);

    // 5. Delete all existing ITEM#, CAT#, SNAP#, SNAPDATA# entities
    const tableName = process.env.TABLE_NAME;
    const deleteOps = existingRecords
      .filter((r) => isDeletableEntity(r.SK))
      .map((r) => ({
        DeleteRequest: {
          Key: { PK: r.PK, SK: r.SK },
        },
      }));

    if (deleteOps.length > 0) {
      await batchWrite(tableName, deleteOps);
    }

    // 6. Write new data
    let importedItems = 0;
    let importedCategories = 0;
    let importedSnapshots = 0;

    try {
      // 6a. Categories — merge with defaults for known IDs
      const now = new Date().toISOString();
      const catOps = [];

      for (const cat of categories) {
        const id = cat.id || crypto.randomUUID();
        const defaultCat = DEFAULT_CAT_MAP[id];
        const merged = defaultCat
          ? { ...defaultCat, ...cat, id }
          : { ...cat, id, isDefault: cat.isDefault || false };

        catOps.push({
          PutRequest: {
            Item: {
              PK: `USER#${userId}`,
              SK: `CAT#${id}`,
              ...merged,
              createdAt: cat.createdAt || now,
              updatedAt: now,
            },
          },
        });
      }

      if (catOps.length > 0) {
        await batchWrite(tableName, catOps);
        importedCategories = catOps.length;
      }

      // 6b. Items
      const itemOps = [];

      for (const item of items) {
        const id = item.id || crypto.randomUUID();
        const { id: _stripId, ...itemData } = item;
        itemOps.push({
          PutRequest: {
            Item: {
              PK: `USER#${userId}`,
              SK: `ITEM#${id}`,
              ...itemData,
              id,
              createdAt: item.createdAt || now,
              updatedAt: now,
            },
          },
        });
      }

      if (itemOps.length > 0) {
        await batchWrite(tableName, itemOps);
        importedItems = itemOps.length;
      }

      // 6c. Snapshots — write SNAP# summary + SNAPDATA# if items included
      const snapOps = [];

      for (const snap of snapshots) {
        const date = snap.date;
        if (!date) continue;

        // Summary data (everything except the items array)
        const { items: snapItems, ...summaryData } = snap;
        snapOps.push({
          PutRequest: {
            Item: {
              PK: `USER#${userId}`,
              SK: `SNAP#${date}`,
              ...summaryData,
              date,
              createdAt: snap.createdAt || now,
              updatedAt: now,
            },
          },
        });

        // Snapshot item data (if provided)
        if (Array.isArray(snapItems)) {
          snapOps.push({
            PutRequest: {
              Item: {
                PK: `USER#${userId}`,
                SK: `SNAPDATA#${date}`,
                date,
                items: snapItems,
                createdAt: now,
                updatedAt: now,
              },
            },
          });
        }
      }

      if (snapOps.length > 0) {
        await batchWrite(tableName, snapOps);
        // Count actual snapshots (not snapdata entries)
        importedSnapshots = snapshots.filter((s) => s.date).length;
      }

      // 6d. Settings — update PROFILE if provided
      if (settings && typeof settings === 'object') {
        const existingProfile = await getItem(userId, 'PROFILE');
        if (existingProfile) {
          await updateItem(userId, 'PROFILE', settings);
        } else {
          await putItem(userId, 'PROFILE', {
            baseCurrency: 'USD',
            theme: 'system',
            exchangeRates: {},
            snapshotReminder: true,
            lastSnapshotDate: null,
            stocksLastRefreshed: null,
            ...settings,
          });
        }
      }
    } catch (writeErr) {
      // 7. Write failed mid-way — attempt to restore from backup
      console.error('Import write failed, attempting restore from backup:', writeErr);

      try {
        const backup = await getItem(userId, backupSK);
        if (backup && Array.isArray(backup.data)) {
          // Delete whatever partial data was written
          const currentRecords = await queryUserData(userId);
          const partialDeleteOps = currentRecords
            .filter((r) => isDeletableEntity(r.SK))
            .map((r) => ({
              DeleteRequest: {
                Key: { PK: r.PK, SK: r.SK },
              },
            }));

          if (partialDeleteOps.length > 0) {
            await batchWrite(tableName, partialDeleteOps);
          }

          // Restore original data from backup
          const restoreOps = backup.data
            .filter((r) => isDeletableEntity(r.SK))
            .map((r) => ({
              PutRequest: {
                Item: r,
              },
            }));

          if (restoreOps.length > 0) {
            await batchWrite(tableName, restoreOps);
          }
        }
      } catch (restoreErr) {
        console.error('Restore from backup also failed:', restoreErr);
      }

      return {
        statusCode: 500,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          error: 'Import failed during write phase. Attempted restore from backup.',
        }),
      };
    }

    // 8. Return success
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        imported: {
          items: importedItems,
          categories: importedCategories,
          snapshots: importedSnapshots,
        },
      }),
    };
  } catch (err) {
    console.error('handleImport error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to import data' }),
    };
  }
}
