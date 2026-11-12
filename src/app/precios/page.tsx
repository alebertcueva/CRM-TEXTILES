'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Fila = {
  cliente: string
  tela: string
  variante: string | null
  precio: number
  veces: number
  fecha: string | null
}

function normVariante(v: string | null): string | null {
  if (!v) return null
  if (/^est/i.test(v.trim())) return 'Estampado'
  return v
}

export default function PreciosPage() {
  const [filas, setFilas]           = useState<Fila[]>([])
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [expandido, setExpandido]   = useState<Record<string, boolean>>({})

  useEffect(() => {
    supabase
      .from('lineas_pedido')
      .select('tela,variante,precio,pedidos(fecha_pedido,clientes(nombre))')
      .gt('precio', 0)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        // Agrupar por cliente+tela+variante — el último gana (más reciente)
        const map: Record<string, { precio: number; veces: number; fecha: string | null }> = {}
        ;(data ?? []).forEach((l: any) => {
          const cliente  = l.pedidos?.clientes?.nombre ?? '—'
          const tela     = l.tela ?? ''
          const variante = normVariante(l.variante) ?? ''
          const key = `${cliente}|||${tela}|||${variante}`
          if (!map[key]) map[key] = { precio: l.precio, veces: 0, fecha: null }
          map[key].precio = l.precio
          map[key].fecha  = l.pedidos?.fecha_pedido ?? null
          map[key].veces += 1
        })
        const resultado: Fila[] = Object.entries(map).map(([key, v]) => {
          const [cliente, tela, variante] = key.split('|||')
          return { cliente, tela, variante: variante || null, precio: v.precio, veces: v.veces, fecha: v.fecha }
        })
        resultado.sort((a, b) => a.cliente.localeCompare(b.cliente) || a.tela.localeCompare(b.tela))
        setFilas(resultado)
        setLoading(false)
      })
  }, [])

  const q = busqueda.toLowerCase().trim()

  const filtradas = filas.filter(f => {
    if (!q) return true
    return f.tela.toLowerCase().includes(q) || (f.variante ?? '').toLowerCase().includes(q) || f.cliente.toLowerCase().includes(q)
  })

  // Agrupar por cliente
  const porCliente: Record<string, Fila[]> = {}
  filtradas.forEach(f => {
    if (!porCliente[f.cliente]) porCliente[f.cliente] = []
    porCliente[f.cliente].push(f)
  })

  const clientesOrdenados = Object.keys(porCliente).sort()

  // Si hay búsqueda activa, expandir todos los que tengan resultados
  function estaExpandido(cliente: string) {
    if (q) return true
    return expandido[cliente] ?? false
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Lista de precios</h1>
          <p style={{ color: 'var(--text3)', margin: '2px 0 0', fontSize: 13 }}>
            Precio más reciente por cliente · {filas.length} combinaciones
          </p>
        </div>
      </div>

      <input
        value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar tela, variante o cliente..."
        className="input" style={{ width: '100%', marginBottom: 16 }}
      />

      {clientesOrdenados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Sin resultados</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clientesOrdenados.map(cliente => {
            const lineas  = porCliente[cliente]
            const abierto = estaExpandido(cliente)
            return (
              <div key={cliente} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Header cliente — clic para expandir */}
                <button
                  onClick={() => setExpandido(e => ({ ...e, [cliente]: !e[cliente] }))}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--text3)', fontSize: 13 }}>{abierto ? '▾' : '▸'}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{cliente}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {lineas.length} artículo{lineas.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Tabla — solo visible si expandido */}
                {abierto && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, borderTop: '1px solid var(--border)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '7px 16px', color: 'var(--text3)', fontWeight: 500 }}>Tela</th>
                        <th style={{ textAlign: 'left', padding: '7px 8px', color: 'var(--text3)', fontWeight: 500 }}>Variante / Color</th>
                        <th style={{ textAlign: 'right', padding: '7px 12px', color: 'var(--text3)', fontWeight: 500 }}>Precio $/m</th>
                        <th style={{ textAlign: 'right', padding: '7px 16px', color: 'var(--text3)', fontWeight: 500 }}>Última factura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((f, i) => (
                        <tr key={i} style={{ borderBottom: i < lineas.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '8px 16px', fontWeight: 600, color: 'var(--text)' }}>{f.tela}</td>
                          <td style={{ padding: '8px 8px', color: f.variante === 'Estampado' ? 'var(--yellow)' : 'var(--text3)' }}>
                            {f.variante ?? '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                            ${f.precio.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text3)', fontSize: 12 }}>
                            {f.fecha ? format(new Date(f.fecha), 'dd MMM yyyy', { locale: es }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
