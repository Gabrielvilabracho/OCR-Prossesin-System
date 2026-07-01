import { describe, it, expect } from 'vitest'
import { validatePdfInput, PdfValidationError } from '../input-validator'

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]) // %PDF-

describe('validatePdfInput', () => {
  it('accepts valid PDF bytes', () => {
    const valid = new Uint8Array([...PDF_MAGIC, ...new Uint8Array(10)])
    expect(() => validatePdfInput(valid)).not.toThrow()
  })
  it('rejects bytes without PDF magic', () => {
    const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
    expect(() => validatePdfInput(invalid)).toThrow(PdfValidationError)
    try { validatePdfInput(invalid) } catch(e) {
      expect((e as PdfValidationError).kind).toBe('invalid_magic_bytes')
    }
  })
  it('rejects file over 50MB', () => {
    const big = new Uint8Array(51 * 1024 * 1024)
    big[0] = 0x25; big[1] = 0x50; big[2] = 0x44; big[3] = 0x46
    expect(() => validatePdfInput(big)).toThrow(PdfValidationError)
    try { validatePdfInput(big) } catch(e) {
      expect((e as PdfValidationError).kind).toBe('file_too_large')
    }
  })
  it('rejects wrong MIME type', () => {
    const valid = new Uint8Array([...PDF_MAGIC, ...new Uint8Array(10)])
    expect(() => validatePdfInput(valid, 'image/png')).toThrow(PdfValidationError)
    try { validatePdfInput(valid, 'image/png') } catch(e) {
      expect((e as PdfValidationError).kind).toBe('invalid_mime')
    }
  })
  it('accepts correct MIME type', () => {
    const valid = new Uint8Array([...PDF_MAGIC, ...new Uint8Array(10)])
    expect(() => validatePdfInput(valid, 'application/pdf')).not.toThrow()
  })
  it('skips MIME check if mimeType is undefined', () => {
    const valid = new Uint8Array([...PDF_MAGIC, ...new Uint8Array(10)])
    expect(() => validatePdfInput(valid, undefined)).not.toThrow()
  })
})
