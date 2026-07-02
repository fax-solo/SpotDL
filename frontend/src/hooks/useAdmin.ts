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

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sinc_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useAdmin() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const aborterRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async (silent = false) => {
    if (aborterRef.current) aborterRef.current.abort()
    const controller = new AbortController()
    aborterRef.current = controller

    if (!silent) setLoading(true)
    setRefreshing(true)
    setError(null)
    try {
      const headers = authHeaders()
      const [statsRes, usersRes] = await Promise.all([
        fetch(apiUrl('/api/admin/stats'), { headers, signal: controller.signal }),
        fetch(apiUrl('/api/admin/users?limit=200'), { headers, signal: controller.signal }),
      ])
      if (!statsRes.ok || !usersRes.ok) {
        throw new Error('Failed to load admin data')
      }
      const statsData = await statsRes.json()
      const usersData = await usersRes.json()
      setStats(statsData)
      setUsers(usersData.users || [])
      setUsersTotal(usersData.total || 0)
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
    loadData(true)
    pollRef.current = setInterval(() => loadData(true), POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (aborterRef.current) aborterRef.current.abort()
    }
  }, [loadData])

  const toggleUserActive = useCallback(async (userId: string, currentlyActive: boolean) => {
    try {
      const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
      const res = await fetch(apiUrl(`/api/admin/${userId}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_active: !currentlyActive }),
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentlyActive } : u))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  return { stats, users, usersTotal, loading, refreshing, error, lastUpdated, loadData, toggleUserActive }
}
