/**
 * Telemetry route handler.
 *
 * Receives batched telemetry events from the frontend, sanitises them,
 * and logs structured JSON to CloudWatch (which IS the storage layer).
 *
 * POST /api/telemetry  — body: { events: [...] }
 * No authentication required.
 */

const MAX_BATCH_SIZE = 50;

const ALLOWED_PROP_KEYS = new Set([
  "viewport",
  "deviceType",
  "theme",
  "itemCount",
  "assetCount",
  "liabilityCount",
  "snapshotCount",
  "currency",
  "ticker",
  "errorMessage",
  "errorStack",
  "duration",
  "category",
]);

const MAX_EVENT_NAME_LEN = 100;
const MAX_PAGE_LEN = 200;
const MAX_SID_LEN = 36;
const MAX_PROP_VALUE_LEN = 500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Truncate a string to `maxLen` characters. Returns empty string for
 * non-string input.
 */
function truncate(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

/**
 * Sanitise a single telemetry event object.
 */
function sanitizeEvent(raw) {
  const sanitized = {
    event: truncate(raw?.event, MAX_EVENT_NAME_LEN),
    page: truncate(raw?.page, MAX_PAGE_LEN),
    ts:
      typeof raw?.ts === "number" && Number.isFinite(raw.ts)
        ? raw.ts
        : Date.now(),
    sid: truncate(raw?.sid, MAX_SID_LEN),
  };

  // Sanitise props — keep only allowed keys, stringify & truncate values
  if (raw?.props && typeof raw.props === "object" && !Array.isArray(raw.props)) {
    const cleanProps = {};
    for (const key of Object.keys(raw.props)) {
      if (ALLOWED_PROP_KEYS.has(key)) {
        const val = raw.props[key];
        cleanProps[key] =
          typeof val === "string"
            ? truncate(val, MAX_PROP_VALUE_LEN)
            : truncate(String(val ?? ""), MAX_PROP_VALUE_LEN);
      }
    }
    sanitized.props = cleanProps;
  } else {
    sanitized.props = {};
  }

  return sanitized;
}

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @returns {Promise<{statusCode: number, headers?: Record<string,string>, body?: string}>}
 */
export async function handleTelemetry(event) {
  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  // Only accept POST
  if (event.requestContext?.http?.method !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Parse body
  let parsed;
  try {
    parsed = JSON.parse(event.body || "");
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain" },
      body: "Invalid JSON",
    };
  }

  // Validate events array
  if (!Array.isArray(parsed?.events) || parsed.events.length === 0) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "\"events\" must be a non-empty array",
      }),
    };
  }

  if (parsed.events.length > MAX_BATCH_SIZE) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `Batch too large — maximum ${MAX_BATCH_SIZE} events per request`,
      }),
    };
  }

  // Sanitise every event in the batch
  const sanitizedEvents = parsed.events.map(sanitizeEvent);

  // Log structured JSON to CloudWatch
  console.log(
    JSON.stringify({
      type: "telemetry_batch",
      count: sanitizedEvents.length,
      events: sanitizedEvents,
      sourceIp: event.requestContext?.http?.sourceIp || null,
      userAgent: event.headers?.["user-agent"] || null,
      receivedAt: new Date().toISOString(),
    })
  );

  // 204 No Content — nothing to return
  return { statusCode: 204, headers: CORS_HEADERS };
}
