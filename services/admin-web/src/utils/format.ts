/**
 * 统一的时间展示格式化。兼容两种时间戳来源：
 * - 管理员账号（adminUsers 集合）用 ISO 字符串（如 "2026-08-06T12:00:00.000Z"）
 * - 房间 / 玩家（rooms、users 集合）用 Date.now() 数字毫秒
 * `new Date(value)` 对两种输入都能正确解析。
 */
export function formatTime(value: string | number): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
