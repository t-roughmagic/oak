'use client'

import { Layer } from 'effect'
import { useState, type ReactElement } from 'react'
import { useScopedRuntime } from '@oak/effect-runtime-react-provider'
import { OakEffectViewProvider } from '@oak/platform-effect-react'
import { DeskView } from './desk-view'
import type { DeskSeed } from '@/lib/server-seed'
import { DeskApiLive, makeDeskProgram } from '@/oak-program/index'

export function OakDeskClient({ seed }: { readonly seed: DeskSeed }): ReactElement {
  const [program] = useState(() => makeDeskProgram(seed.initialModel))
  const [layer] = useState(() => program.layer.pipe(Layer.provideMerge(DeskApiLive)))
  const runtime = useScopedRuntime(layer)

  return (
    <OakEffectViewProvider runtime={runtime} program={program}>
      <DeskView seed={seed} />
    </OakEffectViewProvider>
  )
}
