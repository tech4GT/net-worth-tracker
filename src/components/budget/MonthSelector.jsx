export default function MonthSelector({ selectedMonth, onChangeMonth }) {
  const [year, month] = selectedMonth.split('-').map(Number)
  const date = new Date(year, month - 1)

  const label = date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const goPrev = () => {
    const prev = new Date(year, month - 2)
    onChangeMonth(
      `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    )
  }

  const goNext = () => {
    const next = new Date(year, month)
    onChangeMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    )
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <button
        onClick={goPrev}
        className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-[180px] text-center">
        {label}
      </h3>
      <button
        onClick={goNext}
        className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
