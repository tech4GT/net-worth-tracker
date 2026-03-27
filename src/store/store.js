import { create } from 'zustand'
import { DEFAULT_CATEGORIES } from '../lib/constants'
import { convertToBase, fetchExchangeRates } from '../lib/currency'
import { fetchMultipleStockPrices } from '../lib/stocks'
import { api } from '../lib/api'
import { track } from '../lib/telemetry'
import { toastSuccess, toastError } from '../components/ui/Toast'

const useStore = create((set, get) => ({
  // --- Data (loaded from API) ---
  items: [],
  categories: DEFAULT_CATEGORIES,
  snapshots: [],
  baseCurrency: 'USD',
  exchangeRates: {},
  theme: 'system',
  snapshotReminder: true,
  lastSnapshotDate: null,
  stocksLastRefreshed: null,

  // --- UI state ---
  loading: true,
  error: null,
  hydrated: false,
  pendingIds: new Set(),

  // --- Transient ---
  stocksRefreshing: false,
  stockRefreshErrors: {},

  // --- Budget Data ---
  budgetConfig: null,
  budgetCategories: [],
  budgetMonths: [],
  budgetYtdSummary: null,

  // --- Budget UI state ---
  budgetLoading: false,
  budgetHydrated: false,
  budgetError: null,
  parsedTransactions: null,
  parsingStatement: false,

  // --- Initial load ---
  loadUserData: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api.get('/api/state')
      set({
        items: data.items,
        categories: data.categories,
        snapshots: data.snapshots,
        baseCurrency: data.settings.baseCurrency || 'USD',
        exchangeRates: data.settings.exchangeRates || {},
        theme: data.settings.theme || 'system',
        snapshotReminder: data.settings.snapshotReminder ?? true,
        lastSnapshotDate: data.settings.lastSnapshotDate,
        stocksLastRefreshed: data.settings.stocksLastRefreshed,
        loading: false,
        hydrated: true,
      })
      // Auto-refresh stock prices on load
      get().refreshStockPrices()
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  // --- Items ---
  addItem: async (item) => {
    const tempId = crypto.randomUUID()
    const newItem = {
      ...item,
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({
      items: [...s.items, newItem],
      pendingIds: new Set([...s.pendingIds, tempId]),
    }))
    try {
      const saved = await api.post('/api/items', item)
      set((s) => ({
        items: s.items.map((i) => (i.id === tempId ? saved : i)),
        pendingIds: new Set([...s.pendingIds].filter((id) => id !== tempId)),
      }))
      track('item_add', { category: item.type })
      return saved
    } catch (err) {
      set((s) => ({
        items: s.items.filter((i) => i.id !== tempId),
        pendingIds: new Set([...s.pendingIds].filter((id) => id !== tempId)),
      }))
      toastError('Failed to add item')
      throw err
    }
  },

  updateItem: async (id, updates) => {
    const state = get()
    const original = state.items.find((i) => i.id === id)
    if (!original) return

    // Optimistic local update
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, ...updates, updatedAt: new Date().toISOString() }
          : i
      ),
    }))
    try {
      const saved = await api.put(`/api/items/${id}`, updates)
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? saved : i)),
      }))
      return saved
    } catch (err) {
      // Rollback
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? original : i)),
      }))
      toastError('Failed to update item')
      throw err
    }
  },

  deleteItem: async (id) => {
    const state = get()
    const original = state.items.find((i) => i.id === id)
    if (!original) return

    // Optimistic removal
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
    }))
    try {
      await api.delete(`/api/items/${id}`)
      track('item_delete')
    } catch (err) {
      // Rollback
      set((s) => ({
        items: [...s.items, original],
      }))
      toastError('Failed to delete item')
      throw err
    }
  },

  addItems: async (newItems) => {
    const tempEntries = newItems.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }))
    const tempIds = tempEntries.map((e) => e.id)

    // Optimistic add
    set((s) => ({
      items: [...s.items, ...tempEntries],
      pendingIds: new Set([...s.pendingIds, ...tempIds]),
    }))
    try {
      const saved = await api.post('/api/items/batch', { items: newItems })
      // Replace all temp entries with server-returned items
      const tempIdSet = new Set(tempIds)
      set((s) => ({
        items: [
          ...s.items.filter((i) => !tempIdSet.has(i.id)),
          ...saved,
        ],
        pendingIds: new Set(
          [...s.pendingIds].filter((id) => !tempIdSet.has(id))
        ),
      }))
      return saved
    } catch (err) {
      // Rollback: remove all temp items
      const tempIdSet = new Set(tempIds)
      set((s) => ({
        items: s.items.filter((i) => !tempIdSet.has(i.id)),
        pendingIds: new Set(
          [...s.pendingIds].filter((id) => !tempIdSet.has(id))
        ),
      }))
      toastError('Failed to add items')
      throw err
    }
  },

  // --- Categories ---
  addCategory: async (category) => {
    const tempId = crypto.randomUUID()
    const newCat = { ...category, id: tempId, isDefault: false }

    set((s) => ({
      categories: [...s.categories, newCat],
    }))
    try {
      const saved = await api.post('/api/categories', category)
      set((s) => ({
        categories: s.categories.map((c) => (c.id === tempId ? saved : c)),
      }))
      return saved
    } catch (err) {
      set((s) => ({
        categories: s.categories.filter((c) => c.id !== tempId),
      }))
      toastError('Failed to add category')
      throw err
    }
  },

  updateCategory: async (id, updates) => {
    const state = get()
    const original = state.categories.find((c) => c.id === id)
    if (!original) return

    set((s) => ({
      categories: s.categories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }))
    try {
      const saved = await api.put(`/api/categories/${id}`, updates)
      set((s) => ({
        categories: s.categories.map((c) => (c.id === id ? saved : c)),
      }))
      return saved
    } catch (err) {
      set((s) => ({
        categories: s.categories.map((c) => (c.id === id ? original : c)),
      }))
      toastError('Failed to update category')
      throw err
    }
  },

  deleteCategory: async (id) => {
    const state = get()
    const cat = state.categories.find((c) => c.id === id)
    if (!cat) return

    // Determine fallback category (same referential integrity logic as before)
    const fallbackId = state.categories.find(
      (c) =>
        c.id !== id &&
        (c.type === cat.type || c.type === 'both') &&
        c.isDefault
    )?.id

    try {
      await api.delete(`/api/categories/${id}`)
      // On success: remove category locally, reassign affected items
      set((s) => ({
        categories: s.categories.filter((c) => c.id !== id),
        items: fallbackId
          ? s.items.map((i) =>
              i.categoryId === id ? { ...i, categoryId: fallbackId } : i
            )
          : s.items,
      }))
      track('category_delete')
    } catch (err) {
      toastError('Failed to delete category')
      throw err
    }
  },

  // --- Snapshots ---
  takeSnapshot: async () => {
    try {
      const snapshot = await api.post('/api/snapshots')
      set((s) => ({
        snapshots: [...s.snapshots, snapshot],
        lastSnapshotDate: snapshot.date,
      }))
      track('snapshot_take')
      toastSuccess('Snapshot created')
      return snapshot
    } catch (err) {
      toastError('Failed to create snapshot')
      throw err
    }
  },

  deleteSnapshot: async (date) => {
    const state = get()
    const snapshot = state.snapshots.find((s) => s.date === date)
    if (!snapshot) return

    // Optimistic removal
    set((s) => ({
      snapshots: s.snapshots.filter((snap) => snap.date !== date),
    }))
    try {
      await api.delete(`/api/snapshots/${encodeURIComponent(date)}`)
      track('snapshot_delete')
    } catch (err) {
      // Rollback
      set((s) => ({
        snapshots: [...s.snapshots, snapshot],
      }))
      toastError('Failed to delete snapshot')
      throw err
    }
  },

  // --- Currency ---
  setBaseCurrency: async (code) => {
    const prev = get().baseCurrency
    set({ baseCurrency: code })
    try {
      await api.put('/api/settings', { baseCurrency: code })
    } catch (err) {
      set({ baseCurrency: prev })
      toastError('Failed to update currency')
      throw err
    }
  },

  setExchangeRate: async (code, rate) => {
    const prev = get().exchangeRates
    set((s) => ({
      exchangeRates: { ...s.exchangeRates, [code]: rate },
    }))
    try {
      await api.put('/api/settings', {
        exchangeRates: { ...prev, [code]: rate },
      })
    } catch (err) {
      set({ exchangeRates: prev })
      toastError('Failed to update exchange rate')
      throw err
    }
  },

  removeExchangeRate: async (code) => {
    const prev = get().exchangeRates
    const { [code]: _, ...rest } = prev
    set({ exchangeRates: rest })
    try {
      await api.put('/api/settings', { exchangeRates: rest })
    } catch (err) {
      set({ exchangeRates: prev })
      toastError('Failed to remove exchange rate')
      throw err
    }
  },

  refreshExchangeRates: async () => {
    const { baseCurrency, exchangeRates } = get()
    const fetched = await fetchExchangeRates(baseCurrency)
    const merged = { ...exchangeRates, ...fetched }
    set({ exchangeRates: merged })
    try {
      await api.put('/api/settings', { exchangeRates: merged })
      track('rates_refresh')
    } catch (err) {
      // Rates are still valid locally even if persist fails
      toastError('Rates refreshed locally but failed to save')
    }
  },

  // --- Stocks ---
  refreshStockPrices: async () => {
    const state = get()
    if (state.stocksRefreshing) return

    const stockItems = state.items.filter((i) => i.isStock && i.ticker)
    if (stockItems.length === 0) return

    const tickers = [
      ...new Set(stockItems.map((i) => i.ticker.toUpperCase())),
    ]

    set({ stocksRefreshing: true, stockRefreshErrors: {} })

    try {
      const { results, errors } = await fetchMultipleStockPrices(tickers)

      const updatedItems = state.items.map((item) => {
        if (!item.isStock || !item.ticker) return item
        const quote = results[item.ticker.toUpperCase()]
        if (!quote) return item
        return {
          ...item,
          pricePerShare: quote.price,
          value: item.shares * quote.price,
          currency: quote.currency || item.currency,
          lastPriceUpdate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      })

      const now = new Date().toISOString()
      set({
        items: updatedItems,
        stocksRefreshing: false,
        stocksLastRefreshed: now,
        stockRefreshErrors: errors,
      })

      // Persist updated stock items to backend
      const changedItems = updatedItems.filter(
        (item) => item.isStock && item.ticker && results[item.ticker.toUpperCase()]
      )
      if (changedItems.length > 0) {
        try {
          await api.put('/api/items/batch', { updates: changedItems })
          await api.put('/api/settings', { stocksLastRefreshed: now })
        } catch {
          // Stock prices updated locally; backend sync failed silently
        }
      }
      track('stocks_refresh')
    } catch (err) {
      set({
        stocksRefreshing: false,
        stockRefreshErrors: { _general: err.message },
      })
      throw err
    }
  },

  // --- Settings ---
  setTheme: async (theme) => {
    const prev = get().theme
    set({ theme })
    try {
      await api.put('/api/settings', { theme })
    } catch (err) {
      set({ theme: prev })
      toastError('Failed to update theme')
      throw err
    }
  },

  // --- Import/Export ---
  importData: async (data) => {
    try {
      const result = await api.post('/api/import', data)
      // Re-fetch all state from server
      await get().loadUserData()
      track('data_import')
      toastSuccess(`Imported ${result.imported.items} items`)
    } catch (err) {
      toastError('Import failed')
      throw err
    }
  },

  // --- Budget ---
  loadBudgetData: async () => {
    set({ budgetLoading: true, budgetError: null })
    try {
      const data = await api.get('/api/budget/state')
      set({
        budgetConfig: data.config,
        budgetCategories: data.categories,
        budgetMonths: data.months,
        budgetLoading: false,
        budgetHydrated: true,
      })
      track('budget_load')
    } catch (err) {
      set({ budgetLoading: false, budgetError: err.message })
    }
  },

  loadYtdSummary: async (year) => {
    try {
      const data = await api.get(`/api/budget/ytd-summary?year=${year}`)
      set({ budgetYtdSummary: data })
    } catch (err) {
      toastError('Failed to load YTD summary')
      throw err
    }
  },

  saveBudgetConfig: async (config) => {
    const prev = get().budgetConfig
    set({ budgetConfig: config })
    try {
      const saved = await api.put('/api/budget/config', config)
      set({ budgetConfig: saved })
      track('budget_config_save')
      toastSuccess('Budget configuration saved')
      return saved
    } catch (err) {
      set({ budgetConfig: prev })
      toastError('Failed to save budget configuration')
      throw err
    }
  },

  addBudgetCategory: async (category) => {
    const tempId = crypto.randomUUID()
    const newCat = { ...category, id: tempId }

    set((s) => ({
      budgetCategories: [...s.budgetCategories, newCat],
    }))
    try {
      const saved = await api.post('/api/budget/categories', category)
      set((s) => ({
        budgetCategories: s.budgetCategories.map((c) => (c.id === tempId ? saved : c)),
      }))
      track('budget_category_add')
      return saved
    } catch (err) {
      set((s) => ({
        budgetCategories: s.budgetCategories.filter((c) => c.id !== tempId),
      }))
      toastError('Failed to add budget category')
      throw err
    }
  },

  updateBudgetCategory: async (id, updates) => {
    const state = get()
    const original = state.budgetCategories.find((c) => c.id === id)
    if (!original) return

    set((s) => ({
      budgetCategories: s.budgetCategories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }))
    try {
      const saved = await api.put(`/api/budget/categories/${id}`, updates)
      set((s) => ({
        budgetCategories: s.budgetCategories.map((c) => (c.id === id ? saved : c)),
      }))
      track('budget_category_update')
      return saved
    } catch (err) {
      set((s) => ({
        budgetCategories: s.budgetCategories.map((c) => (c.id === id ? original : c)),
      }))
      toastError('Failed to update budget category')
      throw err
    }
  },

  deleteBudgetCategory: async (id) => {
    const state = get()
    const cat = state.budgetCategories.find((c) => c.id === id)
    if (!cat) return
    if (cat.isDefault) {
      toastError('Cannot delete a default budget category')
      return
    }

    set((s) => ({
      budgetCategories: s.budgetCategories.filter((c) => c.id !== id),
    }))
    try {
      await api.delete(`/api/budget/categories/${id}`)
      track('budget_category_delete')
    } catch (err) {
      set((s) => ({
        budgetCategories: [...s.budgetCategories, cat],
      }))
      toastError('Failed to delete budget category')
      throw err
    }
  },

  parseStatement: async ({ month, statementText, actualIncome }) => {
    set({ parsingStatement: true })
    try {
      const result = await api.post('/api/budget/parse-statement', {
        month,
        statementText,
        actualIncome,
      })
      set({ parsedTransactions: result, parsingStatement: false })
      track('budget_parse_statement')
      return result
    } catch (err) {
      set({ parsingStatement: false })
      toastError('Failed to parse statement')
      throw err
    }
  },

  confirmTransactions: async ({ month, actualIncome, transactions }) => {
    try {
      const result = await api.post('/api/budget/transactions/confirm', {
        month,
        actualIncome,
        transactions,
      })
      set((s) => ({
        parsedTransactions: null,
        budgetMonths: [...s.budgetMonths.filter((m) => m.month !== month), result],
      }))
      // Reload YTD summary for the year of the confirmed month
      const year = month.slice(0, 4)
      await get().loadYtdSummary(year)
      track('budget_transactions_confirm')
      toastSuccess('Transactions confirmed')
      return result
    } catch (err) {
      toastError('Failed to confirm transactions')
      throw err
    }
  },

  clearParsedTransactions: () => {
    set({ parsedTransactions: null })
  },

  loadMonthTransactions: async (month) => {
    try {
      const data = await api.get(`/api/budget/months/${encodeURIComponent(month)}/transactions`)
      return data
    } catch (err) {
      toastError('Failed to load month transactions')
      throw err
    }
  },

  deleteMonth: async (month) => {
    const state = get()
    const original = state.budgetMonths.find((m) => m.month === month)
    if (!original) return

    set((s) => ({
      budgetMonths: s.budgetMonths.filter((m) => m.month !== month),
    }))
    try {
      await api.delete(`/api/budget/months/${encodeURIComponent(month)}`)
      track('budget_month_delete')
      toastSuccess('Month deleted')
    } catch (err) {
      set((s) => ({
        budgetMonths: [...s.budgetMonths, original],
      }))
      toastError('Failed to delete month')
      throw err
    }
  },
}))

export default useStore
