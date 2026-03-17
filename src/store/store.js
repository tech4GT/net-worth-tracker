import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CATEGORIES, SCHEMA_VERSION } from '../lib/constants'
import { convertToBase, fetchExchangeRates } from '../lib/currency'
import { fetchMultipleStockPrices } from '../lib/stocks'
import { idbStorage } from '../lib/storage'

const useStore = create(
  persist(
    (set, get) => ({
      // --- Items ---
      items: [],

      addItem: (item) =>
        set((state) => ({
          items: [
            ...state.items,
            {
              ...item,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })),

      updateItem: (id, updates) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id
              ? { ...i, ...updates, updatedAt: new Date().toISOString() }
              : i
          ),
        })),

      deleteItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      addItems: (newItems) =>
        set((state) => ({
          items: [
            ...state.items,
            ...newItems.map((item) => ({
              ...item,
              id: crypto.randomUUID(),
              createdAt: item.createdAt || new Date().toISOString(),
              updatedAt: item.updatedAt || new Date().toISOString(),
            })),
          ],
        })),

      // --- Categories ---
      categories: DEFAULT_CATEGORIES,

      addCategory: (category) =>
        set((state) => ({
          categories: [
            ...state.categories,
            { ...category, id: crypto.randomUUID(), isDefault: false },
          ],
        })),

      updateCategory: (id, updates) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteCategory: (id) => {
        const state = get()
        const cat = state.categories.find((c) => c.id === id)
        // Reassign orphaned items to a fallback category of the same type
        const fallback = state.categories.find(
          (c) => c.id !== id && (c.type === cat?.type || c.type === 'both') && c.isDefault
        )
        if (!fallback) {
          // No safe fallback — block deletion to prevent orphaned items
          console.warn('[NWT] Cannot delete category: no default fallback category of the same type exists')
          return
        }
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          items: s.items.map((i) => (i.categoryId === id ? { ...i, categoryId: fallback.id } : i)),
        }))
      },

      // --- Snapshots ---
      snapshots: [],

      takeSnapshot: () => {
        const state = get()
        const { items, categories, baseCurrency, exchangeRates, snapshots } = state
        const now = new Date()
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        // Prevent duplicate snapshots for the same month
        const existing = snapshots.find((s) => s.date === date)
        if (existing) {
          // Replace the existing snapshot for this month
          set((s) => ({
            snapshots: s.snapshots.filter((snap) => snap.id !== existing.id),
          }))
        }

        let totalAssets = 0
        let totalLiabilities = 0
        const categoryTotals = {}

        items.forEach((item) => {
          const converted = convertToBase(
            item.value,
            item.currency,
            baseCurrency,
            exchangeRates
          )
          if (item.type === 'asset') {
            totalAssets += converted
          } else {
            totalLiabilities += converted
          }
          if (!categoryTotals[item.categoryId]) {
            const cat = categories.find((c) => c.id === item.categoryId)
            categoryTotals[item.categoryId] = {
              categoryId: item.categoryId,
              name: cat?.name || 'Unknown',
              total: 0,
              type: item.type,
            }
          }
          categoryTotals[item.categoryId].total += converted
        })

        const snapshot = {
          id: crypto.randomUUID(),
          date,
          baseCurrency,
          totalAssets,
          totalLiabilities,
          netWorth: totalAssets - totalLiabilities,
          breakdown: Object.values(categoryTotals),
          items: JSON.parse(JSON.stringify(items)),
          createdAt: new Date().toISOString(),
        }

        set((s) => ({
          snapshots: [...s.snapshots, snapshot],
          lastSnapshotDate: date,
        }))
      },

      deleteSnapshot: (id) =>
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.id !== id),
        })),

      // --- Currency ---
      baseCurrency: 'USD',
      exchangeRates: {},

      setBaseCurrency: (code) => set({ baseCurrency: code }),

      setExchangeRate: (code, rate) =>
        set((state) => ({
          exchangeRates: { ...state.exchangeRates, [code]: rate },
        })),

      removeExchangeRate: (code) =>
        set((state) => {
          const { [code]: _, ...rest } = state.exchangeRates
          return { exchangeRates: rest }
        }),

      refreshExchangeRates: async () => {
        const { baseCurrency, exchangeRates } = get()
        const fetched = await fetchExchangeRates(baseCurrency)
        // Merge fetched rates into existing (preserves manually set rates for crypto etc.)
        set({
          exchangeRates: { ...exchangeRates, ...fetched },
        })
      },

      // --- Stocks ---
      stocksRefreshing: false,
      stocksLastRefreshed: null,
      stockRefreshErrors: {},

      refreshStockPrices: async () => {
        const state = get()
        if (state.stocksRefreshing) return // guard against concurrent calls

        const stockItems = state.items.filter((i) => i.isStock && i.ticker)
        if (stockItems.length === 0) return

        const tickers = [...new Set(stockItems.map((i) => i.ticker.toUpperCase()))]

        set({ stocksRefreshing: true, stockRefreshErrors: {} })

        try {
          const { results, errors } = await fetchMultipleStockPrices(tickers)

          set((state) => ({
            items: state.items.map((item) => {
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
            }),
            stocksRefreshing: false,
            stocksLastRefreshed: new Date().toISOString(),
            stockRefreshErrors: errors,
          }))
        } catch (err) {
          set({ stocksRefreshing: false, stockRefreshErrors: { _general: err.message } })
          throw err
        }
      },

      // --- Settings ---
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      snapshotReminder: true,
      lastSnapshotDate: null,

      // --- Import/Export ---
      importData: (data) => {
        set({
          items: data.items || [],
          categories: data.categories || DEFAULT_CATEGORIES,
          snapshots: data.snapshots || [],
          baseCurrency: data.baseCurrency || 'USD',
          exchangeRates: data.exchangeRates || {},
          theme: data.theme || 'system',
          lastSnapshotDate: data.lastSnapshotDate || null,
          snapshotReminder: data.snapshotReminder ?? true,
        })
      },
    }),
    {
      name: 'nwt-store',
      version: SCHEMA_VERSION,
      storage: idbStorage,
      // Don't persist transient UI state
      partialize: (state) => {
        const { stocksRefreshing, stockRefreshErrors, ...rest } = state
        return rest
      },
      migrate: (persisted, version) => {
        if (version < 3) {
          const cats = persisted.categories || []
          if (!cats.find((c) => c.id === 'cat-stocks')) {
            cats.push({ id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true })
            persisted.categories = cats
          }
          persisted.items = (persisted.items || []).map((item) => {
            if (item.isStock && item.ticker) {
              return { ...item, categoryId: 'cat-stocks' }
            }
            return item
          })
        }
        return persisted
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const cats = state.categories
        const hasCatStocks = cats.some((c) => c.id === 'cat-stocks')
        // Ensure cat-stocks exists
        if (!hasCatStocks) {
          state.categories = [...cats, { id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true }]
        }
        // Fix any stock items with wrong/missing category
        const needsFix = state.items.some((i) => i.isStock && i.categoryId !== 'cat-stocks' && i.categoryId !== 'cat-retirement')
        if (needsFix) {
          useStore.setState({
            categories: hasCatStocks ? cats : [...cats, { id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true }],
            items: state.items.map((item) => {
              if (item.isStock && item.ticker && item.categoryId !== 'cat-stocks') {
                return { ...item, categoryId: 'cat-stocks' }
              }
              return item
            }),
          })
        } else if (!hasCatStocks) {
          useStore.setState({ categories: [...cats, { id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true }] })
        }
      },
    }
  )
)

export default useStore
