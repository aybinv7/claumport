export function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

export function formatTimestamp(value?: number): string {
  if (value === undefined) return 'unknown'
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString()
}

export function compactPath(value?: string): string {
  if (!value) return 'unknown path'
  return value.length > 58 ? `…${value.slice(-57)}` : value
}
