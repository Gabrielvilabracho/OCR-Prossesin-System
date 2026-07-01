export const PdfValidationErrorKind = {
  invalid_magic_bytes: 'invalid_magic_bytes',
  file_too_large: 'file_too_large',
  invalid_mime: 'invalid_mime',
} as const

export type PdfValidationErrorKind = typeof PdfValidationErrorKind[keyof typeof PdfValidationErrorKind]

export class PdfValidationError extends Error {
  readonly kind: PdfValidationErrorKind
  constructor(kind: PdfValidationErrorKind, message: string) {
    super(message)
    this.name = 'PdfValidationError'
    this.kind = kind
  }
}

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] // %PDF

export function validatePdfInput(
  bytes: Uint8Array,
  mimeType?: string,
  _fileName?: string
): void {
  if (bytes.length > MAX_PDF_SIZE_BYTES) {
    throw new PdfValidationError('file_too_large', `PDF exceeds 50MB limit (${bytes.length} bytes)`)
  }
  const hasMagic = bytes.length >= 4 &&
    bytes[0] === PDF_MAGIC[0] &&
    bytes[1] === PDF_MAGIC[1] &&
    bytes[2] === PDF_MAGIC[2] &&
    bytes[3] === PDF_MAGIC[3]
  if (!hasMagic) {
    throw new PdfValidationError('invalid_magic_bytes', 'File does not start with %PDF magic bytes')
  }
  if (mimeType !== undefined && mimeType !== 'application/pdf') {
    throw new PdfValidationError('invalid_mime', `Invalid MIME type: ${mimeType}`)
  }
}
