import { useState, useRef, useEffect, useCallback } from 'react'
import useStore from '../../store/store'
import Button from '../ui/Button'
import Input from '../ui/Input'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Use Y-coordinates to detect line breaks (new row = new line)
    const items = content.items.filter((item) => item.str.trim().length > 0)
    if (items.length === 0) continue

    const lines = []
    let currentLine = []
    let lastY = null

    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(currentLine.join(' '))
        currentLine = []
      }
      currentLine.push(item.str)
      lastY = y
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.join(' '))
    }

    // Merge amount-only lines with the preceding line
    // Bank PDFs often put amounts on a separate row from the description
    const merged = []
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j].trim()
      // Check if this line is just a number (amount) — e.g. "1,234.56" or "£1,234.56"
      if (/^[£$€]?[\d,]+\.\d{2}$/.test(line.replace(/\s/g, ''))) {
        // Append to previous line
        if (merged.length > 0) {
          merged[merged.length - 1] += ' ' + line
        } else {
          merged.push(line)
        }
      } else {
        merged.push(line)
      }
    }

    pages.push(merged.join('\n'))
  }

  return pages.join('\n')
}

const POLL_INTERVAL_MS = 5000

export default function StatementUpload({ month }) {
  const submitStatement = useStore((s) => s.submitStatement)
  const pollJobStatus = useStore((s) => s.pollJobStatus)
  const parsingStatement = useStore((s) => s.parsingStatement)
  const processingJobId = useStore((s) => s.processingJobId)

  const [income, setIncome] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileText, setFileText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef(null)
  const pollTimerRef = useRef(null)

  // Start polling when we have a processingJobId
  const startPolling = useCallback((jobId) => {
    // Clear any existing timer
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const result = await pollJobStatus(jobId)
        if (result.status === 'completed' || result.status === 'failed') {
          clearInterval(pollTimerRef.current)
          pollTimerRef.current = null
        }
      } catch {
        // Network error during poll — keep trying
      }
    }, POLL_INTERVAL_MS)
  }, [pollJobStatus])

  // Resume polling if component mounts with an active processingJobId
  useEffect(() => {
    if (processingJobId) {
      startPolling(processingJobId)
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [processingJobId, startPolling])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    if (isPdf) {
      setExtracting(true)
      try {
        const text = await extractPdfText(file)
        setFileText(text)
      } catch (err) {
        console.error('PDF extraction failed:', err)
        setFileText('')
        setFileName('')
      } finally {
        setExtracting(false)
      }
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setFileText(ev.target.result)
      }
      reader.readAsText(file)
    }
  }

  const handleParse = async () => {
    if (!fileText) return
    setSubmitting(true)
    try {
      const result = await submitStatement({
        month,
        statementText: fileText,
        actualIncome: income ? Number(income) : undefined,
      })
      // Start polling for the new job
      if (result?.jobId) {
        startPolling(result.jobId)
      }
    } catch {
      // Error handled by store
    } finally {
      setSubmitting(false)
    }
  }

  const isProcessing = parsingStatement || extracting || submitting || !!processingJobId

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
        Upload Statement
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Upload a bank or credit card statement (.csv, .txt, or .pdf) and we'll categorize your transactions using AI.
      </p>

      <div className="space-y-5">
        {/* File upload zone */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isProcessing}
            className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              isProcessing
                ? 'opacity-60 cursor-not-allowed border-gray-300 dark:border-gray-600'
                : fileName
                  ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            {extracting ? (
              <div>
                <svg className="w-8 h-8 mx-auto text-primary-500 mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                  Extracting text from PDF...
                </p>
              </div>
            ) : fileName ? (
              <div>
                <svg className="w-8 h-8 mx-auto text-primary-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                  {fileName}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {fileText ? `${Math.round(fileText.length / 1024)}KB extracted` : 'No text extracted'} · Click to change file
                </p>
              </div>
            ) : (
              <div>
                <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Click to upload .csv, .txt, or .pdf
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Bank or credit card statement
                </p>
              </div>
            )}
          </button>
        </div>

        {/* Warnings */}
        {fileName && fileText && fileText.length > 80000 && !processingJobId && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
            Large statement ({Math.round(fileText.length / 1024)}KB). Processing may take a bit longer.
          </div>
        )}
        {fileName && !extracting && !fileText && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
            Could not extract text from this file. Try a different format (CSV or TXT) or a different PDF.
          </div>
        )}

        {/* Processing status message */}
        {processingJobId && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Processing your statement...
                </p>
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                  This usually takes 30-60 seconds. You can navigate away and come back.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Income input */}
        <Input
          label="Actual Income for This Month (optional — AI will detect from statement)"
          type="number"
          min="0"
          step="any"
          placeholder="e.g. 5000"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          disabled={!!processingJobId}
        />

        {/* Parse button */}
        <Button
          className="w-full"
          onClick={handleParse}
          disabled={isProcessing || !fileText}
        >
          {extracting ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Extracting PDF...
            </span>
          ) : submitting ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting...
            </span>
          ) : processingJobId ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing... (check back in a moment)
            </span>
          ) : (
            'Parse Statement'
          )}
        </Button>
      </div>
    </div>
  )
}
