export const DEFAULT_CATEGORIES = [
  // Assets
  { id: 'cat-cash', name: 'Cash & Checking', type: 'asset', icon: 'banknotes', color: '#22c55e', isDefault: true },
  { id: 'cat-savings', name: 'Savings', type: 'asset', icon: 'piggy-bank', color: '#10b981', isDefault: true },
  { id: 'cat-investments', name: 'Investments', type: 'asset', icon: 'chart', color: '#6366f1', isDefault: true },
  { id: 'cat-retirement', name: 'Retirement', type: 'asset', icon: 'shield', color: '#8b5cf6', isDefault: true },
  { id: 'cat-real-estate', name: 'Real Estate', type: 'asset', icon: 'home', color: '#f59e0b', isDefault: true },
  { id: 'cat-crypto', name: 'Crypto', type: 'asset', icon: 'bolt', color: '#f97316', isDefault: true },
  { id: 'cat-stocks', name: 'Stocks', type: 'asset', icon: 'chart-bar', color: '#3b82f6', isDefault: true },
  { id: 'cat-vehicles', name: 'Vehicles', type: 'asset', icon: 'car', color: '#06b6d4', isDefault: true },
  { id: 'cat-other-assets', name: 'Other Assets', type: 'asset', icon: 'box', color: '#64748b', isDefault: true },
  // Liabilities
  { id: 'cat-credit-cards', name: 'Credit Cards', type: 'liability', icon: 'card', color: '#ef4444', isDefault: true },
  { id: 'cat-student-loans', name: 'Student Loans', type: 'liability', icon: 'academic', color: '#f87171', isDefault: true },
  { id: 'cat-mortgage', name: 'Mortgage', type: 'liability', icon: 'home', color: '#dc2626', isDefault: true },
  { id: 'cat-auto-loan', name: 'Auto Loan', type: 'liability', icon: 'car', color: '#fb923c', isDefault: true },
  { id: 'cat-personal-loan', name: 'Personal Loan', type: 'liability', icon: 'user', color: '#e11d48', isDefault: true },
  { id: 'cat-other-liabilities', name: 'Other Liabilities', type: 'liability', icon: 'box', color: '#9f1239', isDefault: true },
]

export const COMMON_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '\u20AC' },
  { code: 'GBP', name: 'British Pound', symbol: '\u00A3' },
  { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5' },
  { code: 'BTC', name: 'Bitcoin', symbol: '\u20BF' },
  { code: 'ETH', name: 'Ethereum', symbol: '\u039E' },
]

export const CHART_COLORS = [
  '#22c55e', '#6366f1', '#f59e0b', '#06b6d4', '#8b5cf6',
  '#f97316', '#ec4899', '#10b981', '#64748b', '#ef4444',
  '#14b8a6', '#a855f7', '#eab308', '#3b82f6', '#e11d48',
]
export const SCHEMA_VERSION = 3

export const DEFAULT_BUDGET_CATEGORIES = [
  { id: 'bcat-housing', name: 'Housing', color: '#6366f1', icon: 'home', percentOfIncome: 30 },
  { id: 'bcat-transportation', name: 'Transportation', color: '#f59e0b', icon: 'car', percentOfIncome: 10 },
  { id: 'bcat-food', name: 'Food & Dining', color: '#22c55e', icon: 'utensils', percentOfIncome: 15 },
  { id: 'bcat-utilities', name: 'Utilities', color: '#06b6d4', icon: 'bolt', percentOfIncome: 5 },
  { id: 'bcat-insurance', name: 'Insurance', color: '#8b5cf6', icon: 'shield', percentOfIncome: 5 },
  { id: 'bcat-healthcare', name: 'Healthcare', color: '#ec4899', icon: 'heart', percentOfIncome: 5 },
  { id: 'bcat-savings', name: 'Savings & Investing', color: '#10b981', icon: 'piggy-bank', percentOfIncome: 15 },
  { id: 'bcat-entertainment', name: 'Entertainment', color: '#f97316', icon: 'star', percentOfIncome: 5 },
  { id: 'bcat-personal', name: 'Personal', color: '#64748b', icon: 'user', percentOfIncome: 5 },
  { id: 'bcat-other', name: 'Other', color: '#9f1239', icon: 'box', percentOfIncome: 5 },
]
