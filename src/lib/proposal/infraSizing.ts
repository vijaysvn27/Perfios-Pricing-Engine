// Reference-architecture infrastructure sizing — the client-side Consent
// Bridge footprint (SaaS/Hybrid) and the data-security (DSPM/DAM) estate
// footprint (cloud dataplane + on-premise estate), built from the REAL
// reference architectures rather than invented figures. Source documents:
//  - Consent Bridge: Perfios Tech Artifacts, "Hardware Sizing" sheet.
//  - Cloud dataplane: AWS Dataplane Terraform doc (per cloud account/VPC).
//  - On-premise estate: data-security partner infra sheet.
//
// Never name the data-security partner in any string here — every render
// model is scanned by clientSafe.scanForBlocklist and must stay clean; use
// "data-security dataplane / estate" phrasing instead (see CLIENT_BLOCKLIST
// in clientSafe.ts).
import type { RenderSection, RenderTable } from './formats/types'

export type CmBridgeProfile = 'Medium' | 'Large'

interface HardwareRow {
  component: string
  nodes: string
  vcpu: string
  ram_gb: string
  storage: string
}

/** Medium (<3M data principals) vs Large (<10M) profile selection — the
 * only two profiles the Hardware Sizing sheet defines. */
export function cmBridgeProfileFor(dpBase: number): CmBridgeProfile {
  return dpBase < 3_000_000 ? 'Medium' : 'Large'
}

function cmBridgeRows(profile: CmBridgeProfile): HardwareRow[] {
  const nodes = profile === 'Medium' ? '2–3' : '6+'
  const dbVcpu = profile === 'Medium' ? '8' : '16'
  const dbRam = profile === 'Medium' ? '32' : '64'
  const mongoStorage = profile === 'Medium' ? '~3 TB' : '~6 TB'
  const mysqlStorage = profile === 'Medium' ? '~500 GB' : '~1 TB'
  return [
    { component: 'Web tier (Ubuntu 22.04, Docker/Kubernetes)', nodes, vcpu: '4', ram_gb: '16', storage: '—' },
    { component: 'App tier', nodes, vcpu: '8', ram_gb: '16', storage: '200 GB per environment' },
    { component: 'MongoDB 8.x (3-node replica set)', nodes: '3', vcpu: dbVcpu, ram_gb: dbRam, storage: mongoStorage },
    { component: 'MySQL 8.x (primary + secondary)', nodes: '2', vcpu: dbVcpu, ram_gb: dbRam, storage: mysqlStorage },
    {
      component: 'Redis cache (3-node HA: 1 primary, 2 replicas)',
      nodes: '3',
      vcpu: '4',
      ram_gb: '~26',
      storage: '—',
    },
  ]
}

/**
 * "Consent Bridge — Client-Side Footprint (Reference)": the bridge always
 * runs on the client's premises, in every hosted mode (SaaS included — see
 * sizing.ts's hostingFootprint). Profile (Medium/Large) is picked from the
 * deal's Year-1 data-principal base, same "< 3,000,000" threshold the
 * Hardware Sizing sheet uses.
 */
export function cmBridgeFootprint(dpBase: number): RenderSection {
  const profile = cmBridgeProfileFor(dpBase)
  const rows = cmBridgeRows(profile)
  const table: RenderTable = {
    title: 'Consent Bridge — Client-Side Footprint (Reference)',
    columns: ['Component', 'Nodes', 'vCPU/node', 'RAM/node', 'Storage'],
    rows: rows.map((r) => [r.component, r.nodes, r.vcpu, r.ram_gb, r.storage]),
  }
  return {
    heading: 'Consent Bridge — Client-Side Footprint (Reference)',
    table,
    paragraphs: [
      `Sized for your ${dpBase.toLocaleString('en-IN')} data-principal base — ${profile} profile.`,
      'Deployed across Production and UAT environments; the consent bridge always runs on your premises.',
    ],
  }
}

/**
 * "Data-Security Dataplane — Per Cloud Account (Reference)": one dataplane
 * per cloud account/VPC (this is why the estate is priced per account /
 * connector) — deployed inside the client's own account, outbound-only.
 * `cloudAccounts` is the count of cloud accounts/VPCs in scope (see
 * sizing.ts, which resolves this from estate_quantities['cloud_connector']
 * or estate_quantities['account']).
 */
export function aurvaCloudDataplane(cloudAccounts: number): RenderSection {
  const n = Math.max(0, Math.trunc(cloudAccounts))
  const rows: (string | number)[][] = [
    ['Dataplane instance (auto-scaling, 2 min / 3 max)', '2–3', '4', '16', '50 GB gp3 each'],
    ['PostgreSQL', '1', '2', '2', '30 GB gp3'],
  ]
  const table: RenderTable = {
    title: 'Data-Security Dataplane — Per Cloud Account (Reference)',
    columns: ['Component', 'Nodes', 'vCPU/node', 'RAM GB/node', 'Storage/node'],
    rows,
  }
  return {
    heading: 'Data-Security Dataplane — Per Cloud Account (Reference)',
    table,
    paragraphs: [
      'Deploys inside your cloud account/VPC; networking is outbound-only HTTPS (443) to the management plane — ' +
        'no inbound rules.',
      `${n.toLocaleString('en-IN')} cloud account${n === 1 ? '' : 's'} in scope → ${n.toLocaleString('en-IN')} ` +
        `dataplane deployment${n === 1 ? '' : 's'}.`,
    ],
  }
}

/**
 * "Data-Security Estate — On-Premise (Reference)": Kubernetes estate sized
 * off the client's on-premise database count. Worker count scales with the
 * database count (max(2, ceil(databases / 60))); the exact figure is
 * confirmed during implementation planning like every other reference
 * figure here.
 */
export function aurvaOnPremEstate(databases: number): RenderSection {
  const dbs = Math.max(0, Math.trunc(databases))
  const workers = Math.max(2, Math.ceil(dbs / 60))
  const rows: (string | number)[][] = [
    ['Kubernetes master nodes', '3', '1', '2', '100 GB'],
    ['Kubernetes worker nodes', String(workers), '4', '8', '100 GB each'],
    ['PostgreSQL 15.7+', '1', '2', '4', '150 GB'],
    ['Elasticsearch', '3', '2', '8', '100 GB each'],
  ]
  const table: RenderTable = {
    title: 'Data-Security Estate — On-Premise (Reference)',
    columns: ['Component', 'Nodes', 'vCPU/node', 'RAM GB/node', 'Storage/node'],
    rows,
  }
  return {
    heading: 'Data-Security Estate — On-Premise (Reference)',
    table,
    paragraphs: [
      `Worker nodes scale with your database count — roughly one worker per 50–75 databases; ` +
        `${dbs.toLocaleString('en-IN')} database${dbs === 1 ? '' : 's'} in scope → ${workers} worker` +
        `${workers === 1 ? '' : 's'}.`,
      'DR: a mirror of the production estate (active-passive, PostgreSQL streaming replication).',
    ],
  }
}

/**
 * Endpoint Discovery / DLP note: a lightweight agent per device, no
 * server-side footprint beyond the estate components above.
 */
export function endpointNote(devices: number): string {
  const n = Math.max(0, Math.trunc(devices))
  return (
    'Endpoint Discovery / DLP — a lightweight agent deployed per device (laptop/desktop)' +
    (n > 0 ? ` across ${n.toLocaleString('en-IN')} devices` : '') +
    '; no additional server-side footprint beyond the estate components above.'
  )
}
