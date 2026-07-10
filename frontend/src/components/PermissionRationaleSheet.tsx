import { Settings, ShieldCheck } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import { openAppSettings } from '../lib/permissions'
import type { PermissionDef } from '../lib/permissions'

interface PermissionRationaleSheetProps {
  open: boolean
  onClose: () => void
  permission: PermissionDef | null
  permanentlyDenied: boolean
}

export function PermissionRationaleSheet({ open, onClose, permission, permanentlyDenied }: PermissionRationaleSheetProps) {
  if (!permission) return null

  return (
    <BottomSheet open={open} onClose={onClose} title={`${permission.label} Permission`}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/10 border border-accent/20">
          <ShieldCheck className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-light-text dark:text-dark-text">
              {permission.label}
            </p>
            <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
              {permission.description}
            </p>
          </div>
        </div>

        {permanentlyDenied ? (
          <>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This permission was permanently denied. You must enable it in system settings.
              </p>
            </div>
            <button
              onClick={openAppSettings}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              Open Settings
            </button>
          </>
        ) : (
          <p className="text-sm text-light-muted dark:text-dark-muted">
            Tap the toggle below to grant this permission. If you change your mind later, you can update it in Settings.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800 text-light-text dark:text-dark-text font-medium text-sm hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
        >
          {permanentlyDenied ? 'Cancel' : 'Got it'}
        </button>
      </div>
    </BottomSheet>
  )
}
