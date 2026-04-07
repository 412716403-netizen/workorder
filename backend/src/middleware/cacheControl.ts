import type { RequestHandler } from 'express';

/**
 * Sets Cache-Control header for GET requests.
 * Responses are private (per-user) and cached for `maxAge` seconds.
 */
export function cacheControl(maxAge = 60): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', `private, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
    }
    next();
  };
}
