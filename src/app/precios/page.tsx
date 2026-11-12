'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Fila = {
  cliente: string
  tela: string
  variante: string | null
  precio: number
  veces: number
}

export default function PreciosPage() {
  const [filas, setFilas]           = useState<Fila[]>([])
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [clienteFiltro, setClienteFiltro] = useState('Todos')

  useEffect(() => {
    supabase
      .from('lineas_pedido')
      .select('tela,variante,precio,pedidos(clientes(nombre))')
      .gt('precio', 0)
      .then(({ data }) => {
        // Agrupar por cliente+tela+variante, tomar el precio más reciente (último en el array)
        const map: Record<string, { precio: number; veces: number }> = {}
        ;(data ?? []).forEach((l: any) => {
          const cliente = l.pedidos?.clientes?.nombre ?? '—'
          const tela    = l.tela ?? ''
          const variante = l.variante ?? ''
          const key = `${cliente}|||${tela}|||${variante}`
          if (!map[key]) map[key] = { precio: l.precio, veces: 0 }
          map[key].precio = l.precio  // el último gana = más reciente
          map[key].veces += 1
        })
        const resultado: Fila[] = Object.entries(map).map(([key, v]) => {
          const [cliente, tela, variante] = key.split('|||')
          return { cliente, tela, variante: variante || null, precio: v.precio, veces: v.veces }
        })
        resultado.sort((a, b) => a.cliente.localeCompare(b.cliente) || a.tela.localeCompare(b.tela))
        setFilas(resultado)
        setLoading(false)
      })
  }, [])

  const clientes = ['Todos', ...Array.from(new Set(filas.map(f => f.cliente))).sort()]

  const filtradas = filas.filter(f => {
    const matchCliente = clienteFiltro === 'Todos' || f.cliente === clienteFiltro
    const q = busqueda.toLowerCase()
    const matchBusqueda = !q || f.tela.toLowerCase().includes(q) || (f.variante ?? '').toLowerCase().includes(q) || f.cliente.toLowerCase().includes(q)
    return matchCliente && matchBusqueda
  })

  // Agrupar por cliente para renderizado
  const porCliente: Record<string, Fila[]> = {}
  filtradas.forEach(f => {
    if (!porCliente[f.cliente]) porCliente[f.cliente] = []
    porCliente[f.cliente].push(f)
  })

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Lista de precios</h1>
          <p style={{ color: 'var(--text3)', margin: '2px 0 0', fontSize: 13 }}>
            Precios más recientes por cliente · {filas.length} combinaciones
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar tela, variante o cliente..."
          className="input" style={{ flex: 1, minWidth: 200 }}
        />
        <select value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)} className="input" style={{ minWidth: 160 }}>
          {clientes.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabla por cliente */}
      {Object.keys(porCliente).length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Sin resultados</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(porCliente).map(([cliente, lineas]) => (
            <div key={cliente} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Cliente header */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{cliente}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{lineas.length} artículo{lineas.length !== 1 ? 's' : ''}</span>
              </div>
              {/* Filas */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '7px 16px', color: 'var(--text3)', fontWeight: 500 }}>Tela</th>
                    <th style={{ textAlign: 'left', padding: '7px 8px', color: 'var(--text3)', fontWeight: 500 }}>Variante / Color</th>
                    <th style={{ textAlign: 'right', padding: '7px 16px', color: 'var(--text3)', fontWeight: 500 }}>Precio $/m</th>
                    <th style={{ textAlign: 'right', padding: '7px 16px', color: 'var(--text3)', fontWeight: 500 }}>Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((f, i) => (
                    <tr key={i} style={{ borderBottom: i < lineas.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '8px 16px', fontWeight: 600, color: 'var(--text)' }}>{f.tela}</td>
                      <td style={{ padding: '8px 8px', color: 'var(--text3)' }}>{f.variante ?? '—'}</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                        ${f.precio.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--text3)', fontSize: 12 }}>
                        {f.veces}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
