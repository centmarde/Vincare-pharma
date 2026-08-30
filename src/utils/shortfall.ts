

export const maxQtyMultiple = 3

export type QtyCheck =
  | { status: 'ok' }
  | { status: 'below'; floor: number }
  | { status: 'over'; floor: number }

/**
 * Validates order quantity against shortfall constraints
 * @param qty - The order quantity to check
 * @param shortfall - The shortfall quantity (null/undefined means no constraint)
 * @returns Status indicating if qty is ok, below minimum, or over maximum allowed
 */
export function checkQtyAgainstShortfall(qty: number, shortfall: number | null | undefined): QtyCheck {
  const floor = Number(shortfall)
  if (shortfall == null || !Number.isFinite(floor) || floor <= 0) return { status: 'ok' }
  const q = Number(qty)
  if (!Number.isFinite(q)) return { status: 'ok' }
  if (q < floor) return { status: 'below', floor }
  if (q > floor * maxQtyMultiple) return { status: 'over', floor }
  return { status: 'ok' }
}

/**
 * Calculates the buffer quantity ordered above the shortfall
 * The "+N" buffer chip both tables render — how far over the shortfall we're ordering.
 * @param qty - The order quantity
 * @param shortfall - The shortfall quantity (null/undefined means no shortfall)
 * @returns The buffer amount (how much over the shortfall), or 0 if none
 */
export function bufferOver(qty: number, shortfall: number | null | undefined): number {
  const floor = Number(shortfall)
  if (shortfall == null || !Number.isFinite(floor)) return 0
  return Math.max(0, Number(qty) - floor)
}
