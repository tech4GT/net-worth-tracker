import { useState } from 'react'
import useStore from '../../store/store'
import { COMMON_CURRENCIES, DEFAULT_BUDGET_CATEGORIES, CHART_COLORS } from '../../lib/constants'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

export default function BudgetSetup({ initialConfig = null, initialCategories = null, onCancel = null }) {
  const saveBudgetConfig = useStore((s) => s.saveBudgetConfig)
  const addBudgetCategory = useStore((s) => s.addBudgetCategory)
  const deleteBudgetCategory = useStore((s) => s.deleteBudgetCategory)
  const loadBudgetData = useStore((s) => s.loadBudgetData)
  const validateBudgetCategories = useStore((s) => s.validateBudgetCategories)

  const isEditing = !!initialConfig

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationIssues, setValidationIssues] = useState(null)
  const [skipValidation, setSkipValidation] = useState(false)

  // Step 1: Config — pre-fill from existing config if editing
  const currentYear = new Date().getFullYear()
  const [incomeInput, setIncomeInput] = useState(
    initialConfig ? String(initialConfig.yearlyIncome || '') : ''
  )
  const [incomePeriod, setIncomePeriod] = useState('yearly')
  const [year, setYear] = useState(
    initialConfig ? String(initialConfig.year) : String(currentYear)
  )
  const [currency, setCurrency] = useState(
    initialConfig?.currency || 'GBP'
  )

  const yearlyIncome = incomePeriod === 'monthly'
    ? (Number(incomeInput) || 0) * 12
    : (Number(incomeInput) || 0)
  const monthlyIncome = yearlyIncome / 12

  // Step 2: Categories — pre-fill from existing categories if editing
  const [budgetMode, setBudgetMode] = useState('percentage')
  const [amountPeriod, setAmountPeriod] = useState('monthly')
  const [categories, setCategories] = useState(() => {
    if (initialCategories && initialCategories.length > 0) {
      return initialCategories.map((c) => ({
        ...c,
        included: true,
        description: c.description || '',
        isExisting: true,
      }))
    }
    return DEFAULT_BUDGET_CATEGORIES.map((c) => ({ ...c, included: true, description: '' }))
  })
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')

  // Compute percent from amount or vice versa
  const getCatPercent = (cat) => cat.percentOfIncome
  const getCatAmount = (cat, period) => {
    const yearly = yearlyIncome * cat.percentOfIncome / 100
    return period === 'monthly' ? yearly / 12 : yearly
  }

  const totalPercent = categories
    .filter((c) => c.included)
    .reduce((sum, c) => sum + c.percentOfIncome, 0)

  const totalAmount = categories
    .filter((c) => c.included)
    .reduce((sum, c) => sum + yearlyIncome * c.percentOfIncome / 100, 0)

  const toggleCategory = (id) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, included: !c.included } : c))
    )
  }

  const updateByPercent = (id, value) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, percentOfIncome: Number(value) || 0 } : c))
    )
  }

  const updateDescription = (id, description) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, description } : c))
    )
    // Don't clear validation issues here — the description input is shown
    // because of the issue. Clearing would hide the input mid-typing.
  }

  const updateByAmount = (id, value, period) => {
    if (!yearlyIncome) return
    const amount = Number(value) || 0
    const yearlyAmount = period === 'monthly' ? amount * 12 : amount
    const percent = Math.round((yearlyAmount / yearlyIncome) * 10000) / 100
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, percentOfIncome: Math.min(percent, 100) } : c))
    )
  }

  const updateName = (id, name) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    )
  }

  const addCategory = () => {
    if (!newName.trim() || !newValue) return
    const usedColors = categories.map((c) => c.color)
    const availableColor = CHART_COLORS.find((c) => !usedColors.includes(c)) || '#64748b'

    let percent
    if (budgetMode === 'percentage') {
      percent = Number(newValue) || 0
    } else {
      const amount = Number(newValue) || 0
      const yearlyAmount = amountPeriod === 'monthly' ? amount * 12 : amount
      percent = yearlyIncome ? Math.round((yearlyAmount / yearlyIncome) * 10000) / 100 : 0
    }

    setCategories((prev) => [
      ...prev,
      {
        id: `bcat-custom-${Date.now()}`,
        name: newName.trim(),
        color: availableColor,
        icon: 'tag',
        percentOfIncome: percent,
        included: true,
        isCustom: true,
      },
    ])
    setNewName('')
    setNewValue('')
  }

  const removeCategory = (id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }

  const handleFinish = async () => {
    const included = categories.filter((c) => c.included)

    // Run AI validation unless the user chose to skip
    if (!skipValidation) {
      setValidating(true)
      setValidationIssues(null)
      try {
        const result = await validateBudgetCategories(
          included.map((c) => ({ name: c.name, percentOfIncome: c.percentOfIncome, description: c.description || '' }))
        )
        if (result.valid === false && result.issues && result.issues.length > 0) {
          setValidationIssues(result.issues)
          setValidating(false)
          return
        }
      } catch {
        // If validation fails (network error, etc.), proceed anyway
      }
      setValidating(false)
    }

    // Proceed with saving
    setSaving(true)
    try {
      await saveBudgetConfig({
        yearlyIncome,
        year: Number(year),
        currency,
      })

      if (isEditing) {
        // Delete categories that were removed or unchecked
        const removedCats = (initialCategories || []).filter(
          (orig) => !included.some((c) => c.id === orig.id)
        )
        for (const cat of removedCats) {
          try { await deleteBudgetCategory(cat.id) } catch { /* ignore */ }
        }
        // Update existing + create new
        for (const cat of included) {
          await addBudgetCategory({
            name: cat.name,
            color: cat.color,
            icon: cat.icon,
            percentOfIncome: cat.percentOfIncome,
            ...(cat.description ? { description: cat.description } : {}),
          })
        }
      } else {
        for (const cat of included) {
          await addBudgetCategory({
            name: cat.name,
            color: cat.color,
            icon: cat.icon,
            percentOfIncome: cat.percentOfIncome,
            ...(cat.description ? { description: cat.description } : {}),
          })
        }
      }

      await loadBudgetData()
      if (onCancel) onCancel() // Exit edit mode
    } catch {
      // Errors handled by store
    } finally {
      setSaving(false)
      setSkipValidation(false)
    }
  }

  const currencySymbol = COMMON_CURRENCIES.find((c) => c.code === currency)?.symbol || currency

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {step === 1 ? (isEditing ? 'Edit Your Budget' : 'Set Up Your Budget') : 'Customize Categories'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {step === 1
              ? 'How much do you earn? You can enter monthly or yearly.'
              : 'Set budgets by percentage or fixed amount. Toggle, rename, or add your own categories.'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className={`w-2.5 h-2.5 rounded-full ${step === 1 ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <div className={`w-2.5 h-2.5 rounded-full ${step === 2 ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
          </div>
        </div>

        {/* Step 1: Income */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Period toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                I want to enter my income as
              </label>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setIncomePeriod('monthly')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    incomePeriod === 'monthly'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setIncomePeriod('yearly')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    incomePeriod === 'yearly'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>

            <Input
              label={incomePeriod === 'monthly' ? 'Monthly Income (before tax)' : 'Yearly Income (before tax)'}
              type="number"
              min="0"
              step="any"
              placeholder={incomePeriod === 'monthly' ? 'e.g. 5000' : 'e.g. 60000'}
              value={incomeInput}
              onChange={(e) => setIncomeInput(e.target.value)}
            />

            {incomeInput && Number(incomeInput) > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-400">
                {incomePeriod === 'monthly' ? (
                  <>That's <strong className="text-gray-900 dark:text-gray-100">{currencySymbol}{yearlyIncome.toLocaleString()}</strong> per year ({currencySymbol}{monthlyIncome.toLocaleString()}/month)</>
                ) : (
                  <>That's <strong className="text-gray-900 dark:text-gray-100">{currencySymbol}{monthlyIncome.toLocaleString()}</strong> per month ({currencySymbol}{yearlyIncome.toLocaleString()}/year)</>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Budget Year"
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              <Select
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={COMMON_CURRENCIES.map((c) => ({
                  value: c.code,
                  label: `${c.code} (${c.symbol})`,
                }))}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!incomeInput || Number(incomeInput) <= 0}
            >
              Next: Choose Categories
            </Button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-2 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Step 2: Categories */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Budget mode toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Set budgets using
              </label>
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setBudgetMode('percentage')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    budgetMode === 'percentage'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  % of Income
                </button>
                <button
                  onClick={() => setBudgetMode('amount')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    budgetMode === 'amount'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {currencySymbol} Amount
                </button>
              </div>
            </div>

            {/* Amount period toggle (only in amount mode) */}
            {budgetMode === 'amount' && (
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setAmountPeriod('monthly')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    amountPeriod === 'monthly'
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Monthly amounts
                </button>
                <button
                  onClick={() => setAmountPeriod('yearly')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    amountPeriod === 'yearly'
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Yearly amounts
                </button>
              </div>
            )}

            {/* Allocation bar */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total allocated</span>
              <span className={`font-medium ${
                Math.round(totalPercent) === 100
                  ? 'text-success-600 dark:text-success-400'
                  : totalPercent > 100
                  ? 'text-danger-500'
                  : 'text-warning-600 dark:text-warning-400'
              }`}>
                {budgetMode === 'percentage' ? (
                  <>{Math.round(totalPercent * 10) / 10}%</>
                ) : (
                  <>{currencySymbol}{Math.round(totalAmount / (amountPeriod === 'monthly' ? 12 : 1)).toLocaleString()} / {amountPeriod === 'monthly' ? 'mo' : 'yr'}</>
                )}
                {Math.round(totalPercent) !== 100 && (
                  <span className="text-xs ml-1">
                    ({Math.round(totalPercent)}% of income)
                  </span>
                )}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  Math.round(totalPercent) === 100
                    ? 'bg-success-500'
                    : totalPercent > 100
                    ? 'bg-danger-500'
                    : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(totalPercent, 100)}%` }}
              />
            </div>

            {/* Category list */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {categories.map((cat) => {
                const issue = validationIssues?.find((i) => i.name === cat.name)
                return (
                  <div key={cat.id}>
                    <div
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        issue
                          ? 'border-danger-400 dark:border-danger-500 bg-danger-50 dark:bg-danger-900/20'
                          : cat.included
                          ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={cat.included}
                        onChange={() => toggleCategory(cat.id)}
                        className="rounded border-gray-300 dark:border-gray-600 cursor-pointer shrink-0"
                      />
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => {
                          updateName(cat.id, e.target.value)
                          if (validationIssues) setValidationIssues(null)
                        }}
                        disabled={!cat.included}
                        className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 disabled:text-gray-400 min-w-0"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        {budgetMode === 'percentage' ? (
                          <>
                            <input
                              type="number"
                              value={cat.percentOfIncome}
                              onChange={(e) => updateByPercent(cat.id, e.target.value)}
                              disabled={!cat.included}
                              min="0" max="100" step="0.1"
                              className="w-14 text-sm text-right bg-transparent border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 disabled:text-gray-400"
                            />
                            <span className="text-xs text-gray-400 w-5">%</span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-gray-400">{currencySymbol}</span>
                            <input
                              type="number"
                              value={Math.round(getCatAmount(cat, amountPeriod)) || ''}
                              onChange={(e) => updateByAmount(cat.id, e.target.value, amountPeriod)}
                              disabled={!cat.included}
                              min="0" step="1"
                              className="w-20 text-sm text-right bg-transparent border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 disabled:text-gray-400"
                              placeholder="0"
                            />
                          </>
                        )}
                      </div>
                      {cat.isCustom && (
                        <button
                          onClick={() => removeCategory(cat.id)}
                          className="text-gray-400 hover:text-danger-500 cursor-pointer shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {issue && (
                      <div className="ml-10 mt-1 space-y-1">
                        <p className="text-xs text-danger-500">{issue.reason}</p>
                        <input
                          type="text"
                          placeholder="Add a description to clarify this category (e.g., 'Monthly rent and mortgage payments')"
                          value={cat.description || ''}
                          onChange={(e) => updateDescription(cat.id, e.target.value)}
                          className="w-full text-xs bg-white dark:bg-gray-800 border border-danger-300 dark:border-danger-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                        />
                      </div>
                    )}
                    {!issue && cat.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-10 italic">{cat.description}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Add custom category */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <input
                type="text"
                placeholder="New category"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <input
                type="number"
                placeholder={budgetMode === 'percentage' ? '%' : currencySymbol}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                min="0"
                className="w-20 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <Button size="sm" variant="ghost" onClick={addCategory} disabled={!newName.trim() || !newValue}>
                Add
              </Button>
            </div>

            {/* Validation issues banner */}
            {validationIssues && validationIssues.length > 0 && (
              <div className="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-danger-700 dark:text-danger-300">
                  Some category names need attention. Fix them above and try again.
                </p>
                <button
                  onClick={() => {
                    setSkipValidation(true)
                    setValidationIssues(null)
                  }}
                  className="text-xs text-danger-500 dark:text-danger-400 underline hover:text-danger-700 dark:hover:text-danger-200 cursor-pointer"
                >
                  Skip Check
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button variant="ghost" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleFinish}
                disabled={saving || validating || categories.filter((c) => c.included).length === 0}
              >
                {validating ? 'Checking names...' : saving ? 'Setting up...' : 'Finish Setup'}
              </Button>
            </div>

            {Math.round(totalPercent) !== 100 && (
              <p className="text-xs text-center text-warning-600 dark:text-warning-400">
                Tip: Allocations don't need to total exactly 100%, but it helps with tracking.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
