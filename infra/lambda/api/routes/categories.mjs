/**
 * Category route handlers.
 *
 * POST   /api/categories      — create a new category
 * PUT    /api/categories/{id} — update an existing category
 * DELETE /api/categories/{id} — delete a category (with item reassignment)
 */

import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getItem, putItem, updateItem, deleteItem, queryUserData } from '../lib/db.mjs';
import { parseBody, validateCategory } from '../lib/validate.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Lazy singleton for conditional updates (not exposed by db.mjs)
let _docClient = null;
function getDocClient() {
  if (!_docClient) {
    const ddbClient = new DynamoDBClient({});
    _docClient = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _docClient;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripKeys(record) {
  const { PK, SK, ...rest } = record;
  return rest;
}

function extractIdFromPath(rawPath) {
  // /api/categories/{id} — last segment
  const segments = rawPath.split('/');
  return segments[segments.length - 1];
}

// ---------------------------------------------------------------------------
// POST /api/categories
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleCreateCategory(event, userId) {
  try {
    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateCategory(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    const id = crypto.randomUUID();
    const data = {
      ...validation.data,
      id,
      isDefault: false,
    };

    const item = await putItem(userId, `CAT#${id}`, data);

    return {
      statusCode: 201,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(item)),
    };
  } catch (err) {
    console.error('handleCreateCategory error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to create category' }),
    };
  }
}

// ---------------------------------------------------------------------------
// PUT /api/categories/{id}
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleUpdateCategory(event, userId) {
  try {
    const id = extractIdFromPath(event.rawPath);
    if (!id) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing category id in path' }),
      };
    }

    const body = parseBody(event);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Invalid or missing JSON body' }),
      };
    }

    const validation = validateCategory(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: validation.error }),
      };
    }

    // Check that the category exists
    const existing = await getItem(userId, `CAT#${id}`);
    if (!existing) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Category not found' }),
      };
    }

    const updated = await updateItem(userId, `CAT#${id}`, validation.data);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify(stripKeys(updated)),
    };
  } catch (err) {
    console.error('handleUpdateCategory error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to update category' }),
    };
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/categories/{id}
// ---------------------------------------------------------------------------

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @param {string} userId
 */
export async function handleDeleteCategory(event, userId) {
  try {
    const id = extractIdFromPath(event.rawPath);
    if (!id) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Missing category id in path' }),
      };
    }

    // Fetch the category — must exist
    const category = await getItem(userId, `CAT#${id}`);
    if (!category) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Category not found' }),
      };
    }

    // Cannot delete default categories
    if (category.isDefault === true) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Cannot delete a default category' }),
      };
    }

    // Query all user data to find categories and items
    const allRecords = await queryUserData(userId);

    // Find a fallback category: same type (or 'both') and isDefault: true
    const fallback = allRecords.find((r) => {
      if (!r.SK.startsWith('CAT#')) return false;
      if (r.SK === `CAT#${id}`) return false;
      if (r.isDefault !== true) return false;
      return r.type === category.type || r.type === 'both';
    });

    if (!fallback) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'No fallback default category found for this type' }),
      };
    }

    const fallbackId = fallback.SK.slice(4); // strip "CAT#"

    // Find all ITEM# entities that belong to the deleted category
    const affectedItems = allRecords.filter(
      (r) => r.SK.startsWith('ITEM#') && r.categoryId === id
    );

    // Reassign each affected item to the fallback category
    // Uses ConditionExpression for idempotency: only update if categoryId still matches
    const docClient = getDocClient();
    let reassignedCount = 0;

    for (const item of affectedItems) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: item.SK },
            UpdateExpression: 'SET categoryId = :newCat, updatedAt = :now',
            ConditionExpression: 'categoryId = :oldCat',
            ExpressionAttributeValues: {
              ':newCat': fallbackId,
              ':oldCat': id,
              ':now': new Date().toISOString(),
            },
          })
        );
        reassignedCount++;
      } catch (condErr) {
        // ConditionalCheckFailedException means item was already reassigned — skip
        if (condErr.name !== 'ConditionalCheckFailedException') {
          throw condErr;
        }
      }
    }

    // Delete the category
    await deleteItem(userId, `CAT#${id}`);

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ deleted: id, reassigned: reassignedCount }),
    };
  } catch (err) {
    console.error('handleDeleteCategory error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete category' }),
    };
  }
}
