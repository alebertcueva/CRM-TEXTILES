'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/',         label: 'Dashboard', short: 'Inicio'   },
  { href: '/pedidos',  label: 'Pedidos',   short: 'Pedidos'  },
  { href: '/clientes', label: 'Clientes',  short: 'Clientes' },
  { href: '/cobros',   label: 'Cobros 💰', short: 'Cobros'   },
]

export default function NavBar() {
  const path = usePathname()

  return (
    <>
      {/* ── Top nav (desktop) ── */}
      <nav className="top-nav">
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', height: 52, gap: 2 }}>
          <img src="/favicon.svg" width={26} height={26} alt="A.Bert" style={{ borderRadius: 6, marginRight: 14 }} />
          {LINKS.map(({ href, label }) => {
            const active = href === '/' ? path === '/' : path.startsWith(href)
            return (
              <Link key={href} href={href} style={{
                padding: '5px 13px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--text)' : 'var(--text2)',
                textDecoration: 'none',
                background: active ? 'var(--surface2)' : 'transparent',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
              }}>
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className="bottom-nav">
        {LINKS.map(({ href, short }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link key={href} href={href} className={`bottom-tab${active ? ' bottom-tab-active' : ''}`}>
              {short}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
