'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type Cobro = { id: string; pedido_id: string; monto: number; fecha: string; notas: string | null }
type Linea = { metros_solicitados: number; metros_entregados: number | null; precio: number; tipo: string; unidades: number | null; precio_unitario: number | null; tela: string; variante: string | null; descripcion_producto: string | null }
type Pedido = {
  id: string; folio: string; estado: string; fecha_entregado: string | null; fabrica: string
  clientes: { id: string; nombre: string; dias_credito: number | null } | null
  lineas_pedido: Linea[]
  cobros: Cobro[]
}

function valorPedido(p: Pedido) {
  const entregado = p.estado === 'Entregado'
  return (p.lineas_pedido ?? []).reduce((s, l) => {
    if (l.tipo === 'producto') return s + ((l.unidades ?? 0) * (l.precio_unitario ?? 0))
    // Entregado → metros reales; en curso → metros pedidos como proyección
    const metros = entregado && l.metros_entregados != null ? l.metros_entregados : l.metros_solicitados
    return s + (metros * (l.precio ?? 0))
  }, 0)
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
  const [todosCobros, setTodosCobros] = useState<{monto:number; fecha:string}[]>([])
  const [editingCredito, setEditingCredito] = useState<string | null>(null)
  const [creditoVal, setCreditoVal]         = useState('')

  async function guardarCredito(clienteId: string) {
    const dias = parseInt(creditoVal)
    if (!isNaN(dias) && dias > 0) {
      await supabase.from('clientes').update({ dias_credito: dias }).eq('id', clienteId)
      load()
    }
    setEditingCredito(null)
  }

  const IVA = 0.16
  const iva  = (v: number) => v * (1 + IVA)
  const fmt  = (v: number) => Math.round(iva(v)).toLocaleString()
  function compact(v: number) {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000)     return `$${Math.round(v / 1000)}K`
    return `$${Math.round(v)}`
  }

  async function load() {
    const [{ data: pData }, { data: cData }] = await Promise.all([
      supabase.from('pedidos')
        .select('id,folio,estado,fecha_entregado,fabrica,clientes(id,nombre,dias_credito),lineas_pedido(metros_solicitados,metros_entregados,precio,tipo,unidades,precio_unitario,tela,variante,descripcion_producto)')
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
    setTodosCobros((cData ?? []).map((c: any) => ({ monto: c.monto, fecha: c.fecha })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function registrarCobro(e: React.FormEvent) {
    e.preventDefault()
    if (!addingTo || !monto) return
    setSaving(true)
    const { error } = await supabase.from('cobros').insert({ pedido_id: addingTo.id, monto: parseFloat(monto), fecha, notas: notas || null })
    setSaving(false)
    if (error) { alert('Error al guardar: ' + error.message); return }
    setAddingTo(null); setMonto(''); setNotas('')
    load()
  }
  async function borrarCobro(cobroId: string) {
    await supabase.from('cobros').delete().eq('id', cobroId)
    load()
  }

  // Group by client
  const porCliente: Record<string, { nombre: string; clienteId: string; diasCredito: number | null; pedidos: Pedido[] }> = {}
  pedidos.forEach(p => {
    if (!(p.estado === 'Entregado' || p.fecha_entregado)) return
    const clienteId  = p.clientes?.id ?? 'sin-cliente'
    const nombre     = p.clientes?.nombre ?? 'Sin cliente'
    const diasCredito = p.clientes?.dias_credito ?? null
    if (!porCliente[clienteId]) porCliente[clienteId] = { nombre, clienteId, diasCredito, pedidos: [] }
    const val = valorPedido(p), cob = cobrado(p)
    if (filtro === 'pendiente' && cob >= val && val > 0) return
    if (filtro === 'cobrado'   && !(cob >= val && val > 0)) return
    porCliente[clienteId].pedidos.push(p)
  })

  const totalFacturado = pedidos.filter(p => p.estado==='Entregado'||p.fecha_entregado).reduce((s,p)=>s+valorPedido(p),0)
  const totalCobrado   = pedidos.reduce((s,p)=>s+cobrado(p),0)
  const totalDeuda     = totalFacturado - totalCobrado

  const clientes = Object.values(porCliente).filter(c => c.pedidos.length > 0)

  // Histórico mensual — últimos 12 meses
  const hoy = new Date()
  const mesesHistorico = Array.from({ length: 12 }, (_, i) => {
    const mes = subMonths(hoy, 11 - i)
    const inicio = startOfMonth(mes)
    const fin    = endOfMonth(mes)
    const total  = todosCobros
      .filter(c => { const f = new Date(c.fecha); return f >= inicio && f <= fin })
      .reduce((s, c) => s + c.monto, 0)
    return {
      mes: format(mes, 'MMM yy', { locale: es }),
      total,
      esActual: i === 11,
    }
  })
  const cobradoEsteMes = mesesHistorico[11].total
  const cobradoMesAnterior = mesesHistorico[10].total
  const variacion = cobradoMesAnterior > 0 ? ((cobradoEsteMes - cobradoMesAnterior) / cobradoMesAnterior) * 100 : null

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Cobros</h1>
        <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:99, padding:'4px 10px' }}>IVA 16% incluido</span>
      </div>

      {/* Este mes + histórico */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 16px 10px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              {format(hoy, 'MMMM yyyy', { locale: es })}
            </div>
            <div style={{ fontSize:28, fontWeight:700, color:'var(--accent)', lineHeight:1 }}>
              {compact(cobradoEsteMes)}
            </div>
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
              {mesesHistorico.map((m, i) => (
                <Cell key={i} fill={m.esActual ? 'var(--accent)' : 'var(--border2)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Facturado', raw: totalFacturado,  color:'var(--text)' },
          { label:'Cobrado',   raw: totalCobrado,    color:'var(--accent)' },
          { label:'Debe',      raw: totalDeuda,      color: totalDeuda>0?'var(--red)':'var(--accent)' },
        ].map(({ label, raw, color }) => (
          <div key={label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 12px' }}>
            <div style={{ fontSize:18, fontWeight:700, color }}>{compact(iva(raw))}</div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>s/IVA {compact(raw)}</div>
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
          {clientes.map(({ nombre, clienteId, diasCredito, pedidos: cPedidos }) => {
            const totalC   = cPedidos.reduce((s,p)=>s+valorPedido(p),0)
            const cobradoC = cPedidos.reduce((s,p)=>s+cobrado(p),0)
            const deudaC   = totalC - cobradoC
            return (
              <div key={clienteId} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                {/* Header cliente */}
                <div style={{ padding:'12px 14px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Link href={`/clientes/${clienteId}`} style={{ fontWeight:700, fontSize:15, color:'var(--text)', textDecoration:'none' }}>
                      {nombre}
                    </Link>
                    {editingCredito === clienteId ? (
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <input autoFocus type="number" value={creditoVal} onChange={e => setCreditoVal(e.target.value)}
                          onBlur={() => guardarCredito(clienteId)}
                          onKeyDown={e => { if (e.key==='Enter') guardarCredito(clienteId); if (e.key==='Escape') setEditingCredito(null) }}
                          style={{ width:52, fontSize:12, padding:'2px 6px', borderRadius:6, border:'1px solid var(--accent)', background:'var(--surface)', color:'var(--text)', textAlign:'center' }}
                        />
                        <span style={{ fontSize:11, color:'var(--text3)' }}>días</span>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingCredito(clienteId); setCreditoVal(String(diasCredito ?? '')) }}
                        title="Condiciones de pago — clic para editar"
                        style={{ fontSize:11, padding:'2px 8px', borderRadius:99, cursor:'pointer',
                          background: diasCredito ? 'var(--surface)' : 'rgba(234,179,8,0.1)',
                          border: `1px solid ${diasCredito ? 'var(--border)' : 'rgba(234,179,8,0.4)'}`,
                          color: diasCredito ? 'var(--text3)' : 'var(--yellow)' }}>
                        {diasCredito ? `${diasCredito}d crédito` : '+ crédito'}
                      </button>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:12, fontSize:12, flexWrap:'wrap' }}>
                    <span style={{ color:'var(--text3)' }}>Total c/IVA: <span style={{ color:'var(--text)', fontWeight:600 }}>${fmt(totalC)}</span></span>
                    <span style={{ color:'var(--text3)' }}>Cobrado: <span style={{ color:'var(--accent)', fontWeight:600 }}>${Math.round(cobradoC).toLocaleString()}</span></span>
                    {deudaC > 0 && <span style={{ color:'var(--red)', fontWeight:700 }}>Debe: ${fmt(deudaC)}</span>}
                    {deudaC <= 0 && totalC > 0 && <span style={{ color:'var(--accent)', fontWeight:700 }}>✓ Al corriente</span>}
                  </div>
                </div>

                {/* Pedidos como cards */}
                <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                  {cPedidos.map(p => {
                    const val    = valorPedido(p)
                    const cob    = cobrado(p)
                    const saldo  = val - cob
                    const pct    = val > 0 ? Math.min(cob/val*100, 100) : 0
                    const diasSinPagar = saldo > 0 && p.fecha_entregado
                      ? Math.floor((Date.now() - new Date(p.fecha_entregado).getTime()) / 86_400_000)
                      : null
                    const vencido = diasSinPagar !== null && diasCredito !== null && diasSinPagar > diasCredito
                    return (
                      <div key={p.id} style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                        {/* Fila principal */}
                        <div style={{ padding:'10px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flex:1 }}>
                            <Link href={`/pedidos/${p.id}`} style={{ fontWeight:700, color:'var(--accent)', textDecoration:'none', fontSize:14 }}>{p.folio}</Link>
                            <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px' }}>{p.fabrica}</span>
                            {p.fecha_entregado && <span style={{ fontSize:11, color:'var(--text3)' }}>{format(new Date(p.fecha_entregado),'dd MMM yy',{locale:es})}</span>}
                            {/* Telas y variantes */}
                            <span style={{ fontSize:11, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>
                              {p.lineas_pedido.map(l => {
                                const nombre = l.tipo === 'producto' ? (l.descripcion_producto ?? l.tela) : l.tela
                                return nombre + (l.variante ? ` (${l.variante})` : '')
                              }).join(' · ')}
                            </span>
                            {diasSinPagar !== null && (
                              <span style={{
                                fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99,
                                background: vencido ? 'rgba(239,68,68,0.15)' : 'var(--surface2)',
                                color: vencido ? 'var(--red)' : 'var(--text3)',
                                border: `1px solid ${vencido ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                              }}>
                                {diasSinPagar}d
                              </span>
                            )}
                            {/* Indicador estimado vs real */}
                            {p.estado !== 'Entregado' && (
                              <span title="Proyección basada en metros del pedido — se ajustará al entregar"
                                style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'var(--surface2)', color:'var(--text3)', border:'1px solid var(--border)', cursor:'default' }}>
                                proyección
                              </span>
                            )}
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                            {val > 0 && (
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:13, fontWeight:700, color: saldo>0?'var(--red)':'var(--accent)' }}>
                                  {saldo>0 ? `Debe $${fmt(saldo)}` : '✓ Cobrado'}
                                </div>
                                <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                                  ${fmt(val)} <span style={{ fontSize:10, fontWeight:400, color:'var(--text3)' }}>c/IVA</span>
                                </div>
                                <div style={{ fontSize:10, color:'var(--text3)' }}>
                                  s/IVA ${Math.round(val).toLocaleString()}
                                </div>
                              </div>
                            )}
                            <button onClick={() => { setAddingTo(p); setMonto(saldo>0?String(Math.round(iva(saldo))):''); setFecha(new Date().toISOString().split('T')[0]); setNotas('') }}
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
              {valorPedido(addingTo) > 0 && (() => {
                const saldoModal = valorPedido(addingTo) - cobrado(addingTo)
                return ` · Saldo c/IVA: $${Math.round(iva(saldoModal)).toLocaleString()} (s/IVA $${Math.round(saldoModal).toLocaleString()})`
              })()}
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
