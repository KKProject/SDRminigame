function safeJsonParse(raw) {
  try {
    return { ok: true, value: JSON.parse(String(raw || '')) };
  } catch (err) {
    return { ok: false, error: 'MESSAGE_JSON_INVALID' };
  }
}

function normalizeEnvelope(raw) {
  const parsed = typeof raw === 'string' || Buffer.isBuffer(raw) ? safeJsonParse(raw) : { ok: true, value: raw };
  if (!parsed.ok) return parsed;
  const msg = parsed.value || {};
  if (!msg.type || typeof msg.type !== 'string') return { ok: false, error: 'MESSAGE_TYPE_REQUIRED' };
  return {
    ok: true,
    value: {
      type: msg.type,
      requestId: typeof msg.requestId === 'string' ? msg.requestId : '',
      roomId: typeof msg.roomId === 'string' ? msg.roomId : '',
      version: typeof msg.version === 'number' ? msg.version : undefined,
      eventSeq: typeof msg.eventSeq === 'number' ? msg.eventSeq : undefined,
      payload: msg.payload && typeof msg.payload === 'object' ? msg.payload : {},
    },
  };
}

function envelope(type, fields = {}) {
  return JSON.stringify({
    type,
    requestId: fields.requestId || '',
    roomId: fields.roomId || '',
    version: typeof fields.version === 'number' ? fields.version : undefined,
    eventSeq: typeof fields.eventSeq === 'number' ? fields.eventSeq : undefined,
    ok: fields.ok !== false,
    error: fields.error || undefined,
    payload: fields.payload || {},
  });
}

function success(type, request, payload = {}, extra = {}) {
  return envelope(type, Object.assign({}, extra, {
    requestId: request && request.requestId,
    roomId: (request && request.roomId) || extra.roomId,
    payload,
  }));
}

function failure(type, request, error, extra = {}) {
  return envelope(type, Object.assign({}, extra, {
    ok: false,
    requestId: request && request.requestId,
    roomId: (request && request.roomId) || extra.roomId,
    error,
  }));
}

module.exports = {
  envelope,
  failure,
  normalizeEnvelope,
  success,
};
