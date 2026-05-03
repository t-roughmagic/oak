import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import { DemoPage } from '../demo-page'
import type { OakPageSeed } from '../page-client'

const seeds: Record<string, { seed: OakPageSeed; note: string }> = {
  alpha: {
    seed: { counter: { count: 11 } },
    note: 'Alpha is a simple server-seeded counter. It should hydrate directly to 11.',
  },
  beta: {
    seed: { counter: { count: 27 } },
    note: 'Beta is a second route with a different server seed, useful for visual remount checks.',
  },
}

/**
 * Server-side data loading returns only serializable props. The server does not
 * import `makeOak`, create a `ManagedRuntime`, or attempt to hydrate an Oak
 * store.
 */
async function loadPageData(page: string) {
  await Promise.resolve()
  return seeds[page]
}

export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly page: string }>
}): Promise<ReactElement> {
  const { page } = await params
  const data = await loadPageData(page)

  if (!data) {
    notFound()
  }

  return <DemoPage key={page} page={page} seed={data.seed} note={data.note} />
}
