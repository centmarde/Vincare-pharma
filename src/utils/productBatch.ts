export type CarriedProductSource = {
  category?: string | null
  brand?: string | null
  reorder_level?: number | null
  sku?: string | null
}

export type CarriedProductFields = {
  category: string | null
  brand: string | null
  reorder_level: number | null
  sku: string | null
}

export function carriedProductFields(
  source: CarriedProductSource | null | undefined,
): CarriedProductFields {
  return {
    category: source?.category ?? null,
    brand: source?.brand ?? null,
    reorder_level: source?.reorder_level ?? null,
    sku: source?.sku ?? null,
  }
}
