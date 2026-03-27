/**
 * Settings route handler.
 *
 * PUT /api/settings — update user settings (PROFILE entity)
 */

import { getItem, putItem, updateItem } from '../lib/db.mjs';
import { parseBody, validateSettings } from '../lib/validate.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const DEFAULT_SETTINGS = {
  baseCurrency: 'USD',
  theme: 'system',
  exchangeRates: {},
  snapshotReminder: true,
  lastSnapshotDate: null,
  stocksLastRefreshed: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripKeys(record) {
  const { PK, SK, ...rest } = record;
  return rest;
}

// ---------------------------------------------------------------------------
// PUT /api/settings
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleUpdateSettings(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateSettings(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    // Check if PROFILE already exists
    const existing = await getItem(userId, 'PROFILE');

    let result;
    if (existing) {
      // Update the existing profile with the new settings
      result = await updateItem(userId, 'PROFILE', validation.data);
    } else {
      // Create a new profile with defaults merged with provided settings
      const merged = {
        ...DEFAULT_SETTINGS,
        ...validation.data,
      };
      result = await putItem(userId, 'PROFILE', merged);
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(result)),
    };
  } catch (err) {
    console.error('handleUpdateSettings error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to update settings' }),
    };
  }
}
