<script setup lang="ts">
import { AlertTriangle, Database, Layers3, RefreshCw, RotateCcw, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { adminApi, ApiError } from '@/api/client'
import type { CollectionStatus } from '@/api/types'
import DangerConfirmDialog from '@/components/DangerConfirmDialog.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const collections = ref<CollectionStatus[]>([])
const loading = ref(false)
const clearing = ref(false)
const error = ref('')
const notice = ref('')
const dialogOpen = ref(false)
const clearTarget = ref<CollectionStatus | null>(null)
const clearAll = ref(false)

const total = computed(() => collections.value.reduce((sum, item) => sum + item.count, 0))
const dialogTarget = computed(() => clearAll.value ? collections.value.map((item) => item.name).join('、') : clearTarget.value?.name || '')
const dialogDescription = computed(() => clearAll.value
  ? `将永久删除全部房间相关数据，共 ${total.value} 条记录。玩家用户资料不会被删除。`
  : `将永久删除 ${clearTarget.value?.name || ''} 中的 ${clearTarget.value?.count || 0} 条记录。`)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.status(session.token)
    collections.value = result.collections
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '读取集合状态失败。'
  } finally {
    loading.value = false
  }
}

function requestClear(item?: CollectionStatus) {
  clearAll.value = !item
  clearTarget.value = item || null
  notice.value = ''
  dialogOpen.value = true
}

async function confirmClear() {
  if (clearing.value) return
  clearing.value = true
  error.value = ''
  try {
    const result = await adminApi.clear(session.token, clearAll.value ? 'all' : clearTarget.value?.name || '', 'CLEAR')
    const summary = Object.entries(result.deleted).map(([name, count]) => `${name} ${count} 条`).join('，')
    notice.value = `清理完成：${summary}`
    dialogOpen.value = false
    await refresh()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '清理失败，请重试。'
  } finally {
    clearing.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div>
        <span class="eyebrow">数据管理</span>
        <h1>房间数据概览</h1>
        <p>查看权威房间状态，并处理异常残留数据。</p>
      </div>
      <ElButton :loading="loading" @click="refresh">
        <RefreshCw :size="17" />刷新状态
      </ElButton>
    </header>

    <div v-if="error" class="inline-error inline-error--row" role="alert">
      <span>{{ error }}</span>
      <button type="button" @click="refresh">
        <RotateCcw :size="15" />重试
      </button>
    </div>
    <div v-if="notice" class="inline-notice" role="status">
      {{ notice }}
    </div>

    <section class="stat-grid" aria-label="集合计数">
      <article v-for="(item, index) in collections" :key="item.name" class="stat-card">
        <div class="stat-card__icon" :class="`stat-card__icon--${index + 1}`">
          <Database :size="21" />
        </div>
        <div>
          <code>{{ item.name }}</code>
          <strong>{{ item.count }}</strong>
          <span>当前记录</span>
        </div>
      </article>
      <template v-if="loading && !collections.length">
        <article
          v-for="index in 3"
          :key="index"
          class="stat-card stat-card--skeleton"
          aria-hidden="true"
        />
      </template>
    </section>

    <section class="content-card">
      <div class="card-heading">
        <div>
          <h2><Layers3 :size="20" />受管理集合</h2>
          <p>清理操作不可撤销，请先确认当前牌局状态。</p>
        </div>
        <span class="record-total">合计 {{ total }} 条</span>
      </div>

      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>集合</th><th>用途</th><th>记录数</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            <tr v-for="item in collections" :key="item.name">
              <td><code>{{ item.name }}</code></td>
              <td>{{ item.description }}</td>
              <td><span class="count-badge">{{ item.count }}</span></td>
              <td class="table-action">
                <ElButton type="danger" plain :disabled="item.count <= 0" @click="requestClear(item)">
                  <Trash2 :size="15" />清空
                </ElButton>
              </td>
            </tr>
            <tr v-if="!loading && !collections.length">
              <td colspan="4" class="empty-cell">
                暂无集合数据，请刷新重试。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="danger-zone">
      <div class="danger-zone__icon">
        <AlertTriangle :size="22" />
      </div>
      <div class="danger-zone__copy">
        <h2>清空全部房间数据</h2>
        <p>同时清空 rooms、roomStates 和 matchQueue，不会删除玩家用户资料。</p>
      </div>
      <ElButton type="danger" :disabled="total <= 0" @click="requestClear()">
        <Trash2 :size="16" />清空全部
      </ElButton>
    </section>

    <DangerConfirmDialog
      v-model="dialogOpen"
      title="确认危险操作"
      :description="dialogDescription"
      :target="dialogTarget"
      confirm-text="CLEAR"
      :loading="clearing"
      @confirm="confirmClear"
    />
  </div>
</template>
