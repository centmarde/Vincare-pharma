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

export interface PurchaseCharges {
  discount_percent: number
  tax_amount: number
  shipping_amount: number
}

export interface SupplierCharges extends PurchaseCharges {
  supplier_id: number
}

export interface PurchaseBreakdown {
  netTotal: number
  discountPercent: number
  discountAmount: number
  taxAmount: number
  shippingAmount: number
  purchaseTotal: number
}

export function emptySupplierCharges(supplierId: number): SupplierCharges {
  return { supplier_id: supplierId, discount_percent: 0, tax_amount: 0, shipping_amount: 0 }
}

function roundToCentavos(value: number): number {
  return Math.round(value * 100) / 100
}

export function computePurchaseBreakdown(
  netTotal: number,
  charges: PurchaseCharges,
): PurchaseBreakdown {
  const roundedNetTotal = roundToCentavos(netTotal)
  const discountPercent = Number(charges.discount_percent) || 0
  const taxAmount = roundToCentavos(Number(charges.tax_amount) || 0)
  const shippingAmount = roundToCentavos(Number(charges.shipping_amount) || 0)
  const discountAmount = roundToCentavos((roundedNetTotal * discountPercent) / 100)
  const purchaseTotal = roundToCentavos(
    roundedNetTotal - discountAmount + taxAmount + shippingAmount,
  )

  return {
    netTotal: roundedNetTotal,
    discountPercent,
    discountAmount,
    taxAmount,
    shippingAmount,
    purchaseTotal,
  }
}
