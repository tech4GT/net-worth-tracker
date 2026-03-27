import { useState, useEffect } from 'react'
import useStore from '../../store/store'
import { CHART_COLORS } from '../../lib/constants'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function BudgetCategoryForm({ open, onClose, category }) {
  const addBudgetCategory = useStore((s) => s.addBudgetCategory)
  const updateBudgetCategory = useStore((s) => s.updateBudgetCategory)

  const [name, setName] = useState('')
  const [percentOfIncome, setPercentOfIncome] = useState('')
  const [color, setColor] = useState(CHART_COLORS[0])
  const [saving, setSaving] = useState(false)

  const isEditing = !!category

  // Reset form when opening or switching between add/edit
  useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name || '')
        setPercentOfIncome(String(category.percentOfIncome || ''))
        setColor(category.color || CHART_COLORS[0])
      } else {
        setName('')
        setPercentOfIncome('')
        setColor(CHART_COLORS[0])
      }
    }
  }, [open, category])

  const handleSubmit = async () => {
    if (!name.trim() || !percentOfIncome || Number(percentOfIncome) <= 0) return
    setSaving(true)
    try {
      if (isEditing) {
        await updateBudgetCategory(category.id, {
          name: name.trim(),
          percentOfIncome: Number(percentOfIncome),
          color,
        })
      } else {
        await addBudgetCategory({
          name: name.trim(),
          percentOfIncome: Number(percentOfIncome),
          color,
        })
      }
      onClose()
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Budget Category' : 'Add Budget Category'}
      size="sm"
    >
      <div className="space-y-4">
        <Input
          label="Name"
          placeholder="e.g. Groceries"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Input
          label="Percentage of Income"
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="e.g. 15"
          value={percentOfIncome}
          onChange={(e) => setPercentOfIncome(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {CHART_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                  color === c
                    ? 'scale-125 ring-2 ring-offset-2 ring-primary-500'
                    : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !percentOfIncome || Number(percentOfIncome) <= 0}
          >
            {saving
              ? isEditing
                ? 'Saving...'
                : 'Adding...'
              : isEditing
              ? 'Save'
              : 'Add'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
