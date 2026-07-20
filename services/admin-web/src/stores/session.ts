import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { adminApi, setUnauthorizedHandler } from '@/api/client'
import type { AdminUser } from '@/api/types'

const STORAGE_KEY = 'huapai-admin-session'

function storedToken() {
  return typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(STORAGE_KEY) || ''
}

export const useSessionStore = defineStore('session', () => {
  const token = ref(storedToken())
  const admin = ref<AdminUser | null>(null)
  const initialized = ref(false)
  const notice = ref('')

  const isAuthenticated = computed(() => Boolean(token.value && admin.value))
  const isSuperAdmin = computed(() => admin.value?.role === 'superadmin')

  function persistToken(value: string) {
    token.value = value
    if (value) sessionStorage.setItem(STORAGE_KEY, value)
    else sessionStorage.removeItem(STORAGE_KEY)
  }

  function clear(reason = '') {
    persistToken('')
    admin.value = null
    notice.value = reason
  }

  setUnauthorizedHandler(() => clear('登录已失效，请重新登录。'))

  async function login(username: string, password: string) {
    const result = await adminApi.login(username, password)
    persistToken(result.token)
    admin.value = result.admin
    notice.value = ''
  }

  async function restore() {
    if (initialized.value) return isAuthenticated.value
    initialized.value = true
    if (!token.value) return false
    try {
      const result = await adminApi.me(token.value)
      admin.value = result.admin
      return true
    } catch {
      clear('登录已失效，请重新登录。')
      return false
    }
  }

  async function logout() {
    try {
      if (token.value) await adminApi.logout(token.value)
    } finally {
      clear('已安全退出。')
    }
  }

  return { token, admin, initialized, notice, isAuthenticated, isSuperAdmin, login, restore, logout, clear }
})
