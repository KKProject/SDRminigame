import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminApi } from '@/api/client'
import type { AdminUser } from '@/api/types'

import { useSessionStore } from './session'

const admin: AdminUser = {
  username: 'operator',
  role: 'superadmin',
  enabled: true,
  defaultAdmin: true,
  createdAt: '',
  updatedAt: '',
  createdBy: 'system',
  lastLoginAt: '',
}

describe('session store', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('stores a successful login only in sessionStorage', async () => {
    vi.spyOn(adminApi, 'login').mockResolvedValue({ ok: true, token: 'token', expiresAt: 10, admin })
    const store = useSessionStore()

    await store.login('operator', 'test-password')

    expect(store.admin).toEqual(admin)
    expect(store.isSuperAdmin).toBe(true)
    expect(sessionStorage.getItem('huapai-admin-session')).toBe('token')
  })

  it('restores a valid session from /api/admin/me', async () => {
    sessionStorage.setItem('huapai-admin-session', 'saved-token')
    vi.spyOn(adminApi, 'me').mockResolvedValue({ ok: true, admin })
    const store = useSessionStore()

    await expect(store.restore()).resolves.toBe(true)
    expect(adminApi.me).toHaveBeenCalledWith('saved-token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('clears an invalid restored session', async () => {
    sessionStorage.setItem('huapai-admin-session', 'expired-token')
    vi.spyOn(adminApi, 'me').mockRejectedValue(new Error('expired'))
    const store = useSessionStore()

    await expect(store.restore()).resolves.toBe(false)
    expect(store.token).toBe('')
    expect(store.notice).toContain('登录已失效')
  })
})
