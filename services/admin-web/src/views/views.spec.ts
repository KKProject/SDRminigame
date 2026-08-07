import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminApi, ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

import AdminUsersView from './AdminUsersView.vue'
import DashboardView from './DashboardView.vue'
import PlayersView from './PlayersView.vue'
import RoomsView from './RoomsView.vue'

function sampleRoom(overrides: Partial<import('@/api/types').RoomSummary> = {}): import('@/api/types').RoomSummary {
  return {
    roomId: '100001',
    status: 'waiting',
    seatCount: 4,
    hostOpenid: 'openid-a',
    players: [{ seat: 0, openid: 'openid-a', nickName: '房主甲', avatarUrl: '' }],
    settings: { maxRounds: 2, repeatRound: false, washTwice: false, payType: 'pihu' },
    tableScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    tableStats: { completedRounds: 0, winRounds: { 0: 0, 1: 0, 2: 0, 3: 0 }, lastAppliedResultKey: '' },
    version: 0,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  }
}

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

  it('renders room detail rows and disables force-close for already-closed rooms', async () => {
    vi.spyOn(adminApi, 'rooms').mockResolvedValue({
      ok: true,
      rooms: [
        sampleRoom(),
        sampleRoom({ roomId: '100002', status: 'closed', hostOpenid: 'openid-b', players: [] }),
      ],
    })
    const wrapper = mount(RoomsView, { global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    expect(wrapper.text()).toContain('100001')
    expect(wrapper.text()).toContain('等待中')
    expect(wrapper.text()).toContain('房主甲')
    const closeButtons = wrapper.findAll('.rooms-table .el-button--danger')
    expect(closeButtons[0].attributes('disabled')).toBeUndefined()
    expect(closeButtons[1].attributes('disabled')).toBeDefined()
  })

  it('force-closes a room only after typing the confirmation text', async () => {
    vi.spyOn(adminApi, 'rooms').mockResolvedValue({ ok: true, rooms: [sampleRoom()] })
    const closeSpy = vi.spyOn(adminApi, 'closeRoom').mockResolvedValue({
      ok: true,
      room: sampleRoom({ status: 'closed', players: [] }),
    })
    const wrapper = mount(RoomsView, { attachTo: document.body, global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    await wrapper.find('.rooms-table .el-button--danger').trigger('click')
    await wrapper.vm.$nextTick()
    const input = document.body.querySelector<HTMLInputElement>('.el-dialog .el-input__inner')
    expect(input).not.toBeNull()
    expect(closeSpy).not.toHaveBeenCalled()

    input!.value = 'CLOSE'
    input!.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    document.body.querySelector<HTMLButtonElement>('.el-dialog .el-button--danger')!.click()
    await flushPromises()

    expect(closeSpy).toHaveBeenCalledWith('token', '100001')
    wrapper.unmount()
  })

  it('renders player rows and reveals the full openid in the detail dialog', async () => {
    vi.spyOn(adminApi, 'players').mockResolvedValue({
      ok: true,
      users: [
        { openid: 'openid-aaaaaaaaaaaaaaaaaaaa', nickName: '玩家甲', avatarUrl: '', totalScore: 42, createdAt: 1000, lastLoginAt: 5000 },
      ],
    })
    const wrapper = mount(PlayersView, { attachTo: document.body, global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    expect(wrapper.text()).toContain('玩家甲')
    expect(wrapper.text()).toContain('42')

    await wrapper.find('.players-table .el-button').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.el-dialog')?.textContent).toContain('openid-aaaaaaaaaaaaaaaaaaaa')
    wrapper.unmount()
  })

  it('deletes a player from the detail dialog only after typing the confirmation text', async () => {
    vi.spyOn(adminApi, 'players').mockResolvedValue({
      ok: true,
      users: [
        { openid: 'openid-aaaaaaaaaaaaaaaaaaaa', nickName: '玩家甲', avatarUrl: '', totalScore: 42, createdAt: 1000, lastLoginAt: 5000 },
      ],
    })
    const deleteSpy = vi.spyOn(adminApi, 'deletePlayers').mockResolvedValue({ ok: true, deleted: ['openid-aaaaaaaaaaaaaaaaaaaa'], notFound: [] })
    const wrapper = mount(PlayersView, { attachTo: document.body, global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    await wrapper.find('.players-table .el-button').trigger('click')
    await wrapper.vm.$nextTick()
    const dialogByTitle = (title: string) => Array.from(document.body.querySelectorAll('.el-dialog'))
      .find((el) => el.querySelector('.el-dialog__title')?.textContent === title)

    const detailDialog = dialogByTitle('玩家详情')
    expect(detailDialog).toBeTruthy()
    detailDialog!.querySelector<HTMLButtonElement>('.el-button--danger')!.click()
    await wrapper.vm.$nextTick()

    const confirmDialog = dialogByTitle('删除玩家')
    expect(confirmDialog).toBeTruthy()
    const input = confirmDialog!.querySelector<HTMLInputElement>('.el-input__inner')
    expect(input).not.toBeNull()
    expect(deleteSpy).not.toHaveBeenCalled()

    input!.value = 'DELETE'
    input!.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    confirmDialog!.querySelector<HTMLButtonElement>('.el-button--danger')!.click()
    await flushPromises()

    expect(deleteSpy).toHaveBeenCalledWith('token', ['openid-aaaaaaaaaaaaaaaaaaaa'])
    expect(wrapper.find('.players-table').text()).not.toContain('玩家甲')
    expect(wrapper.find('.players-table').text()).toContain('暂无玩家数据')
    wrapper.unmount()
  })

  it('deletes multiple players at once via row checkboxes and the batch-delete button', async () => {
    vi.spyOn(adminApi, 'players').mockResolvedValue({
      ok: true,
      users: [
        { openid: 'openid-a', nickName: '玩家甲', avatarUrl: '', totalScore: 1, createdAt: 1000, lastLoginAt: 5000 },
        { openid: 'openid-b', nickName: '玩家乙', avatarUrl: '', totalScore: 2, createdAt: 1000, lastLoginAt: 4000 },
        { openid: 'openid-c', nickName: '玩家丙', avatarUrl: '', totalScore: 3, createdAt: 1000, lastLoginAt: 3000 },
      ],
    })
    const deleteSpy = vi.spyOn(adminApi, 'deletePlayers').mockResolvedValue({ ok: true, deleted: ['openid-a', 'openid-b'], notFound: [] })
    const wrapper = mount(PlayersView, { attachTo: document.body, global: { plugins: [authenticatedPinia()] } })
    await flushPromises()

    const batchButton = () => wrapper.findAll('.filter-row .el-button--danger')[0]
    expect(batchButton().attributes('disabled')).toBeDefined()

    const rowCheckboxes = wrapper.findAll('.players-table tbody .select-cell input[type="checkbox"]')
    await rowCheckboxes[0].setValue(true)
    await rowCheckboxes[1].setValue(true)
    expect(wrapper.text()).toContain('已选择 2 位')
    expect(batchButton().attributes('disabled')).toBeUndefined()

    await batchButton().trigger('click')
    await wrapper.vm.$nextTick()
    const confirmDialog = Array.from(document.body.querySelectorAll('.el-dialog'))
      .find((el) => el.querySelector('.el-dialog__title')?.textContent === '删除玩家')
    expect(confirmDialog).toBeTruthy()
    expect(confirmDialog!.textContent).toContain('选中的 2 位玩家')

    const input = confirmDialog!.querySelector<HTMLInputElement>('.el-input__inner')
    input!.value = 'DELETE'
    input!.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    confirmDialog!.querySelector<HTMLButtonElement>('.el-button--danger')!.click()
    await flushPromises()

    expect(deleteSpy).toHaveBeenCalledWith('token', ['openid-a', 'openid-b'])
    expect(wrapper.find('.players-table').text()).not.toContain('玩家甲')
    expect(wrapper.find('.players-table').text()).not.toContain('玩家乙')
    expect(wrapper.find('.players-table').text()).toContain('玩家丙')
    wrapper.unmount()
  })
})
