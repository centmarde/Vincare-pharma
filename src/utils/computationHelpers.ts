export const SELLING_PRICE_MARKUP: number = 1.6
//gamita ni nga function for the selling price computation
export function computeSellingPrice(costPrice: number | null | undefined): number | null {
  if (costPrice == null) return null
  const cost = Number(costPrice)
  if (!Number.isFinite(cost) || cost <= 0) return null
  // round off ngadto sa nearest 0.50 (e.g. 16.22 -> 16.50, 16.80 -> 17.00,
  // 200.75 -> 201.00). Bisag unsa nga decimal, padayon nga i-round UP.
  return Math.ceil(cost * SELLING_PRICE_MARKUP * 2) / 2
}
