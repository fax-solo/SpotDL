import { create } from 'zustand'
import type { UserProfile } from '../lib/auth'
import * as auth from '../lib/auth'

interface AuthState {
  user: UserProfile | null
  loading: boolean
  initialized: boolean
  isGuest: boolean

  initialize: () => Promise<void>
  login: (login: string, password: string) => Promise<void>
  signup: (email: string, password: string, displayName?: string) => Promise<void>
  googleAuth: (idToken: string, displayName?: string) => Promise<void>
  guestLogin: () => Promise<void>
  logout: () => void
  updateProfile: (displayName: string) => Promise<void>
  uploadAvatar: (file: File) => Promise<string>
  refreshUser: () => Promise<void>
}

function getDeviceId(): string {
  let id = localStorage.getItem('sinc_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('sinc_device_id', id)
  }
  return id
}

export const useAuth = create<AuthState>((set, get) => ({
  user: auth.getStoredUser(),
  loading: false,
  initialized: false,
  isGuest: auth.getStoredUser()?.is_guest || false,

  initialize: async () => {
    if (get().initialized) return
    set({ loading: true })
    const user = await auth.getMe()
    if (user) {
      auth.storeUser(user)
      set({ user, initialized: true, loading: false, isGuest: user.is_guest || false })
    } else {
      set({ initialized: true, loading: false, user: null })
    }
  },

  login: async (login: string, password: string) => {
    const res = await auth.login(login, password)
    auth.storeUser(res.user)
    set({ user: res.user, isGuest: false })
  },

  signup: async (email: string, password: string, displayName?: string) => {
    const res = await auth.signup(email, password, displayName)
    auth.storeUser(res.user)
    set({ user: res.user, isGuest: false })
  },

  googleAuth: async (idToken: string, displayName?: string) => {
    const res = await auth.googleAuth(idToken, displayName)
    auth.storeUser(res.user)
    set({ user: res.user, isGuest: false })
  },

  guestLogin: async () => {
    const deviceId = getDeviceId()
    const res = await auth.guestLogin(deviceId)
    auth.storeUser(res.user)
    set({ user: res.user, isGuest: true })
  },

  logout: () => {
    auth.logout()
    set({ user: null, isGuest: false })
  },

  updateProfile: async (displayName: string) => {
    await auth.updateProfile(displayName)
    const user = get().user
    if (user) {
      const updated = { ...user, display_name: displayName }
      auth.storeUser(updated)
      set({ user: updated })
    }
  },

  uploadAvatar: async (file: File) => {
    const res = await auth.uploadAvatar(file)
    const user = get().user
    if (user) {
      const updated = { ...user, avatar_url: res.avatar_url }
      auth.storeUser(updated)
      set({ user: updated })
    }
    return res.avatar_url
  },

  refreshUser: async () => {
    const user = await auth.getMe()
    if (user) {
      auth.storeUser(user)
      set({ user, isGuest: user.is_guest || false })
    }
  },
}))
