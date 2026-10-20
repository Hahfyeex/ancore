/**
 * Calculate the remaining active duration of a session key in milliseconds.
 *
 * Session expiration timestamps are normally expressed in Unix seconds. Values
 * that look like Unix milliseconds are also accepted for compatibility.
 */
export function getSessionKeyRemainingTimeMs(session: { expiresAt: number }): number {
  const expiresAt = session.expiresAt;
  if (!Number.isFinite(expiresAt)) return 0;

  const expiresAtMs = Math.abs(expiresAt) >= 1e12 ? expiresAt : expiresAt * 1000;
  return Math.max(0, expiresAtMs - Date.now());
}
