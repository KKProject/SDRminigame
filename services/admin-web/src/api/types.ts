export type AdminRole = 'admin' | 'superadmin'

export interface AdminUser {
  username: string
  role: AdminRole
  enabled: boolean
  defaultAdmin: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
  lastLoginAt: string
}

export interface CollectionStatus {
  name: 'rooms' | 'roomStates' | 'matchQueue'
  description: string
  count: number
}

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'tableResult' | 'closed'

export interface RoomPlayerSummary {
  seat: number
  openid: string
  nickName: string
  avatarUrl: string
}

export interface RoomSettingsSummary {
  maxRounds: number
  repeatRound: boolean
  washTwice: boolean
  payType: 'pihu' | 'jiahu' | 'changhu'
}

export interface RoomTableStats {
  completedRounds: number
  winRounds: Record<string, number>
  lastAppliedResultKey: string
}

export interface RoomSummary {
  roomId: string
  status: RoomStatus
  seatCount: number
  hostOpenid: string
  players: RoomPlayerSummary[]
  settings: RoomSettingsSummary
  tableScores: Record<string, number>
  tableStats: RoomTableStats
  version: number
  createdAt: number
  updatedAt: number
}

export interface RoomsResponse { ok: true; rooms: RoomSummary[] }
export interface RoomCloseResponse { ok: true; room: RoomSummary }

// 命名用 Player 而非 User，避免和管理员账号的 AdminUser 混淆——这里对应的是 users 集合里的游戏玩家
export interface PlayerSummary {
  openid: string
  nickName: string
  avatarUrl: string
  totalScore: number
  createdAt: number
  lastLoginAt: number
}

export interface PlayersResponse { ok: true; users: PlayerSummary[] }
export interface PlayerDeleteResponse { ok: true; deleted: string[]; notFound: string[] }

export interface LoginResponse {
  ok: true
  token: string
  expiresAt: number
  admin: AdminUser
}

export interface MeResponse { ok: true; admin: AdminUser }
export interface StatusResponse { ok: true; collections: CollectionStatus[] }
export interface AdminsResponse { ok: true; admins: AdminUser[] }
export interface AdminResponse { ok: true; admin: AdminUser }
export interface ClearResponse { ok: true; deleted: Record<string, number> }

export interface ApiFailure {
  ok: false
  error: string
  message?: string
}
