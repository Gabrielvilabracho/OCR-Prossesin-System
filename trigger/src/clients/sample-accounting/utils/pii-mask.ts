export function maskNif(nif: string): string {
  if (nif.length < 5) return '***'
  const prefixLen = nif.length <= 6 ? 2 : 3
  const first = nif.slice(0, prefixLen)
  const last = nif.slice(-2)
  return `${first}****${last}`
}

export function maskAmount(_amount: number): string {
  return '***.**'
}
