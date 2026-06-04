'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar() {
  const path = usePathname()

  return (
    <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', height: 52, gap: 4 }}>
        <img src="/favicon.svg" width={26} height={26} alt="A.Bert" style={{ borderRadius: 6, marginRight: 12 }} />
        {[
          { href: '/', label: 'Dashboard' },
          { href: '/pedidos', label: 'Pedidos' },
          { href: '/acabados', label: 'Acabados' },
          { href: '/clientes', label: 'Clientes' },
          { href: '/cobros',   label: 'Cobros 💰' },
        ].map(({ href, label }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link key={href} href={href} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              color: active ? 'var(--text)' : 'var(--text2)',
              textDecoration: 'none',
              background: active ? 'var(--surface2)' : 'transparent',
              transition: 'all 0.15s',
            }}>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
