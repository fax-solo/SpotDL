import { useState, useCallback, useRef, useEffect } from 'react'
import { apiUrl } from '../lib/apiConfig'

export interface AdminStats {
  total_users: number
  total_guests: number
  total_email_users: number
  total_google_users: number
  active_this_month: number
  new_this_month: number
  total_downloads: number
  downloads_this_month: number
  guest_downloads: number
  user_downloads: number
  downloads_by_source: Record<string, number>
  last_7_days: { date: string; downloads: number }[]
}

export interface AdminUser {
  id: string
  email: string | null
  display_name: string | null
  role: string
  auth_provider: string
  is_guest: boolean
  created_at: string | null
  last_active: string | null
  is_active: boolean
}

const POLL_INTERVAL = 15_000
const PAGE_SIZE = 50

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sinc_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type ToggleResult = 'ok' | 'unauthorized' | 'error'

export function useAdmin({ enabled = true }: { enabled?: boolean } = {}) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aborterRef = useRef<AbortController | null>(null)
  const searchRef = useRef('')
  const offsetRef = useRef(0)
  const loadedCountRef = useRef(0)

  const loadData = useCallback(async (silent = false, append = false) => {
    if (aborterRef.current) aborterRef.current.abort()
    const controller = new AbortController()
    aborterRef.current = controller

    if (!silent) setLoading(true)
    setRefreshing(true)
    setError(null)
    try {
      const headers = authHeaders()
      const currentOffset = append ? offsetRef.current : 0
      const q = searchRef.current
      const searchParam = q ? `&q=${encodeURIComponent(q)}` : ''
      const limit = (!append && loadedCountRef.current > PAGE_SIZE) ? Math.ceil(loadedCountRef.current / PAGE_SIZE) * PAGE_SIZE : PAGE_SIZE
      const [statsRes, usersRes] = await Promise.all([
        fetch(apiUrl('/api/admin/stats'), { headers, signal: controller.signal }),
        fetch(apiUrl(`/api/admin/users?limit=${limit}&offset=${currentOffset}${searchParam}`), { headers, signal: controller.signal }),
      ])
      if (!statsRes.ok || !usersRes.ok) {
        throw new Error('Failed to load admin data')
      }
      const statsData = await statsRes.json()
      const usersData = await usersRes.json()
      setStats(statsData)
      if (append) {
        setUsers(prev => [...prev, ...(usersData.users || [])])
        loadedCountRef.current += (usersData.users || []).length
      } else {
        setUsers(usersData.users || [])
        loadedCountRef.current = (usersData.users || []).length
      }
      const total = usersData.total || 0
      setUsersTotal(total)
      setHasMore((currentOffset + limit) < total)
      offsetRef.current = currentOffset + limit
      setLastUpdated(new Date())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    offsetRef.current = 0
    setUsers([])
    loadData(true)
    const startPolling = () => {
      pollRef.current = setInterval(() => loadData(true), POLL_INTERVAL)
    }
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData(true)
        startPolling()
      } else {
        stopPolling()
      }
    }
    startPolling()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (aborterRef.current) aborterRef.current.abort()
    }
  }, [enabled, loadData])

  const toggleUserActive = useCallback(async (userId: string, currentlyActive: boolean): Promise<ToggleResult> => {
    try {
      const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
      const res = await fetch(apiUrl('/api/admin/toggle'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: userId, is_active: !currentlyActive }),
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentlyActive } : u))
        return 'ok'
      }
      if (res.status === 401) return 'unauthorized'
      return 'error'
    } catch {
      return 'error'
    }
  }, [])

  const loadMore = useCallback(() => {
    loadData(true, true)
  }, [loadData])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    searchRef.current = value
  }, [])

  return { stats, users, usersTotal, loading, refreshing, error, lastUpdated, loadData, toggleUserActive, searchQuery, handleSearchChange, hasMore, loadMore }
}
