import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Download, UserCheck, UserPlus, Globe, Shield,
  Calendar, ArrowLeft, Activity, Music,
  ChevronDown, ChevronUp, UserX, Mail, RefreshCw,
  Search, Clock, AlertTriangle, X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAdmin, type AdminUser, type ToggleResult } from '../hooks/useAdmin'
import { useToast } from '../components/Toast'

function StatCard({ icon, label, value, sub, color, trend }: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  color: string
  trend?: { value: number; label: string; positive?: boolean }
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-light-muted dark:text-dark-muted uppercase tracking-wider truncate">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color} tabular-nums`}>{value}</p>
          {sub && <p className="text-xs text-light-muted dark:text-dark-muted mt-1 truncate">{sub}</p>}
          {trend && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${trend.positive !== false ? 'text-emerald-500' : 'text-red-500'}`}>
              {trend.positive !== false ? '+' : '-'}{trend.value} {trend.label}
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.replace('text-', 'bg-').replace('700', '100').replace('500', '100').replace('600', '100')} ${color.replace('text-', 'dark:bg-').replace('700', '900/30').replace('500', '900/30').replace('600', '900/30')}`}>
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
            <span className="text-[10px] text-light-muted dark:text-dark-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium tabular-nums">
              {d.downloads}
            </span>
            <div
              ref={el => { if (el) el.style.height = `${Math.max(h, 2)}px` }}
              className="w-full rounded-sm bg-accent/60 dark:bg-accent/40 transition-all hover:bg-accent/80"
            />
            <span className="text-[9px] text-light-muted dark:text-dark-muted tabular-nums">{day}</span>
          </div>
        )
      })}
    </div>
  )
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">{title}</h3>
        </div>
        <p className="text-sm text-light-muted dark:text-dark-muted mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-light-border/50 dark:border-dark-border/50 text-light-text dark:text-dark-text hover:bg-light-surface-2 dark:hover:bg-dark-surface-2 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

function UserSkeleton() {
  return (
    <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-light-surface-2 dark:bg-dark-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-light-surface-2 dark:bg-dark-surface-2" />
          <div className="h-3 w-48 rounded bg-light-surface-2 dark:bg-dark-surface-2" />
          <div className="h-3 w-24 rounded bg-light-surface-2 dark:bg-dark-surface-2" />
        </div>
        <div className="h-8 w-16 rounded-lg bg-light-surface-2 dark:bg-dark-surface-2" />
      </div>
    </div>
  )
}

function UserCard({ user, onToggle, toggling }: {
  user: AdminUser
  onToggle: (u: AdminUser) => void
  toggling: boolean
}) {
  return (
    <div
      className={`rounded-xl bg-white dark:bg-dark-surface border p-4 transition-all hover:shadow-md ${
        user.is_active
          ? 'border-light-border/50 dark:border-dark-border/50'
          : 'border-red-500/20 dark:border-red-500/20 bg-red-500/5'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            user.is_guest
              ? 'bg-zinc-100 dark:bg-zinc-800'
              : user.auth_provider === 'google'
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-purple-100 dark:bg-purple-900/30'
          }`}>
            {user.is_guest ? (
              <UserX className="w-5 h-5 text-zinc-500" />
            ) : user.auth_provider === 'google' ? (
              <Globe className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            ) : (
              <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate">
                {user.display_name || 'Unknown'}
              </p>
              {user.role === 'admin' && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  Admin
                </span>
              )}
              {!user.is_active && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-xs text-light-muted dark:text-dark-muted truncate">
              {user.email || 'No email'}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
              <span className="capitalize">{user.auth_provider}</span>
              {user.created_at && (
                <>
                  <span>·</span>
                  <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                </>
              )}
              {user.last_active && (
                <>
                  <span>·</span>
                  <span>Active {new Date(user.last_active).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        </div>
        {user.role !== 'admin' && (
          <button
            onClick={() => onToggle(user)}
            disabled={toggling}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
              user.is_active
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20'
                : 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/20'
            }`}
          >
            {user.is_active ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  )
}

export function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()
  const { stats, users, usersTotal, loading, refreshing, error, lastUpdated, loadData, toggleUserActive, searchQuery, handleSearchChange, hasMore, loadMore } = useAdmin({ enabled: user?.role === 'admin' })
  const [tab, setTab] = useState<'overview' | 'users'>('overview')
  const [showInactive, setShowInactive] = useState(false)
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  const onSearchInput = (value: string) => {
    handleSearchChange(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      loadData(false, false)
    }, 300)
  }

  const filteredUsers = useMemo(() => {
    let list = showInactive ? users : users.filter(u => u.is_active)
    return list
  }, [users, showInactive])

  const handleToggle = async (u: AdminUser) => {
    if (u.is_active) {
      setConfirmUser(u)
    } else {
      setTogglingId(u.id)
      const result: ToggleResult = await toggleUserActive(u.id, u.is_active)
      setTogglingId(null)
      if (result === 'unauthorized') {
        toast('Session expired — please log in again', 'error')
      } else if (result !== 'ok') {
        toast('Failed to update user — try again', 'error')
      }
    }
  }

  const confirmToggle = async () => {
    if (!confirmUser) return
    setTogglingId(confirmUser.id)
    setConfirmUser(null)
    const result: ToggleResult = await toggleUserActive(confirmUser.id, confirmUser.is_active)
    setTogglingId(null)
    if (result === 'unauthorized') {
      toast('Session expired — please log in again', 'error')
    } else if (result !== 'ok') {
      toast('Failed to update user — try again', 'error')
    }
  }

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

  if (error && !stats) {
    return (
      <div className="px-4 pt-6 pb-32">
        <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-500 font-medium mb-4">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-32 max-w-2xl mx-auto animate-pageEnter">
      <ConfirmDialog
        open={confirmUser !== null}
        title="Disable User"
        message={`Are you sure you want to disable ${confirmUser?.display_name || confirmUser?.email || 'this user'}? They will no longer be able to log in.`}
        onConfirm={confirmToggle}
        onCancel={() => setConfirmUser(null)}
      />

      <div className="flex items-center justify-between mb-6 animate-slideUp">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="w-9 h-9 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 flex items-center justify-center text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer active:scale-90"
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
        <button
          onClick={() => loadData()}
          disabled={refreshing}
          className="w-9 h-9 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 flex items-center justify-center text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer disabled:opacity-50 active:scale-90"
          title="Refresh data"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {lastUpdated && (
        <div className="flex items-center gap-1.5 mb-4 text-[11px] text-light-muted dark:text-dark-muted">
          <Clock className="w-3 h-3" />
          <span>Updated {lastUpdated.toLocaleTimeString()}</span>
          {refreshing && <span className="text-accent">· Refreshing...</span>}
        </div>
      )}

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
        <div className="space-y-4 animate-slideUp" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              label="Total Users"
              value={stats.total_users}
              sub={`${stats.active_this_month} active this month`}
              color="text-blue-600 dark:text-blue-400"
              trend={{ value: stats.new_this_month, label: 'new this month' }}
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
              <span className="text-xs text-light-muted dark:text-dark-muted tabular-nums">{stats.total_users} total</span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Email', value: stats.total_email_users, color: 'bg-purple-500' },
                { label: 'Google', value: stats.total_google_users, color: 'bg-orange-500' },
                { label: 'Guest', value: stats.total_guests, color: 'bg-zinc-400 dark:bg-zinc-600' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-light-muted dark:text-dark-muted">{label}</span>
                    <span className="text-light-text dark:text-dark-text font-medium tabular-nums">{value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
                    <div ref={el => { if (el) el.style.width = `${(value / Math.max(stats.total_users, 1)) * 100}%` }} className={`h-full rounded-full ${color} transition-all`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Download className="w-5 h-5 text-accent" />}
              label="Total Downloads"
              value={stats.total_downloads}
              color="text-accent"
            />
            <StatCard
              icon={<Music className="w-5 h-5 text-sky-600 dark:text-sky-400" />}
              label="This Month"
              value={stats.downloads_this_month}
              sub={`${stats.user_downloads} by users, ${stats.guest_downloads} by guests`}
              color="text-sky-600 dark:text-sky-400"
            />
          </div>

          <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">Downloads — Last 7 Days</h3>
            </div>
            <div className="h-[50px]">
              <MiniBar data={stats.last_7_days} />
            </div>
          </div>

          {stats.downloads_by_source && Object.keys(stats.downloads_by_source).length > 0 && (
            <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Music className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">Downloads by Source</h3>
              </div>
              <div className="space-y-2.5">
                {Object.entries(stats.downloads_by_source)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count], _, arr) => {
                    const total = arr.reduce((s, [, c]) => s + c, 0)
                    const pct = (count / Math.max(total, 1)) * 100
                    const colors = ['bg-blue-500', 'bg-red-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500']
                    const color = colors[arr.findIndex(([s]) => s === source) % colors.length]
                    return (
                      <div key={source}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-light-muted dark:text-dark-muted capitalize">{source}</span>
                          <span className="text-light-text dark:text-dark-text font-medium tabular-nums">{count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
                          <div ref={el => { if (el) el.style.width = `${pct}%` }} className={`h-full rounded-full ${color} transition-all`} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                <span className="text-sm text-light-text dark:text-dark-text font-medium">Active this month</span>
              </div>
              <span className="text-lg font-bold text-accent tabular-nums">{stats.active_this_month}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-light-surface-2 dark:bg-dark-surface-2 overflow-hidden">
              <div ref={el => { if (el) el.style.width = `${(stats.active_this_month / Math.max(stats.total_users, 1)) * 100}%` }} className="h-full rounded-full bg-accent transition-all" />
            </div>
            <p className="text-xs text-light-muted dark:text-dark-muted mt-1.5">
              {((stats.active_this_month / Math.max(stats.total_users, 1)) * 100).toFixed(1)}% of all users
            </p>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={e => onSearchInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder-light-muted dark:placeholder-dark-muted focus:outline-none focus:border-accent/50 transition-colors"
              />
              {searchQuery && (
                <button
                    onClick={() => { handleSearchChange(''); loadData(false, false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer flex-shrink-0"
            >
              {showInactive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showInactive ? 'All' : 'Active'}
            </button>
          </div>

          {searchQuery && (
            <p className="text-xs text-light-muted dark:text-dark-muted mb-3">
              Found {filteredUsers.length} of {usersTotal} users
            </p>
          )}

          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <UserSkeleton key={i} />)
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-light-muted dark:text-dark-muted mx-auto mb-2" />
                <p className="text-sm text-light-muted dark:text-dark-muted">
                  {searchQuery ? 'No users match your search' : 'No users found'}
                </p>
                {searchQuery && (
                  <button
                  onClick={() => { handleSearchChange(''); loadData(false, false) }}
                    className="mt-2 text-xs text-accent hover:underline cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredUsers.map(u => (
                  <UserCard
                    key={u.id}
                    user={u}
                    onToggle={handleToggle}
                    toggling={togglingId === u.id}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    className="w-full py-3 rounded-xl text-sm font-medium text-accent hover:bg-accent/5 border border-dashed border-light-border/50 dark:border-dark-border/50 transition-colors cursor-pointer"
                  >
                    Load more ({usersTotal - users.length} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
