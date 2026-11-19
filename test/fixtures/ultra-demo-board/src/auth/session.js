// Synthetic fixture for Ultra demo board.
export function verifySession(req) {
  const token = req.headers['x-session-token'];
  if (!token || typeof token !== 'string') return null;
  if (!token.startsWith('sess_')) return null;
  return { userId: token.slice(5), role: req.headers['x-role-hint'] || 'member' };
}
