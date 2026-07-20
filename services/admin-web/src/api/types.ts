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
