import type { ClientSafeProposal } from '../clientSafe'
import { build as buildModuleWise } from './moduleWise'
import { build as buildSaasStyle } from './saasStyle'
import { build as buildPerfios } from './perfiosFormat'
import type { ProposalRenderModel } from './types'

export type FormatKind = 'module_wise' | 'saas_style' | 'perfios'

/**
 * `asOfDate` (YYYY-MM-DD) drives the cover's date label and reference code.
 * Required, not defaulted here, so this stays a pure function of its inputs
 * — no Date.now() inside lib code. Callers (Step4Present) supply today's
 * date; tests supply a fixed string for determinism.
 */
export function buildFormat(kind: FormatKind, p: ClientSafeProposal, asOfDate: string): ProposalRenderModel {
  switch (kind) {
    case 'module_wise':
      return buildModuleWise(p, asOfDate)
    case 'saas_style':
      return buildSaasStyle(p, asOfDate)
    case 'perfios':
      return buildPerfios(p, asOfDate)
  }
}

export type { ProposalCover, ProposalRenderModel, RenderSection, RenderTable } from './types'
