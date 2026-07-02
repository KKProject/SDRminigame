import { BACKEND_API_BASE_URL } from './cloud';

const DIAGNOSTIC_ENDPOINT = `${String(BACKEND_API_BASE_URL || '').replace(/\/+$/, '')}/api/client-log`;
const MAX_EVENTS_PER_BATCH = 25;
const MAX_QUEUE_SIZE = 100;
const FLUSH_DELAY_MS = 500;

let queue = [];
let flushTimer = null;
let sequence = 0;

function createSessionId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `render-${Date.now().toString(36)}-${random}`;
}

export const CLIENT_DIAGNOSTIC_SESSION_ID = createSessionId();

function canSendDiagnostics() {
  return Boolean(
    DIAGNOSTIC_ENDPOINT
    && typeof wx !== 'undefined'
    && typeof wx.request === 'function'
  );
}

function scheduleFlush() {
  if (flushTimer || !canSendDiagnostics()) return;
  flushTimer = setTimeout(flushClientDiagnostics, FLUSH_DELAY_MS);
}

export function reportClientDiagnostic(event, detail = {}) {
  if (!canSendDiagnostics() || !event) return;
  queue.push({
    seq: ++sequence,
    event,
    at: Date.now(),
    detail,
  });
  if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
  scheduleFlush();
}

export function flushClientDiagnostics() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!canSendDiagnostics() || !queue.length) return;
  const events = queue.splice(0, MAX_EVENTS_PER_BATCH);
  wx.request({
    url: DIAGNOSTIC_ENDPOINT,
    method: 'POST',
    timeout: 5000,
    data: {
      sessionId: CLIENT_DIAGNOSTIC_SESSION_ID,
      source: 'wechat-minigame',
      events,
    },
    header: { 'content-type': 'application/json' },
    success: () => {
      if (queue.length) scheduleFlush();
    },
    fail: () => {},
  });
}
