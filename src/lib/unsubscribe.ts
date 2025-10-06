import crypto from 'crypto';

const SECRET = process.env.UNSUBSCRIBE_SIGNING_SECRET ?? '';

export function sign(email: string, listKey: string) {
  return crypto.createHmac('sha256', SECRET)
    .update(`${email}:${listKey}`)
    .digest('base64url');
}

export function verify(email: string, listKey: string, token: string) {
  const expected = sign(email, listKey);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function generateUnsubscribeUrl(email: string, listKey = 'general') {
  const configured = (process.env.BASE_URL ?? '').trim();
  const baseUrlRaw = configured || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  const baseUrl = baseUrlRaw.replace(/\/$/, '');
  if (!baseUrl) throw new Error('BASE_URL not set');
  const token = sign(email, listKey);
  const qs = new URLSearchParams({ email, list: listKey, token });
  return `${baseUrl}/api/unsubscribe?${qs.toString()}`;
}
