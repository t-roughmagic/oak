import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactElement, ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Oak SSR Hydration',
  description: 'Next.js demo for server-seeded Oak state with no init flicker.',
}

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
          }}
        >
          <header
            style={{
              padding: '1.5rem 1.5rem 0',
            }}
          >
            <div
              style={{
                maxWidth: '72rem',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1.25rem 1.4rem',
                border: '1px solid var(--line)',
                borderRadius: '1rem',
                background: 'rgba(255,255,255,0.56)',
                backdropFilter: 'blur(18px)',
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'grid', gap: '0.2rem' }}>
                <strong style={{ fontSize: '1rem', letterSpacing: '0.02em' }}>
                  Oak SSR Hydration
                </strong>
                <span style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
                  Server-seeded state, client-first paint.
                </span>
              </div>
              <nav style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link
                  href="/alpha"
                  style={{
                    padding: '0.55rem 0.85rem',
                    borderRadius: '999px',
                    border: '1px solid var(--line)',
                    background: 'var(--panel-strong)',
                  }}
                >
                  Alpha
                </Link>
                <Link
                  href="/beta"
                  style={{
                    padding: '0.55rem 0.85rem',
                    borderRadius: '999px',
                    border: '1px solid var(--line)',
                    background: 'var(--panel-strong)',
                  }}
                >
                  Beta
                </Link>
              </nav>
            </div>
          </header>
          <main style={{ padding: '1.5rem' }}>{children}</main>
        </div>
      </body>
    </html>
  )
}
