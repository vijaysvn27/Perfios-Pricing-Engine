// "Inclusions & Exclusions" section (item 2 of the revamp, upgraded to
// consulting-grade detail per owner feedback 2026-07-13: "I want it detailed
// ... like how a McKinsey would send a pricing proposal"): every format gets
// an explicit, scope-aware, GROUPED statement of what is and isn't in the
// deal — named unselected modules under exclusions, quantified selected
// modules under inclusions, each grouped under a labelled sub-heading. Kept
// in one place so the two formats can never drift on wording, mirroring
// how shared.ts centralizes the CM module copy.
//
// Rendering note: RenderModelView / excelExport (both out of scope for this
// change) only special-case the exact strings "Included in this proposal:"
// and "Not included in this proposal:" — there is no generic "paragraph
// ending in ':' renders bold" convention. Sub-group labels below (e.g.
// "Platform & Licences:") are therefore plain bullet-list entries, not
// styled headers; they still group the content for a reader scanning the
// list, and excelExport's writeInclusionsExclusionsSheet (which slices the
// bullets between the two marker strings above) tolerates them as ordinary
// list rows.
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

/** The 7 Consent Manager capability groups, each a substantive bullet in its
 * own right (not a single cram-bullet) — the detail the owner asked for. */
const CM_CAPABILITY_BULLETS: string[] = [
  '1. Consent Notice & Templates — DPDP-compliant notices in 22 languages, omnichannel delivery, audio readout, ' +
    'self & nomination flows.',
  '2. Data Principal Rights Portal (DPAR) — access, correction, revocation and nomination with KYC, grievance ' +
    'workflows with SLA tracking.',
  '3. Cookie Consent Manager — granular category consent, banner and library deployment.',
  '4. Consent Governance (Consent Bridge) — DPO dashboards, immutable audit logs, versioning, maker-checker, rule ' +
    'engine, RBAC, auto-renewal, bulk operations, OCR.',
  '5. Consent Breach Module — breach detection with consent-to-data and DSAR tie-back.',
  '6. Vendor / Third-Party Module — automated processor API notifications and vendor reporting.',
  '7. DPIA — data privacy risk assessment with risk scoring and versioning.',
]

const CM_UNLIMITED_LINE = 'Unlimited consents and consent actions per data principal — no per-transaction charges.'

/** Automated DPIA needs DSPM/DAM's discovery feed (owner feedback: "DPIA
 * cannot be delivered standalone in CM-only deals"). SaaS is CM-only, so it
 * never qualifies regardless of module toggles — same rule
 * scopeExclusionBullets/scopeNote already apply to the estate modules
 * themselves. */
function dpiaAutomated(p: ClientSafeProposal): boolean {
  return p.inputs.deployment_mode !== 'saas' && (p.inputs.modules.dspm || p.inputs.modules.dam)
}

const DPIA_SCOPE_NOTE = 'Consent Manager — all modules bundled; DPIA activates fully with DSPM/DAM.'

/** "Platform & Licences:" group — the 7 CM capability bullets (minus DPIA
 * when it can't run automated — see dpiaAutomated), the unlimited-consents
 * line, and (mode-permitting) one quantified bullet per selected estate
 * module. */
function platformAndLicenceBullets(p: ClientSafeProposal): string[] {
  const automated = dpiaAutomated(p)
  // DPIA (bullet 7) needs DSPM/DAM's automated discovery feed to run in
  // full; in a CM-only deal it moves to Scope exclusions instead (see
  // scopeExclusionBullets) rather than being listed as a plain inclusion.
  const capabilityBullets = automated ? CM_CAPABILITY_BULLETS : CM_CAPABILITY_BULLETS.slice(0, 6)
  const bullets: string[] = ['Platform & Licences:', ...capabilityBullets]
  if (!automated) bullets.push(DPIA_SCOPE_NOTE)
  bullets.push(CM_UNLIMITED_LINE)

  const mode = p.inputs.deployment_mode
  if (mode !== 'saas') {
    const { dspm, dam, endpoint } = p.inputs.modules
    if (dspm) {
      const qty = qtyPhrase(p, [...SHARED_KEYS, 'gdrive_user', 'vm', 'sharepoint_site'])
      bullets.push(
        `DSPM — data discovery & classification across your estate${qty ? ` (${qty})` : ''}; data lineage and ` +
          `automated RoPA included.`,
      )
    }
    if (dam) {
      // Shared-bucket quantities are only DAM's own to describe when DSPM
      // isn't also selected (engine2 attributes the shared base to DSPM
      // first — see estateBases in engine2.ts). The RoPA/lineage capability
      // is delivered with whichever of DSPM/DAM is in scope, so it's only
      // called out here when DSPM isn't already carrying that line.
      const keys = dspm ? ['dam_dataset'] : [...SHARED_KEYS, 'dam_dataset']
      const qty = qtyPhrase(p, keys)
      const ropaSuffix = dspm ? '' : ' Data lineage and automated RoPA included.'
      bullets.push(`DAM — database activity monitoring across your estate${qty ? ` (${qty})` : ''}.${ropaSuffix}`)
    }
    if (endpoint) {
      const qty = qtyPhrase(p, ['endpoint_device'])
      bullets.push(
        `Endpoint Discovery / DLP — coverage${qty ? ` for ${qty}` : ''}, including data-loss-prevention (DLP) ` +
          `policies.`,
      )
    }
  }

  return bullets
}

/** "Delivery & Implementation:" group. */
function deliveryImplementationBullets(): string[] {
  return [
    'Delivery & Implementation:',
    'One-time deployment (18% of the licence/base fee) — end-to-end implementation: environment setup, standard ' +
      'connector configuration, consent-journey configuration, API governance integration via the consent bridge, ' +
      'UAT support and production go-live.',
    'Standard connector set — the pre-built integrations to your common systems, configured as part of deployment.',
    'Training and handover — administrator and end-user training, with documentation, ahead of go-live.',
  ]
}

/** "Support & Maintenance:" group — always the standard support line;
 * SaaS/Hybrid additionally get the hosting inclusion (On-Prem hosts itself,
 * so no hosting line there). */
function supportMaintenanceBullets(p: ClientSafeProposal): string[] {
  const bullets: string[] = [
    'Support & Maintenance:',
    'Annual support from Year 1 — product updates, compliance-rule updates as DPDP rules evolve, and standard ' +
      'business-hours coverage. 24×7 coverage and onsite resources are available as chargeable add-ons.',
  ]
  if (p.inputs.deployment_mode !== 'onprem') {
    bullets.push(
      'Hosting (SaaS/Hybrid) — Perfios-hosted, India region, with proactive monitoring and disaster recovery ' +
        '(cold standby; RPO < 15 min, RTO 1–2 hrs).',
    )
  }
  return bullets
}

/** "Data-blind by design:" group — kept as its own labelled clause. */
function dataBlindBullets(p: ClientSafeProposal): string[] {
  return [
    'Data-blind by design:',
    `Perfios holds consent artefacts and proof, not the underlying personal data, which remains within ` +
      `${p.customer_name || 'your'} systems.`,
  ]
}

/** Bullets for the "Included in this proposal:" half of the section, grouped
 * under labelled sub-headings. */
export function inclusionBullets(p: ClientSafeProposal): string[] {
  return [
    ...platformAndLicenceBullets(p),
    ...deliveryImplementationBullets(),
    ...supportMaintenanceBullets(p),
    ...dataBlindBullets(p),
  ]
}

const MODULE_EXCLUSION_LABEL: Record<'dspm' | 'dam' | 'endpoint', string> = {
  dspm: 'DSPM',
  dam: 'DAM',
  endpoint: 'Endpoint Discovery / DLP',
}

/** "Commercial exclusions:" group. */
function commercialExclusionBullets(p: ClientSafeProposal): string[] {
  return [
    'Commercial exclusions:',
    'Applicable taxes — GST and other statutory levies, at actuals.',
    `Price validity — this proposal is valid for ${p.validity_days} days from the date of issue; a re-quote is ` +
      `required thereafter.`,
  ]
}

/** "Scope exclusions:" group — unselected modules named explicitly, plus the
 * standard out-of-scope items with a precise fence around each. */
function scopeExclusionBullets(p: ClientSafeProposal): string[] {
  const mode = p.inputs.deployment_mode
  const isExcluded = (key: 'dspm' | 'dam' | 'endpoint'): boolean => mode === 'saas' || !p.inputs.modules[key]
  const bullets: string[] = ['Scope exclusions:']
  for (const key of ['dspm', 'dam', 'endpoint'] as const) {
    if (isExcluded(key)) {
      bullets.push(`${MODULE_EXCLUSION_LABEL[key]} — not in current scope; available as a priced add-on.`)
    }
  }
  if (!dpiaAutomated(p)) {
    bullets.push('Automated DPIA — requires DSPM/DAM in scope; questionnaire-based DPIA available as an interim.')
  }
  bullets.push(
    'Custom connectors beyond the standard set — bespoke integrations to systems outside the standard connector ' +
      'list; scoped and quoted separately.',
    'SI-partner delivery — engaged only where separately opted into this deal.',
    'Data migration / cleansing of legacy consent records beyond the standard bulk-import.',
    'Custom UI/UX beyond standard theming.',
  )
  return bullets
}

/** "Client responsibilities (not Perfios-provided):" group — On-Prem carries
 * the infrastructure/network/OS/DB-licence obligations on top of the items
 * every mode carries (third-party licences, client-side UAT resourcing). */
function clientResponsibilityBullets(p: ClientSafeProposal): string[] {
  const bullets: string[] = ['Client responsibilities (not Perfios-provided):']
  if (p.inputs.deployment_mode === 'onprem') {
    bullets.push(
      'Infrastructure — provisioned by you, sized per the sizing annexure (see Sizing Estimate).',
      'Network and firewall provisioning for the on-premise environment.',
      'Operating-system and database licences for the infrastructure you host.',
    )
  }
  bullets.push(
    'Third-party licences (operating system, database, cloud provider, etc.) beyond what Perfios provides.',
    'Client-side project resources for UAT and integration sign-off.',
  )
  return bullets
}

/** Bullets for the "Not included in this proposal:" half of the section,
 * grouped under labelled sub-headings. */
export function exclusionBullets(p: ClientSafeProposal): string[] {
  return [
    ...commercialExclusionBullets(p),
    ...scopeExclusionBullets(p),
    ...clientResponsibilityBullets(p),
  ]
}

/** The full "Inclusions & Exclusions" section, ready to drop into any
 * format's `sections` array. The two exact marker strings below
 * ("Included in this proposal:" / "Not included in this proposal:") are
 * load-bearing: RenderModelView bolds them and excelExport's
 * writeInclusionsExclusionsSheet slices the bullet list on them to build the
 * dedicated Excel sheet — do not rename or remove them. */
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
