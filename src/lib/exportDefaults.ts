// Final fallback copy if neither the user's saved prefs nor the live config carry
// hero/terms. Kept in sync with migration 0014's seeded defaults.

export const DEFAULT_HERO =
  'Estimated base cost for the selected data-privacy and Consent Manager modules. Year 1 includes one-time setup; Year 2 is the recurring annual cost.'

export const DEFAULT_TERMS = [
  'All figures are base cost in Indian Rupees, exclusive of applicable taxes (e.g. GST).',
  'Year 1 includes one-time deployment and implementation; Year 2 onward is the recurring annual cost.',
  'This estimate is indicative and valid for 30 days from the date above.',
  'Final pricing is subject to a formal agreement.',
].join('\n')
