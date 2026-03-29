import { useState, useEffect } from 'react'
import useStore from '../store/store'
import BudgetSetup from '../components/budget/BudgetSetup'
import YTDSummaryCards from '../components/budget/YTDSummaryCards'
import YTDByCategoryChart from '../components/budget/YTDByCategoryChart'
import MonthlyTrendChart from '../components/budget/MonthlyTrendChart'
import MonthSelector from '../components/budget/MonthSelector'
import MonthSummaryCard from '../components/budget/MonthSummaryCard'
import StatementUpload from '../components/budget/StatementUpload'
import TransactionReview from '../components/budget/TransactionReview'
import TransactionList from '../components/budget/TransactionList'
import BudgetCategoryList from '../components/budget/BudgetCategoryList'
import BudgetCategoryForm from '../components/budget/BudgetCategoryForm'
import Button from '../components/ui/Button'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'categories', label: 'Categories' },
]

export default function BudgetPage() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingBudget, setEditingBudget] = useState(false)

  // Month selector state — must be declared before any early returns (Rules of Hooks)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  const budgetConfig = useStore((s) => s.budgetConfig)
  const budgetLoading = useStore((s) => s.budgetLoading)
  const budgetHydrated = useStore((s) => s.budgetHydrated)
  const budgetError = useStore((s) => s.budgetError)
  const loadBudgetData = useStore((s) => s.loadBudgetData)
  const loadYtdSummary = useStore((s) => s.loadYtdSummary)
  const parsedTransactions = useStore((s) => s.parsedTransactions)
  const budgetMonths = useStore((s) => s.budgetMonths)
  const budgetCategories = useStore((s) => s.budgetCategories)

  // Load budget data on mount
  useEffect(() => {
    if (!budgetHydrated) {
      loadBudgetData()
    }
  }, [budgetHydrated, loadBudgetData])

  // Load YTD summary when config is available
  useEffect(() => {
    if (budgetConfig?.year) {
      loadYtdSummary(String(budgetConfig.year))
    }
  }, [budgetConfig?.year, loadYtdSummary])

  if (budgetLoading && !budgetHydrated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <svg
          className="w-8 h-8 text-primary-600 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading budget data...
        </p>
      </div>
    )
  }

  if (budgetError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-sm text-danger-500 mb-3">{budgetError}</p>
          <Button onClick={() => loadBudgetData()}>Retry</Button>
        </div>
      </div>
    )
  }

  if (!budgetConfig || editingBudget) {
    return (
      <BudgetSetup
        initialConfig={editingBudget ? budgetConfig : null}
        initialCategories={editingBudget ? budgetCategories : null}
        onCancel={editingBudget ? () => setEditingBudget(false) : null}
      />
    )
  }

  const currentMonthData = (budgetMonths || []).find((m) => m.month === selectedMonth)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => setEditingBudget(true)}
          className="pb-3 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit Budget
        </button>
      </div>

      {/* Dashboard tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <YTDSummaryCards />
          <YTDByCategoryChart />
          <MonthlyTrendChart />
        </div>
      )}

      {/* Monthly tab */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          <MonthSelector
            selectedMonth={selectedMonth}
            onChangeMonth={setSelectedMonth}
          />
          <MonthSummaryCard month={selectedMonth} />

          {parsedTransactions ? (
            <TransactionReview month={selectedMonth} />
          ) : currentMonthData ? (
            <TransactionList month={selectedMonth} />
          ) : (
            <StatementUpload month={selectedMonth} />
          )}
        </div>
      )}

      {/* Categories tab */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setEditingCategory(null)
                setShowCategoryForm(true)
              }}
            >
              Add Category
            </Button>
          </div>
          <BudgetCategoryList
            onEdit={(cat) => {
              setEditingCategory(cat)
              setShowCategoryForm(true)
            }}
          />
          <BudgetCategoryForm
            open={showCategoryForm}
            onClose={() => {
              setShowCategoryForm(false)
              setEditingCategory(null)
            }}
            category={editingCategory}
          />
        </div>
      )}
    </div>
  )
}
