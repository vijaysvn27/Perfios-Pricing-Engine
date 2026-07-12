// Render-model contract shared by screen preview and exports (§7/§9 of the
// revamp design). Format builders turn a ClientSafeProposal into this shape;
// the screen preview and excelExport both consume it, so there is exactly one
// place that decides what a proposal "says".

export interface RenderTable {
  title: string
  columns: string[]
  rows: (string | number)[][]
}

export interface RenderSection {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
  table?: RenderTable
}

/**
 * Branded cover data (item 3 of the revamp): every format emits this so the
 * screen preview and the Excel export can render a consistent header band —
 * logo, title, customer, date, validity, and a deterministic reference code.
 * `logo` is a boolean flag (not the asset itself — formats stay asset-free so
 * lib code never imports binary/image modules); the render layers decide how
 * to source the actual image.
 */
export interface ProposalCover {
  logo: boolean
  title: string
  customer: string
  date_label: string
  validity_days: number
  reference: string
}

export interface ProposalRenderModel {
  title: string
  subtitle: string
  cover?: ProposalCover
  sections: RenderSection[]
}
