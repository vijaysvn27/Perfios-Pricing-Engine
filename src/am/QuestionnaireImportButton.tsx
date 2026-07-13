// "New from questionnaire": lets an AM upload a filled
// Perfios_DPDP_Questionnaire.xlsx and skip retyping every value into the
// wizard. Parsing lives in src/lib/proposal/questionnaireImport.ts (pure,
// tested); this component is just the file-picker chrome plus a dismissible
// summary of any assumptions the parser had to make.
import { useRef, useState } from 'react'
import { btn } from '../admin/styles'
import { importQuestionnaireXlsx, type QuestionnaireImportResult } from '../lib/proposal/questionnaireImport'

interface Props {
  onImported: (result: QuestionnaireImportResult) => void
  disabled?: boolean
  /** Smaller footprint for the wizard header — same parse/merge behaviour,
   * just a lighter-weight button and label ("Import questionnaire" instead
   * of "New from questionnaire") so it sits comfortably next to the step
   * pills instead of competing with the list page's primary action. */
  compact?: boolean
}

export default function QuestionnaireImportButton({ onImported, disabled, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[] | null>(null)

  async function handleFile(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    setWarnings(null)
    try {
      const buffer = await file.arrayBuffer()
      const result = await importQuestionnaireXlsx(buffer)
      setWarnings(result.warnings.length > 0 ? result.warnings : null)
      onImported(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const buttonClass = compact
    ? 'rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-perfios-blue hover:text-perfios-blue disabled:cursor-not-allowed disabled:opacity-40'
    : btn

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Importing…' : compact ? 'Import questionnaire' : 'New from questionnaire'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleFile(file)
          }}
        />
      </div>

      {error && (
        <div className="max-w-sm rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Could not import questionnaire: {error}
        </div>
      )}

      {warnings && (
        <div className="max-w-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-start justify-between gap-2">
            <span>
              Imported with {warnings.length} assumption{warnings.length === 1 ? '' : 's'} — review Scope.
            </span>
            <button
              type="button"
              className="shrink-0 text-amber-500 hover:text-amber-700"
              onClick={() => setWarnings(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
