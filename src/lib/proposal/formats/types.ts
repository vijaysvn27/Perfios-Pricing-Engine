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

export interface ProposalRenderModel {
  title: string
  subtitle: string
  sections: RenderSection[]
}
