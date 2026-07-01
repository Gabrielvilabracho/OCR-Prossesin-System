import { z } from "zod";

export const ProcessInvoiceRequestSchema = z.object({
  storage_key: z.string().regex(/\.(pdf|jpg|jpeg|png|svg|xml)$/),
  client_id: z.string().uuid(),
  dry_run: z.boolean().optional().default(false),
  mime_type: z.string().nullable().optional(),
}).strict();

export const ProcessInvoiceResponseSchema = z.object({
  status: z.enum(["success", "failed", "dry_run", "processing"]),
  invoice_id: z.string().uuid().nullable().optional(),
  errors: z.array(z.string()).optional().default([]),
}).strict();

export type ProcessInvoiceRequest = z.infer<typeof ProcessInvoiceRequestSchema>;
export type ProcessInvoiceResponse = z.infer<typeof ProcessInvoiceResponseSchema>;
