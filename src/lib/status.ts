import type { SyncStatus } from '../types'

export const STATUS: Record<SyncStatus, { label: string; tone: 'live' | 'warn' | 'idle' | 'replay'; hint: string }> = {
  boot: { label: 'Snapshot', tone: 'idle', hint: 'Verified snapshot · connecting to GitHub' },
  syncing: { label: 'Syncing', tone: 'idle', hint: 'Checking GitHub' },
  live: { label: 'Live', tone: 'live', hint: 'In sync with GitHub' },
  limited: { label: 'Snapshot', tone: 'warn', hint: 'GitHub rate limit reached · showing last known data' },
  offline: { label: 'Offline', tone: 'warn', hint: 'Could not reach GitHub · showing last known data' },
  replay: { label: 'Replay', tone: 'replay', hint: 'Replaying real merges from the snapshot' },
}
