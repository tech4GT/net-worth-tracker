/**
 * DynamoDB helpers for the Net Worth Tracker API.
 *
 * Uses the AWS SDK v3 clients that are pre-installed in the Lambda Node 20 runtime.
 * All functions operate against a single-table design:
 *   PK = USER#{userId}   SK = varies by entity type
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Lazy singleton client
// ---------------------------------------------------------------------------

let _docClient = null;

function getClient() {
  if (!_docClient) {
    const ddbClient = new DynamoDBClient({});
    _docClient = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }
  return _docClient;
}

function tableName() {
  return process.env.TABLE_NAME;
}

// ---------------------------------------------------------------------------
// queryUserData
// ---------------------------------------------------------------------------

/**
 * Return every item for a given user (PK = USER#{userId}).
 * Handles DynamoDB pagination automatically.
 */
export async function queryUserData(userId) {
  const client = getClient();
  const items = [];
  let exclusiveStartKey = undefined;

  do {
    const response = await client.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` },
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      })
    );

    if (response.Items) {
      items.push(...response.Items);
    }

    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

// ---------------------------------------------------------------------------
// getItem
// ---------------------------------------------------------------------------

export async function getItem(userId, sk) {
  const client = getClient();

  const response = await client.send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: `USER#${userId}`, SK: sk },
    })
  );

  return response.Item || null;
}

// ---------------------------------------------------------------------------
// putItem
// ---------------------------------------------------------------------------

export async function putItem(userId, sk, data) {
  const client = getClient();
  const now = new Date().toISOString();

  const item = {
    ...data,
    PK: `USER#${userId}`,
    SK: sk,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };

  await client.send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
    })
  );

  return item;
}

// ---------------------------------------------------------------------------
// updateItem
// ---------------------------------------------------------------------------

/**
 * Build a dynamic UpdateExpression from an arbitrary updates object.
 * Always sets `updatedAt`.  Returns the full item after update.
 */
export async function updateItem(userId, sk, updates) {
  const client = getClient();
  const now = new Date().toISOString();

  // Merge updatedAt into the updates so it is always set
  const allUpdates = { ...updates, updatedAt: now };

  const expressionParts = [];
  const expressionNames = {};
  const expressionValues = {};

  let idx = 0;
  for (const [key, value] of Object.entries(allUpdates)) {
    // PK and SK are key attributes — never update them
    if (key === 'PK' || key === 'SK') continue;

    const nameToken = `#f${idx}`;
    const valueToken = `:v${idx}`;
    expressionParts.push(`${nameToken} = ${valueToken}`);
    expressionNames[nameToken] = key;
    expressionValues[valueToken] = value;
    idx++;
  }

  if (expressionParts.length === 0) {
    // Nothing to update — just return the existing item
    return getItem(userId, sk);
  }

  const response = await client.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { PK: `USER#${userId}`, SK: sk },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    })
  );

  return response.Attributes;
}

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------

export async function deleteItem(userId, sk) {
  const client = getClient();

  const response = await client.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { PK: `USER#${userId}`, SK: sk },
      ReturnValues: 'ALL_OLD',
    })
  );

  return response.Attributes || null;
}

// ---------------------------------------------------------------------------
// batchWrite
// ---------------------------------------------------------------------------

/**
 * Write items in batches of 25 (DynamoDB limit).
 * Retries UnprocessedItems with exponential backoff.
 *
 * @param {string} table  - Table name (pass process.env.TABLE_NAME)
 * @param {Array}  operations - Array of { PutRequest: {...} } or { DeleteRequest: {...} }
 */
export async function batchWrite(table, operations) {
  const client = getClient();
  const MAX_RETRIES = 5;
  const CHUNK_SIZE = 25;

  // Split into chunks of 25
  const chunks = [];
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    chunks.push(operations.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    let requestItems = { [table]: chunk };
    let attempt = 0;

    while (Object.keys(requestItems).length > 0 && attempt < MAX_RETRIES) {
      const response = await client.send(
        new BatchWriteCommand({ RequestItems: requestItems })
      );

      const unprocessed = response.UnprocessedItems;
      if (!unprocessed || Object.keys(unprocessed).length === 0) {
        break;
      }

      // Exponential backoff: 100ms * random * attempt
      attempt++;
      const delay = 100 * Math.random() * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));

      requestItems = unprocessed;
    }

    if (attempt >= MAX_RETRIES && Object.keys(requestItems).length > 0) {
      throw new Error(
        `batchWrite failed after ${MAX_RETRIES} retries — unprocessed items remain`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// transactWrite
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around TransactWriteItems.
 *
 * @param {Array} operations - Array of transact item operations
 *   e.g. [{ Put: { TableName, Item } }, { Delete: { TableName, Key } }]
 */
export async function transactWrite(operations) {
  const client = getClient();

  await client.send(
    new TransactWriteCommand({
      TransactItems: operations,
    })
  );
}
