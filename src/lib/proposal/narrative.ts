// Template narrative (item 4 of the revamp): scope-aware Executive Summary /
// Solution Overview / Why Perfios copy so an AM starts from a filled-in
// document instead of a blank page. Pure — same ClientSafeProposal always
// produces the same copy — and asset-free (no logo/image imports; that stays
// in the .tsx render layer per the render-model contract).
import type { ClientSafeProposal } from './clientSafe'
import type { DeploymentMode } from '../engine2/types'
import type { RenderSection } from './formats/types'

export interface Narrative {
  executive_summary: string
  solution_overview: string
  why_perfios: string[]
}

/** Whole-lakh-friendly rendering of a data-principal count, e.g. 2,500,000 ->
 * "25-lakh". Falls back to a plain Indian-grouped number under 1 lakh. */
function lakh(n: number): string {
  if (n <= 0) return '0'
  if (n < 100_000) return n.toLocaleString('en-IN')
  const l = n / 100_000
  const rounded = Math.round(l * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}-lakh`
}

/** How the deployment mode is framed to the client — the hosting story
 * drives a lot of the executive summary's shape. */
function deploymentFraming(mode: DeploymentMode): string {
  switch (mode) {
    case 'onprem':
      return 'hosted fully within your environment, with Perfios providing the software and your team retaining full control of the infrastructure'
    case 'hybrid':
      return 'Perfios-hosted, with the consent governance bridge running on your premises so sensitive consent data never leaves your network'
    case 'saas':
      return 'fully hosted and managed by Perfios as a subscription service, so your team can go live without provisioning any infrastructure'
  }
}

function selectedModuleNames(p: ClientSafeProposal): string[] {
  const names: string[] = ['Consent Manager']
  if (p.inputs.deployment_mode === 'saas') return names
  const { dspm, dam, endpoint } = p.inputs.modules
  if (dspm) names.push('DSPM (Data Security Posture Management)')
  if (dam) names.push('DAM (Database Activity Monitoring)')
  if (endpoint) names.push('Endpoint Discovery / DLP')
  return names
}

function joinEnglish(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function buildNarrative(p: ClientSafeProposal): Narrative {
  const mode = p.inputs.deployment_mode
  const modules = selectedModuleNames(p)
  const base = lakh(p.inputs.dp_base_y1)

  const executive_summary =
    `This proposal sets out Perfios' DPDP-compliant solution for ${p.customer_name}, built to meet your ` +
    `obligations under the Digital Personal Data Protection Act, 2023 (DPDP Act) — valid, granular, and ` +
    `auditable consent collection, data-principal rights fulfilment, and governance oversight. The solution ` +
    `is ${deploymentFraming(mode)}, sized for consent operations across a ${base} data-principal base in Year 1. ` +
    `Scope covers ${joinEnglish(modules)}${modules.length > 1 ? ', giving you a single platform for consent and estate-wide data protection' : ''}.`

  const solutionOverviewParts = [
    'At the core is the Consent Manager: DPDP notices in 22 languages, a self-service Data Principal Rights ' +
      'Portal, granular cookie consent, a governance dashboard with maker-checker and audit trails, breach ' +
      'and vendor modules, and DPIA with risk scoring — all seven modules bundled, not sold piecemeal.',
  ]
  if (mode !== 'saas') {
    if (p.inputs.modules.dspm) {
      solutionOverviewParts.push(
        'DSPM extends this to discovery and classification of personal data across your estate — databases, ' +
          'cloud connectors, file stores, and virtual machines — so you know where personal data lives before you govern it.',
      )
    }
    if (p.inputs.modules.dam) {
      solutionOverviewParts.push(
        'DAM adds continuous activity monitoring on your structured datasets, flagging anomalous access to ' +
          'personal data as it happens.',
      )
    }
    if (p.inputs.modules.endpoint) {
      solutionOverviewParts.push(
        'Endpoint Discovery / DLP closes the loop at the device layer, covering laptops and desktops that may hold personal data locally.',
      )
    }
  }
  const solution_overview = solutionOverviewParts.join(' ')

  const why_perfios = [
    'Consent notices and DP-facing surfaces in 22 Indian languages, including audio readout for accessibility.',
    'Unlimited consents and actions per data principal — no per-transaction metering, and SaaS/Hybrid pricing follows your user count via a transparent, published-in-advance per-user rate.',
    'Seven Consent Manager modules bundled as one platform: notice, rights portal, cookie consent, governance, breach, vendor, and DPIA.',
    'Evidence-grade audit trails — every consent, access, and grievance event is versioned and exportable for regulatory review.',
    'RPO under 15 minutes with cold-DR across every tier, so your consent records survive a site failure.',
  ]

  return { executive_summary, solution_overview, why_perfios }
}

/** The narrative as leading RenderSections — every format prepends these
 * ahead of its own content (item 4: "Formats include these as leading sections"). */
export function narrativeSections(p: ClientSafeProposal): RenderSection[] {
  const n = buildNarrative(p)
  return [
    { heading: 'Executive Summary', paragraphs: [n.executive_summary] },
    { heading: 'Solution Overview', paragraphs: [n.solution_overview] },
    { heading: 'Why Perfios', bullets: n.why_perfios },
  ]
}
