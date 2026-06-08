'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Cobro = { id: string; pedido_id: string; monto: number; fecha: string; notas: string | null }
type Linea = { metros_solicitados: number; metros_entregados: number | null; precio: number; tipo: string; unidades: number | null; precio_unitario: number | null }
type Pedido = {
  id: string; folio: string; estado: string; fecha_entregado: string | null
  clientes: { id: string; nombre: string } | null
  lineas_pedido: Linea[]
  cobros: Cobro[]
}

/** Usa metros_entregados si ya están registrados; si no, usa metros_solicitados como estimado */
function metrosBase(l: Linea) {
  return l.metros_entregados != null ? l.metros_entregados : l.metros_solicitados
}
function valorPedido(p: Pedido) {
  return (p.lineas_pedido ?? []).reduce((s, l) => {
    if (l.tipo === 'producto') return s + ((l.unidades ?? 0) * (l.precio_unitario ?? 0))
    return s + (metrosBase(l) * (l.precio ?? 0))
  }, 0)
}
/** True si el valor está basado en metros reales entregados (no estimado) */
function valorEsFinal(p: Pedido) {
  return (p.lineas_pedido ?? []).some(l => l.tipo !== 'producto' && l.metros_entregados != null)
}
function cobrado(p: Pedido) { return (p.cobros ?? []).reduce((s, c) => s + c.monto, 0) }

export default function CobrosPage() {
  const [pedidos, setPedidos]     = useState<Pedido[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtro, setFiltro]       = useState<'pendiente'|'todos'|'cobrado'>('pendiente')
  const [addingTo, setAddingTo]   = useState<Pedido | null>(null)
  const [monto, setMonto]         = useState('')
  const [fecha, setFecha]         = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas]         = useState('')
  const [saving, setSaving]       = useState(false)

  async function load() {
    const [{ data: pData }, { data: cData }] = await Promise.all([
      supabase.from('pedidos')
        .select('id,folio,estado,fecha_entregado,clientes(id,nombre),lineas_pedido(metros_solicitados,metros_entregados,precio,tipo,unidades,precio_unitario)')
        .order('fecha_entregado', { ascending: false, nullsFirst: false }),
      supabase.from('cobros').select('id,pedido_id,monto,fecha,notas'),
    ])
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
  const porCliente: Record<string, { nombre: string; clienteId: string; pedidos: Pedido[] }> = {}
  pedidos.forEach(p => {
    if (!(p.estado === 'Entregado' || p.fecha_entregado)) return
    const clienteId = p.clientes?.id ?? 'sin-cliente'
    const nombre    = p.clientes?.nombre ?? 'Sin cliente'
    if (!porCliente[clienteId]) porCliente[clienteId] = { nombre, clienteId, pedidos: [] }
    const val = valorPedido(p), cob = cobrado(p)
    if (filtro === 'pendiente' && cob >= val && val > 0) return
    if (filtro === 'cobrado'   && !(cob >= val && val > 0)) return
    porCliente[clienteId].pedidos.push(p)
  })

  const totalFacturado = pedidos.filter(p => p.estado==='Entregado'||p.fecha_entregado).reduce((s,p)=>s+valorPedido(p),0)
  const totalCobrado   = pedidos.reduce((s,p)=>s+cobrado(p),0)
  const totalDeuda     = totalFacturado - totalCobrado

  const clientes = Object.values(porCliente).filter(c => c.pedidos.length > 0)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Cobros</h1>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Facturado', value:`$${Math.round(totalFacturado/1000)}K`,   color:'var(--text)' },
          { label:'Cobrado',   value:`$${Math.round(totalCobrado/1000)}K`,     color:'var(--accent)' },
          { label:'Debe',      value:`$${Math.round(totalDeuda/1000)}K`,       color: totalDeuda>0?'var(--red)':'var(--accent)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 12px' }}>
            <div style={{ fontSize:20, fontWeight:700, color }}>{value}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {(['pendiente','todos','cobrado'] as const).map(v => (
          <button key={v} onClick={() => setFiltro(v)} style={{
            flex:1, padding:'9px 8px', fontSize:12, cursor:'pointer',
            border:'1px solid var(--border2)', borderRadius:6,
            background: filtro===v ? 'var(--accent)' : 'var(--surface)',
            color: filtro===v ? '#0c0c0c' : 'var(--text2)',
            fontWeight: filtro===v ? 600 : 400,
          }}>
            {v==='pendiente'?'Pendiente':v==='cobrado'?'Cobrado':'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>Cargando...</div>
      ) : clientes.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)' }}>
          {filtro==='pendiente' ? 'Sin deuda pendiente 🎉' : 'Sin resultados'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {clientes.map(({ nombre, clienteId, pedidos: cPedidos }) => {
            const totalC   = cPedidos.reduce((s,p)=>s+valorPedido(p),0)
            const cobradoC = cPedidos.reduce((s,p)=>s+cobrado(p),0)
            const deudaC   = totalC - cobradoC
            return (
              <div key={clienteId} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                {/* Header cliente */}
                <div style={{ padding:'12px 14px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                  <Link href={`/clientes/${clienteId}`} style={{ fontWeight:700, fontSize:15, color:'var(--text)', textDecoration:'none' }}>
                    {nombre}
                  </Link>
                  <div style={{ display:'flex', gap:12, fontSize:12, flexWrap:'wrap' }}>
                    <span style={{ color:'var(--text3)' }}>Total: <span style={{ color:'var(--text)', fontWeight:600 }}>${Math.round(totalC).toLocaleString()}</span></span>
                    <span style={{ color:'var(--text3)' }}>Cobrado: <span style={{ color:'var(--accent)', fontWeight:600 }}>${Math.round(cobradoC).toLocaleString()}</span></span>
                    {deudaC > 0 && <span style={{ color:'var(--red)', fontWeight:700 }}>Debe: ${Math.round(deudaC).toLocaleString()}</span>}
                    {deudaC <= 0 && totalC > 0 && <span style={{ color:'var(--accent)', fontWeight:700 }}>✓ Al corriente</span>}
                  </div>
                </div>

                {/* Pedidos como cards */}
                <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                  {cPedidos.map(p => {
                    const val    = valorPedido(p)
                    const esFin  = valorEsFinal(p)
                    const cob    = cobrado(p)
                    const saldo  = val - cob
                    const pct    = val > 0 ? Math.min(cob/val*100, 100) : 0
                    return (
                      <div key={p.id} style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                        {/* Fila principal */}
                        <div style={{ padding:'10px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flex:1 }}>
                            <Link href={`/pedidos/${p.id}`} style={{ fontWeight:700, color:'var(--accent)', textDecoration:'none', fontSize:14 }}>{p.folio}</Link>
                            {p.fecha_entregado && <span style={{ fontSize:11, color:'var(--text3)' }}>{format(new Date(p.fecha_entregado),'dd MMM yy',{locale:es})}</span>}
                            {/* Indicador estimado vs real */}
                            {!esFin && (
                              <span title="Basado en metros pedidos — registra metros entregados para valor final"
                                style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'#2a1f00', color:'var(--yellow)', border:'1px solid #4a3800', cursor:'default' }}>
                                estimado
                              </span>
                            )}
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            {val > 0 && (
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:13, fontWeight:700, color: saldo>0?'var(--red)':'var(--accent)' }}>
                                  {saldo>0 ? `Debe $${Math.round(saldo).toLocaleString()}` : '✓ Cobrado'}
                                </div>
                                <div style={{ fontSize:11, color:'var(--text3)' }}>
                                  de ${Math.round(val).toLocaleString()}
                                  {!esFin && <span style={{ color:'var(--yellow)', marginLeft:3 }}>~</span>}
                                </div>
                              </div>
                            )}
                            <button onClick={() => { setAddingTo(p); setMonto(saldo>0?String(Math.round(saldo)):''); setFecha(new Date().toISOString().split('T')[0]); setNotas('') }}
                              style={{ background:'var(--accent)', border:'none', color:'#0c0c0c', borderRadius:6, padding:'7px 12px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                              + Cobro
                            </button>
                          </div>
                        </div>

                        {/* Barra de progreso */}
                        {val > 0 && (
                          <div style={{ height:3, background:'var(--surface2)' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background: pct>=100?'var(--accent)':'var(--yellow)', transition:'width 0.3s' }} />
                          </div>
                        )}

                        {/* Cobros registrados */}
                        {p.cobros.length > 0 && (
                          <div style={{ padding:'8px 12px', borderTop:'1px solid var(--border)', display:'flex', flexWrap:'wrap', gap:6 }}>
                            {p.cobros.map(c => (
                              <span key={c.id} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', fontSize:12 }}>
                                <span style={{ color:'var(--accent)', fontWeight:600 }}>${c.monto.toLocaleString()}</span>
                                <span style={{ color:'var(--text3)' }}>{format(new Date(c.fecha),'dd/MM',{locale:es})}</span>
                                {c.notas && <span style={{ color:'var(--text3)' }}>· {c.notas}</span>}
                                <button onClick={() => borrarCobro(c.id)}
                                  style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}
                                  onMouseEnter={e=>(e.currentTarget.style.color='var(--red)')}
                                  onMouseLeave={e=>(e.currentTarget.style.color='var(--text3)')}
                                >✕</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal cobro */}
      {addingTo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:0 }}
          onClick={() => setAddingTo(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:'16px 16px 0 0', padding:24, width:'100%', maxWidth:480, boxShadow:'0 -8px 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            {/* Handle */}
            <div style={{ width:40, height:4, background:'var(--border2)', borderRadius:99, margin:'0 auto 20px' }} />
            <h2 style={{ fontSize:16, fontWeight:700, margin:'0 0 4px' }}>Registrar cobro</h2>
            <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 18px' }}>
              {addingTo.folio} · {addingTo.clientes?.nombre}
              {valorPedido(addingTo) > 0 && ` · Saldo: $${Math.round(valorPedido(addingTo)-cobrado(addingTo)).toLocaleString()}`}
            </p>
            <form onSubmit={registrarCobro} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label className="label">Monto cobrado</label>
                <input type="number" value={monto} onChange={e=>setMonto(e.target.value)}
                  className="input" autoFocus min="0" step="any" required placeholder="$0" />
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
                <button type="submit" disabled={saving} className="btn-primary" style={{ flex:1, padding:'13px 0', fontSize:15 }}>
                  {saving ? 'Guardando...' : 'Registrar cobro'}
                </button>
                <button type="button" onClick={()=>setAddingTo(null)} className="btn-ghost" style={{ padding:'13px 16px' }}>✕</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
