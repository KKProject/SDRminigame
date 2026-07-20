import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminApi, ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

import AdminUsersView from './AdminUsersView.vue'
import DashboardView from './DashboardView.vue'

function authenticatedPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.token = 'token'
  session.admin = {
    username: 'owner', role: 'superadmin', enabled: true, defaultAdmin: true,
    createdAt: '', updatedAt: '', createdBy: 'system', lastLoginAt: '',
  }
  session.initialized = true
  return pinia
}

describe('management views', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders collection counts and exposes disabled clear for empty collections', async () => {
    vi.spyOn(adminApi, 'status').mockResolvedValue({
      ok: true,
      collections: [
        { name: 'rooms', description: '权威房间', count: 2 },
        { name: 'roomStates', description: '公共快照', count: 0 },
        { name: 'matchQueue', description: '匹配队列', count: 1 },
      ],
    })
    const wrapper = mount(DashboardView, { global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    expect(wrapper.text()).toContain('rooms')
    expect(wrapper.text()).toContain('合计 3 条')
    const clearButtons = wrapper.findAll('.data-table .el-button--danger')
    expect(clearButtons[1].attributes('disabled')).toBeDefined()
  })

  it('shows a recoverable dashboard error', async () => {
    vi.spyOn(adminApi, 'status').mockRejectedValue(new ApiError('REQUEST_FAILED'))
    const wrapper = mount(DashboardView, { global: { plugins: [authenticatedPinia()] } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('请求失败')
    expect(wrapper.find('[role="alert"] button').text()).toContain('重试')
  })

  it('protects the initial and current administrators from disable actions', async () => {
    vi.spyOn(adminApi, 'admins').mockResolvedValue({
      ok: true,
      admins: [
        { username: 'owner', role: 'superadmin', enabled: true, defaultAdmin: true, createdAt: '', updatedAt: '', createdBy: 'system', lastLoginAt: '' },
        { username: 'ops', role: 'admin', enabled: true, defaultAdmin: false, createdAt: '', updatedAt: '', createdBy: 'owner', lastLoginAt: '' },
      ],
    })
    const wrapper = mount(AdminUsersView, { global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    const buttons = wrapper.findAll('.admin-table .el-button--danger')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].attributes('disabled')).toBeUndefined()
  })
})
