'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Cliente = { id: string; nombre: string; pedidos: { id: string }[] }

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const { data } = await supabase.from('clientes').select('id,nombre,pedidos(id)').order('nombre')
    setClientes((data as unknown as Cliente[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    setAdding(true)
    await supabase.from('clientes').insert({ nombre: nuevoNombre.trim() })
    setNuevoNombre('')
    setAdding(false)
    load()
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Clientes</h1>

      <form onSubmit={agregar} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input type="text" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
          placeholder="Nombre del cliente..." className="input" style={{ flex: 1 }} />
        <button type="submit" disabled={adding} className="btn-primary">+ Agregar</button>
      </form>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Cargando...</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {clientes.map((c, i) => (
            <Link key={c.id} href={`/clientes/${c.id}`} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', textDecoration: 'none',
              borderBottom: i < clientes.length - 1 ? '1px solid var(--border)' : 'none',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.nombre}</span>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{c.pedidos.length} pedido{c.pedidos.length !== 1 ? 's' : ''}</span>
            </Link>
          ))}
          {clientes.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Sin clientes</div>
          )}
        </div>
      )}
    </div>
  )
}
