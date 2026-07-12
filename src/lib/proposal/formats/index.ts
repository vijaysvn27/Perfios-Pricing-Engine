import type { ClientSafeProposal } from '../clientSafe'
import { build as buildModuleWise } from './moduleWise'
import { build as buildSaasStyle } from './saasStyle'
import { build as buildPerfios } from './perfiosFormat'
import type { ProposalRenderModel } from './types'

export type FormatKind = 'module_wise' | 'saas_style' | 'perfios'

export function buildFormat(kind: FormatKind, p: ClientSafeProposal): ProposalRenderModel {
  switch (kind) {
    case 'module_wise':
      return buildModuleWise(p)
    case 'saas_style':
      return buildSaasStyle(p)
    case 'perfios':
      return buildPerfios(p)
  }
}

export type { ProposalRenderModel, RenderSection, RenderTable } from './types'
