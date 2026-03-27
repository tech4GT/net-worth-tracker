import { useState, useRef } from 'react'
import useStore from '../store/store'
import { COMMON_CURRENCIES, CHART_COLORS } from '../lib/constants'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import { useAuth } from '../contexts/AuthContext'
import { track } from '../lib/telemetry'

export default function SettingsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <AccountSection />
      <CurrencySection />
      <ExchangeRatesSection />
      <CategoriesSection />
      <ImportExportSection />
    </div>
  )
}

function AccountSection() {
  const { user, logout } = useAuth()

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Account
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center text-base font-medium shrink-0">
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </span>
            <div>
              {user?.name && (
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user.name}
                </p>
              )}
              {user?.email && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </section>
  )
}

function CurrencySection() {
  const baseCurrency = useStore((s) => s.baseCurrency)
  const setBaseCurrency = useStore((s) => s.setBaseCurrency)

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Base Currency
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <Select
          label="All values will be converted to this currency for display"
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
          options={COMMON_CURRENCIES.map((c) => ({
            value: c.code,
            label: `${c.code} - ${c.name} (${c.symbol})`,
          }))}
        />
      </div>
    </section>
  )
}

function ExchangeRatesSection() {
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)
  const setExchangeRate = useStore((s) => s.setExchangeRate)
  const removeExchangeRate = useStore((s) => s.removeExchangeRate)
  const refreshExchangeRates = useStore((s) => s.refreshExchangeRates)

  const [newCode, setNewCode] = useState('')
  const [newRate, setNewRate] = useState('')
  const [fetching, setFetching] = useState(false)

  const addRate = () => {
    const code = newCode.trim().toUpperCase()
    if (code && newRate && !isNaN(Number(newRate))) {
      setExchangeRate(code, Number(newRate))
      setNewCode('')
      setNewRate('')
    }
  }

  const handleFetchRates = async () => {
    setFetching(true)
    try {
      await refreshExchangeRates()
    } catch {
      // ignore
    } finally {
      setFetching(false)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Exchange Rates
        </h2>
        <Button size="sm" variant="secondary" onClick={handleFetchRates} disabled={fetching}>
          {fetching ? 'Fetching...' : 'Fetch Live Rates'}
        </Button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        1 {baseCurrency} = X foreign currency. Live rates from ECB via frankfurter.app.
      </p>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
        {Object.entries(exchangeRates).map(([code, rate]) => (
          <div key={code} className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12">
              {code}
            </span>
            <input
              type="number"
              step="any"
              value={rate}
              onChange={(e) => {
                const val = e.target.value
                if (val === '') return
                setExchangeRate(code, Number(val))
              }}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={() => removeExchangeRate(code)}
              className="text-gray-400 hover:text-danger-500 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        <div className="flex items-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <Input
            label="Currency Code"
            placeholder="EUR"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="w-28"
          />
          <Input
            label="Rate"
            type="number"
            step="any"
            placeholder="0.92"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" onClick={addRate}>
            Add
          </Button>
        </div>
      </div>
    </section>
  )
}

function CategoriesSection() {
  const categories = useStore((s) => s.categories)
  const addCategory = useStore((s) => s.addCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)

  const [showAdd, setShowAdd] = useState(false)
  const [newCat, setNewCat] = useState({ name: '', type: 'asset', color: CHART_COLORS[0] })

  const handleAdd = () => {
    if (newCat.name.trim()) {
      addCategory(newCat)
      setNewCat({ name: '', type: 'asset', color: CHART_COLORS[0] })
      setShowAdd(false)
    }
  }

  const assetCats = categories.filter((c) => c.type === 'asset' || c.type === 'both')
  const liabCats = categories.filter((c) => c.type === 'liability' || c.type === 'both')

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Categories
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>
          Add Category
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            Asset Categories
          </h3>
          <div className="space-y-2">
            {assetCats.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                </div>
                {!cat.isDefault && (
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="text-gray-400 hover:text-danger-500 text-xs cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            Liability Categories
          </h3>
          <div className="space-y-2">
            {liabCats.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                </div>
                {!cat.isDefault && (
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="text-gray-400 hover:text-danger-500 text-xs cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Category" size="sm">
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Side Business"
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
          />
          <Select
            label="Type"
            value={newCat.type}
            onChange={(e) => setNewCat({ ...newCat, type: e.target.value })}
            options={[
              { value: 'asset', label: 'Asset' },
              { value: 'liability', label: 'Liability' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {CHART_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewCat({ ...newCat, color })}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    newCat.color === color ? 'scale-125 ring-2 ring-offset-2 ring-primary-500' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function ImportExportSection() {
  const items = useStore((s) => s.items)
  const categories = useStore((s) => s.categories)
  const snapshots = useStore((s) => s.snapshots)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const exchangeRates = useStore((s) => s.exchangeRates)
  const theme = useStore((s) => s.theme)
  const lastSnapshotDate = useStore((s) => s.lastSnapshotDate)
  const snapshotReminder = useStore((s) => s.snapshotReminder)
  const importData = useStore((s) => s.importData)
  const addItems = useStore((s) => s.addItems)
  const fileRef = useRef(null)
  const csvFileRef = useRef(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importMode, setImportMode] = useState('json') // 'json' | 'csv'

  const exportJSON = () => {
    const data = {
      items,
      categories,
      snapshots,
      baseCurrency,
      exchangeRates,
      theme,
      lastSnapshotDate,
      snapshotReminder,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `net-worth-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    track('data_export', { format: 'json' })
  }

  const exportCSV = () => {
    const headers = ['Name', 'Type', 'Category', 'Value', 'Currency', 'Tags', 'Notes', 'IsStock', 'Ticker', 'Shares', 'PricePerShare', 'Created', 'Updated']
    const rows = items.map((item) => {
      const cat = categories.find((c) => c.id === item.categoryId)
      return [
        item.name,
        item.type,
        cat?.name || '',
        item.value,
        item.currency,
        (item.tags || []).join(';'),
        (item.notes || '').replace(/"/g, '""'),
        item.isStock ? 'Yes' : 'No',
        item.ticker || '',
        item.shares || '',
        item.pricePerShare || '',
        item.createdAt,
        item.updatedAt,
      ]
    })
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `net-worth-items-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    track('data_export', { format: 'csv' })
  }

  const handleFileSelect = (e, mode) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportMode(mode)
      setShowConfirm(true)
    }
  }

  const parseCSV = (text) => {
    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return []
    // Parse header
    const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim())
    return lines.slice(1).map((line) => {
      // Parse CSV row respecting quoted fields
      const values = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (ch === ',' && !inQuotes) {
          values.push(current)
          current = ''
        } else {
          current += ch
        }
      }
      values.push(current)

      const row = {}
      headers.forEach((h, i) => { row[h] = (values[i] || '').trim() })
      return row
    })
  }

  const handleImport = () => {
    if (!importFile) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        if (importMode === 'json') {
          const data = JSON.parse(e.target.result)
          await importData(data)
        } else {
          const rows = parseCSV(e.target.result)
          const items = rows.map((row) => {
            const typeLower = (row.Type || 'asset').toLowerCase()
            const catName = row.Category || ''
            const cat = categories.find(
              (c) => c.name.toLowerCase() === catName.toLowerCase()
            )
            const fallbackCat = categories.find(
              (c) => c.type === typeLower || c.type === 'both'
            )
            return {
              type: typeLower === 'liability' ? 'liability' : 'asset',
              name: row.Name || 'Unnamed',
              categoryId: cat?.id || fallbackCat?.id || categories[0]?.id,
              value: Number(row.Value) || 0,
              currency: row.Currency || baseCurrency,
              tags: row.Tags ? row.Tags.split(';').map((t) => t.trim()).filter(Boolean) : [],
              notes: row.Notes || '',
              isStock: (row.IsStock || '').toLowerCase() === 'yes',
              ticker: row.Ticker || null,
              shares: row.Shares ? Number(row.Shares) : null,
              pricePerShare: row.PricePerShare ? Number(row.PricePerShare) : null,
              createdAt: row.Created || new Date().toISOString(),
              updatedAt: row.Updated || new Date().toISOString(),
            }
          }).filter((item) => item.name && item.value > 0)
          if (items.length === 0) {
            alert('No valid items found in CSV')
            return
          }
          await addItems(items)
        }
        setShowConfirm(false)
        setImportFile(null)
        if (fileRef.current) fileRef.current.value = ''
        if (csvFileRef.current) csvFileRef.current.value = ''
      } catch {
        alert(importMode === 'json' ? 'Invalid JSON file' : 'Invalid CSV file')
      }
    }
    reader.readAsText(importFile)
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Import & Export
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Export
          </h3>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" onClick={exportJSON}>
              Export JSON
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              Export CSV
            </Button>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Import
          </h3>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={(e) => handleFileSelect(e, 'json')}
            className="hidden"
          />
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv"
            onChange={(e) => handleFileSelect(e, 'csv')}
            className="hidden"
          />
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Import a JSON backup to replace all current data.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                Import JSON
              </Button>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Import items from a CSV file. Items will be added to your existing data.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => csvFileRef.current?.click()}
              >
                Import CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={showConfirm}
        onClose={() => { setShowConfirm(false); setImportFile(null) }}
        title="Confirm Import"
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {importMode === 'json'
            ? 'This will replace all your current data with the imported file. This action cannot be undone. Consider exporting your current data first.'
            : 'This will add the items from the CSV file to your existing data.'}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => { setShowConfirm(false); setImportFile(null) }}>
            Cancel
          </Button>
          <Button variant={importMode === 'json' ? 'danger' : 'primary'} onClick={handleImport}>
            {importMode === 'json' ? 'Replace Data' : 'Add Items'}
          </Button>
        </div>
      </Modal>
    </section>
  )
}
