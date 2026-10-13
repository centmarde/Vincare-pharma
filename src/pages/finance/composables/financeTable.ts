// Page sizes offered by every finance table.
//
// No "All": these tables grow with the books, and rendering every row at once
// is what slows a page down as the data piles up. 100 rows is the most a page
// shows; anything longer is paged.
export const financePageSizes = [10, 25, 50, 100]

/** Vuetify's default page size. A table with this many rows or fewer needs no pager. */
export const financeDefaultPageSize = 10
