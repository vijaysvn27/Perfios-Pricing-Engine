// Generic on-screen renderer for a ProposalRenderModel (cover band, headings,
// paragraphs, bullets, tables). The same model drives the Excel export, so
// what the AM previews here is exactly what the client file will say.
// The logo import lives HERE (not in lib code) so the pure formats/excel
// libs stay asset-free and unit-testable without a bundler asset pipeline.
//
// Document design language (extracted from real Perfios deliverables — see
// docs/superpowers/specs/2026-07-12-proposal-builder-revamp-design.md §7,
// "Document design language"): palette tokens live in src/index.css as
// --color-doc-* CSS variables; Arial is the document typeface (screen +
// print + Excel all use it, distinct from the app UI's default sans stack).
import type { CSSProperties } from 'react'
import logoUrl from '../assets/perfios-logo.png'
import { formatINR } from '../lib/format'
import type { ProposalRenderModel, RenderTable } from '../lib/proposal/formats'

const DOC_FONT: CSSProperties = { fontFamily: 'Arial, Helvetica, sans-serif' }

function isTotalRow(firstCell: string | number): boolean {
  return /total|tco/i.test(String(firstCell))
}

/** Sections whose heading matches one of the boilerplate/closing headings get
 * the callout treatment (light tint inset) rather than the plain body style,
 * so the certifications disclaimer and the closing statement read visually
 * distinct from deal-specific content. */
function isCalloutSection(heading: string): boolean {
  return /^certifications & delivery assurance$/i.test(heading) || /^one partner, one accountable outcome$/i.test(heading)
}

function ModelTable({ table }: { table: RenderTable }) {
  return (
    <div className="overflow-x-auto rounded-md border" style={{ borderColor: 'var(--color-doc-hairline-outer)' }}>
      <table className="w-full text-sm" style={DOC_FONT}>
        <thead>
          <tr style={{ backgroundColor: 'var(--color-doc-primary)' }}>
            {table.columns.map((c, i) => (
              <th
                key={i}
                className={`px-3 py-2 text-xs font-bold text-white ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => {
            const total = isTotalRow(row[0])
            return (
              <tr
                key={ri}
                className="border-t"
                style={{
                  borderColor: 'var(--color-doc-hairline-inner)',
                  backgroundColor: total ? undefined : ri % 2 === 1 ? 'var(--color-doc-tint-2)' : '#FFFFFF',
                }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-3 py-2 ${typeof cell === 'number' ? 'text-right tabular-nums' : 'text-left'} ${total ? 'font-bold' : ''}`}
                    style={{ color: total ? '#FFFFFF' : 'var(--color-doc-body)' }}
                  >
                    {typeof cell === 'number' ? formatINR(cell) : cell}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Branded cover band, following the COVER spec (Vi Blueprint pattern,
 * adapted): logo (or a text wordmark fallback) top-left, a thin green accent
 * rule underneath, a two-tone title, an eyebrow "Prepared for" line, an
 * italic tagline, and a prepared-by block with date / validity / reference.
 */
function CoverBand({ model }: { model: ProposalRenderModel }) {
  const cover = model.cover
  if (!cover) {
    return (
      <header style={DOC_FONT}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-doc-primary)' }}>
          {model.title}
        </h1>
        <p className="mt-1 text-sm italic" style={{ color: 'var(--color-doc-meta)' }}>
          {model.subtitle}
        </p>
      </header>
    )
  }
  return (
    <header className="cover-band overflow-hidden rounded-xl border bg-white" style={{ borderColor: 'var(--color-doc-hairline-outer)', ...DOC_FONT }}>
      <div className="px-6 pb-4 pt-6">
        <div className="flex items-center gap-3">
          {cover.logo ? (
            <img src={logoUrl} alt="Perfios" className="h-10 w-auto shrink-0" />
          ) : (
            <p className="text-xl font-bold" style={{ color: 'var(--color-doc-primary)' }}>
              PERFIOS<span style={{ color: 'var(--color-doc-green-accent)' }}> · DPDP SUITE</span>
            </p>
          )}
        </div>
        {/* Thin accent rule under the wordmark (COVER spec item 2). */}
        <div className="mt-3 h-[3px] w-24 rounded" style={{ backgroundColor: 'var(--color-doc-green-rule)' }} />

        <h1 className="mt-5 text-2xl font-bold leading-tight">
          <span style={{ color: 'var(--color-doc-navy)' }}>DPDP Suite</span>
          <br />
          <span style={{ color: 'var(--color-doc-primary)' }}>{cover.title}</span>
        </h1>

        <p className="mt-4 text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-doc-meta)' }}>
          Prepared for
        </p>
        <p className="text-[17px] font-bold" style={{ color: 'var(--color-doc-navy)' }}>
          {cover.customer || '—'}
        </p>

        <p className="mt-2 text-sm italic" style={{ color: 'var(--color-doc-green-accent)' }}>
          Solution &middot; Consulting &middot; Integration &middot; SLAs &middot; Support — delivered by Perfios
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3" style={{ backgroundColor: 'var(--color-doc-primary)' }}>
        <p className="text-sm font-bold text-white">Perfios Software Solutions Pvt. Ltd.</p>
        <p className="text-xs text-white/85">
          {cover.date_label} &middot; Valid {cover.validity_days} days &middot; Ref {cover.reference} &middot; Private &amp; Confidential
        </p>
      </div>
    </header>
  )
}

export default function RenderModelView({ model }: { model: ProposalRenderModel }) {
  return (
    <div className="space-y-6" style={DOC_FONT}>
      <CoverBand model={model} />
      {model.sections.map((section, si) => {
        const callout = isCalloutSection(section.heading)
        return (
          <section
            key={si}
            className={`proposal-section ${callout ? 'rounded-md px-4 py-3' : ''}`}
            style={callout ? { backgroundColor: 'var(--color-doc-tint-1)' } : undefined}
          >
            {/* H1: 15pt bold primary blue with a 0.7pt green accent rule underneath. */}
            <h2
              className="mb-2 pb-1 text-[15px] font-bold"
              style={{ color: 'var(--color-doc-primary)', borderBottom: '1.5px solid var(--color-doc-green-rule)' }}
            >
              {section.heading}
            </h2>
            {section.paragraphs?.map((p, pi) => (
              <p key={pi} className="mb-1 text-sm leading-relaxed" style={{ color: 'var(--color-doc-body)' }}>
                {p}
              </p>
            ))}
            {section.bullets && (
              <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--color-doc-body)' }}>
                {section.bullets.map((b, bi) => (
                  <li
                    key={bi}
                    className={
                      /^(included in this proposal|not included in this proposal):$/i.test(b)
                        ? 'list-none -ml-5 font-bold'
                        : ''
                    }
                    style={/^(included in this proposal|not included in this proposal):$/i.test(b) ? { color: 'var(--color-doc-green-accent)' } : undefined}
                  >
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
        )
      })}
      <p className="border-t pt-3 text-[9pt] italic" style={{ borderColor: 'var(--color-doc-hairline-inner)', color: 'var(--color-doc-meta)' }}>
        Private &amp; Confidential — prepared by Perfios for {model.cover?.customer || 'the client'}
      </p>
    </div>
  )
}
