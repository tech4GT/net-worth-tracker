/**
 * Item CRUD route handlers.
 *
 * POST   /api/items          — Create a single item
 * PUT    /api/items/{id}     — Update an existing item
 * DELETE /api/items/{id}     — Delete an item
 * POST   /api/items/batch    — Batch create items (max 100)
 * PUT    /api/items/batch    — Batch update items (max 100)
 */

import crypto from 'node:crypto';
import { getItem, putItem, updateItem, deleteItem, batchWrite } from '../lib/db.mjs';
import { parseBody, validateItem } from '../lib/validate.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const MAX_BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the trailing id segment from a path like /api/items/{id}.
 */
function extractIdFromPath(rawPath) {
  const segments = rawPath.split('/');
  return segments[segments.length - 1];
}

/**
 * Strip PK and SK from a DynamoDB record for the response.
 */
function stripKeys(record) {
  const { PK, SK, ...rest } = record;
  return rest;
}

// ---------------------------------------------------------------------------
// POST /api/items
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleCreateItem(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing request body' }),
      };
    }

    const validation = validateItem(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const id = crypto.randomUUID();
    const sk = `ITEM#${id}`;
    const saved = await putItem(userId, sk, { ...validation.data, id });

    const item = stripKeys(saved);
    return {
      statusCode: 201,
      headers: JSON_HEADERS,
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error('handleCreateItem error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to create item' }),
    };
  }
}

// ---------------------------------------------------------------------------
// PUT /api/items/{id}
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleUpdateItem(event, userId) {
  try {
    const id = extractIdFromPath(event.rawPath);
    const sk = `ITEM#${id}`;

    // Verify the item exists
    const existing = await getItem(userId, sk);
    if (!existing) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Item not found' }),
      };
    }

    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing request body' }),
      };
    }

    // For updates, merge provided fields onto existing data before validation
    // so that omitted required fields fall back to the stored values.
    const merged = {
      name: body.name ?? existing.name,
      type: body.type ?? existing.type,
      categoryId: body.categoryId ?? existing.categoryId,
      value: body.value ?? existing.value,
      currency: body.currency ?? existing.currency,
    };

    // Carry over optional fields from body or existing record
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
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const updated = await updateItem(userId, sk, validation.data);
    const item = stripKeys(updated);
    item.id = id;

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error('handleUpdateItem error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to update item' }),
    };
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/items/{id}
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleDeleteItem(event, userId) {
  try {
    const id = extractIdFromPath(event.rawPath);
    const sk = `ITEM#${id}`;

    const deleted = await deleteItem(userId, sk);
    if (!deleted) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Item not found' }),
      };
    }

    const item = stripKeys(deleted);
    item.id = id;

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error('handleDeleteItem error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete item' }),
    };
  }
}

// ---------------------------------------------------------------------------
// POST /api/items/batch
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleBatchCreateItems(event, userId) {
  try {
    const body = parseBody(event);
    if (!body || !Array.isArray(body.items)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Request body must contain an "items" array' }),
      };
    }

    if (body.items.length > MAX_BATCH_SIZE) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} items` }),
      };
    }

    if (body.items.length === 0) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Items array must not be empty' }),
      };
    }

    // Validate every item up-front before writing any
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
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: errors.join('; ') }),
      };
    }

    // Assign ids and build BatchWrite operations
    const now = new Date().toISOString();
    const tableName = process.env.TABLE_NAME;
    const createdItems = [];

    const operations = validatedItems.map((data) => {
      const id = crypto.randomUUID();
      const item = {
        PK: `USER#${userId}`,
        SK: `ITEM#${id}`,
        ...data,
        id,
        createdAt: now,
        updatedAt: now,
      };
      createdItems.push({ ...data, id, createdAt: now, updatedAt: now });
      return { PutRequest: { Item: item } };
    });

    await batchWrite(tableName, operations);

    return {
      statusCode: 201,
      headers: JSON_HEADERS,
      body: JSON.stringify(createdItems),
    };
  } catch (err) {
    console.error('handleBatchCreateItems error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to batch create items' }),
    };
  }
}

// ---------------------------------------------------------------------------
// PUT /api/items/batch
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleBatchUpdateItems(event, userId) {
  try {
    const body = parseBody(event);
    if (!body || !Array.isArray(body.updates)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Request body must contain an "updates" array' }),
      };
    }

    if (body.updates.length > MAX_BATCH_SIZE) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} updates` }),
      };
    }

    if (body.updates.length === 0) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Updates array must not be empty' }),
      };
    }

    // Validate that every entry has an id
    for (let i = 0; i < body.updates.length; i++) {
      if (!body.updates[i].id || typeof body.updates[i].id !== 'string') {
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ error: `updates[${i}]: id is required and must be a string` }),
        };
      }
    }

    const updatedItems = [];

    for (const entry of body.updates) {
      const { id, ...fields } = entry;
      const sk = `ITEM#${id}`;

      // Fetch the existing item so we can merge for validation
      const existing = await getItem(userId, sk);
      if (!existing) {
        return {
          statusCode: 404,
          headers: JSON_HEADERS,
          body: JSON.stringify({ error: `Item not found: ${id}` }),
        };
      }

      // Merge provided fields onto existing values
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
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ error: `Item ${id}: ${validation.error}` }),
        };
      }

      const updated = await updateItem(userId, sk, validation.data);
      const item = stripKeys(updated);
      item.id = id;
      updatedItems.push(item);
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(updatedItems),
    };
  } catch (err) {
    console.error('handleBatchUpdateItems error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to batch update items' }),
    };
  }
}
