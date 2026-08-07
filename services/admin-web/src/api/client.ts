import { readonly, ref } from 'vue'

import type {
  AdminResponse,
  AdminRole,
  AdminsResponse,
  ApiFailure,
  ClearResponse,
  LoginResponse,
  MeResponse,
  PlayerDeleteResponse,
  PlayersResponse,
  RoomCloseResponse,
  RoomsResponse,
  StatusResponse,
} from './types'

const pendingCount = ref(0)
let unauthorizedHandler: (() => void) | null = null

const errorMessages: Record<string, string> = {
  ADMIN_LOGIN_FAILED: '用户名或密码不正确。',
  ADMIN_UNAUTHORIZED: '登录已失效，请重新登录。',
  ADMIN_FORBIDDEN: '当前账号没有执行此操作的权限。',
  ADMIN_ALREADY_EXISTS: '该用户名已经存在。',
  ADMIN_DEFAULT_CANNOT_DISABLE: '初始管理员受到保护，不能禁用。',
  ADMIN_SELF_CANNOT_DISABLE: '不能禁用当前登录账号。',
  ADMIN_NOT_FOUND: '管理员不存在。',
  ADMIN_USERNAME_INVALID: '用户名需为 3–32 位字母、数字、点、短横线或下划线。',
  ADMIN_PASSWORD_INVALID: '密码长度需为 6–128 位。',
  ADMIN_CONFIRM_REQUIRED: '确认文本不匹配。',
  ADMIN_ROOM_ID_REQUIRED: '请提供房间号。',
  ADMIN_ROOM_NOT_FOUND: '未找到该房间。',
  ADMIN_USER_ID_REQUIRED: '请提供玩家 openid。',
  ADMIN_USER_NOT_FOUND: '未找到该玩家。',
  REQUEST_FAILED: '请求失败，请稍后重试。',
  BAD_JSON: '服务返回了无法识别的数据。',
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status = 0, message?: string) {
    super(errorMessages[code] || message || errorMessages.REQUEST_FAILED)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export const apiPending = readonly(pendingCount)

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

async function request<T extends { ok: true }>(path: string, token = '', options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (options.body) headers.set('content-type', 'application/json')

  pendingCount.value += 1
  try {
    const response = await fetch(path, { ...options, headers })
    const data = await response.json().catch(() => ({ ok: false, error: 'BAD_JSON' })) as T | ApiFailure
    if (!response.ok || !('ok' in data) || !data.ok) {
      const failure = data as ApiFailure
      if (response.status === 401) unauthorizedHandler?.()
      throw new ApiError(failure.error || 'REQUEST_FAILED', response.status, failure.message)
    }
    return data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('REQUEST_FAILED', 0, error instanceof Error ? error.message : undefined)
  } finally {
    pendingCount.value -= 1
  }
}

export const adminApi = {
  login(username: string, password: string) {
    return request<LoginResponse>('/api/admin/login', '', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },
  me(token: string) {
    return request<MeResponse>('/api/admin/me', token)
  },
  logout(token: string) {
    return request<{ ok: true }>('/api/admin/logout', token, { method: 'POST' })
  },
  status(token: string) {
    return request<StatusResponse>('/api/admin/status', token)
  },
  clear(token: string, collection: string, confirm: string) {
    return request<ClearResponse>('/api/admin/clear', token, {
      method: 'POST',
      body: JSON.stringify({ collection, confirm }),
    })
  },
  admins(token: string) {
    return request<AdminsResponse>('/api/admin/admins', token)
  },
  createAdmin(token: string, input: { username: string; password: string; role: AdminRole }) {
    return request<AdminResponse>('/api/admin/admins', token, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  disableAdmin(token: string, username: string) {
    return request<AdminResponse>('/api/admin/admins/disable', token, {
      method: 'POST',
      body: JSON.stringify({ username }),
    })
  },
  rooms(token: string) {
    return request<RoomsResponse>('/api/admin/rooms', token)
  },
  closeRoom(token: string, roomId: string) {
    return request<RoomCloseResponse>('/api/admin/rooms/close', token, {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    })
  },
  players(token: string) {
    return request<PlayersResponse>('/api/admin/users', token)
  },
  deletePlayers(token: string, openids: string[]) {
    return request<PlayerDeleteResponse>('/api/admin/users/delete', token, {
      method: 'POST',
      body: JSON.stringify({ openids }),
    })
  },
}
