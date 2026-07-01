import { describe, it, expect } from 'vitest'
import { maskNif, maskAmount } from '../pii-mask'

describe('maskNif', () => {
  it('masks middle digits of standard 9-digit NIF', () => {
    expect(maskNif('516315242')).toBe('516****42')
  })
  it('masks 9-digit NIF starting with different digit', () => {
    expect(maskNif('123456789')).toBe('123****89')
  })
  it('returns *** for empty string', () => {
    expect(maskNif('')).toBe('***')
  })
  it('returns *** for NIF shorter than 5 chars', () => {
    expect(maskNif('123')).toBe('***')
  })
  it('handles NIF with exactly 5 chars', () => {
    expect(maskNif('12345')).toBe('12****45'.slice(0,8)) // edge: mask middle
  })
})

describe('maskAmount', () => {
  it('masks positive amount', () => {
    expect(maskAmount(1234.56)).toBe('***.**')
  })
  it('masks zero', () => {
    expect(maskAmount(0)).toBe('***.**')
  })
  it('masks negative amount', () => {
    expect(maskAmount(-99.99)).toBe('***.**')
  })
  it('masks large amount', () => {
    expect(maskAmount(999999.99)).toBe('***.**')
  })
  it('masks decimal amount', () => {
    expect(maskAmount(0.01)).toBe('***.**')
  })
})
