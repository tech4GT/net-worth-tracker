/**
 * Yahoo Finance proxy route handler.
 *
 * Proxied paths (frontend prefixes them with /api/yahoo/):
 *   GET /api/yahoo/v8/finance/chart/{ticker}?interval=1d&range=1d
 *   GET /api/yahoo/v1/finance/search?q={query}&quotesCount=12&newsCount=0&listsCount=0
 *
 * Uses Node 20 native fetch — no external dependencies.
 */

const YAHOO_BASE = "https://query1.finance.yahoo.com";
const PROXY_PREFIX = "/api/yahoo/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * @param {import("aws-lambda").APIGatewayProxyEventV2} event
 * @returns {Promise<{statusCode: number, headers: Record<string,string>, body: string}>}
 */
export async function handleYahooProxy(event) {
  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  // Only allow GET
  if (event.requestContext?.http?.method !== "GET") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const rawPath = event.rawPath || "";
  const prefixIndex = rawPath.indexOf(PROXY_PREFIX);

  if (prefixIndex === -1) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid proxy path" }),
    };
  }

  // Everything after /api/yahoo/ is the Yahoo Finance path
  const yahooPath = rawPath.slice(prefixIndex + PROXY_PREFIX.length);

  if (!yahooPath) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing Yahoo Finance path" }),
    };
  }

  const queryString = event.rawQueryString || "";
  const targetUrl = queryString
    ? `${YAHOO_BASE}/${yahooPath}?${queryString}`
    : `${YAHOO_BASE}/${yahooPath}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    const body = await response.text();
    const contentType =
      response.headers.get("content-type") || "application/json";

    return {
      statusCode: response.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60",
      },
      body,
    };
  } catch (err) {
    console.error("Yahoo proxy fetch error:", err);

    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to fetch from Yahoo Finance",
        message: err?.message || "Unknown error",
      }),
    };
  }
}
