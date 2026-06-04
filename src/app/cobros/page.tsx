'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Cobro = { id: string; monto: number; fecha: string; notas: string | null }
type LineaPedido = { metros_solicitados: number; precio: number; tipo: string; unidades: number | null; precio_unitario: number | null }
type Pedido = {
  id: string; folio: string; estado: string; fecha_entregado: string | null
  clientes: { id: string; nombre: string } | null
  lineas_pedido: LineaPedido[]
  cobros: Cobro[]
}

function valorPedido(p: Pedido) {
  return (p.lineas_pedido ?? []).reduce((s, l) => {
    if (l.tipo === 'producto') return s + ((l.unidades ?? 0) * (l.precio_unitario ?? 0))
    return s + (l.metros_solicitados * (l.precio ?? 0))
  }, 0)
}

function cobrado(p: Pedido) {
  return (p.cobros ?? []).reduce((s, c) => s + c.monto, 0)
}

export default function CobrosPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro]   = useState<'pendiente' | 'todos' | 'cobrado'>('pendiente')
  // New cobro modal
  const [addingTo, setAddingTo]   = useState<Pedido | null>(null)
  const [monto, setMonto]         = useState('')
  const [fecha, setFecha]         = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas]         = useState('')
  const [saving, setSaving]       = useState(false)

  async function load() {
    const [{ data: pData }, { data: cData }] = await Promise.all([
      supabase.from('pedidos')
        .select('id,folio,estado,fecha_entregado,clientes(id,nombre),lineas_pedido(metros_solicitados,precio,tipo,unidades,precio_unitario)')
        .order('fecha_entregado', { ascending: false, nullsFirst: false }),
      supabase.from('cobros').select('id,pedido_id,monto,fecha,notas'),
    ])
    // Merge cobros into pedidos
    const cobrosMap: Record<string, Cobro[]> = {}
    ;(cData ?? []).forEach((c: any) => {
      if (!cobrosMap[c.pedido_id]) cobrosMap[c.pedido_id] = []
      cobrosMap[c.pedido_id].push(c)
    })
    const merged = (pData as unknown as Pedido[])?.map(p => ({ ...p, cobros: cobrosMap[p.id] ?? [] })) ?? []
    setPedidos(merged)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function registrarCobro(e: React.FormEvent) {
    e.preventDefault()
    if (!addingTo || !monto) return
    setSaving(true)
    await supabase.from('cobros').insert({ pedido_id: addingTo.id, monto: parseFloat(monto), fecha, notas: notas || null })
    setAddingTo(null); setMonto(''); setNotas(''); setSaving(false)
    load()
  }

  async function borrarCobro(cobroId: string) {
    await supabase.from('cobros').delete().eq('id', cobroId)
    load()
  }

  // Group by client
  const porCliente: Record<string, { nombre: string; pedidos: Pedido[] }> = {}
  pedidos.forEach(p => {
    const clienteId = p.clientes?.id ?? 'sin-cliente'
    const nombre    = p.clientes?.nombre ?? 'Sin cliente'
    if (!porCliente[clienteId]) porCliente[clienteId] = { nombre, pedidos: [] }
    const val = valorPedido(p)
    const cob = cobrado(p)
    const isEntregado = p.estado === 'Entregado' || !!p.fecha_entregado
    // Solo mostrar pedidos entregados en todas las vistas
    if (!isEntregado) return
    if (filtro === 'pendiente' && cob >= val && val > 0) return  // excluir los ya cobrados completos
    if (filtro === 'cobrado'   && !(cob >= val && val > 0)) return
    porCliente[clienteId].pedidos.push(p)
  })

  // Stats
  const totalFacturado = pedidos.filter(p => p.estado === 'Entregado' || p.fecha_entregado).reduce((s, p) => s + valorPedido(p), 0)
  const totalCobrado   = pedidos.reduce((s, p) => s + cobrado(p), 0)
  const totalDeuda     = totalFacturado - totalCobrado

  const s: React.CSSProperties  = { padding:'8px 12px', textAlign:'left', fontSize:13, color:'var(--text)', borderBottom:'1px solid var(--border)' }
  const sh: React.CSSProperties = { ...s, fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', background:'var(--surface2)' }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Deuda por cliente</h1>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total facturado', value:`$${Math.round(totalFacturado).toLocaleString()}`, color:'var(--text)' },
          { label:'Total cobrado',   value:`$${Math.round(totalCobrado).toLocaleString()}`,   color:'var(--accent)' },
          { label:'Deuda pendiente', value:`$${Math.round(totalDeuda).toLocaleString()}`,     color: totalDeuda > 0 ? 'var(--red)' : 'var(--accent)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'16px 18px' }}>
            <div style={{ fontSize:24, fontWeight:700, color }}>{value}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div style={{ display:'flex', gap:4, marginBottom:16 }}>
        {(['pendiente','todos','cobrado'] as const).map(v => (
          <button key={v} onClick={() => setFiltro(v)} style={{
            padding:'7px 14px', fontSize:12, cursor:'pointer', border:'1px solid var(--border2)', borderRadius:6, textTransform:'capitalize',
            background: filtro===v ? 'var(--accent)' : 'var(--surface)',
            color: filtro===v ? '#0c0c0c' : 'var(--text2)',
            fontWeight: filtro===v ? 600 : 400,
          }}>
            {v === 'pendiente' ? 'Deuda pendiente' : v === 'cobrado' ? 'Cobrado' : 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>Cargando...</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {Object.entries(porCliente).filter(([,c]) => c.pedidos.length > 0).map(([clienteId, { nombre, pedidos: cPedidos }]) => {
            const totalCliente   = cPedidos.reduce((s, p) => s + valorPedido(p), 0)
            const cobradoCliente = cPedidos.reduce((s, p) => s + cobrado(p), 0)
            const deudaCliente   = totalCliente - cobradoCliente
            return (
              <div key={clienteId} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                {/* Cliente header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                  <Link href={`/clientes/${clienteId}`} style={{ fontWeight:700, fontSize:15, color:'var(--text)', textDecoration:'none' }}>
                    {nombre}
                  </Link>
                  <div style={{ display:'flex', gap:20, fontSize:13 }}>
                    <span style={{ color:'var(--text3)' }}>Facturado: <span style={{ color:'var(--text)', fontWeight:600 }}>${Math.round(totalCliente).toLocaleString()}</span></span>
                    <span style={{ color:'var(--text3)' }}>Cobrado: <span style={{ color:'var(--accent)', fontWeight:600 }}>${Math.round(cobradoCliente).toLocaleString()}</span></span>
                    <span style={{ color:'var(--text3)' }}>Debe: <span style={{ color: deudaCliente > 0 ? 'var(--red)' : 'var(--accent)', fontWeight:700, fontSize:14 }}>${Math.round(deudaCliente).toLocaleString()}</span></span>
                  </div>
                </div>

                {/* Pedidos del cliente */}
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={sh}>Folio</th>
                      <th style={sh}>Entregado</th>
                      <th style={{ ...sh, textAlign:'right' }}>Valor</th>
                      <th style={{ ...sh, textAlign:'right' }}>Cobrado</th>
                      <th style={{ ...sh, textAlign:'right' }}>Saldo</th>
                      <th style={sh}>Cobros</th>
                      <th style={sh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cPedidos.map(p => {
                      const val  = valorPedido(p)
                      const cob  = cobrado(p)
                      const saldo = val - cob
                      return (
                        <tr key={p.id}
                          onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
                          onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                        >
                          <td style={s}>
                            <Link href={`/pedidos/${p.id}`} style={{ color:'var(--accent)', textDecoration:'none', fontWeight:700 }}>{p.folio}</Link>
                          </td>
                          <td style={{ ...s, fontSize:12, color:'var(--text3)' }}>
                            {p.fecha_entregado ? format(new Date(p.fecha_entregado),'dd MMM yy',{locale:es}) : '—'}
                          </td>
                          <td style={{ ...s, textAlign:'right', fontWeight:600 }}>${Math.round(val).toLocaleString()}</td>
                          <td style={{ ...s, textAlign:'right', color:'var(--accent)' }}>${Math.round(cob).toLocaleString()}</td>
                          <td style={{ ...s, textAlign:'right', fontWeight:700, color: saldo > 0 ? 'var(--red)' : saldo < 0 ? 'var(--yellow)' : 'var(--text3)' }}>
                            {saldo === 0 ? '✓ Cobrado' : `$${Math.round(saldo).toLocaleString()}`}
                          </td>
                          <td style={{ ...s, fontSize:11, color:'var(--text3)' }}>
                            {p.cobros.length > 0 && (
                              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                {p.cobros.map(c => (
                                  <span key={c.id} style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px' }}>
                                    ${c.monto.toLocaleString()} · {format(new Date(c.fecha),'dd/MM',{locale:es})}
                                    <button onClick={() => borrarCobro(c.id)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:11, padding:0, lineHeight:1 }}
                                      onMouseEnter={e=>(e.currentTarget.style.color='var(--red)')}
                                      onMouseLeave={e=>(e.currentTarget.style.color='var(--text3)')}
                                    >✕</button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ ...s }}>
                            {saldo !== 0 && (
                              <button onClick={() => { setAddingTo(p); setMonto(saldo > 0 ? String(Math.round(saldo)) : ''); setFecha(new Date().toISOString().split('T')[0]); setNotas('') }}
                                style={{ fontSize:11, padding:'3px 8px', background:'var(--accent)', border:'none', color:'#0c0c0c', borderRadius:4, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                                + Cobro
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
          {Object.values(porCliente).filter(c => c.pedidos.length > 0).length === 0 && (
            <div style={{ textAlign:'center', padding:60, color:'var(--text3)', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)' }}>
              {filtro === 'pendiente' ? 'Sin deuda pendiente 🎉' : 'Sin resultados'}
            </div>
          )}
        </div>
      )}

      {/* Modal registrar cobro */}
      {addingTo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setAddingTo(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:12, padding:24, width:380, boxShadow:'0 24px 48px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:16, fontWeight:700, margin:'0 0 4px' }}>Registrar cobro</h2>
            <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 20px' }}>
              {addingTo.folio} · {addingTo.clientes?.nombre} · Saldo: ${Math.round(valorPedido(addingTo)-cobrado(addingTo)).toLocaleString()}
            </p>
            <form onSubmit={registrarCobro} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label className="label">Monto cobrado</label>
                <input type="number" value={monto} onChange={e=>setMonto(e.target.value)} className="input" autoFocus min="0" step="any" required placeholder="$0" />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">Notas <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional)</span></label>
                <input type="text" value={notas} onChange={e=>setNotas(e.target.value)} className="input" placeholder="Transferencia, cheque..." />
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button type="submit" disabled={saving} className="btn-primary" style={{ flex:1 }}>
                  {saving ? 'Guardando...' : 'Registrar cobro'}
                </button>
                <button type="button" onClick={() => setAddingTo(null)} className="btn-ghost" style={{ padding:'8px 16px' }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
