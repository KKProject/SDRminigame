import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DangerConfirmDialog from './DangerConfirmDialog.vue'

describe('DangerConfirmDialog', () => {
  it('requires the exact confirmation text before emitting', async () => {
    const wrapper = mount(DangerConfirmDialog, {
      attachTo: document.body,
      props: {
        modelValue: true,
        title: '确认清空',
        description: '此操作不可撤销',
        target: 'rooms',
        confirmText: 'CLEAR',
      },
    })
    await flushPromises()

    const input = document.body.querySelector<HTMLInputElement>('.el-dialog .el-input__inner')
    expect(input).not.toBeNull()
    input!.value = 'WRONG'
    input!.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector<HTMLButtonElement>('.el-button--danger')?.disabled).toBe(true)

    input!.value = 'CLEAR'
    input!.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    const confirm = document.body.querySelector<HTMLButtonElement>('.el-button--danger')!
    expect(confirm.disabled).toBe(false)
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('prevents submission while loading', async () => {
    const wrapper = mount(DangerConfirmDialog, {
      attachTo: document.body,
      props: {
        modelValue: true,
        title: '确认',
        description: '说明',
        confirmText: 'DISABLE',
        loading: true,
      },
    })
    await flushPromises()
    expect(document.body.querySelector<HTMLButtonElement>('.el-dialog .el-button--danger')?.disabled).toBe(true)
    wrapper.unmount()
  })
})
