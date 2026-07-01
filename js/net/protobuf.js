const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function encodeUtf8(value) {
  const text = String(value || '');
  if (textEncoder) return Array.from(textEncoder.encode(text));
  const encoded = unescape(encodeURIComponent(text));
  const bytes = [];
  for (let i = 0; i < encoded.length; i += 1) bytes.push(encoded.charCodeAt(i));
  return bytes;
}

function decodeUtf8(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (textDecoder) return textDecoder.decode(array);
  let text = '';
  array.forEach((byte) => { text += String.fromCharCode(byte); });
  return decodeURIComponent(escape(text));
}

function writeVarint(output, value) {
  let next = Number(value) >>> 0;
  while (next > 127) {
    output.push((next & 127) | 128);
    next >>>= 7;
  }
  output.push(next);
}

function readVarint(bytes, cursor) {
  let value = 0;
  let shift = 0;
  let index = cursor.index;
  while (index < bytes.length) {
    const byte = bytes[index];
    value |= (byte & 127) << shift;
    index += 1;
    if (!(byte & 128)) {
      cursor.index = index;
      return value >>> 0;
    }
    shift += 7;
  }
  throw new Error('PROTOBUF_VARINT_TRUNCATED');
}

function writeString(output, field, value) {
  if (value === undefined || value === null || value === '') return;
  const bytes = encodeUtf8(value);
  writeVarint(output, (field << 3) | 2);
  writeVarint(output, bytes.length);
  output.push(...bytes);
}

function writeUint(output, field, value) {
  if (typeof value !== 'number') return;
  writeVarint(output, field << 3);
  writeVarint(output, value);
}

function writeBool(output, field, value) {
  if (typeof value !== 'boolean') return;
  writeVarint(output, field << 3);
  writeVarint(output, value ? 1 : 0);
}

export function encodeProtobufFrame(message = {}) {
  const output = [];
  writeString(output, 1, message.type);
  writeUint(output, 2, message.codecVersion);
  writeString(output, 3, message.requestId);
  writeString(output, 4, message.roomId);
  writeUint(output, 5, message.version);
  writeUint(output, 6, message.eventSeq);
  writeBool(output, 7, message.ok !== false);
  writeString(output, 8, message.error);
  writeString(output, 15, JSON.stringify(message.payload || {}));
  return new Uint8Array(output).buffer;
}

export function decodeProtobufFrame(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data || []);
  const cursor = { index: 0 };
  const message = { payload: {} };
  while (cursor.index < bytes.length) {
    const tag = readVarint(bytes, cursor);
    const field = tag >>> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      const value = readVarint(bytes, cursor);
      if (field === 2) message.codecVersion = value;
      else if (field === 5) message.version = value;
      else if (field === 6) message.eventSeq = value;
      else if (field === 7) message.ok = Boolean(value);
    } else if (wireType === 2) {
      const length = readVarint(bytes, cursor);
      const end = cursor.index + length;
      if (end > bytes.length) throw new Error('PROTOBUF_LENGTH_TRUNCATED');
      const value = decodeUtf8(bytes.slice(cursor.index, end));
      cursor.index = end;
      if (field === 1) message.type = value;
      else if (field === 3) message.requestId = value;
      else if (field === 4) message.roomId = value;
      else if (field === 8) message.error = value;
      else if (field === 15) message.payload = JSON.parse(value || '{}');
    } else {
      throw new Error('PROTOBUF_WIRE_TYPE_UNSUPPORTED');
    }
  }
  return message;
}

export function isBinaryFrame(data) {
  return data instanceof ArrayBuffer || ArrayBuffer.isView(data);
}
