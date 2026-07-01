// ============================================================
// sample-accounting — domain types (sample-client-registry change)
// Spec: S2.4, S2.5, S2.18
// ============================================================

// --- Product Catalog ---
export interface ProductCatalog {
  id: string
  canonical_name: string
  unit: string | null
  category: string | null
  created_at: string
  updated_at: string
}

export type ProductCatalogInsert = Omit<ProductCatalog, 'id' | 'created_at' | 'updated_at'>
export type ProductCatalogUpdate = Partial<ProductCatalogInsert>

// --- Invoice Item (extended with catalog mapping) ---
export interface InvoiceItemWithCatalog {
  id: string
  invoice_id: string
  supplier_id: string
  line_number: number
  description: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  net_amount: number
  vat_rate: number | null
  vat_amount: number | null
  gross_amount: number
  product_catalog_id: string | null
  created_at: string
  // joined
  product_catalog?: ProductCatalog | null
}

// Ítems sin mapear — base para el dashboard de normalización
export type UnmappedInvoiceItem = Omit<InvoiceItemWithCatalog, 'product_catalog'> & {
  product_catalog_id: null
  occurrence_count?: number  // cuántas veces aparece esta description
}

// --- Client Status ---
export const CLIENT_STATUS = {
  draft: 'draft',
  pending_compliance: 'pending_compliance',
  active: 'active',
  suspended: 'suspended',
  dissolved: 'dissolved',
} as const
export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS]

// --- Client Legal Form ---
export const CLIENT_LEGAL_FORM = {
  LDA: 'LDA',
  SA: 'SA',
  ENI: 'ENI',
  UNIPESSOAL: 'UNIPESSOAL',
  OUTRO: 'OUTRO',
} as const
export type ClientLegalForm = (typeof CLIENT_LEGAL_FORM)[keyof typeof CLIENT_LEGAL_FORM]

// --- Shareholder ---
export interface ShareholderEntry {
  name: string
  nif: string
  pct: number
}

// --- SampleClient (full row) ---
export interface SampleClient {
  id: string
  legal_name: string
  nif: string
  legal_form: ClientLegalForm
  status: ClientStatus
  drive_folder_id: string | null
  allows_manual_upload: boolean
  created_by: string
  created_at: string
  updated_at: string
  // Level 2
  account_manager: string | null
  incorporation_date: string | null
  registration_number: string | null
  // Level 3
  trade_name: string | null
  capital_social: number | null
  shareholders: ShareholderEntry[] | null
  notes: string | null
  email: string | null
  phone: string | null
}
