<script setup lang="ts">
import { Database, LogOut, Menu, ShieldCheck, Users, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const loggingOut = ref(false)

async function logout() {
  loggingOut.value = true
  try {
    await session.logout()
    await router.replace({ name: 'login' })
  } finally {
    loggingOut.value = false
  }
}

function navigate(name: string) {
  mobileOpen.value = false
  router.push({ name })
}
</script>

<template>
  <div class="app-shell">
    <button class="mobile-menu-button" type="button" aria-label="打开导航" @click="mobileOpen = true">
      <Menu :size="20" />
    </button>
    <div v-if="mobileOpen" class="sidebar-scrim" aria-hidden="true" @click="mobileOpen = false" />
    <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }">
      <div class="brand-row">
        <div class="brand-mark" aria-hidden="true">
          上
        </div>
        <div>
          <div class="brand-title">
            花牌管理台
          </div>
          <div class="brand-subtitle">
            OPERATIONS CONSOLE
          </div>
        </div>
        <button class="sidebar-close" type="button" aria-label="关闭导航" @click="mobileOpen = false">
          <X :size="20" />
        </button>
      </div>

      <nav class="sidebar-nav" aria-label="主导航">
        <button
          type="button"
          class="nav-item"
          :class="{ 'nav-item--active': route.name === 'dashboard' }"
          @click="navigate('dashboard')"
        >
          <Database :size="19" />
          <span>数据概览</span>
        </button>
        <button
          v-if="session.isSuperAdmin"
          type="button"
          class="nav-item"
          :class="{ 'nav-item--active': route.name === 'administrators' }"
          @click="navigate('administrators')"
        >
          <Users :size="19" />
          <span>管理员账号</span>
        </button>
      </nav>

      <div class="sidebar-account">
        <div class="account-avatar">
          <ShieldCheck :size="20" />
        </div>
        <div class="account-copy">
          <strong>{{ session.admin?.username }}</strong>
          <span>{{ session.isSuperAdmin ? '超级管理员' : '普通管理员' }}</span>
        </div>
        <button
          type="button"
          class="icon-button icon-button--dark"
          aria-label="退出登录"
          :disabled="loggingOut"
          @click="logout"
        >
          <LogOut :size="18" />
        </button>
      </div>
    </aside>

    <main class="workspace">
      <RouterView />
    </main>
  </div>
</template>
