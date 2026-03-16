export function convertToBase(value, fromCurrency, baseCurrency, exchangeRates) {
  if (fromCurrency === baseCurrency) return value
  const rate = exchangeRates[fromCurrency]
  if (!rate || rate <= 0) return 0
  // exchangeRates stores: 1 baseCurrency = X foreignCurrency
  // So to convert foreign -> base: value / rate
  return value / rate
}

// Returns list of currency codes used by items that have no exchange rate configured
export function getMissingRates(items, baseCurrency, exchangeRates) {
  const currencies = new Set(
    items.filter((i) => i.currency !== baseCurrency).map((i) => i.currency)
  )
  return [...currencies].filter((c) => !exchangeRates[c] || exchangeRates[c] <= 0)
}

export function formatCurrency(value, currencyCode = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    // Fallback for unknown currency codes (e.g., BTC, ETH)
    return `${currencyCode} ${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)}`
  }
}

export async function fetchExchangeRates(baseCurrency) {
  const res = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(baseCurrency)}`
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  // Returns { rates: { EUR: 0.92, GBP: 0.79, ... } }
  return data.rates || {}
}

export function formatCompactCurrency(value, currencyCode = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value)
  } catch {
    return `${currencyCode} ${new Intl.NumberFormat(undefined, {
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value)}`
  }
}
