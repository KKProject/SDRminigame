<script setup lang="ts">
import { Check, CircleUserRound, Copy, Eye, RefreshCw, RotateCcw, Trash2, UserRound } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'

import { adminApi, ApiError } from '@/api/client'
import type { PlayerSummary } from '@/api/types'
import DangerConfirmDialog from '@/components/DangerConfirmDialog.vue'
import { useSessionStore } from '@/stores/session'
import { formatTime } from '@/utils/format'

const session = useSessionStore()
const players = ref<PlayerSummary[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const search = ref('')
const detailPlayer = ref<PlayerSummary | null>(null)
const copiedOpenid = ref('')
const dialogOpen = ref(false)
const deleting = ref(false)
const targetPlayers = ref<PlayerSummary[]>([])
const selectedOpenids = ref<string[]>([])

const total = computed(() => players.value.length)

const filteredPlayers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return players.value
  return players.value.filter((player) => `${player.nickName} ${player.openid}`.toLowerCase().includes(keyword))
})

const selectedPlayers = computed(() => players.value.filter((player) => selectedOpenids.value.includes(player.openid)))
const allFilteredSelected = computed(() => filteredPlayers.value.length > 0
  && filteredPlayers.value.every((player) => selectedOpenids.value.includes(player.openid)))
const someFilteredSelected = computed(() => !allFilteredSelected.value
  && filteredPlayers.value.some((player) => selectedOpenids.value.includes(player.openid)))

const deleteDialogDescription = computed(() => {
  if (targetPlayers.value.length > 1) {
    return `删除后，选中的 ${targetPlayers.value.length} 位玩家档案（含累计积分）将被永久移除，且无法恢复。`
  }
  const player = targetPlayers.value[0]
  return `删除后，${player?.nickName || player?.openid || ''} 的玩家档案（含累计积分）将被永久移除，且无法恢复。`
})
const deleteDialogTarget = computed(() => targetPlayers.value.length > 1
  ? targetPlayers.value.map((player) => player.openid).join('、')
  : targetPlayers.value[0]?.openid || '')

// 切换搜索关键字时清空勾选，避免"全选"误伤当前不可见的行
watch(search, () => { selectedOpenids.value = [] })

function shortOpenid(openid: string) {
  return openid.length > 16 ? `${openid.slice(0, 8)}…${openid.slice(-6)}` : openid
}

function isSelected(openid: string) {
  return selectedOpenids.value.includes(openid)
}

// checked 用 CheckboxValueType（element-plus 的 change 事件类型，boolean | string | number）以匹配 ElCheckbox 的类型声明
function toggleSelect(openid: string, checked: boolean | string | number) {
  if (checked === true) {
    if (!isSelected(openid)) selectedOpenids.value = [...selectedOpenids.value, openid]
  } else {
    selectedOpenids.value = selectedOpenids.value.filter((id) => id !== openid)
  }
}

function toggleSelectAll(checked: boolean | string | number) {
  const visibleIds = filteredPlayers.value.map((player) => player.openid)
  selectedOpenids.value = checked === true
    ? Array.from(new Set([...selectedOpenids.value, ...visibleIds]))
    : selectedOpenids.value.filter((id) => visibleIds.indexOf(id) < 0)
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.players(session.token)
    players.value = result.users
    selectedOpenids.value = selectedOpenids.value.filter((id) => result.users.some((player) => player.openid === id))
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '玩家列表读取失败。'
  } finally {
    loading.value = false
  }
}

function openDetail(player: PlayerSummary) {
  detailPlayer.value = player
}

function requestDelete(targets: PlayerSummary[]) {
  if (!targets.length) return
  targetPlayers.value = targets
  notice.value = ''
  dialogOpen.value = true
}

async function confirmDelete() {
  if (!targetPlayers.value.length || deleting.value) return
  deleting.value = true
  error.value = ''
  try {
    const openids = targetPlayers.value.map((player) => player.openid)
    const singleName = targetPlayers.value[0]?.nickName || openids[0]
    const result = await adminApi.deletePlayers(session.token, openids)
    const deletedSet = new Set(result.deleted)
    const notFoundSuffix = result.notFound.length ? `（${result.notFound.length} 位未找到，可能已被删除）` : ''
    notice.value = deletedSet.size > 1
      ? `已删除 ${deletedSet.size} 位玩家。${notFoundSuffix}`
      : `玩家 ${singleName} 已删除。${notFoundSuffix}`
    dialogOpen.value = false
    players.value = players.value.filter((item) => !deletedSet.has(item.openid))
    selectedOpenids.value = selectedOpenids.value.filter((id) => !deletedSet.has(id))
    if (detailPlayer.value && deletedSet.has(detailPlayer.value.openid)) detailPlayer.value = null
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '删除玩家失败。'
  } finally {
    deleting.value = false
  }
}

async function copyOpenid(openid: string) {
  try {
    await navigator.clipboard.writeText(openid)
    copiedOpenid.value = openid
    notice.value = 'openid 已复制到剪贴板。'
    window.setTimeout(() => {
      if (copiedOpenid.value === openid) copiedOpenid.value = ''
    }, 1500)
  } catch {
    // 剪贴板权限不可用时静默降级，不阻塞其他操作
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div>
        <span class="eyebrow">玩家数据</span>
        <h1>玩家管理</h1>
        <p>查看真实玩家档案（昵称、积分、活跃时间），支持单个或批量删除玩家档案。</p>
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

    <section class="content-card">
      <div class="card-heading">
        <div><h2><UserRound :size="20" />玩家列表</h2><p>数据来自 users 集合，与后台管理员账号相互独立。</p></div>
        <span class="record-total">{{ total }} 位玩家</span>
      </div>

      <div class="filter-row">
        <ElInput v-model.trim="search" clearable placeholder="按昵称 / openid 搜索" />
        <span v-if="selectedOpenids.length" class="filter-row__selection">已选择 {{ selectedOpenids.length }} 位</span>
        <ElButton type="danger" plain :disabled="!selectedOpenids.length" @click="requestDelete(selectedPlayers)">
          <Trash2 :size="15" />批量删除
        </ElButton>
      </div>

      <div class="table-scroll">
        <table class="data-table players-table">
          <thead>
            <tr>
              <th class="select-cell">
                <ElCheckbox
                  :model-value="allFilteredSelected"
                  :indeterminate="someFilteredSelected"
                  :disabled="!filteredPlayers.length"
                  aria-label="全选当前列表"
                  @change="toggleSelectAll"
                />
              </th>
              <th><span class="sr-only">头像</span></th><th>昵称</th><th>openid</th><th>累计积分</th><th>注册时间</th><th>最近登录</th><th><span class="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="player in filteredPlayers" :key="player.openid" :class="{ 'is-selected-row': isSelected(player.openid) }">
              <td class="select-cell">
                <ElCheckbox
                  :model-value="isSelected(player.openid)"
                  :aria-label="`选择 ${player.nickName || player.openid}`"
                  @change="(checked: boolean | string | number) => toggleSelect(player.openid, checked)"
                />
              </td>
              <td>
                <img v-if="player.avatarUrl" :src="player.avatarUrl" alt="" class="player-avatar">
                <CircleUserRound v-else :size="28" class="player-avatar player-avatar--placeholder" />
              </td>
              <td>{{ player.nickName || '玩家' }}</td>
              <td>
                <div class="openid-cell">
                  <code>{{ shortOpenid(player.openid) }}</code>
                  <button type="button" class="icon-button-sm" title="复制完整 openid" @click="copyOpenid(player.openid)">
                    <Check v-if="copiedOpenid === player.openid" :size="13" />
                    <Copy v-else :size="13" />
                  </button>
                </div>
              </td>
              <td><span class="count-badge">{{ player.totalScore }}</span></td>
              <td>{{ formatTime(player.createdAt) }}</td>
              <td>{{ formatTime(player.lastLoginAt) }}</td>
              <td class="table-action">
                <ElButton plain @click="openDetail(player)">
                  <Eye :size="15" />详情
                </ElButton>
                <ElButton type="danger" plain @click="requestDelete([player])">
                  <Trash2 :size="15" />删除
                </ElButton>
              </td>
            </tr>
            <tr v-if="!loading && !filteredPlayers.length">
              <td colspan="8" class="empty-cell">
                {{ players.length ? '没有匹配搜索条件的玩家。' : '暂无玩家数据。' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ElDialog
      title="玩家详情"
      width="min(92vw, 460px)"
      destroy-on-close
      :model-value="Boolean(detailPlayer)"
      @update:model-value="(open: boolean) => { if (!open) detailPlayer = null }"
    >
      <div v-if="detailPlayer" class="player-detail">
        <img v-if="detailPlayer.avatarUrl" :src="detailPlayer.avatarUrl" alt="" class="player-detail__avatar">
        <CircleUserRound v-else :size="56" class="player-detail__avatar player-detail__avatar--placeholder" />
        <h3>{{ detailPlayer.nickName || '玩家' }}</h3>
        <dl class="player-detail__meta">
          <div><dt>openid</dt><dd><code>{{ detailPlayer.openid }}</code></dd></div>
          <div><dt>累计积分</dt><dd>{{ detailPlayer.totalScore }}</dd></div>
          <div><dt>注册时间</dt><dd>{{ formatTime(detailPlayer.createdAt) }}</dd></div>
          <div><dt>最近登录</dt><dd>{{ formatTime(detailPlayer.lastLoginAt) }}</dd></div>
        </dl>
      </div>
      <template #footer>
        <ElButton type="danger" plain @click="requestDelete(detailPlayer ? [detailPlayer] : [])">
          <Trash2 :size="15" />删除玩家
        </ElButton>
        <ElButton @click="detailPlayer = null">
          关闭
        </ElButton>
      </template>
    </ElDialog>

    <DangerConfirmDialog
      v-model="dialogOpen"
      title="删除玩家"
      :description="deleteDialogDescription"
      :target="deleteDialogTarget"
      confirm-text="DELETE"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
