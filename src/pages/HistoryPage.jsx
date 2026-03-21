import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import useStore from '../store/store'
import { formatCurrency, formatCompactCurrency } from '../lib/currency'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'

export default function HistoryPage() {
  const snapshots = useStore((s) => s.snapshots)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const takeSnapshot = useStore((s) => s.takeSnapshot)
  const deleteSnapshot = useStore((s) => s.deleteSnapshot)
  const items = useStore((s) => s.items)

  const [deleteId, setDeleteId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))

  const chartData = sorted.map((s) => ({
    // Append T12:00:00 so the YYYY-MM-01 string is parsed as local noon rather
    // than UTC midnight, which would display as the previous month in timezones
    // west of UTC.
    date: new Date(s.date + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short',
      year: '2-digit',
    }),
    netWorth: s.netWorth,
    assets: s.totalAssets,
    liabilities: -s.totalLiabilities,
  }))

  if (snapshots.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        title="No snapshots yet"
        description={
          items.length > 0
            ? 'Take your first snapshot to start tracking your net worth over time.'
            : 'Add some assets or liabilities first, then take a snapshot.'
        }
        action={items.length > 0 ? 'Take Snapshot' : undefined}
        onAction={items.length > 0 ? takeSnapshot : undefined}
      />
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
        </p>
        <Button onClick={takeSnapshot}>Take Snapshot</Button>
      </div>

      {/* Chart */}
      {sorted.length >= 2 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            Net Worth Over Time
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="nwGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v, baseCurrency)} />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Math.abs(value), baseCurrency),
                    name === 'netWorth' ? 'Net Worth' : name === 'assets' ? 'Assets' : 'Liabilities',
                  ]}
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Legend />
                <Area type="monotone" dataKey="assets" stroke="#22c55e" strokeWidth={2} fill="url(#assetGrad)" name="Assets" />
                <Area type="monotone" dataKey="liabilities" stroke="#ef4444" strokeWidth={2} fill="url(#liabGrad)" name="Liabilities" />
                <Area type="monotone" dataKey="netWorth" stroke="#6366f1" strokeWidth={2} fill="url(#nwGrad2)" name="Net Worth" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Snapshot List */}
      <div className="space-y-3">
        {[...sorted].reverse().map((snap, i) => {
          const prevSnap = sorted[sorted.length - 2 - i]
          const change = prevSnap ? snap.netWorth - prevSnap.netWorth : null
          const expanded = expandedId === snap.id

          return (
            <div
              key={snap.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : snap.id)}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {new Date(snap.date + 'T12:00:00').toLocaleDateString(undefined, {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {snap.items.length} items
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {change !== null && (
                    <span
                      className={`text-xs font-medium ${
                        change >= 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-500'
                      }`}
                    >
                      {change >= 0 ? '+' : ''}
                      {formatCurrency(change, snap.baseCurrency)}
                    </span>
                  )}
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {formatCurrency(snap.netWorth, snap.baseCurrency)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(snap.id) }}
                    className="p-1 text-gray-400 hover:text-danger-500 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-2">
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-gray-500">Assets</p>
                      <p className="text-sm font-semibold text-success-600 dark:text-success-400">
                        {formatCurrency(snap.totalAssets, snap.baseCurrency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Liabilities</p>
                      <p className="text-sm font-semibold text-danger-500">
                        {formatCurrency(snap.totalLiabilities, snap.baseCurrency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Net Worth</p>
                      <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                        {formatCurrency(snap.netWorth, snap.baseCurrency)}
                      </p>
                    </div>
                  </div>
                  {snap.breakdown.map((b) => (
                    <div key={b.categoryId} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{b.name}</span>
                      <span className={b.type === 'asset' ? 'text-success-600 dark:text-success-400' : 'text-danger-500'}>
                        {formatCurrency(b.total, snap.baseCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Snapshot"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Are you sure? This snapshot data will be permanently lost.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { deleteSnapshot(deleteId); setDeleteId(null) }}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}
