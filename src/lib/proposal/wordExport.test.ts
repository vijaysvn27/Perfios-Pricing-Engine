import { Document } from 'docx'
import { describe, expect, it } from 'vitest'
import { price, priceAllModes } from '../engine2/engine2'
import { RATE_CARD_SEED } from '../engine2/seed'
import type { DealInputs } from '../engine2/types'
import type { ClientSafeProposal } from './clientSafe'
import { bomForDpBase } from './bomData'
import { buildFormat } from './formats/index'
import type { ProposalRenderModel } from './formats/types'
import { buildProposalDocx } from './wordExport'

// Same fixture shapes as formats/formats.test.ts, duplicated here (a test
// file, not a shared module) so this suite is self-contained.
const FIXED_DATE = '2026-07-12'

const onpremInputs: DealInputs = {
  deployment_mode: 'onprem',
  dp_base_y1: 2_500_000,
  dp_base_y2: 2_500_000,
  modules: { dspm: false, dam: false, endpoint: false },
  estate_quantities: {},
  tco_years: 3,
  discount_pct: 0,
}

const saasInputs: DealInputs = {
  ...onpremInputs,
  deployment_mode: 'saas',
  dp_base_y2: 3_000_000,
}

const compareInputs: DealInputs = {
  ...onpremInputs,
  modules: { dspm: true, dam: false, endpoint: false },
  estate_quantities: { database: 10, cloud_connector: 1, account: 1, gdrive_user: 100, vm: 5 },
}

function clientSafe(inputs: DealInputs, opts: { discount_shown?: boolean } = {}): ClientSafeProposal {
  return {
    customer_name: 'Acme Appliances',
    validity_days: 60,
    inputs,
    results: [price(RATE_CARD_SEED, inputs)],
    discount_shown: opts.discount_shown ?? true,
    usage_rates: RATE_CARD_SEED.usage_rates,
  }
}

function compareClientSafe(inputs: DealInputs, opts: { discount_shown?: boolean } = {}): ClientSafeProposal {
  const all = priceAllModes(RATE_CARD_SEED, inputs)
  return {
    customer_name: 'Acme Appliances',
    validity_days: 60,
    inputs,
    results: [all.onprem, all.hybrid, all.saas],
    discount_shown: opts.discount_shown ?? true,
    usage_rates: RATE_CARD_SEED.usage_rates,
  }
}

const FORMAT_KINDS = ['module_wise', 'perfios'] as const

const CASES: Array<{ label: string; proposal: ClientSafeProposal }> = [
  { label: 'onprem', proposal: clientSafe(onpremInputs) },
  { label: 'saas', proposal: clientSafe(saasInputs) },
  { label: 'compare', proposal: compareClientSafe(compareInputs) },
]

describe('buildProposalDocx: construct-without-throw for every format x deployment-mode fixture', () => {
  for (const { label, proposal } of CASES) {
    for (const kind of FORMAT_KINDS) {
      it(`${kind}/${label} builds a Document`, () => {
        const model = buildFormat(kind, proposal, FIXED_DATE)
        const bom = label === 'onprem' ? bomForDpBase(onpremInputs.dp_base_y1) : undefined
        const doc = buildProposalDocx(model, {
          bom,
          bomNotes: 'DR strategy: cold standby.',
          customer: proposal.customer_name,
        })
        expect(doc).toBeInstanceOf(Document)
      })
    }
  }
})

describe('buildProposalDocx client-safety (D5): blocklist guard', () => {
  it('throws when the model contains a blocklisted partner name', () => {
    const poisoned: ProposalRenderModel = {
      title: 'Commercial Proposal',
      subtitle: 'Routed via Aurva co-sell',
      sections: [{ heading: '1. What You Get', bullets: ['Sourced through our partner Aurva'] }],
    }
    expect(() => buildProposalDocx(poisoned, { customer: 'Acme Appliances' })).toThrow(/aurva/i)
  })

  it('throws when a BOM annexure row contains a blocklisted term', () => {
    const clean: ProposalRenderModel = { title: 'Proposal', subtitle: 'x', sections: [] }
    expect(() =>
      buildProposalDocx(clean, {
        customer: 'Acme Appliances',
        bom: [{ component: 'App server (via TechJockey)', site: 'primary', nodes: 1, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' }],
      }),
    ).toThrow(/techjockey/i)
  })

  it('does not throw for a clean model with no bom', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    expect(() => buildProposalDocx(model, { customer: 'Acme Appliances' })).not.toThrow()
  })
})

describe('buildProposalDocx structure', () => {
  it('returns a Document instance', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const doc = buildProposalDocx(model, { customer: 'Acme Appliances' })
    expect(doc).toBeInstanceOf(Document)
  })

  it('constructing with a bom annexure does not throw and still returns a Document', () => {
    const model = buildFormat('module_wise', clientSafe(onpremInputs), FIXED_DATE)
    const withoutBom = buildProposalDocx(model, { customer: 'Acme Appliances' })
    const withBom = buildProposalDocx(model, {
      customer: 'Acme Appliances',
      bom: bomForDpBase(onpremInputs.dp_base_y1),
      bomNotes: 'DR strategy: cold standby.',
    })
    expect(withoutBom).toBeInstanceOf(Document)
    expect(withBom).toBeInstanceOf(Document)
  })

  it('builds without a logo (falls back to the text wordmark cover)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    expect(() => buildProposalDocx(model, { customer: 'Acme Appliances' })).not.toThrow()
  })

  it('builds with a logo (running header gets an embedded image ahead of the "Perfios DPDP Suite" text — item 5)', () => {
    const model = buildFormat('perfios', clientSafe(onpremInputs), FIXED_DATE)
    // A real (if trivial) 1x1 transparent PNG, so this test exercises the
    // same code path as a genuine logo asset rather than an arbitrary buffer.
    const PNG_1X1_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const logo = new Uint8Array(Buffer.from(PNG_1X1_BASE64, 'base64')).buffer as ArrayBuffer
    const doc = buildProposalDocx(model, { customer: 'Acme Appliances', logo })
    expect(doc).toBeInstanceOf(Document)
  })
})
