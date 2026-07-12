// Generic on-screen renderer for a ProposalRenderModel (headings, paragraphs,
// bullets, tables). The same model drives the Excel export, so what the AM
// previews here is exactly what the client file will say.
import { formatINR } from '../lib/format'
import type { ProposalRenderModel, RenderTable } from '../lib/proposal/formats'

function isTotalRow(firstCell: string | number): boolean {
  return /total|tco/i.test(String(firstCell))
}

function ModelTable({ table }: { table: RenderTable }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
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
            <tr key={ri} className={`border-t border-slate-100 ${ri % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={
                    typeof cell === 'number'
                      ? 'px-3 py-2 text-right tabular-nums text-slate-700'
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

export default function RenderModelView({ model }: { model: ProposalRenderModel }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-perfios-blue">{model.title}</h1>
        <p className="mt-1 text-sm italic text-slate-500">{model.subtitle}</p>
      </header>
      {model.sections.map((section, si) => (
        <section key={si}>
          <h2 className="mb-2 text-sm font-semibold text-perfios-blue">{section.heading}</h2>
          {section.paragraphs?.map((p, pi) => (
            <p key={pi} className="mb-1 text-sm text-slate-700">
              {p}
            </p>
          ))}
          {section.bullets && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {section.bullets.map((b, bi) => (
                <li key={bi}>{b}</li>
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
    </div>
  )
}
