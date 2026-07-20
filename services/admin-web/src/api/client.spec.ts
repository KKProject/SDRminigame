import { afterEach, describe, expect, it, vi } from 'vitest'

import { adminApi, setUnauthorizedHandler } from './client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('admin api client contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setUnauthorizedHandler(null)
  })

  it('sends the login payload to the existing endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      token: 'session-token',
      expiresAt: 10,
      admin: { username: 'operator', role: 'superadmin', enabled: true, defaultAdmin: true },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await adminApi.login('operator', 'test-password')

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/login', expect.objectContaining({ method: 'POST' }))
    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(options.body))).toEqual({ username: 'operator', password: 'test-password' })
  })

  it('adds the bearer token and preserves the status response shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      collections: [{ name: 'rooms', description: '房间', count: 2 }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await adminApi.status('secure-token')

    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('authorization')).toBe('Bearer secure-token')
    expect(result.collections[0]).toMatchObject({ name: 'rooms', count: 2 })
  })

  it('uses the unchanged clear and administrator endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, deleted: { rooms: 2 } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, admins: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, admin: { username: 'ops', role: 'admin' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, admin: { username: 'ops', enabled: false } }))
    vi.stubGlobal('fetch', fetchMock)

    await adminApi.clear('token', 'rooms', 'CLEAR')
    await adminApi.admins('token')
    await adminApi.createAdmin('token', { username: 'ops', password: 'test-pass', role: 'admin' })
    await adminApi.disableAdmin('token', 'ops')

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/admin/clear',
      '/api/admin/admins',
      '/api/admin/admins',
      '/api/admin/admins/disable',
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ collection: 'rooms', confirm: 'CLEAR' })
    expect(JSON.parse(String(fetchMock.mock.calls[3][1].body))).toEqual({ username: 'ops' })
  })

  it('clears the session through the unauthorized callback', async () => {
    const unauthorized = vi.fn()
    setUnauthorizedHandler(unauthorized)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401)))

    await expect(adminApi.me('expired')).rejects.toEqual(expect.objectContaining({
      code: 'ADMIN_UNAUTHORIZED',
      status: 401,
    }))
    expect(unauthorized).toHaveBeenCalledOnce()
  })
})
