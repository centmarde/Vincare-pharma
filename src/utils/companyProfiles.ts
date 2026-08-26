/**
 * The two trading entities, in one place.
 *
 * These blocks were previously copy-pasted into every print dialog — five
 * copies of Exelmed's and two of Vincare's — which is why the street name had
 * drifted ("Ochoa Avenue" in the customer-facing documents, "Ochua Avenue" in
 * Purchasing's PO). One of those is a typo; both are on paper that has gone out.
 *
 * WHICH ENTITY ISSUES WHICH DOCUMENT IS A LEGAL FACT, NOT A PREFERENCE.
 * A sales invoice, OR or statement carries the issuing company's TIN, so the
 * default for each document type is encoded below rather than left to whoever
 * happens to be at the keyboard. Treat `defaultCompanyFor` as the rule and the
 * on-screen chooser as an override for the cases where it genuinely varies.
 */

export type CompanyKey = 'exelmed' | 'vincare'

export type CompanyProfile = {
  key: CompanyKey
  /** Short label for the chooser. */
  label: string
  name: string
  line1: string
  line2: string
  /** Licence + VAT/TIN line. Empty renders nothing rather than an empty label. */
  license: string
  contact: string
}

export const companyProfiles: Record<CompanyKey, CompanyProfile> = {
  exelmed: {
    key: 'exelmed',
    label: 'Exelmed Pharma Trade',
    name: 'EXELMED PHARMA TRADE',
    line1: 'Ground Floor NB Building, Ochoa Avenue, Butuan City',
    line2: '8600 Agusan del Norte, Philippines (Tel: 085-3000-460)',
    license: 'License Number: 3000001108883 - VAT Reg: TIN: 178-845-363-000',
    contact: 'Mobile: 09090734525 - Email Address: exelmedshop@gmail.com',
  },
  vincare: {
    key: 'vincare',
    label: 'Vincare Pharma',
    name: 'VINCARE PHARMA',
    line1: '2F N.B. Building, Ochoa Avenue, Butuan City',
    line2: '8600 Agusan del Norte, Philippines',
    // TIN confirmed 2026-08-24. The LICENCE NUMBER is still unknown — Exelmed's
    // line carries both ("License Number: ... - VAT Reg: TIN: ..."), so add it
    // here in the same shape once it is supplied.
    license: 'VAT Reg TIN: 176-395-238-000',
    contact: 'Mobile: 0968-879-5589',
  },
}

export const companyOptions = (Object.values(companyProfiles) as CompanyProfile[])
  .map((c) => ({ title: c.label, value: c.key }))

/** Every document that carries a letterhead. */
export type PrintedDocumentKind =
  | 'pos_receipt'
  | 'ethical_invoice'
  | 'delivery_receipt'
  | 'statement_of_account'
  | 'disbursement_voucher'
  | 'rfq'
  | 'purchase_order'

/**
 * Customer- and tax-facing documents issue from Exelmed (the entity that holds
 * the VAT registration); supplier-facing ones from Vincare, which is how
 * Purchasing's PO has always printed.
 */
const DEFAULTS: Record<PrintedDocumentKind, CompanyKey> = {
  pos_receipt: 'exelmed',
  ethical_invoice: 'exelmed',
  delivery_receipt: 'exelmed',
  statement_of_account: 'exelmed',
  disbursement_voucher: 'exelmed',
  rfq: 'vincare',
  purchase_order: 'vincare',
}

export function defaultCompanyFor(kind: PrintedDocumentKind): CompanyKey {
  return DEFAULTS[kind]
}

export function companyFor(key: CompanyKey): CompanyProfile {
  return companyProfiles[key] ?? companyProfiles.exelmed
}

/**
 * Structured contact details for the public site. The letterhead `contact`
 * strings above are formatted for print ("Mobile: ... - Email Address: ...");
 * these are the same values split so the web page can lay them out and make
 * them tappable.
 */
export const groupContact = {
  address: 'Ground Floor NB Building, Ochoa Avenue, Butuan City',
  region: '8600 Agusan del Norte, Philippines',
  landline: '085-3000-460',
  mobileRetail: '09090734525',
  mobileSupply: '0968-879-5589',
  email: 'exelmedshop@gmail.com',
} as const
