const crypto = require('crypto');

function base64UrlDecode(value) {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = input.length % 4 ? '='.repeat(4 - (input.length % 4)) : '';
  return Buffer.from(input + padding, 'base64').toString('utf8');
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signPayload(encodedPayload, secret) {
  return base64UrlEncode(crypto.createHmac('sha256', secret).update(encodedPayload).digest());
}

function verifySocketToken(token, options = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'TOKEN_MALFORMED' };
  const [encodedPayload, signature] = parts;
  const expected = signPayload(encodedPayload, options.secret || 'huapai-dev-socket-secret');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, error: 'TOKEN_SIGNATURE_INVALID' };
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (err) {
    return { ok: false, error: 'TOKEN_PAYLOAD_INVALID' };
  }
  const now = options.now || Date.now();
  if (!payload.openid) return { ok: false, error: 'TOKEN_OPENID_MISSING' };
  if (typeof payload.exp !== 'number' || payload.exp <= now) return { ok: false, error: 'TOKEN_EXPIRED' };
  if (options.openid && payload.openid !== options.openid) return { ok: false, error: 'TOKEN_OPENID_MISMATCH' };
  return { ok: true, openid: payload.openid, payload };
}

module.exports = {
  verifySocketToken,
};
