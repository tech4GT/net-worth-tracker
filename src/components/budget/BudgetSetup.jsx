import { useState } from 'react'
import useStore from '../../store/store'
import { COMMON_CURRENCIES } from '../../lib/constants'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

export default function BudgetSetup() {
  const saveBudgetConfig = useStore((s) => s.saveBudgetConfig)
  const [saving, setSaving] = useState(false)

  const currentYear = new Date().getFullYear()
  const [yearlyIncome, setYearlyIncome] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [currency, setCurrency] = useState('USD')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!yearlyIncome || Number(yearlyIncome) <= 0) return
    setSaving(true)
    try {
      await saveBudgetConfig({
        yearlyIncome: Number(yearlyIncome),
        year: Number(year),
        currency,
      })
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-12">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Set Up Your Budget
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Enter your yearly income and we'll help you track spending across categories.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
            type="submit"
            className="w-full"
            disabled={saving || !yearlyIncome || Number(yearlyIncome) <= 0}
          >
            {saving ? 'Setting up...' : 'Get Started'}
          </Button>
        </form>
      </div>
    </div>
  )
}
