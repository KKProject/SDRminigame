import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminApi, ApiError } from '@/api/client'
import AppLayout from '@/layouts/AppLayout.vue'
import { useSessionStore } from '@/stores/session'

import LoginView from './LoginView.vue'

function createTestContext(authenticated = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  if (authenticated) {
    session.token = 'token'
    session.admin = {
      username: 'owner', role: 'superadmin', enabled: true, defaultAdmin: true,
      createdAt: '', updatedAt: '', createdBy: 'system', lastLoginAt: '',
    }
    session.initialized = true
  }
  const router = createRouter({
    history: createMemoryHistory('/admin/'),
    routes: [
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      { path: '/rooms', name: 'rooms', component: { template: '<div />' } },
      { path: '/players', name: 'players', component: { template: '<div />' } },
      { path: '/administrators', name: 'administrators', component: { template: '<div />' } },
    ],
  })
  return { pinia, router, session }
}

describe('login and application layout', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps semantic labels and completes a successful login', async () => {
    const { pinia, router } = createTestContext()
    await router.push('/login')
    vi.spyOn(adminApi, 'login').mockResolvedValue({
      ok: true,
      token: 'token',
      expiresAt: 10,
      admin: { username: 'owner', role: 'superadmin', enabled: true, defaultAdmin: true, createdAt: '', updatedAt: '', createdBy: 'system', lastLoginAt: '' },
    })
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })

    expect(wrapper.find('label[for="username"]').exists()).toBe(true)
    expect(wrapper.find('label[for="password"]').exists()).toBe(true)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('test-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(adminApi.login).toHaveBeenCalledWith('owner', 'test-password')
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('announces login failures next to the form', async () => {
    const { pinia, router } = createTestContext()
    await router.push('/login')
    vi.spyOn(adminApi, 'login').mockRejectedValue(new ApiError('ADMIN_LOGIN_FAILED', 401))
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('owner')
    await inputs[1].setValue('wrong-pass')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('用户名或密码不正确')
    expect((inputs[0].element as HTMLInputElement).value).toBe('owner')
  })

  it('opens and closes mobile navigation without hiding superadmin links', async () => {
    const { pinia, router } = createTestContext(true)
    await router.push('/')
    const wrapper = mount(AppLayout, { global: { plugins: [pinia, router], stubs: { RouterView: true } } })

    expect(wrapper.text()).toContain('管理员账号')
    await wrapper.find('.mobile-menu-button').trigger('click')
    expect(wrapper.find('.sidebar').classes()).toContain('sidebar--open')
    const navItems = wrapper.findAll('button.nav-item')
    expect(navItems).toHaveLength(4)
    await navItems[3].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('administrators')
    await wrapper.find('.mobile-menu-button').trigger('click')
    await wrapper.find('.sidebar-close').trigger('click')
    expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--open')
  })
})
