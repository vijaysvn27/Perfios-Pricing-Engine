// "Inclusions & Exclusions" section (item 2 of the revamp): every format gets
// an explicit, scope-aware statement of what is and isn't in the deal — named
// unselected modules under exclusions, quantified selected modules under
// inclusions. Kept in one place so the three formats can never drift on
// wording, mirroring how shared.ts centralizes the CM module copy.
import type { ClientSafeProposal } from '../clientSafe'
import type { RenderSection } from './types'

/** Display-friendly plural for each estate rate key, used to phrase the
 * quantities called out under an included module (e.g. "50 databases"). */
const QTY_LABELS: Record<string, string> = {
  database: 'databases',
  cloud_connector: 'cloud connectors',
  account: 'accounts / subscriptions',
  onprem_connector: 'on-prem connectors',
  onprem_dc: 'on-prem data centres',
  gdrive_user: 'GDrive/OneDrive users',
  vm: 'virtual machines',
  sharepoint_site: 'SharePoint sites',
  dam_dataset: 'structured datasets',
  endpoint_device: 'devices',
}

const SHARED_KEYS = ['database', 'cloud_connector', 'account', 'onprem_connector', 'onprem_dc']

function qtyPhrase(p: ClientSafeProposal, keys: string[]): string {
  return keys
    .map((k) => [k, Math.max(0, Math.trunc(p.inputs.estate_quantities[k] ?? 0))] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n.toLocaleString('en-IN')} ${QTY_LABELS[k] ?? k}`)
    .join(', ')
}

/** Bullet per selected component with a one-line rich description, plus the
 * standard inclusions that apply to every deal. */
export function inclusionBullets(p: ClientSafeProposal): string[] {
  const bullets: string[] = [
    'Consent Manager — all 7 modules bundled (notice & templates, rights portal, cookie consent, ' +
      'governance/consent bridge, breach, vendor, DPIA); unlimited consents and actions per data principal.',
  ]

  const mode = p.inputs.deployment_mode
  if (mode !== 'saas') {
    const { dspm, dam, endpoint } = p.inputs.modules
    if (dspm) {
      const qty = qtyPhrase(p, [...SHARED_KEYS, 'gdrive_user', 'vm', 'sharepoint_site'])
      bullets.push(`DSPM — discovery & classification across your estate${qty ? ` (${qty})` : ''}.`)
    }
    if (dam) {
      // Shared-bucket quantities are only DAM's own to describe when DSPM
      // isn't also selected (engine2 attributes the shared base to DSPM
      // first — see estateBases in engine2.ts).
      const keys = dspm ? ['dam_dataset'] : [...SHARED_KEYS, 'dam_dataset']
      const qty = qtyPhrase(p, keys)
      bullets.push(`DAM — database activity monitoring${qty ? ` (${qty})` : ''}.`)
    }
    if (endpoint) {
      const qty = qtyPhrase(p, ['endpoint_device'])
      bullets.push(`Endpoint Discovery / DLP — coverage${qty ? ` for ${qty}` : ''}.`)
    }
  }

  bullets.push(
    'Implementation & deployment — end-to-end setup, configuration, and go-live support.',
    'Support — priority support for the life of the engagement.',
    'Updates — platform and compliance updates at no extra cost.',
  )
  return bullets
}

const MODULE_EXCLUSION_LABEL: Record<'dspm' | 'dam' | 'endpoint', string> = {
  dspm: 'DSPM',
  dam: 'DAM',
  endpoint: 'Endpoint Discovery / DLP',
}

/** Unselected modules named explicitly, plus the standard exclusions that
 * apply to every deal regardless of scope. */
export function exclusionBullets(p: ClientSafeProposal): string[] {
  const mode = p.inputs.deployment_mode
  const bullets: string[] = []
  const isExcluded = (key: 'dspm' | 'dam' | 'endpoint'): boolean => mode === 'saas' || !p.inputs.modules[key]
  for (const key of ['dspm', 'dam', 'endpoint'] as const) {
    if (isExcluded(key)) bullets.push(`${MODULE_EXCLUSION_LABEL[key]} — not in current scope; available as an add-on.`)
  }
  bullets.push(
    'Applicable taxes.',
    'Custom connectors beyond the standard set.',
    'SI-partner delivery, unless separately opted.',
    'Client-side infrastructure — required only for On-Prem deployments; Perfios hosts the platform on SaaS and Hybrid.',
    'Third-party licences (OS, database, cloud provider, etc.) beyond what Perfios provides.',
  )
  return bullets
}

/** The full "Inclusions & Exclusions" section, ready to drop into any
 * format's `sections` array. */
export function buildInclusionsExclusionsSection(p: ClientSafeProposal): RenderSection {
  return {
    heading: 'Inclusions & Exclusions',
    bullets: [
      'Included in this proposal:',
      ...inclusionBullets(p),
      'Not included in this proposal:',
      ...exclusionBullets(p),
    ],
  }
}
