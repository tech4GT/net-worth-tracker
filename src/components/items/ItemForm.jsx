import { useState, useEffect, useRef } from 'react'
import useStore from '../../store/store'
import { COMMON_CURRENCIES } from '../../lib/constants'
import { fetchStockPrice, searchStocks } from '../../lib/stocks.js'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

export default function ItemForm({ item, type, onClose }) {
  const categories = useStore((s) => s.categories)
  const baseCurrency = useStore((s) => s.baseCurrency)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const filteredCategories = categories.filter(
    (c) => c.type === type || c.type === 'both'
  )

  const stockCategoryId =
    categories.find((c) => c.id === 'cat-stocks')?.id || filteredCategories[0]?.id || ''

  const retirementCategoryId =
    categories.find((c) => c.id === 'cat-retirement')?.id || stockCategoryId

  const [isStock, setIsStock] = useState(false)
  const [manualFund, setManualFund] = useState(false)
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [priceError, setPriceError] = useState('')

  const [form, setForm] = useState({
    name: '',
    categoryId: filteredCategories[0]?.id || '',
    value: '',
    currency: baseCurrency,
    tags: '',
    notes: '',
    // Stock fields
    ticker: '',
    shares: '',
    pricePerShare: '',
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (item) {
      setIsStock(!!item.isStock)
      setManualFund(!!item.isStock && !item.ticker)
      setForm({
        name: item.name,
        categoryId: item.categoryId,
        value: String(item.value),
        currency: item.currency,
        tags: (item.tags || []).join(', '),
        notes: item.notes || '',
        ticker: item.ticker || '',
        shares: item.shares ? String(item.shares) : '',
        pricePerShare: item.pricePerShare ? String(item.pricePerShare) : '',
      })
    }
  }, [item])

  const handleStockToggle = (checked) => {
    setIsStock(checked)
    setManualFund(false)
    setPriceError('')
    if (checked) {
      setForm((f) => ({
        ...f,
        categoryId: stockCategoryId,
        currency: 'USD',
        ticker: '',
        shares: '',
        pricePerShare: '',
        value: '',
        name: '',
      }))
    }
  }

  const handleManualFundToggle = () => {
    setManualFund(true)
    setPriceError('')
    setForm((f) => ({
      ...f,
      ticker: '',
      name: '',
      pricePerShare: '',
      value: '',
      categoryId: retirementCategoryId,
      currency: baseCurrency,
    }))
  }

  const handleBackToSearch = () => {
    setManualFund(false)
    setPriceError('')
    setForm((f) => ({
      ...f,
      ticker: '',
      name: '',
      pricePerShare: '',
      value: '',
      categoryId: stockCategoryId,
      currency: 'USD',
    }))
  }

  const handleManualPriceChange = (val) => {
    const price = Number(val) || 0
    const shares = Number(form.shares) || 0
    setForm((f) => ({
      ...f,
      pricePerShare: val,
      value: shares && price ? String(shares * price) : '',
    }))
  }

  const handleStockSelect = async (stock) => {
    setPriceError('')
    setFetchingPrice(true)
    setForm((f) => ({
      ...f,
      ticker: stock.ticker,
      name: stock.name,
      pricePerShare: '',
      value: '',
    }))

    try {
      const quote = await fetchStockPrice(stock.ticker)
      setForm((f) => {
        const shares = Number(f.shares) || 0
        return {
          ...f,
          pricePerShare: String(quote.price),
          currency: quote.currency || f.currency,
          value: shares ? String(shares * quote.price) : '',
        }
      })
    } catch (err) {
      setPriceError(err.message)
    } finally {
      setFetchingPrice(false)
    }
  }

  // Auto-compute value when shares changes for stocks
  const handleSharesChange = (val) => {
    const shares = Number(val) || 0
    const price = Number(form.pricePerShare) || 0
    setForm((f) => ({
      ...f,
      shares: val,
      value: shares && price ? String(shares * price) : '',
    }))
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (isStock) {
      if (!manualFund && !form.ticker.trim()) errs.ticker = 'Select a stock'
      if (!form.shares || isNaN(Number(form.shares)) || Number(form.shares) <= 0)
        errs.shares = 'Enter valid number of units'
      if (manualFund && (!form.pricePerShare || isNaN(Number(form.pricePerShare)) || Number(form.pricePerShare) <= 0))
        errs.pricePerShare = 'Enter price per unit'
    }
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0)
      errs.value = 'Enter a valid positive number'
    if (!form.categoryId) errs.categoryId = 'Select a category'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const data = {
      type,
      name: form.name.trim(),
      categoryId: form.categoryId,
      value: Number(form.value),
      currency: form.currency,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: form.notes.trim(),
      isStock,
      ticker: isStock && !manualFund ? form.ticker.trim().toUpperCase() : null,
      shares: isStock ? Number(form.shares) : null,
      pricePerShare: isStock ? Number(form.pricePerShare) : null,
      lastPriceUpdate: isStock && !manualFund ? new Date().toISOString() : null,
    }

    if (item) {
      updateItem(item.id, data)
    } else {
      addItem(data)
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stock toggle - only for assets */}
      {type === 'asset' && (
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${
              isStock ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            onClick={() => handleStockToggle(!isStock)}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isStock ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            This is a stock / ETF / fund
          </span>
        </label>
      )}

      {isStock && !manualFund && (
        <>
          <StockSearchDropdown
            selectedTicker={form.ticker}
            onSelect={handleStockSelect}
            onManualEntry={handleManualFundToggle}
            error={errors.ticker}
          />

          {fetchingPrice && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Fetching price...
            </div>
          )}

          {priceError && (
            <p className="text-sm text-danger-500">{priceError}</p>
          )}

          {form.ticker && form.pricePerShare && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Price per unit</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {form.currency} {Number(form.pricePerShare).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {form.value && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Total value</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {form.currency} {Number(form.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}

          <Input
            label="Number of Units"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 10"
            value={form.shares}
            onChange={(e) => handleSharesChange(e.target.value)}
            error={errors.shares}
          />
        </>
      )}

      {isStock && manualFund && (
        <>
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-primary-700 dark:text-primary-300">
                Manual fund entry
              </span>
              <button
                type="button"
                onClick={handleBackToSearch}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 cursor-pointer"
              >
                Back to search
              </button>
            </div>
          </div>

          <Input
            label="Fund Name"
            placeholder="e.g. L&G PMC Target Date 2050-2055"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
            maxLength={100}
          />

          <Select
            label="Category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            options={filteredCategories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price per Unit"
              type="number"
              step="0.0001"
              min="0"
              placeholder="e.g. 1.85"
              value={form.pricePerShare}
              onChange={(e) => handleManualPriceChange(e.target.value)}
              error={errors.pricePerShare}
            />
            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              options={COMMON_CURRENCIES.map((c) => ({
                value: c.code,
                label: `${c.code} (${c.symbol})`,
              }))}
            />
          </div>

          <Input
            label="Number of Units"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 1500"
            value={form.shares}
            onChange={(e) => handleSharesChange(e.target.value)}
            error={errors.shares}
          />

          {form.value && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Total value</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {form.currency} {Number(form.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {!isStock && (
        <Input
          label="Name"
          placeholder={
            type === 'asset' ? 'e.g. Chase Checking' : 'e.g. Student Loan'
          }
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          maxLength={100}
        />
      )}

      {!isStock && (
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          options={filteredCategories.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
        />
      )}

      {!isStock && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Value"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            error={errors.value}
          />
          <Select
            label="Currency"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            options={COMMON_CURRENCIES.map((c) => ({
              value: c.code,
              label: `${c.code} (${c.symbol})`,
            }))}
          />
        </div>
      )}

      <Input
        label="Tags"
        placeholder="e.g. emergency-fund, joint (comma separated)"
        value={form.tags}
        onChange={(e) => setForm({ ...form, tags: e.target.value })}
        maxLength={200}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <textarea
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
          rows={2}
          placeholder="Optional notes..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          maxLength={500}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          {item ? 'Update' : 'Add'} {type === 'asset' ? 'Asset' : 'Liability'}
        </Button>
      </div>
    </form>
  )
}

function StockSearchDropdown({ selectedTicker, onSelect, onManualEntry, error }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const wrapperRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced live search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const stocks = await searchStocks(query)
        setResults(stocks)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  const handleSelect = (stock) => {
    setSelectedName(stock.name)
    setQuery('')
    setOpen(false)
    setResults([])
    onSelect(stock)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Search Stock / ETF
      </label>
      {selectedTicker && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery('') }}
          className={`w-full text-left rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
            error
              ? 'border-danger-500 focus:ring-danger-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
          } bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2`}
        >
          <span className="font-semibold text-primary-600 dark:text-primary-400">{selectedTicker}</span>
          {selectedName && (
            <span className="text-gray-500 dark:text-gray-400 ml-2">{selectedName}</span>
          )}
        </button>
      ) : (
        <input
          type="text"
          autoFocus
          placeholder="Type to search... e.g. Apple, TSLA, VOO"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors ${
            error
              ? 'border-danger-500 focus:ring-danger-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
          } bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2`}
        />
      )}
      {error && <p className="text-xs text-danger-500 mt-1">{error}</p>}
      <button
        type="button"
        onClick={onManualEntry}
        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 mt-1 cursor-pointer"
      >
        Can't find your fund? Enter manually
      </button>

      {open && (query.trim() || searching) && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {searching ? (
            <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 text-center space-y-2">
              <p>No results found</p>
              <button
                type="button"
                onClick={onManualEntry}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 cursor-pointer"
              >
                Enter fund details manually
              </button>
            </div>
          ) : (
            results.map((stock) => (
              <button
                key={stock.ticker}
                type="button"
                onClick={() => handleSelect(stock)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-primary-900/30 cursor-pointer transition-colors flex items-center gap-2 ${
                  stock.ticker === selectedTicker
                    ? 'bg-primary-50 dark:bg-primary-900/20'
                    : ''
                }`}
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100 w-16 shrink-0">
                  {stock.ticker}
                </span>
                <span className="text-gray-500 dark:text-gray-400 truncate flex-1">
                  {stock.name}
                </span>
                {stock.exchange && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {stock.exchange}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
