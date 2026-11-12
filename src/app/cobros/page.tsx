'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type Cobro = { id: string; cliente_id: string | null; monto: number; fecha: string; notas: string | null }
type Linea = { metros_solicitados: number; metros_entregados: number | null; precio: number; tipo: string; unidades: number | null; precio_unitario: number | null }
type Pedido = { id: string; folio: string; estado: string; fecha_entregado: string | null; cliente_id: string; lineas_pedido: Linea[] }
type Cliente = { id: string; nombre: string; dias_credito: number | null }

function valorPedido(p: Pedido) {
  const entregado = p.estado === 'Entregado'
  return (p.lineas_pedido ?? []).reduce((s, l) => {
    if (l.tipo === 'producto') return s + ((l.unidades ?? 0) * (l.precio_unitario ?? 0))
    const metros = entregado && l.metros_entregados != null ? l.metros_entregados : l.metros_solicitados
    return s + (metros * (l.precio ?? 0))
  }, 0)
}

export default function CobrosPage() {
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [pedidos, setPedidos]     = useState<Pedido[]>([])
  const [cobros, setCobros]       = useState<Cobro[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtro, setFiltro]       = useState<'pendiente'|'todos'|'cobrado'>('pendiente')
  const [addingTo, setAddingTo]   = useState<Cliente | null>(null)
  const [monto, setMonto]         = useState('')
  const [fecha, setFecha]         = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})

  const IVA = 0.16
  const iva = (v: number) => v * (1 + IVA)
  function compact(v: number) {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000)     return `$${Math.round(v / 1000)}K`
    return `$${Math.round(v)}`
  }

  async function load() {
    const [{ data: cData }, { data: pData }, { data: coData }] = await Promise.all([
      supabase.from('clientes').select('id,nombre,dias_credito').order('nombre'),
      supabase.from('pedidos')
        .select('id,folio,estado,fecha_entregado,cliente_id,lineas_pedido(metros_solicitados,metros_entregados,precio,tipo,unidades,precio_unitario)'),
      supabase.from('cobros').select('id,cliente_id,monto,fecha,notas').order('fecha', { ascending: false }),
    ])
    setClientes((cData ?? []) as Cliente[])
    setPedidos((pData as unknown as Pedido[]) ?? [])
    setCobros((coData ?? []) as Cobro[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function registrarCobro(e: React.FormEvent) {
    e.preventDefault()
    if (!addingTo || !monto) return
    setSaving(true)
    const { error } = await supabase.from('cobros').insert({
      cliente_id: addingTo.id,
      pedido_id: null,
      monto: parseFloat(monto),
      fecha,
      notas: notas || null,
    })
    setSaving(false)
    if (error) { alert('Error al guardar: ' + error.message); return }
    setAddingTo(null); setMonto(''); setNotas('')
    load()
  }

  async function borrarCobro(cobroId: string) {
    if (!confirm('¿Eliminar este cobro?')) return
    await supabase.from('cobros').delete().eq('id', cobroId)
    load()
  }

  // Facturado: solo pedidos entregados o con fecha_entregado
  const facturadoMap: Record<string, number> = {}
  pedidos
    .filter(p => p.estado === 'Entregado' || p.fecha_entregado)
    .forEach(p => {
      if (!facturadoMap[p.cliente_id]) facturadoMap[p.cliente_id] = 0
      facturadoMap[p.cliente_id] += valorPedido(p)
    })

  // Cobrado: suma de cobros por cliente
  const cobradoMap: Record<string, number> = {}
  cobros.forEach(c => {
    if (!c.cliente_id) return
    cobradoMap[c.cliente_id] = (cobradoMap[c.cliente_id] ?? 0) + c.monto
  })

  const totalFacturado = Object.values(facturadoMap).reduce((s, v) => s + v, 0)
  const totalCobrado   = cobros.reduce((s, c) => s + c.monto, 0)
  const totalDeuda     = iva(totalFacturado) - totalCobrado

  const clientesFiltrados = clientes.filter(c => {
    const facturado = facturadoMap[c.id] ?? 0
    if (facturado === 0) return false
    const cobradoC  = cobradoMap[c.id] ?? 0
    const deuda     = iva(facturado) - cobradoC
    if (filtro === 'pendiente') return deuda > 1
    if (filtro === 'cobrado')   return deuda <= 1
    return true
  })

  // Gráfica: últimos 12 meses
  const hoy = new Date()
  const mesesHistorico = Array.from({ length: 12 }, (_, i) => {
    const mes    = subMonths(hoy, 11 - i)
    const inicio = startOfMonth(mes)
    const fin    = endOfMonth(mes)
    const total  = cobros
      .filter(c => { const f = new Date(c.fecha); return f >= inicio && f <= fin })
      .reduce((s, c) => s + c.monto, 0)
    return { mes: format(mes, 'MMM yy', { locale: es }), total, esActual: i === 11 }
  })
  const cobradoEsteMes      = mesesHistorico[11].total
  const cobradoMesAnterior  = mesesHistorico[10].total
  const variacion = cobradoMesAnterior > 0
    ? ((cobradoEsteMes - cobradoMesAnterior) / cobradoMesAnterior) * 100
    : null

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Cobros</h1>
        <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:99, padding:'4px 10px' }}>IVA 16% incluido</span>
      </div>

      {/* Gráfica mensual */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 16px 10px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              {format(hoy, 'MMMM yyyy', { locale: es })}
            </div>
            <div style={{ fontSize:28, fontWeight:700, color:'var(--accent)', lineHeight:1 }}>{compact(cobradoEsteMes)}</div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>cobrado este mes</div>
          </div>
          {variacion !== null && (
            <div style={{
              fontSize:13, fontWeight:700, padding:'4px 10px', borderRadius:8,
              background: variacion >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: variacion >= 0 ? 'var(--accent)' : 'var(--red)',
            }}>
              {variacion >= 0 ? '▲' : '▼'} {Math.abs(Math.round(variacion))}% vs mes anterior
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={mesesHistorico} barSize={18} margin={{ top:4, right:0, left:0, bottom:0 }}>
            <XAxis dataKey="mes" tick={{ fontSize:10, fill:'var(--text3)' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              formatter={(v: unknown) => [compact(Number(v ?? 0)), 'Cobrado']}
              contentStyle={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}
              cursor={{ fill:'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="total" radius={[4,4,0,0]}>
              {mesesHistorico.map((m, i) => <Cell key={i} fill={m.esActual ? 'var(--accent)' : 'var(--border2)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Facturado', val: iva(totalFacturado), sub: `s/IVA ${compact(totalFacturado)}`, color:'var(--text)'   },
          { label:'Cobrado',   val: totalCobrado,        sub: '',                                  color:'var(--accent)' },
          { label:'Debe',      val: totalDeuda,          sub: '',                                  color: totalDeuda > 0 ? 'var(--red)' : 'var(--accent)' },
        ].map(({ label, val, sub, color }) => (
          <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 12px' }}>
            <div style={{ fontSize:18, fontWeight:700, color }}>{compact(val)}</div>
            {sub && <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>{sub}</div>}
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
            {v==='pendiente' ? 'Pendiente' : v==='cobrado' ? 'Cobrado' : 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>Cargando...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)' }}>
          {filtro==='pendiente' ? 'Sin deuda pendiente 🎉' : 'Sin resultados'}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {clientesFiltrados.map(c => {
            const facturado = facturadoMap[c.id] ?? 0
            const cobradoC  = cobradoMap[c.id] ?? 0
            const deuda     = iva(facturado) - cobradoC
            const pct       = facturado > 0 ? Math.min(cobradoC / iva(facturado) * 100, 100) : 0
            const cobrosCli = cobros.filter(cb => cb.cliente_id === c.id)
            const abierto   = expandido[c.id]

            return (
              <div key={c.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                {/* Fila principal */}
                <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
                    <button onClick={() => setExpandido(e => ({ ...e, [c.id]: !e[c.id] }))}
                      style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:0, lineHeight:1, flexShrink:0 }}>
                      {abierto ? '▾' : '▸'}
                    </button>
                    <Link href={`/clientes/${c.id}`} style={{ fontWeight:700, fontSize:15, color:'var(--text)', textDecoration:'none' }}>
                      {c.nombre}
                    </Link>
                    {cobrosCli.length > 0 && (
                      <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:99, padding:'1px 7px', flexShrink:0 }}>
                        {cobrosCli.length} pago{cobrosCli.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <div style={{ textAlign:'right' }}>
                      {deuda > 1 ? (
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--red)' }}>
                          Debe ${Math.round(deuda).toLocaleString()}
                        </div>
                      ) : (
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>✓ Al corriente</div>
                      )}
                      <div style={{ fontSize:11, color:'var(--text3)' }}>
                        Cobrado ${Math.round(cobradoC).toLocaleString()} / ${Math.round(iva(facturado)).toLocaleString()} c/IVA
                      </div>
                    </div>
                    <button onClick={() => { setAddingTo(c); setMonto(''); setFecha(new Date().toISOString().split('T')[0]); setNotas('') }}
                      style={{ background:'var(--accent)', border:'none', color:'#0c0c0c', borderRadius:6, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                      + Cobro
                    </button>
                  </div>
                </div>

                {/* Barra de progreso */}
                {facturado > 0 && (
                  <div style={{ height:3, background:'var(--surface2)' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background: pct>=100?'var(--accent)':'var(--yellow)', transition:'width 0.3s' }} />
                  </div>
                )}

                {/* Detalle expandido: pedidos + pagos */}
                {abierto && (() => {
                  const pedidosCli = pedidos
                    .filter(p => p.cliente_id === c.id && (p.estado === 'Entregado' || p.fecha_entregado))
                    .sort((a, b) => (b.fecha_entregado ?? '').localeCompare(a.fecha_entregado ?? ''))
                  return (
                    <div style={{ borderTop:'1px solid var(--border)' }}>
                      {/* Pedidos */}
                      {pedidosCli.length > 0 && (
                        <div style={{ padding:'10px 16px 6px' }}>
                          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Pedidos facturados</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {pedidosCli.map(p => {
                              const val = valorPedido(p)
                              return (
                                <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13, padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                                  <span style={{ fontWeight:600, color:'var(--text)' }}>{p.folio}</span>
                                  <span style={{ color:'var(--text3)', fontSize:12 }}>
                                    {p.fecha_entregado ? format(new Date(p.fecha_entregado), 'dd MMM yy', { locale: es }) : '—'}
                                  </span>
                                  <span style={{ fontWeight:700, color:'var(--text)' }}>${Math.round(iva(val)).toLocaleString()} <span style={{ fontWeight:400, fontSize:11, color:'var(--text3)' }}>c/IVA</span></span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {/* Pagos registrados */}
                      <div style={{ padding:'8px 16px 12px' }}>
                        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Pagos registrados</div>
                        {cobrosCli.length === 0 ? (
                          <span style={{ fontSize:13, color:'var(--text3)' }}>Sin pagos registrados</span>
                        ) : (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                            {cobrosCli.map(cb => (
                              <span key={cb.id} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:12 }}>
                                <span style={{ color:'var(--accent)', fontWeight:700 }}>${cb.monto.toLocaleString()}</span>
                                <span style={{ color:'var(--text3)' }}>{format(new Date(cb.fecha), 'dd MMM yy', { locale: es })}</span>
                                {cb.notas && <span style={{ color:'var(--text3)' }}>· {cb.notas}</span>}
                                <button onClick={() => borrarCobro(cb.id)}
                                  style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}
                                  onMouseEnter={e=>(e.currentTarget.style.color='var(--red)')}
                                  onMouseLeave={e=>(e.currentTarget.style.color='var(--text3)')}
                                >✕</button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal registrar cobro */}
      {addingTo && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setAddingTo(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:'16px 16px 0 0', padding:24, width:'100%', maxWidth:480, boxShadow:'0 -8px 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'var(--border2)', borderRadius:99, margin:'0 auto 20px' }} />
            <h2 style={{ fontSize:16, fontWeight:700, margin:'0 0 4px' }}>Registrar cobro</h2>
            <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 18px' }}>
              {addingTo.nombre}
              {(() => {
                const facturado = facturadoMap[addingTo.id] ?? 0
                const cobradoC  = cobradoMap[addingTo.id] ?? 0
                const deuda     = iva(facturado) - cobradoC
                return deuda > 0 ? ` · Saldo $${Math.round(deuda).toLocaleString()}` : ''
              })()}
            </p>
            <form onSubmit={registrarCobro} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label className="label">Monto cobrado</label>
                <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
                  className="input" autoFocus min="0" step="any" required placeholder="$0" />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">Notas <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional)</span></label>
                <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className="input" placeholder="Transferencia, cheque..." />
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button type="submit" disabled={saving} className="btn-primary" style={{ flex:1, padding:'13px 0', fontSize:15 }}>
                  {saving ? 'Guardando...' : 'Registrar cobro'}
                </button>
                <button type="button" onClick={() => setAddingTo(null)} className="btn-ghost" style={{ padding:'13px 16px' }}>✕</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
