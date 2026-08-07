<script setup lang="ts">
import { CircleUserRound, DoorClosed, DoorOpen, Eye, RefreshCw, RotateCcw } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { adminApi, ApiError } from '@/api/client'
import type { RoomStatus, RoomSummary } from '@/api/types'
import DangerConfirmDialog from '@/components/DangerConfirmDialog.vue'
import { useSessionStore } from '@/stores/session'
import { formatTime } from '@/utils/format'

const session = useSessionStore()
const rooms = ref<RoomSummary[]>([])
const loading = ref(false)
const closing = ref(false)
const error = ref('')
const notice = ref('')
const search = ref('')
const statusFilter = ref<'all' | RoomStatus>('all')
const dialogOpen = ref(false)
const targetRoom = ref<RoomSummary | null>(null)
const detailRoom = ref<RoomSummary | null>(null)

const STATUS_META: Record<RoomStatus, { label: string; modifier: string }> = {
  waiting: { label: '等待中', modifier: 'status-dot--waiting' },
  playing: { label: '游戏中', modifier: 'status-dot--playing' },
  finished: { label: '本局结算', modifier: 'status-dot--finished' },
  tableResult: { label: '整局结束', modifier: 'status-dot--table-result' },
  closed: { label: '已解散', modifier: 'status-dot--off' },
}
const PAY_TYPE_LABEL: Record<string, string> = { pihu: '屁胡', jiahu: '甲胡', changhu: '场胡' }
const STATUS_OPTIONS: Array<{ label: string; value: 'all' | RoomStatus }> = [
  { label: '全部状态', value: 'all' },
  { label: '等待中', value: 'waiting' },
  { label: '游戏中', value: 'playing' },
  { label: '本局结算', value: 'finished' },
  { label: '整局结束', value: 'tableResult' },
  { label: '已解散', value: 'closed' },
]

const total = computed(() => rooms.value.length)

const filteredRooms = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return rooms.value.filter((room) => {
    if (statusFilter.value !== 'all' && room.status !== statusFilter.value) return false
    if (!keyword) return true
    const haystack = [room.roomId, room.hostOpenid, ...room.players.map((p) => `${p.nickName} ${p.openid}`)]
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })
})

const detailSeats = computed(() => {
  const room = detailRoom.value
  if (!room) return []
  return Array.from({ length: room.seatCount }, (_, seat) => {
    const player = room.players.find((item) => item.seat === seat) || null
    return {
      seat,
      player,
      isHost: Boolean(player && player.openid === room.hostOpenid),
      score: room.tableScores[seat] ?? 0,
      wins: room.tableStats.winRounds[seat] ?? 0,
    }
  })
})

function ruleSummary(room: RoomSummary) {
  return [
    `${room.settings.maxRounds}局`,
    room.settings.repeatRound ? '重场' : '',
    room.settings.washTwice ? '洗两道' : '',
    PAY_TYPE_LABEL[room.settings.payType] || '屁胡',
  ].filter(Boolean).join(' · ')
}

function canClose(room: RoomSummary) {
  return room.status !== 'closed'
}

function applyUpdatedRoom(next: RoomSummary) {
  const index = rooms.value.findIndex((item) => item.roomId === next.roomId)
  if (index >= 0) rooms.value[index] = next
  if (detailRoom.value?.roomId === next.roomId) detailRoom.value = next
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.rooms(session.token)
    rooms.value = result.rooms
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '房间列表读取失败。'
  } finally {
    loading.value = false
  }
}

function openDetail(room: RoomSummary) {
  detailRoom.value = room
}

function requestClose(room: RoomSummary) {
  if (!canClose(room)) return
  targetRoom.value = room
  notice.value = ''
  dialogOpen.value = true
}

async function confirmClose() {
  if (!targetRoom.value || closing.value) return
  closing.value = true
  error.value = ''
  try {
    const result = await adminApi.closeRoom(session.token, targetRoom.value.roomId)
    notice.value = `房间 ${targetRoom.value.roomId} 已强制解散。`
    dialogOpen.value = false
    applyUpdatedRoom(result.room)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '解散房间失败。'
  } finally {
    closing.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page-stack">
    <header class="page-header">
      <div>
        <span class="eyebrow">房间数据</span>
        <h1>房间管理</h1>
        <p>查看真实房间明细，并可强制解散异常或卡住的房间。</p>
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
        <div><h2><DoorOpen :size="20" />房间列表</h2><p>状态与玩家为服务端实时数据，解散操作不可撤销。</p></div>
        <span class="record-total">{{ total }} 间房间</span>
      </div>

      <div class="filter-row">
        <ElInput v-model.trim="search" clearable placeholder="按房间号 / 房主昵称 / 玩家昵称 / openid 搜索" />
        <ElSelect v-model="statusFilter" class="filter-row__status">
          <ElOption v-for="opt in STATUS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </ElSelect>
      </div>

      <div class="table-scroll">
        <table class="data-table rooms-table">
          <thead>
            <tr>
              <th>房间号</th><th>状态</th><th>玩家</th><th>局数设置</th><th>创建时间</th><th>更新时间</th><th><span class="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in filteredRooms" :key="room.roomId">
              <td><code>{{ room.roomId }}</code></td>
              <td><span class="status-dot" :class="STATUS_META[room.status].modifier">{{ STATUS_META[room.status].label }}</span></td>
              <td>
                <div class="player-chip-list">
                  <div v-for="player in room.players" :key="player.seat" class="player-chip">
                    <img v-if="player.avatarUrl" :src="player.avatarUrl" alt="" class="player-chip__avatar">
                    <CircleUserRound v-else :size="18" class="player-chip__avatar player-chip__avatar--placeholder" />
                    <span class="player-chip__name">{{ player.nickName || '玩家' }}</span>
                    <small v-if="player.openid === room.hostOpenid" class="player-chip__host">房主</small>
                  </div>
                  <span class="player-chip-list__count">{{ room.players.length }}/{{ room.seatCount }} 人</span>
                </div>
              </td>
              <td>{{ ruleSummary(room) }}</td>
              <td>{{ formatTime(room.createdAt) }}</td>
              <td>{{ formatTime(room.updatedAt) }}</td>
              <td class="table-action">
                <ElButton plain @click="openDetail(room)">
                  <Eye :size="15" />详情
                </ElButton>
                <ElButton type="danger" plain :disabled="!canClose(room)" @click="requestClose(room)">
                  <DoorClosed :size="15" />解散
                </ElButton>
              </td>
            </tr>
            <tr v-if="!loading && !filteredRooms.length">
              <td colspan="7" class="empty-cell">
                {{ rooms.length ? '没有匹配筛选条件的房间。' : '暂无房间数据。' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ElDialog
      title="房间详情"
      width="min(94vw, 680px)"
      destroy-on-close
      :model-value="Boolean(detailRoom)"
      @update:model-value="(open: boolean) => { if (!open) detailRoom = null }"
    >
      <div v-if="detailRoom" class="room-detail">
        <div class="room-detail__meta">
          <div><span>房间号</span><code>{{ detailRoom.roomId }}</code></div>
          <div><span>状态</span><span class="status-dot" :class="STATUS_META[detailRoom.status].modifier">{{ STATUS_META[detailRoom.status].label }}</span></div>
          <div><span>局数设置</span>{{ ruleSummary(detailRoom) }}</div>
          <div><span>已完成局数</span>{{ detailRoom.tableStats.completedRounds }}</div>
          <div><span>创建时间</span>{{ formatTime(detailRoom.createdAt) }}</div>
          <div><span>更新时间</span>{{ formatTime(detailRoom.updatedAt) }}</div>
        </div>
        <table class="data-table seat-table">
          <thead><tr><th>座位</th><th>玩家</th><th>身份</th><th>本局比分</th><th>累计胜场</th></tr></thead>
          <tbody>
            <tr v-for="seat in detailSeats" :key="seat.seat">
              <td>{{ seat.seat + 1 }}</td>
              <td>
                <span v-if="seat.player">{{ seat.player.nickName || '玩家' }}</span>
                <span v-else class="seat-table__empty">空位（AI 代打）</span>
              </td>
              <td>{{ seat.isHost ? '房主' : (seat.player ? '玩家' : '—') }}</td>
              <td>{{ seat.score }}</td>
              <td>{{ seat.wins }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <ElButton @click="detailRoom = null">
          关闭
        </ElButton>
      </template>
    </ElDialog>

    <DangerConfirmDialog
      v-model="dialogOpen"
      title="强制解散房间"
      :description="`解散后，${targetRoom?.roomId || ''} 内的玩家会被移出，且无法继续本局对局，此操作不可撤销。`"
      :target="targetRoom?.roomId"
      confirm-text="CLOSE"
      :loading="closing"
      @confirm="confirmClose"
    />
  </div>
</template>
