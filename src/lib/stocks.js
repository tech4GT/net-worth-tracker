const YAHOO_BASE = 'https://query2.finance.yahoo.com'

export async function fetchStockPrice(ticker) {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  const result = data.chart?.result?.[0]
  if (!result) {
    throw new Error(`No data found for "${ticker}"`)
  }

  const meta = result.meta
  const price = meta.regularMarketPrice
  const previousClose = meta.chartPreviousClose || meta.previousClose

  if (price == null) {
    throw new Error(`No price data for "${ticker}"`)
  }

  return {
    price,
    previousClose,
    change: previousClose ? price - previousClose : 0,
    changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : 0,
    currency: meta.currency || 'USD',
  }
}

export async function searchStocks(query) {
  if (!query || query.trim().length < 1) return []
  const url = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(query.trim())}&quotesCount=12&newsCount=0&listsCount=0`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.quotes || [])
    .filter((q) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
    .map((q) => ({
      ticker: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || '',
      type: q.quoteType,
    }))
}

export async function fetchMultipleStockPrices(tickers) {
  const results = {}
  const errors = {}

  for (const ticker of tickers) {
    try {
      results[ticker] = await fetchStockPrice(ticker)
    } catch (err) {
      errors[ticker] = err.message
    }
  }

  return { results, errors }
}
