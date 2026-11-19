// Synthetic fixture for Ultra demo board.
import { verifySession } from '../auth/session.js';

export function exportBundle(req) {
  const actor = verifySession(req);
  if (!actor) return { status: 401 };
  const archiveName = String(req.query.name || 'bundle.tar');
  return { status: 200, path: `/tmp/exports/${archiveName}`, actor };
}
