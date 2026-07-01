import { useState, useCallback } from 'react'
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

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sinc_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useAdmin() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = authHeaders()
      const [statsRes, usersRes] = await Promise.all([
        fetch(apiUrl('/api/admin/stats'), { headers }),
        fetch(apiUrl('/api/admin/users?limit=200'), { headers }),
      ])
      if (!statsRes.ok || !usersRes.ok) {
        throw new Error('Failed to load admin data')
      }
      const statsData = await statsRes.json()
      const usersData = await usersRes.json()
      setStats(statsData)
      setUsers(usersData.users || [])
      setUsersTotal(usersData.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

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
      }
    } catch {}
  }, [])

  return { stats, users, usersTotal, loading, error, loadData, toggleUserActive }
}
