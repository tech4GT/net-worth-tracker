/**
 * Net Worth Tracker — Lambda route dispatcher.
 *
 * Single Lambda function that handles all API routes.
 * Uses API Gateway HTTP API v2 payload format.
 * Cognito JWT authorizer passes claims via requestContext.
 */

import { getUserId } from './lib/auth.mjs';

// Route handlers — imported from ./routes/*.mjs
import { handleGetState } from './routes/state.mjs';
import { handleCreateItem, handleUpdateItem, handleDeleteItem, handleBatchCreateItems, handleBatchUpdateItems } from './routes/items.mjs';
import { handleCreateCategory, handleUpdateCategory, handleDeleteCategory } from './routes/categories.mjs';
import { handleCreateSnapshot, handleGetSnapshotItems, handleDeleteSnapshot } from './routes/snapshots.mjs';
import { handleUpdateSettings } from './routes/settings.mjs';
import { handleImport } from './routes/import.mjs';
import { handleYahooProxy } from './routes/yahoo-proxy.mjs';
import { handleTelemetry } from './routes/telemetry.mjs';

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler(event) {
  try {
    const { method, path } = event.requestContext.http;
    const rawPath = event.rawPath || path;

    // -----------------------------------------------------------------------
    // POST /api/telemetry — no auth required
    // -----------------------------------------------------------------------
    if (method === 'POST' && rawPath === '/api/telemetry') {
      return await handleTelemetry(event);
    }

    // -----------------------------------------------------------------------
    // All other routes require authentication
    // -----------------------------------------------------------------------
    const userId = getUserId(event);
    if (!userId) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    // -----------------------------------------------------------------------
    // Route matching
    // -----------------------------------------------------------------------

    // GET /api/state
    if (method === 'GET' && rawPath === '/api/state') {
      return await handleGetState(event, userId);
    }

    // POST /api/items/batch  (must be checked before POST /api/items)
    if (method === 'POST' && rawPath === '/api/items/batch') {
      return await handleBatchCreateItems(event, userId);
    }

    // PUT /api/items/batch  (must be checked before PUT /api/items/{id})
    if (method === 'PUT' && rawPath === '/api/items/batch') {
      return await handleBatchUpdateItems(event, userId);
    }

    // POST /api/items
    if (method === 'POST' && rawPath === '/api/items') {
      return await handleCreateItem(event, userId);
    }

    // PUT /api/items/{id}
    if (method === 'PUT' && rawPath.match(/^\/api\/items\/[^/]+$/)) {
      return await handleUpdateItem(event, userId);
    }

    // DELETE /api/items/{id}
    if (method === 'DELETE' && rawPath.match(/^\/api\/items\/[^/]+$/)) {
      return await handleDeleteItem(event, userId);
    }

    // POST /api/categories
    if (method === 'POST' && rawPath === '/api/categories') {
      return await handleCreateCategory(event, userId);
    }

    // PUT /api/categories/{id}
    if (method === 'PUT' && rawPath.match(/^\/api\/categories\/[^/]+$/)) {
      return await handleUpdateCategory(event, userId);
    }

    // DELETE /api/categories/{id}
    if (method === 'DELETE' && rawPath.match(/^\/api\/categories\/[^/]+$/)) {
      return await handleDeleteCategory(event, userId);
    }

    // POST /api/snapshots
    if (method === 'POST' && rawPath === '/api/snapshots') {
      return await handleCreateSnapshot(event, userId);
    }

    // GET /api/snapshots/{date}/items
    if (method === 'GET' && rawPath.match(/^\/api\/snapshots\/[^/]+\/items$/)) {
      return await handleGetSnapshotItems(event, userId);
    }

    // DELETE /api/snapshots/{date}
    if (method === 'DELETE' && rawPath.match(/^\/api\/snapshots\/[^/]+$/)) {
      return await handleDeleteSnapshot(event, userId);
    }

    // PUT /api/settings
    if (method === 'PUT' && rawPath === '/api/settings') {
      return await handleUpdateSettings(event, userId);
    }

    // POST /api/import
    if (method === 'POST' && rawPath === '/api/import') {
      return await handleImport(event, userId);
    }

    // GET /api/yahoo/{proxy+}
    if (method === 'GET' && rawPath.startsWith('/api/yahoo/')) {
      return await handleYahooProxy(event);
    }

    // -----------------------------------------------------------------------
    // 404 — no matching route
    // -----------------------------------------------------------------------
    return jsonResponse(404, { error: 'Not found' });
  } catch (err) {
    // Structured error logging for CloudWatch / observability
    console.error(
      JSON.stringify({
        level: 'ERROR',
        message: 'Unhandled exception in route dispatcher',
        error: err.message,
        stack: err.stack,
        requestId: event?.requestContext?.requestId,
        path: event?.rawPath,
        method: event?.requestContext?.http?.method,
      })
    );

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
}
