import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessionStore } from '@/stores/session'

import { installRouterGuards } from './index'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory('/admin/'),
    routes: [
      { path: '/login', name: 'login', component: { template: '<div />' }, meta: { public: true } },
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      { path: '/administrators', name: 'administrators', component: { template: '<div />' }, meta: { superadmin: true } },
    ],
  })
}

describe('router guards', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('redirects anonymous users to login', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const target = makeRouter()
    installRouterGuards(target, pinia)

    await target.push('/administrators')

    expect(target.currentRoute.value.name).toBe('login')
    expect(target.currentRoute.value.query.redirect).toBe('/administrators')
  })

  it('redirects regular administrators away from superadmin routes', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.token = 'token'
    session.admin = {
      username: 'regular', role: 'admin', enabled: true, defaultAdmin: false,
      createdAt: '', updatedAt: '', createdBy: '', lastLoginAt: '',
    }
    session.initialized = true
    const target = makeRouter()
    installRouterGuards(target, pinia)

    await target.push('/administrators')

    expect(target.currentRoute.value.name).toBe('dashboard')
  })
})
