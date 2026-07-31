export async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({length: values.length})
  let cursor = 0

  async function worker(): Promise<void> {
    if (cursor >= values.length) return
    const index = cursor
    cursor += 1
    results[index] = await mapper(values[index])
    return worker()
  }

  const workerCount = Math.min(Math.max(concurrency, 1), values.length)
  await Promise.all(Array.from({length: workerCount}, async () => worker()))
  return results
}
