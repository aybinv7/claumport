export function renderTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  )
  const border = widths.map((width) => '─'.repeat(width)).join('─┼─')
  return [formatRow(headers, widths), border, ...rows.map((row) => formatRow(row, widths))]
}

export function truncate(value: string, width: number): string {
  if (value.length <= width) return value
  return `${value.slice(0, Math.max(0, width - 1))}…`
}

function formatRow(values: string[], widths: number[]): string {
  return values.map((value, index) => value.padEnd(widths[index])).join(' │ ')
}
