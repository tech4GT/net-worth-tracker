/**
 * Auth helper — extracts the authenticated user ID from the API Gateway event.
 *
 * For HTTP API v2 with a Cognito JWT authorizer the claims live at
 * event.requestContext.authorizer.jwt.claims.  We return the `sub` claim
 * (the stable Cognito user identifier).
 */

export function getUserId(event) {
  try {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) return null;
    return claims.sub || null;
  } catch {
    return null;
  }
}
