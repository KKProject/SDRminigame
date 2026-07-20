<script setup lang="ts">
import { Plus, RefreshCw, RotateCcw, Shield, ShieldOff, UserPlus, Users } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'

import { adminApi, ApiError } from '@/api/client'
import type { AdminRole, AdminUser } from '@/api/types'
import DangerConfirmDialog from '@/components/DangerConfirmDialog.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const admins = ref<AdminUser[]>([])
const loading = ref(false)
const submitting = ref(false)
const disabling = ref(false)
const error = ref('')
const notice = ref('')
const dialogOpen = ref(false)
const targetAdmin = ref<AdminUser | null>(null)
const form = reactive({ username: '', password: '', role: 'admin' as AdminRole })

const formValid = computed(() => /^[A-Za-z0-9_.-]{3,32}$/.test(form.username.trim()) && form.password.length >= 6)

function formatTime(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function canDisable(admin: AdminUser) {
  return admin.enabled && !admin.defaultAdmin && admin.username !== session.admin?.username
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.admins(session.token)
    admins.value = result.admins
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '管理员列表读取失败。'
  } finally {
    loading.value = false
  }
}

async function createAdmin() {
  if (!formValid.value || submitting.value) return
  submitting.value = true
  error.value = ''
  notice.value = ''
  try {
    await adminApi.createAdmin(session.token, { username: form.username.trim(), password: form.password, role: form.role })
    notice.value = `管理员 ${form.username.trim()} 已创建。`
    form.username = ''
    form.password = ''
    form.role = 'admin'
    await refresh()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '创建管理员失败。'
  } finally {
    submitting.value = false
  }
}

function requestDisable(admin: AdminUser) {
  if (!canDisable(admin)) return
  targetAdmin.value = admin
  dialogOpen.value = true
  notice.value = ''
}

async function confirmDisable() {
  if (!targetAdmin.value || disabling.value) return
  disabling.value = true
  error.value = ''
  try {
    await adminApi.disableAdmin(session.token, targetAdmin.value.username)
    notice.value = `管理员 ${targetAdmin.value.username} 已禁用。`
    dialogOpen.value = false
    await refresh()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '禁用管理员失败。'
  } finally {
    disabling.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div>
        <span class="eyebrow">权限管理</span>
        <h1>管理员账号</h1>
        <p>创建和维护能够访问后台工作台的账号。</p>
      </div>
      <ElButton :loading="loading" @click="refresh">
        <RefreshCw :size="17" />刷新列表
      </ElButton>
    </header>

    <div v-if="error" class="inline-error inline-error--row" role="alert">
      <span>{{ error }}</span><button type="button" @click="refresh">
        <RotateCcw :size="15" />重试
      </button>
    </div>
    <div v-if="notice" class="inline-notice" role="status">
      {{ notice }}
    </div>

    <section class="content-card create-admin-card">
      <div class="card-heading">
        <div><h2><UserPlus :size="20" />新增管理员</h2><p>用户名创建后不可修改，请确认角色范围。</p></div>
      </div>
      <form class="admin-form" novalidate @submit.prevent="createAdmin">
        <div class="form-field">
          <label for="new-username">用户名</label>
          <ElInput id="new-username" v-model.trim="form.username" autocomplete="off" placeholder="3–32 位字母、数字或 _ . -" />
        </div>
        <div class="form-field">
          <label for="new-password">初始密码</label>
          <ElInput
            id="new-password"
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            show-password
            placeholder="至少 6 位"
          />
        </div>
        <div class="form-field">
          <label for="new-role">角色</label>
          <ElSelect id="new-role" v-model="form.role">
            <ElOption label="普通管理员" value="admin" />
            <ElOption label="超级管理员" value="superadmin" />
          </ElSelect>
        </div>
        <ElButton
          class="admin-form__submit"
          type="primary"
          native-type="submit"
          :loading="submitting"
          :disabled="!formValid"
        >
          <Plus :size="17" />创建账号
        </ElButton>
      </form>
    </section>

    <section class="content-card">
      <div class="card-heading">
        <div><h2><Users :size="20" />账号列表</h2><p>初始管理员和当前登录账号不能被禁用。</p></div>
        <span class="record-total">{{ admins.length }} 个账号</span>
      </div>
      <div class="table-scroll">
        <table class="data-table admin-table">
          <thead><tr><th>管理员</th><th>角色</th><th>状态</th><th>创建人</th><th>更新时间</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            <tr v-for="admin in admins" :key="admin.username">
              <td>
                <div class="admin-identity">
                  <span class="admin-identity__icon"><Shield :size="17" /></span>
                  <div><code>{{ admin.username }}</code><small v-if="admin.defaultAdmin">初始管理员</small><small v-else-if="admin.username === session.admin?.username">当前账号</small></div>
                </div>
              </td>
              <td><span class="role-badge" :class="{ 'role-badge--super': admin.role === 'superadmin' }">{{ admin.role === 'superadmin' ? '超级管理员' : '普通管理员' }}</span></td>
              <td><span class="status-dot" :class="{ 'status-dot--off': !admin.enabled }">{{ admin.enabled ? '启用' : '禁用' }}</span></td>
              <td>{{ admin.createdBy || '—' }}</td>
              <td>{{ formatTime(admin.updatedAt) }}</td>
              <td class="table-action">
                <ElButton type="danger" plain :disabled="!canDisable(admin)" @click="requestDisable(admin)">
                  <ShieldOff :size="15" />禁用
                </ElButton>
              </td>
            </tr>
            <tr v-if="!loading && !admins.length">
              <td colspan="6" class="empty-cell">
                暂无管理员数据。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <DangerConfirmDialog
      v-model="dialogOpen"
      title="禁用管理员"
      :description="`禁用后，${targetAdmin?.username || ''} 的现有会话将无法继续访问后台。`"
      :target="targetAdmin?.username"
      confirm-text="DISABLE"
      :loading="disabling"
      @confirm="confirmDisable"
    />
  </div>
</template>
