-- Migration: add 'validated' value to invoice_processing_status enum
-- Applied: 2026-05-20
-- Reason: sample-accounting-ai Python service uses 'validated' as output status
--         after successful LangGraph pipeline execution.

ALTER TYPE facturas.invoice_processing_status ADD VALUE IF NOT EXISTS 'validated';
