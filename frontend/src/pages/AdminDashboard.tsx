import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Download, UserCheck, UserPlus, Globe, Shield,
  Calendar, ArrowLeft, Activity, Music,
  ChevronDown, ChevronUp, UserX, Mail,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAdmin } from '../hooks/useAdmin'

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-light-muted dark:text-dark-muted uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-light-muted dark:text-dark-muted mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace('text-', 'bg-').replace('700', '100').replace('500', '100').replace('600', '100')} ${color.replace('text-', 'dark:bg-').replace('700', '900/30').replace('500', '900/30').replace('600', '900/30')}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function MiniBar({ data, height = 40 }: { data: { date: string; downloads: number }[]; height?: number }) {
  const max = Math.max(...data.map(d => d.downloads), 1)
  return (
    <div className="flex items-end gap-1.5 h-full">
      {data.map((d, i) => {
        const h = (d.downloads / max) * height
        const day = d.date.slice(5)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            <span className="text-[10px] text-light-muted dark:text-dark-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {d.downloads}
            </span>
            <div
              className="w-full rounded-sm bg-accent/60 dark:bg-accent/40 transition-all"
              style={{ height: Math.max(h, 2) }}
            />
            <span className="text-[9px] text-light-muted dark:text-dark-muted">{day}</span>
          </div>
        )
      })}
    </div>
  )
}

export function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { stats, users, usersTotal, loading, error, loadData, toggleUserActive } = useAdmin()
  const [tab, setTab] = useState<'overview' | 'users'>('overview')
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/', { replace: true })
      return
    }
    loadData()
  }, [user])

  const filteredUsers = showInactive ? users : users.filter(u => u.is_active)

  if (loading && !stats) {
    return (
      <div className="px-4 pt-6 pb-32 flex items-center justify-center min-h-[60dvh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm text-light-muted dark:text-dark-muted">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 pt-6 pb-32">
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 font-medium">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-32">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="w-9 h-9 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 flex items-center justify-center text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent" />
            <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Admin</h1>
          </div>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-0.5">Dashboard & user management</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-light-surface-2 dark:bg-dark-surface-2">
        <button
          onClick={() => setTab('overview')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            tab === 'overview'
              ? 'bg-white dark:bg-dark-surface text-light-text dark:text-dark-text shadow-xs'
              : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            tab === 'users'
              ? 'bg-white dark:bg-dark-surface text-light-text dark:text-dark-text shadow-xs'
              : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
          }`}
        >
          Users ({usersTotal})
        </button>
      </div>

      {tab === 'overview' && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              label="Total Users"
              value={stats.total_users}
              sub={`${stats.active_this_month} active this month`}
              color="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon={<UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              label="New This Month"
              value={stats.new_this_month}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              icon={<Globe className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
              label="Google Users"
              value={stats.total_google_users}
              sub={`${((stats.total_google_users / Math.max(stats.total_users, 1)) * 100).toFixed(0)}% of users`}
              color="text-orange-600 dark:text-orange-400"
            />
            <StatCard
              icon={<UserCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
              label="Email Users"
              value={stats.total_email_users}
              color="text-purple-600 dark:text-purple-400"
            />
          </div>

          <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-light-muted dark:text-dark-muted" />
                <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">User Breakdown</h3>
              </div>
              <span className="text-xs text-light-muted dark:text-dark-muted">{stats.total_users} total</span>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-light-muted dark:text-dark-muted">Email</span>
                  <span className="text-light-text dark:text-dark-text font-medium">{stats.total_email_users}</span>
                </div>
                <div className="h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
                  <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${(stats.total_email_users / Math.max(stats.total_users, 1)) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-light-muted dark:text-dark-muted">Google</span>
                  <span className="text-light-text dark:text-dark-text font-medium">{stats.total_google_users}</span>
                </div>
                <div className="h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(stats.total_google_users / Math.max(stats.total_users, 1)) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-light-muted dark:text-dark-muted">Guest</span>
                  <span className="text-light-text dark:text-dark-text font-medium">{stats.total_guests}</span>
                </div>
                <div className="h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
                  <div className="h-full rounded-full bg-zinc-400 dark:bg-zinc-600 transition-all" style={{ width: `${(stats.total_guests / Math.max(stats.total_users, 1)) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Download className="w-5 h-5 text-accent" />} label="Total Downloads" value={stats.total_downloads} color="text-accent" />
            <StatCard icon={<Music className="w-5 h-5 text-sky-600 dark:text-sky-400" />} label="This Month" value={stats.downloads_this_month} sub={`${stats.user_downloads} by users, ${stats.guest_downloads} by guests`} color="text-sky-600 dark:text-sky-400" />
          </div>

          <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">Downloads — Last 7 Days</h3>
            </div>
            <div style={{ height: 50 }}>
              <MiniBar data={stats.last_7_days} />
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                <span className="text-sm text-light-text dark:text-dark-text font-medium">Active this month</span>
              </div>
              <span className="text-lg font-bold text-accent">{stats.active_this_month}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(stats.active_this_month / Math.max(stats.total_users, 1)) * 100}%` }} />
            </div>
            <p className="text-xs text-light-muted dark:text-dark-muted mt-1.5">
              {((stats.active_this_month / Math.max(stats.total_users, 1)) * 100).toFixed(1)}% of all users
            </p>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-light-muted dark:text-dark-muted">{usersTotal} total users</p>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="flex items-center gap-1 text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
            >
              {showInactive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </button>
          </div>

          <div className="space-y-2">
            {filteredUsers.map(u => (
              <div
                key={u.id}
                className={`rounded-xl bg-white dark:bg-dark-surface border p-4 transition-colors ${
                  u.is_active
                    ? 'border-light-border/50 dark:border-dark-border/50'
                    : 'border-red-500/20 dark:border-red-500/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      u.is_guest
                        ? 'bg-zinc-100 dark:bg-zinc-800'
                        : u.auth_provider === 'google'
                          ? 'bg-orange-100 dark:bg-orange-900/30'
                          : 'bg-purple-100 dark:bg-purple-900/30'
                    }`}>
                      {u.is_guest ? (
                        <UserX className="w-5 h-5 text-zinc-500" />
                      ) : u.auth_provider === 'google' ? (
                        <Globe className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      ) : (
                        <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate">
                        {u.display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                        {u.email || 'No email'}
                        {u.role === 'admin' && ' • Admin'}
                        {!u.is_active && ' • Disabled'}
                      </p>
                      <p className="text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
                        {u.auth_provider}
                        {u.last_active && ` • Last active: ${new Date(u.last_active).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  {u.role !== 'admin' && (
                    <button
                      onClick={() => toggleUserActive(u.id, u.is_active)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        u.is_active
                          ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20'
                          : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20'
                      }`}
                    >
                      {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-light-muted dark:text-dark-muted mx-auto mb-2" />
                <p className="text-sm text-light-muted dark:text-dark-muted">No users found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
