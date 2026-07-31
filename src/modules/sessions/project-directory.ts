export function projectDirectoryName(path: string): string {
  return path.replaceAll(':', '-').replaceAll(/[/\\\s]+/g, '-')
}
