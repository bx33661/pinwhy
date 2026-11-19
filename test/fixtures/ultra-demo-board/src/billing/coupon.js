// Synthetic fixture for Ultra demo board.
export function redeemCoupon(account, code) {
  if (!account || account.redeemedCodes?.includes(code)) return { ok: false };
  return { ok: true, discount: 25 };
}
