// Single source of truth for the "Perfios_DPDP_Questionnaire" workbook: the
// exact row/column layout that BOTH the generator (questionnaireExport.ts)
// and the parser (questionnaireImport.ts) key off. Neither module hardcodes
// a cell reference for a question — they derive it from this file — so the
// generated workbook and the importer's cell map can never drift apart.
//
// Row numbers are load-bearing: a filled questionnaire an AM sends today
// must still import correctly next quarter, so once a question's `row` ships
// it should not move. Add new questions in new rows rather than renumbering.

export interface QuestionRow {
  row: number
  no: number
  question: string
  why: string
  /** Which parsed field this question feeds (see questionnaireImport.ts).
   * `'notes'` marks free-text answers that are preserved verbatim as an
   * internal note rather than mapped to a structured field; several
   * questions share that key since it is not used as a lookup key. */
  import_key?: string
}

export interface QuestionSection {
  header_row: number
  title: string
  questions: QuestionRow[]
}

/** Fixed layout shared by both sheets: banner/title row, prepared-for row,
 * guidance row, then a blank spacer before the first section header. Each
 * section's column-header row is header_row + 1 and its first question row
 * is header_row + 2 — true for every section below; the exporter and any
 * future section rely on that invariant rather than a separate stored field. */
export const TITLE_ROW = 3
export const PREPARED_FOR_ROW = 4
export const GUIDANCE_ROW = 5

export interface SheetMeta {
  title: string
  /** B4 template. Deliberately has no "Channel:" fragment — partner names
   * (Aurva / Tech Jockey) are internal-only and must never reach a
   * client-facing file (see CLIENT_BLOCKLIST in clientSafe.ts). */
  prepared_for_template: string
  guidance: string
  column_headers: [string, string, string, string]
  note_row: number
  note: string
}

export const PRICING_SHEET_NAME = 'Pricing Questionnaire'
export const SCOPING_SHEET_NAME = 'Scoping Questions'
export const RESPONSE_COL = 'D'

export const PRICING_SHEET: SheetMeta = {
  title: 'DPDP Suite  |  Pricing Prerequisite Questionnaire',
  prepared_for_template: 'Prepared for: ____________________          Date: DD-MMM-YYYY',
  guidance:
    'Fill only the Response column. Every answer maps directly to a pricing line. Volume of data in TB is not required. Bundled compliance features are confirmed on a separate scope sheet.',
  column_headers: ['No', 'Question', 'Response', 'Why needed'],
  note_row: 31,
  note:
    'Infrastructure sizing for the data-security components (DSPM and DAM) is confirmed with our data security partner and marked TBD until then, never estimated. Consent Manager is provided at implementation stage.',
}

export const SCOPING_SHEET: SheetMeta = {
  title: 'DPDP Suite  |  Discovery & Scoping Questions',
  prepared_for_template: 'Prepared for: ____________________          Date: DD-MMM-YYYY',
  guidance:
    'Use during the call. Note answers in the Response column. These questions scope your consent journeys, your telephonic-consent design, and your data estate. Rough answers are fine.',
  column_headers: ['No', 'Question', 'Response', 'Why we ask / What it scopes'],
  note_row: 40,
  note:
    'Consent Manager is provided at implementation stage. DSPM and DAM are delivered with our data security partner. Any capability marked pending is confirmed before the commercial proposal, never estimated.',
}

export const PRICING_SECTIONS: QuestionSection[] = [
  {
    header_row: 7,
    title: 'Section 1   Deployment Mode + Consent Manager',
    questions: [
      {
        row: 9,
        no: 1,
        question: 'Deployment mode  (On-Prem / Hybrid / SaaS)',
        why: 'Tells us how you want the platform hosted. On-Premise sits fully inside your environment as a one-time licence; Hybrid and SaaS are hosted and run as an annual subscription. It also decides where your data physically resides.',
        import_key: 'deployment_mode',
      },
      {
        row: 10,
        no: 2,
        question: 'Active data principal base, Year 1  (consumers + dealers/distributors + employees)',
        why: 'The number of individuals whose consent you will manage in Year 1. This sizes the platform to your actual base, so you pay for the capacity you use and not more.',
        import_key: 'dp_base_y1',
      },
      {
        row: 11,
        no: 3,
        question: 'Expected data principal growth from Year 2 onward  (% or absolute per year)',
        why: 'Your expected yearly growth in the individual base. Lets us hold your future pricing steady and avoid surprises as you scale.',
        import_key: 'dp_growth',
      },
      {
        row: 12,
        no: 4,
        question:
          'Core systems to integrate for consent governance  (CRM, Service CRM, ERP/SAP, dealer portal, connected-product app, others + count)',
        why: 'The systems where consent must be applied and enforced. Each integration point is built once during Year-1 deployment; the count helps us size that effort.',
        import_key: 'notes',
      },
    ],
  },
  {
    header_row: 14,
    title: 'Section 2   Data Estate  (DSPM / DAM / Endpoint)',
    questions: [
      {
        row: 16,
        no: 5,
        question: 'Databases to be scanned  (total count + engine types: Oracle, Postgres, Mongo, MySQL, Redshift)',
        why: 'How many databases hold personal data, and on which engines. Discovery is priced per database, not by data volume, so a rough count is enough.',
        import_key: 'database',
      },
      {
        row: 17,
        no: 6,
        question: 'Cloud providers holding PII  (AWS, Azure, GCP, on-prem DC)',
        why: 'Which clouds or on-premise centres store personal data. Each one is at least one secure connection point for scanning and monitoring.',
        import_key: 'cloud_connector',
      },
      {
        row: 18,
        no: 7,
        question: 'Separate accounts per provider  (split by department, owner or legal entity)',
        why: 'Whether a cloud is split into multiple accounts (by team, entity or region). Each account needs its own secure connection, so this affects the connection count.',
        import_key: 'account',
      },
      {
        row: 19,
        no: 8,
        question: 'Virtual machines hosting PII apps or services',
        why: 'Servers running applications that hold or touch personal data. Each is a separate point we secure and monitor.',
        import_key: 'vm',
      },
      {
        row: 20,
        no: 9,
        question: 'M365 / Google Workspace users  (SharePoint, OneDrive, mail)',
        why: 'Users on email and file-sharing tools, where personal data often sits inside documents. Sizes discovery across this unstructured content.',
        import_key: 'gdrive_user',
      },
      {
        row: 21,
        no: 10,
        question: 'Endpoint devices across HO and branches',
        why: 'Laptops and devices across offices and branches where personal data may sit locally. Sizes endpoint discovery; a rough count is fine.',
        import_key: 'endpoint_device',
      },
    ],
  },
  {
    header_row: 23,
    title: 'Section 3   Scope Gates  (Yes / No)',
    questions: [
      {
        row: 25,
        no: 11,
        question: 'DSPM in scope?   DAM in scope?',
        why: 'Confirms whether data discovery (DSPM) and data activity monitoring (DAM) are included. Turns these estate components on or off in the estimate.',
        import_key: 'dspm_dam',
      },
      {
        row: 26,
        no: 12,
        question: 'Endpoint Discovery / DLP in scope?',
        why: 'Whether scanning of laptops and devices, together with data-loss prevention, is included in scope.',
        import_key: 'endpoint',
      },
      {
        row: 27,
        no: 13,
        question: 'Existing DSPM or data-lineage tool to connect to?',
        why: 'If you already run a discovery or data-lineage tool, we connect to it instead of adding our own, which reduces cost.',
        import_key: 'notes',
      },
      {
        row: 28,
        no: 14,
        question: 'Any SaaS or multi-tenant sources holding PII?',
        why: 'Any shared or multi-tenant systems holding personal data. These use a different, export-based method and are scoped separately.',
        import_key: 'notes',
      },
      {
        row: 29,
        no: 15,
        question: 'Implementation: Perfios direct or via SI partner?',
        why: 'Whether Perfios delivers implementation directly or works alongside your system-integrator partner. Selects the deployment approach.',
        import_key: 'notes',
      },
    ],
  },
]

// Scoping Questions content is context for the discovery call only — none of
// it is imported back, so no import_key. Copied verbatim from the original
// template (C:\Users\vijay.narayanan\Downloads\Perfios_DPDP_Questionnaire (1).xlsx,
// sheet "Scoping Questions"), with the "Channel:" fragment dropped from B4.
export const SCOPING_SECTIONS: QuestionSection[] = [
  {
    header_row: 7,
    title: 'Section A   Reaching Your Consumers',
    questions: [
      {
        row: 9,
        no: 1,
        question:
          'Today, how do you primarily reach consumers: telephone, WhatsApp, SMS, email, service visit, or the connected-product app?',
        why: 'Establishes the channels where a consent notice can be delivered and captured.',
      },
      {
        row: 10,
        no: 2,
        question:
          'Do you hold consumer contact details centrally, or does a large share sit only with dealers and service partners?',
        why: 'Determines where consent must be captured and who currently holds the data.',
      },
      {
        row: 11,
        no: 3,
        question: 'Of your installed base, roughly what share can you reach directly today versus only through the channel?',
        why: 'Sizes the direct-reach gap that a unified consent layer can close.',
      },
      {
        row: 12,
        no: 4,
        question: 'Which is your highest-volume capture point: warranty / product registration, service booking, or e-commerce?',
        why: 'Prioritises where consent capture should be deployed first.',
      },
      {
        row: 13,
        no: 5,
        question: 'Rough smartphone versus feature-phone split of your consumer base?',
        why: 'Decides whether consent is captured via a tap-link or via IVR keypress.',
      },
    ],
  },
  {
    header_row: 15,
    title: 'Section B   Telephonic Consent Design',
    questions: [
      {
        row: 17,
        no: 6,
        question: 'On calls, is consent mainly needed for the service itself, or for marketing / cross-sell and data-sharing?',
        why: 'A service the customer initiated may not need fresh consent; marketing and sharing do. This removes needless friction on every call.',
      },
      {
        row: 18,
        no: 7,
        question: 'Are your calls inbound, outbound, or both?',
        why: 'Shapes when and how the notice is delivered during the call.',
      },
      {
        row: 19,
        no: 8,
        question: 'Which dialer, telephony or CRM do your agents use on calls?',
        why: 'Determines how consent capture plugs into the live call.',
      },
      {
        row: 20,
        no: 9,
        question: 'Is call recording already in place?',
        why: 'Decides whether a recorded verbal consent is a viable fallback for non-smartphone consumers.',
      },
      {
        row: 21,
        no: 10,
        question: 'Is live in-call consent required, or is a consent tap within a few hours acceptable?',
        why: 'Sets the capture design: real-time versus deferred.',
      },
      {
        row: 22,
        no: 11,
        question: 'Which languages should consent notices be offered in?',
        why: 'A notice must be understood by the consumer; the platform supports 22 languages.',
      },
    ],
  },
  {
    header_row: 24,
    title: 'Section C   Data Estate & Systems',
    questions: [
      {
        row: 26,
        no: 12,
        question: 'Where does connected-product (app) data sit: in India, or on the group platform abroad?',
        why: 'Flags any cross-border data flow, which affects the notice wording and record-keeping.',
      },
      {
        row: 27,
        no: 13,
        question:
          'Which systems holding consumer PII do you control, versus those a partner controls (service platform, technicians)?',
        why: 'Separates your Data Fiduciary scope from third-party processor scope.',
      },
      {
        row: 28,
        no: 14,
        question: 'Do you run SAP, Oracle, or a dedicated Service CRM for consumer and dealer data?',
        why: 'Confirms the integration points where consent will be enforced.',
      },
      {
        row: 29,
        no: 15,
        question: 'Roughly how many databases and cloud accounts hold consumer, dealer and service data?',
        why: 'Feeds the data-discovery sizing on the pricing sheet.',
      },
    ],
  },
  {
    header_row: 31,
    title: 'Section D   Consent Journeys & Scope',
    questions: [
      {
        row: 33,
        no: 16,
        question:
          'Which consent journeys are in scope for phase 1: warranty, service, marketing, connected-app, dealer onboarding?',
        why: 'Sets the initial build scope.',
      },
      {
        row: 34,
        no: 17,
        question: 'What is the size of the existing installed base you would want to re-consent?',
        why: 'Sizes the one-time bulk re-consent of your legacy base.',
      },
      {
        row: 35,
        no: 18,
        question: 'Are minors ever a data subject in your flows (for example household registration)?',
        why: 'DPDP treats anyone under 18 as a minor needing verifiable guardian consent. Flags whether a guardian-consent journey is required.',
      },
      {
        row: 36,
        no: 19,
        question: 'Is dealer, distributor or group-company data-sharing in scope?',
        why: 'Flags consent pass-through and cross-entity data flow.',
      },
      {
        row: 37,
        no: 20,
        question: 'What is your internal go-live target, and is it consumer-side, dealer-side, or both?',
        why: 'Drives deployment phasing and resourcing.',
      },
      {
        row: 38,
        no: 21,
        question:
          'Do you have an implementation / SI partner in place, or should Perfios propose implementation services?',
        why: 'Scopes whether implementation effort sits with Perfios or a partner.',
      },
    ],
  },
]
