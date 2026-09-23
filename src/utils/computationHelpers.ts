export const SELLING_PRICE_MARKUP: number = 1.6
//gamita ni nga function for the selling price computation
export function computeSellingPrice(costPrice: number | null | undefined): number | null {
  if (costPrice == null) return null
  const cost = Number(costPrice)
  if (!Number.isFinite(cost) || cost <= 0) return null
  return Number((cost * SELLING_PRICE_MARKUP).toFixed(2))
}
