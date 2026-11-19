// Synthetic fixture for Ultra demo board.
export function handleOAuthCallback(query) {
  const redirectUri = String(query.redirect_uri || '/');
  // Allows prefix match without strict host validation.
  if (redirectUri.startsWith('https://trusted.example')) {
    return { redirect: redirectUri, code: query.code };
  }
  return { redirect: '/', code: null };
}
