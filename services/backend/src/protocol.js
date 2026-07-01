const { CODEC_VERSION, isSupportedCodecVersion, normalizeTransportPayload } = require('./codec');
const { decodeProtobufFrame, encodeProtobufFrame, isLikelyJsonBuffer } = require('./protobuf');

function safeJsonParse(raw) {
  try {
    return { ok: true, value: JSON.parse(String(raw || '')) };
  } catch (err) {
    return { ok: false, error: 'MESSAGE_JSON_INVALID' };
  }
}

function normalizeEnvelope(raw) {
  let parsed;
  if (Buffer.isBuffer(raw) && !isLikelyJsonBuffer(raw)) {
    try {
      parsed = { ok: true, value: decodeProtobufFrame(raw), transport: 'protobuf' };
    } catch (err) {
      return { ok: false, error: 'PROTOBUF_DECODE_FAILED' };
    }
  } else {
    parsed = typeof raw === 'string' || Buffer.isBuffer(raw) ? safeJsonParse(raw) : { ok: true, value: raw };
  }
  if (!parsed.ok) return parsed;
  const msg = parsed.value || {};
  if (!msg.type || typeof msg.type !== 'string') return { ok: false, error: 'MESSAGE_TYPE_REQUIRED' };
  const codecVersion = typeof msg.codecVersion === 'number' ? msg.codecVersion : CODEC_VERSION;
  if (!isSupportedCodecVersion(codecVersion)) {
    return {
      ok: false,
      error: 'CODEC_VERSION_UNSUPPORTED',
      value: {
        type: msg.type,
        codecVersion,
        requestId: typeof msg.requestId === 'string' ? msg.requestId : '',
        roomId: typeof msg.roomId === 'string' ? msg.roomId : '',
      },
    };
  }
  let payload;
  try {
    payload = normalizeTransportPayload(msg.payload && typeof msg.payload === 'object' ? msg.payload : {});
  } catch (err) {
    return {
      ok: false,
      error: (err && err.code) || 'CODEC_VALUE_INVALID',
      value: {
        type: msg.type,
        codecVersion,
        requestId: typeof msg.requestId === 'string' ? msg.requestId : '',
        roomId: typeof msg.roomId === 'string' ? msg.roomId : '',
      },
    };
  }
  return {
    ok: true,
    value: {
      type: msg.type,
      codecVersion,
      requestId: typeof msg.requestId === 'string' ? msg.requestId : '',
      roomId: typeof msg.roomId === 'string' ? msg.roomId : '',
      version: typeof msg.version === 'number' ? msg.version : undefined,
      eventSeq: typeof msg.eventSeq === 'number' ? msg.eventSeq : undefined,
      payload,
      transport: parsed.transport || 'json',
    },
  };
}

function envelopeObject(type, fields = {}) {
  return {
    type,
    codecVersion: typeof fields.codecVersion === 'number' ? fields.codecVersion : CODEC_VERSION,
    requestId: fields.requestId || '',
    roomId: fields.roomId || '',
    version: typeof fields.version === 'number' ? fields.version : undefined,
    eventSeq: typeof fields.eventSeq === 'number' ? fields.eventSeq : undefined,
    ok: fields.ok !== false,
    error: fields.error || undefined,
    payload: fields.payload || {},
  };
}

function envelope(type, fields = {}) {
  return JSON.stringify(envelopeObject(type, fields));
}

function encodeEnvelope(type, fields = {}, options = {}) {
  const message = envelopeObject(type, fields);
  return options.protobuf ? encodeProtobufFrame(message) : JSON.stringify(message);
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
  CODEC_VERSION,
  encodeEnvelope,
  envelope,
  failure,
  normalizeEnvelope,
  success,
};
