import { getClient } from "../supabase-client";
import type { ReasonCode } from "../intelligence/review-router";

// ---------------------------------------------------------------------------
// ReviewInsert — data shape for invoice_reviews table
// ---------------------------------------------------------------------------

export interface ReviewInsert {
  invoice_id: string;
  decision: "approved" | "rejected" | "edited";
  reason?: string;
  reviewed_by: string;
}

// ---------------------------------------------------------------------------
// ReviewQueueInsert — data shape for addToReviewQueue (TASK-3-6)
// ---------------------------------------------------------------------------

export interface ReviewQueueInsert {
  invoice_id: string;
  reason_code: ReasonCode;
  priority: 1 | 2 | 3;
  status?: "pending" | "in_review" | "resolved" | "auto_resolved";
}

// ---------------------------------------------------------------------------
// saveReview
// ---------------------------------------------------------------------------

export async function saveReview(data: ReviewInsert): Promise<void> {
  const db = getClient();

  const { error } = await db.from("invoice_reviews").insert(data);

  if (error) {
    throw new Error(`Failed to save review: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// addToReviewQueue — insert one review_queue row per reason (TASK-3-6)
// ---------------------------------------------------------------------------

/**
 * Inserts a review_queue row for the given invoice and reason.
 * Each (invoice_id, reason_code) pair is a separate row — multi-reason invoices
 * produce multiple rows. Status defaults to 'pending'.
 *
 * @param data - ReviewQueueInsert
 */
export async function addToReviewQueue(data: ReviewQueueInsert): Promise<string> {
  const db = getClient();

  const { data: row, error } = await db
    .from("review_queue")
    .insert({
      invoice_id:  data.invoice_id,
      reason_code: data.reason_code,
      priority:    data.priority,
      status:      data.status ?? "pending",
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? `Failed to add review_queue entry for invoice ${data.invoice_id}`);
  }

  return (row as { id: string }).id;
}
