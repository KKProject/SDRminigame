<script setup lang="ts">
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

const usernameError = computed(() => {
  if (!username.value) return '请输入用户名。'
  return /^[A-Za-z0-9_.-]{3,32}$/.test(username.value) ? '' : '用户名格式不正确。'
})
const passwordError = computed(() => password.value.length >= 6 ? '' : '密码至少需要 6 位。')
const canSubmit = computed(() => !usernameError.value && !passwordError.value && !submitting.value)

async function submit() {
  error.value = ''
  if (!canSubmit.value) return
  submitting.value = true
  try {
    await session.login(username.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'
    await router.replace(redirect)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '登录失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-story" aria-label="后台介绍">
      <div class="login-story__grid" aria-hidden="true" />
      <div class="login-brand">
        <span class="brand-mark brand-mark--large">上</span>
        <span>上大人花牌</span>
      </div>
      <div class="login-story__content">
        <span class="eyebrow eyebrow--dark"><ShieldCheck :size="15" /> 安全管理入口</span>
        <h1>让牌桌运行状态<br>始终清晰可控</h1>
        <p>集中查看权威房间数据、处理残留状态，并以明确的权限边界维护后台账号。</p>
      </div>
      <p class="login-story__foot">
        仅限授权维护人员使用
      </p>
    </section>

    <section class="login-panel">
      <form class="login-card" novalidate @submit.prevent="submit">
        <div class="login-card__heading">
          <span class="eyebrow">管理工作台</span>
          <h2>欢迎回来</h2>
          <p>请输入管理员账号继续。</p>
        </div>

        <div v-if="session.notice" class="inline-notice" role="status">
          {{ session.notice }}
        </div>
        <div v-if="error" class="inline-error" role="alert">
          {{ error }}
        </div>

        <div class="form-field">
          <label for="username">用户名</label>
          <ElInput
            id="username"
            v-model.trim="username"
            size="large"
            autocomplete="username"
            placeholder="请输入用户名"
          >
            <template #prefix>
              <UserRound :size="18" aria-hidden="true" />
            </template>
          </ElInput>
          <p v-if="username && usernameError" class="field-error">
            {{ usernameError }}
          </p>
        </div>

        <div class="form-field">
          <label for="password">密码</label>
          <ElInput
            id="password"
            v-model="password"
            size="large"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            show-password
          >
            <template #prefix>
              <LockKeyhole :size="18" aria-hidden="true" />
            </template>
          </ElInput>
          <p v-if="password && passwordError" class="field-error">
            {{ passwordError }}
          </p>
        </div>

        <ElButton
          class="login-submit"
          type="primary"
          size="large"
          native-type="submit"
          :loading="submitting"
          :disabled="!canSubmit"
        >
          登录后台
          <ArrowRight v-if="!submitting" :size="18" aria-hidden="true" />
        </ElButton>
        <p class="security-note">
          <ShieldCheck :size="15" /> 会话仅保留在当前浏览器标签页
        </p>
      </form>
    </section>
  </main>
</template>
