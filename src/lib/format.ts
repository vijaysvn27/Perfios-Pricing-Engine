// Indian-style currency formatting (e.g. 1,00,000).

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function formatINR(amount: number): string {
  return `₹${inr.format(amount)}`
}
