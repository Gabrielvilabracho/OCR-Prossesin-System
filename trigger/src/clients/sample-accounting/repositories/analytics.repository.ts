import { getClient } from "../supabase-client";

// Aging report row returned by v_aging_report
export interface AgingReportRow {
  bucket:           string;
  invoice_count:    number;
  total_amount_due: number;
}

// Cash flow row returned by v_cash_flow
export interface CashFlowRow {
  month:          string; // ISO date string (first day of month)
  invoice_count:  number;
  total_outflow:  number;
}

/**
 * getAgingReport — returns all rows from v_aging_report.
 * Buckets: current (0-30d), overdue-30 (31-60d), overdue-60 (61-90d), overdue-90 (90+d).
 */
export async function getAgingReport(): Promise<AgingReportRow[]> {
  const db = getClient();

  const { data, error } = await db
    .from("v_aging_report")
    .select("bucket, invoice_count, total_amount_due");

  if (error) {
    throw new Error(`Failed to fetch aging report: ${error.message}`);
  }

  return (data as AgingReportRow[]) ?? [];
}

/**
 * getCashFlow — returns all rows from v_cash_flow ordered by month desc.
 */
export async function getCashFlow(): Promise<CashFlowRow[]> {
  const db = getClient();

  const { data, error } = await db
    .from("v_cash_flow")
    .select("month, invoice_count, total_outflow");

  if (error) {
    throw new Error(`Failed to fetch cash flow: ${error.message}`);
  }

  return (data as CashFlowRow[]) ?? [];
}

/**
 * getSupplierResolutionCount — returns the number of 'auto' resolution log entries
 * for a given resolved_supplier_id. Used to determine if this is a first-time supplier.
 *
 * A count of 0 or 1 means "first time" — the current invocation is the first
 * successful resolution for this supplier.
 *
 * @param supplierId - UUID of the resolved supplier
 * @returns count of prior auto-resolved log entries for this supplier
 */
export async function getSupplierResolutionCount(supplierId: string): Promise<number> {
  const db = getClient();

  const { count, error } = await db
    .from("supplier_resolution_log")
    .select("*", { count: "exact", head: true })
    .eq("resolved_supplier_id", supplierId)
    .eq("created_by", "auto");

  if (error) {
    throw new Error(`Failed to count supplier resolutions: ${error.message}`);
  }

  return count ?? 0;
}
