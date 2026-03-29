import { useState } from 'react'
import useStore from '../../store/store'
import { COMMON_CURRENCIES, DEFAULT_BUDGET_CATEGORIES, CHART_COLORS } from '../../lib/constants'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

export default function BudgetSetup() {
  const saveBudgetConfig = useStore((s) => s.saveBudgetConfig)
  const addBudgetCategory = useStore((s) => s.addBudgetCategory)
  const loadBudgetData = useStore((s) => s.loadBudgetData)

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1: Config
  const currentYear = new Date().getFullYear()
  const [yearlyIncome, setYearlyIncome] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [currency, setCurrency] = useState('GBP')

  // Step 2: Categories (editable starter list)
  const [categories, setCategories] = useState(
    DEFAULT_BUDGET_CATEGORIES.map((c) => ({ ...c, included: true }))
  )
  const [newName, setNewName] = useState('')
  const [newPercent, setNewPercent] = useState('')

  const totalPercent = categories
    .filter((c) => c.included)
    .reduce((sum, c) => sum + c.percentOfIncome, 0)

  const toggleCategory = (id) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, included: !c.included } : c))
    )
  }

  const updatePercent = (id, value) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, percentOfIncome: Number(value) || 0 } : c))
    )
  }

  const updateName = (id, name) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c))
    )
  }

  const addCategory = () => {
    if (!newName.trim() || !newPercent) return
    const usedColors = categories.map((c) => c.color)
    const availableColor = CHART_COLORS.find((c) => !usedColors.includes(c)) || '#64748b'
    setCategories((prev) => [
      ...prev,
      {
        id: `bcat-custom-${Date.now()}`,
        name: newName.trim(),
        color: availableColor,
        icon: 'tag',
        percentOfIncome: Number(newPercent) || 0,
        included: true,
        isCustom: true,
      },
    ])
    setNewName('')
    setNewPercent('')
  }

  const removeCategory = (id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      // Save config
      await saveBudgetConfig({
        yearlyIncome: Number(yearlyIncome),
        year: Number(year),
        currency,
      })

      // Create each included category
      const included = categories.filter((c) => c.included)
      for (const cat of included) {
        await addBudgetCategory({
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          percentOfIncome: cat.percentOfIncome,
        })
      }

      // Reload to get server-generated IDs
      await loadBudgetData()
    } catch {
      // Errors handled by store
    } finally {
      setSaving(false)
    }
  }

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
            {step === 1 ? 'Set Up Your Budget' : 'Customize Categories'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {step === 1
              ? 'Enter your yearly income to get started.'
              : 'Customize your spending categories. Toggle, rename, adjust percentages, or add your own.'}
          </p>
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className={`w-2.5 h-2.5 rounded-full ${step === 1 ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
            <div className={`w-2.5 h-2.5 rounded-full ${step === 2 ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
          </div>
        </div>

        {/* Step 1: Income */}
        {step === 1 && (
          <div className="space-y-5">
            <Input
              label="Yearly Income"
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 60000"
              value={yearlyIncome}
              onChange={(e) => setYearlyIncome(e.target.value)}
            />
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
                label: `${c.code} - ${c.name} (${c.symbol})`,
              }))}
            />
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!yearlyIncome || Number(yearlyIncome) <= 0}
            >
              Next: Choose Categories
            </Button>
          </div>
        )}

        {/* Step 2: Categories */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Allocation bar */}
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-500 dark:text-gray-400">Total allocated</span>
              <span className={`font-medium ${
                totalPercent === 100
                  ? 'text-success-600 dark:text-success-400'
                  : totalPercent > 100
                  ? 'text-danger-500'
                  : 'text-warning-600 dark:text-warning-400'
              }`}>
                {totalPercent}%
                {totalPercent !== 100 && (
                  <span className="text-xs ml-1">
                    ({totalPercent < 100 ? `${100 - totalPercent}% unallocated` : `${totalPercent - 100}% over`})
                  </span>
                )}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${
                  totalPercent === 100
                    ? 'bg-success-500'
                    : totalPercent > 100
                    ? 'bg-danger-500'
                    : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(totalPercent, 100)}%` }}
              />
            </div>

            {/* Category list */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    cat.included
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
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(e) => updateName(cat.id, e.target.value)}
                    disabled={!cat.included}
                    className="flex-1 text-sm bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 disabled:text-gray-400"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      value={cat.percentOfIncome}
                      onChange={(e) => updatePercent(cat.id, e.target.value)}
                      disabled={!cat.included}
                      min="0"
                      max="100"
                      className="w-14 text-sm text-right bg-transparent border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 disabled:text-gray-400"
                    />
                    <span className="text-xs text-gray-400">%</span>
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
              ))}
            </div>

            {/* Add custom category */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <input
                type="text"
                placeholder="New category name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <input
                type="number"
                placeholder="%"
                value={newPercent}
                onChange={(e) => setNewPercent(e.target.value)}
                min="0"
                max="100"
                className="w-16 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <Button size="sm" variant="ghost" onClick={addCategory} disabled={!newName.trim() || !newPercent}>
                Add
              </Button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button variant="ghost" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleFinish}
                disabled={saving || categories.filter((c) => c.included).length === 0}
              >
                {saving ? 'Setting up...' : 'Finish Setup'}
              </Button>
            </div>

            {totalPercent !== 100 && (
              <p className="text-xs text-center text-warning-600 dark:text-warning-400">
                Tip: Percentages don't need to add to exactly 100%, but it helps with tracking.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
