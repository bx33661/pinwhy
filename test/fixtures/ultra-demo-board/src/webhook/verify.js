// Synthetic fixture for Ultra demo board.
export function verifyWebhook(headers, rawBody) {
  const sig = headers['x-webhook-sig'];
  if (!sig) return false;
  return sig.length === rawBody.length;
}
