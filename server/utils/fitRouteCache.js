/**
 * Shared server-side route cache for FIT training endpoints.
 * Exported so both fitUploadRoute.js and controllers can invalidate it
 * after mutations (upload, lactate session completion, etc.).
 */
const NodeCache = require('node-cache');

const fitRouteCache = new NodeCache({
  stdTTL: 300,     // 5-minute TTL
  maxKeys: 400,
  useClones: false
});

/**
 * Invalidate all cached FIT training responses for a specific user.
 * Call this after any write that creates or modifies FitTraining documents.
 */
function invalidateFitCacheForUser(userId) {
  if (!userId) {
    fitRouteCache.flushAll();
    return;
  }
  const prefix = String(userId) + ':';
  const keys = fitRouteCache.keys().filter(k => k.startsWith(prefix));
  if (keys.length) fitRouteCache.del(keys);
}

module.exports = { fitRouteCache, invalidateFitCacheForUser };
