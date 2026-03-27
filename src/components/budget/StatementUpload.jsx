import { useState, useRef } from 'react'
import useStore from '../../store/store'
import Button from '../ui/Button'
import Input from '../ui/Input'

export default function StatementUpload({ month }) {
  const parseStatement = useStore((s) => s.parseStatement)
  const parsingStatement = useStore((s) => s.parsingStatement)

  const [income, setIncome] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileText, setFileText] = useState('')
  const fileRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setFileText(ev.target.result)
    }
    reader.readAsText(file)
  }

  const handleParse = async () => {
    if (!fileText || !income || Number(income) <= 0) return
    try {
      await parseStatement({
        month,
        statementText: fileText,
        actualIncome: Number(income),
      })
    } catch {
      // Error handled by store
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
        Upload Statement
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Upload a bank or credit card statement (.csv or .txt) and we'll categorize your transactions.
      </p>

      <div className="space-y-5">
        {/* File upload zone */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              fileName
                ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            {fileName ? (
              <div>
                <svg className="w-8 h-8 mx-auto text-primary-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                  {fileName}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Click to change file
                </p>
              </div>
            ) : (
              <div>
                <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click to upload a .csv or .txt file
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Bank or credit card statement
                </p>
              </div>
            )}
          </button>
        </div>

        {/* Income input */}
        <Input
          label="Actual Income for This Month"
          type="number"
          min="0"
          step="any"
          placeholder="e.g. 5000"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
        />

        {/* Parse button */}
        <Button
          className="w-full"
          onClick={handleParse}
          disabled={parsingStatement || !fileText || !income || Number(income) <= 0}
        >
          {parsingStatement ? (
            <span className="flex items-center gap-2">
              <svg
                className="w-4 h-4 animate-spin"
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
              Parsing Statement...
            </span>
          ) : (
            'Parse Statement'
          )}
        </Button>
      </div>
    </div>
  )
}
