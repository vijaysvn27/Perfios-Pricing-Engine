// Generic on-screen renderer for a ProposalRenderModel (cover band, headings,
// paragraphs, bullets, tables). The same model drives the Excel export, so
// what the AM previews here is exactly what the client file will say.
// The logo import lives HERE (not in lib code) so the pure formats/excel
// libs stay asset-free and unit-testable without a bundler asset pipeline.
import logoUrl from '../assets/perfios-logo.png'
import { formatINR } from '../lib/format'
import type { ProposalRenderModel, RenderTable } from '../lib/proposal/formats'

function isTotalRow(firstCell: string | number): boolean {
  return /total|tco/i.test(String(firstCell))
}

function ModelTable({ table }: { table: RenderTable }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-perfios-blue text-white">
            {table.columns.map((c, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-t border-slate-100 ${isTotalRow(row[0]) ? 'bg-slate-100' : ri % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={
                    typeof cell === 'number'
                      ? `px-3 py-2 text-right tabular-nums text-slate-700 ${isTotalRow(row[0]) ? 'font-semibold text-perfios-blue' : ''}`
                      : `px-3 py-2 text-slate-700 ${ci === 0 && isTotalRow(row[0]) ? 'font-semibold' : ''}`
                  }
                >
                  {typeof cell === 'number' ? formatINR(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Branded cover band: logo, title, "Prepared for <customer>", date,
 * validity, and the deterministic reference code (item 3 of the revamp). */
function CoverBand({ model }: { model: ProposalRenderModel }) {
  const cover = model.cover
  if (!cover) {
    return (
      <header>
        <h1 className="text-xl font-semibold text-perfios-blue">{model.title}</h1>
        <p className="mt-1 text-sm italic text-slate-500">{model.subtitle}</p>
      </header>
    )
  }
  return (
    <header className="cover-band overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-4 border-b-4 border-perfios-blue bg-slate-50 px-5 py-4">
        {cover.logo && <img src={logoUrl} alt="Perfios" className="h-12 w-auto shrink-0" />}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Perfios Software Solutions</p>
          <h1 className="truncate text-xl font-semibold text-perfios-blue">{cover.title}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-perfios-blue px-5 py-3 text-white">
        <p className="text-sm font-medium">Prepared for {cover.customer || '—'}</p>
        <p className="text-xs text-blue-100">
          {cover.date_label} &middot; Valid {cover.validity_days} days &middot; Ref {cover.reference}
        </p>
      </div>
    </header>
  )
}

export default function RenderModelView({ model }: { model: ProposalRenderModel }) {
  return (
    <div className="space-y-6">
      <CoverBand model={model} />
      {model.sections.map((section, si) => (
        <section key={si} className="proposal-section">
          <h2 className="mb-2 border-b-2 border-perfios-blue/20 pb-1 text-sm font-semibold uppercase tracking-wide text-perfios-blue">
            {section.heading}
          </h2>
          {section.paragraphs?.map((p, pi) => (
            <p key={pi} className="mb-1 text-sm leading-relaxed text-slate-700">
              {p}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {section.bullets.map((b, bi) => (
                <li key={bi} className={/^(included in this proposal|not included in this proposal):$/i.test(b) ? 'list-none -ml-5 font-semibold text-perfios-blue' : ''}>
                  {b}
                </li>
              ))}
            </ul>
          )}
          {section.table && (
            <div className="mt-2">
              <ModelTable table={section.table} />
            </div>
          )}
        </section>
      ))}
      <p className="border-t border-slate-100 pt-3 text-[11px] italic text-slate-400">
        Perfios Software Solutions | Confidential — prepared for {model.cover?.customer || 'the client'}
      </p>
    </div>
  )
}
