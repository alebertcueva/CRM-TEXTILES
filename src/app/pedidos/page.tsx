'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FABRICAS, RIESGO_CONFIG, calcularRiesgo } from '@/lib/constants'
import { differenceInDays, format } from 'date-fns'
import { es } from 'date-fns/locale'

type Pedido = {
  id: string; folio: string; fabrica: string; estado: string
  fecha_pedido: string; fecha_compromiso: string | null; fecha_entregado: string | null
  clientes: { nombre: string } | null
  lineas_pedido: { tela: string; variante: string | null; metros_solicitados: number }[]
}

function badgeStyle(estado: string) {
  const m: Record<string,{background:string;color:string}> = {
    '📥 Nuevo pedido':     {background:'#0e2a2a',color:'#5eead4'},
    '🏭 En producción':    {background:'#0e1f3a',color:'#60a5fa'},
    'En Acabado':          {background:'#0e1f3a',color:'#60a5fa'},
    'En acabado Externo':  {background:'#2a1f00',color:'#fbbf24'},
    'En revisión':         {background:'#2a0e1f',color:'#f472b6'},
    'Listo para entregar': {background:'#0e2a1a',color:'#4ade80'},
    'Entregado':           {background:'#1c1c1c',color:'#555'},
    '🔍 Verificando stock':{background:'#0e2a1a',color:'#4ade80'},
  }
  return m[estado] ?? {background:'var(--surface2)',color:'var(--text2)'}
}

function PedidosContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  // Filters from URL
  const paramVista    = params.get('vista') ?? 'activos'
  const paramRiesgo   = params.get('riesgo') ?? ''
  const paramEstado   = params.get('estado') ?? ''
  const paramTela     = params.get('tela') ?? ''
  const paramMes      = params.get('mes') ?? ''
  const paramFabrica  = params.get('fabrica') ?? 'all'

  // Local state mirrors URL (for the filter bar)
  const [busqueda, setBusqueda]           = useState('')
  const [filtroFabrica, setFiltroFabrica] = useState(paramFabrica)
  const [filtroVista, setFiltroVista]     = useState(paramVista)
  // Quick status change
  const [changingId, setChangingId]       = useState<string | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!changingId) return
    const close = () => setChangingId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [changingId])

  useEffect(() => {
    supabase.from('pedidos')
      .select('id,folio,fabrica,estado,fecha_pedido,fecha_compromiso,fecha_entregado,clientes(nombre),lineas_pedido(tela,variante,metros_solicitados)')
      .order('fecha_pedido', { ascending: false })
      .then(({ data }) => { setPedidos((data as unknown as Pedido[]) ?? []); setLoading(false) })
  }, [])

  async function cambiarEstado(pedidoId: string, nuevoEstado: string, estadoActual: string) {
    const updates: Record<string, string | null> = { estado: nuevoEstado }
    if (nuevoEstado === 'Entregado') updates.fecha_entregado = new Date().toISOString().split('T')[0]
    if (nuevoEstado !== 'Entregado' && estadoActual === 'Entregado') updates.fecha_entregado = null
    await supabase.from('pedidos').update(updates).eq('id', pedidoId)
    await supabase.from('estado_historial').insert({ pedido_id: pedidoId, estado_anterior: estadoActual, estado_nuevo: nuevoEstado })
    setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, estado: nuevoEstado } : p))
    setChangingId(null)
  }

  // Sync URL param changes to local state
  useEffect(() => { setFiltroVista(paramVista); setFiltroFabrica(paramFabrica) }, [paramVista, paramFabrica])

  const hoy = new Date()

  const filtrados = pedidos.filter(p => {
    // Vista / estado filters
    if (filtroVista === 'activos' && p.estado === 'Entregado') return false
    if (filtroVista === 'entregados' && p.estado !== 'Entregado') return false
    if (filtroVista === 'semana') {
      if (!p.fecha_entregado) return false
      if (Math.abs(differenceInDays(new Date(p.fecha_entregado), hoy)) > 7) return false
    }

    // URL param filters (from dashboard clicks)
    if (paramRiesgo && calcularRiesgo(p.fecha_compromiso, p.estado) !== paramRiesgo) return false
    if (paramEstado && p.estado !== paramEstado) return false
    if (paramTela && !p.lineas_pedido.some(l => l.tela.toLowerCase() === paramTela.toLowerCase())) return false
    if (paramMes) {
      if (!p.fecha_pedido) return false
      const mes = format(new Date(p.fecha_pedido), 'MMM yy', { locale: es })
      if (mes !== paramMes) return false
    }

    // Local filters
    if (filtroFabrica !== 'all' && p.fabrica !== filtroFabrica) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!p.folio.toLowerCase().includes(q) &&
          !(p.clientes?.nombre ?? '').toLowerCase().includes(q) &&
          !p.lineas_pedido.some(l => l.tela.toLowerCase().includes(q))) return false
    }
    return true
  })

  const totalMetros = filtrados.reduce((s,p) => s + p.lineas_pedido.reduce((ls,l)=>ls+l.metros_solicitados,0),0)

  // Active filter chips (from URL)
  const chips = [
    paramRiesgo && { label: `Riesgo: ${paramRiesgo}`, clear: () => clearParam('riesgo') },
    paramEstado && { label: `Estado: ${paramEstado}`, clear: () => clearParam('estado') },
    paramTela   && { label: `Tela: ${paramTela}`,     clear: () => clearParam('tela') },
    paramMes    && { label: `Mes: ${paramMes}`,        clear: () => clearParam('mes') },
  ].filter(Boolean) as { label: string; clear: () => void }[]

  function clearParam(key: string) {
    const p = new URLSearchParams(params.toString())
    p.delete(key)
    router.push(`/pedidos?${p.toString()}`)
  }

  const s: React.CSSProperties = { padding:'10px 14px', textAlign:'left', fontSize:13, color:'var(--text)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }
  const sh: React.CSSProperties = { ...s, fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', background:'var(--surface2)' }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Pedidos</h1>
          <p style={{ color:'var(--text3)', margin:'2px 0 0', fontSize:13 }}>
            {filtrados.length} pedidos · {totalMetros.toLocaleString()} m
          </p>
        </div>
        <Link href="/pedidos/nuevo" className="btn-primary">+ Nuevo pedido</Link>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
          {chips.map(c => (
            <span key={c.label} style={{
              display:'flex', alignItems:'center', gap:6, fontSize:12, padding:'3px 10px',
              background:'var(--accent-dim)', color:'var(--accent)', borderRadius:99,
              border:'1px solid var(--accent)', cursor:'default',
            }}>
              {c.label}
              <button onClick={c.clear} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:14, lineHeight:1, padding:0 }}>×</button>
            </span>
          ))}
          <button onClick={() => router.push('/pedidos')} style={{
            fontSize:12, padding:'3px 10px', background:'none', border:'1px solid var(--border2)',
            color:'var(--text3)', borderRadius:99, cursor:'pointer',
          }}>Limpiar filtros</button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input type="text" placeholder="Buscar folio, cliente, tela..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className="input" style={{ flex:1, minWidth:160 }} />
        <select value={filtroFabrica} onChange={e => setFiltroFabrica(e.target.value)}
          className="input" style={{ width:'auto' }}>
          <option value="all">Todas las fábricas</option>
          {FABRICAS.map(f => <option key={f}>{f}</option>)}
        </select>
        <div style={{ display:'flex', border:'1px solid var(--border2)', borderRadius:6, overflow:'hidden', flexShrink:0 }}>
          {[
            { v:'activos',    label:'Activos'    },
            { v:'todos',      label:'Todos'      },
            { v:'entregados', label:'Entregados' },
            { v:'semana',     label:'Semana'     },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => { setFiltroVista(v); router.push(`/pedidos?vista=${v}`) }} style={{
              padding:'8px 11px', fontSize:12, cursor:'pointer', border:'none',
              background: filtroVista===v ? 'var(--accent)' : 'var(--surface2)',
              color: filtroVista===v ? '#0c0c0c' : 'var(--text2)',
              fontWeight: filtroVista===v ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)' }}>
          Sin resultados{chips.length > 0 && ' — prueba limpiando los filtros'}
        </div>
      ) : (
        <>
          {/* ── Mobile: card list ── */}
          <div className="mobile-only" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtrados.map(p => {
              const riesgo = calcularRiesgo(p.fecha_compromiso, p.estado)
              const metros = p.lineas_pedido.reduce((s,l)=>s+l.metros_solicitados,0)
              const badge  = badgeStyle(p.estado)
              const rc = riesgo==='atrasado'?'var(--red)':riesgo==='revisar'?'var(--yellow)':riesgo==='entregado'?'var(--text3)':'var(--accent)'
              const diasRestantes = p.fecha_compromiso ? differenceInDays(new Date(p.fecha_compromiso), hoy) : null
              return (
                <div key={p.id} onClick={() => router.push(`/pedidos/${p.id}`)}
                  style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', cursor:'pointer' }}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <span style={{ fontWeight:700, fontSize:14 }}>{p.folio}</span>
                      <span style={{ color:'var(--text3)', fontSize:12, marginLeft:6 }}>{p.fabrica}</span>
                    </div>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500, flexShrink:0, ...badge }}>{p.estado}</span>
                  </div>
                  <div style={{ color:'var(--text2)', fontSize:13, marginBottom:4 }}>{p.clientes?.nombre ?? '—'}</div>
                  <div style={{ color:'var(--text3)', fontSize:12, marginBottom:6, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                    {p.lineas_pedido.map(l=>`${l.tela}${l.variante?` (${l.variante})`:''}`).join(' · ')}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:600, color:rc }}>{RIESGO_CONFIG[riesgo].label}</span>
                    <div style={{ display:'flex', gap:10, fontSize:12, color:'var(--text3)' }}>
                      {diasRestantes !== null && p.estado !== 'Entregado' && (
                        <span style={{ color: diasRestantes<0?'var(--red)':'var(--text3)' }}>
                          {diasRestantes>=0 ? `${diasRestantes}d` : `${Math.abs(diasRestantes)}d venc.`}
                        </span>
                      )}
                      <span style={{ fontWeight:600, color:'var(--text)' }}>{metros.toLocaleString()} m</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Desktop: table ── */}
          <div className="desktop-only" style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            <div className="table-scroll">
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={sh}>Folio</th>
                  <th style={sh}>Cliente</th>
                  <th style={sh}>Fábrica</th>
                  <th style={sh}>Telas</th>
                  <th style={{ ...sh, textAlign:'right' }}>Metros</th>
                  <th style={sh}>Estado</th>
                  <th style={sh}>Riesgo</th>
                  <th style={sh}>Compromiso</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const riesgo = calcularRiesgo(p.fecha_compromiso, p.estado)
                  const metros = p.lineas_pedido.reduce((s,l)=>s+l.metros_solicitados,0)
                  const badge  = badgeStyle(p.estado)
                  const rc = riesgo==='atrasado'?'var(--red)':riesgo==='revisar'?'var(--yellow)':riesgo==='entregado'?'var(--text3)':'var(--accent)'
                  const diasRestantes = p.fecha_compromiso ? differenceInDays(new Date(p.fecha_compromiso), hoy) : null
                  return (
                    <tr key={p.id} style={{ cursor:'pointer' }}
                      onClick={() => router.push(`/pedidos/${p.id}`)}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    >
                      <td style={{ ...s, fontWeight:700 }}>{p.folio}</td>
                      <td style={{ ...s, color:'var(--text2)' }}>{p.clientes?.nombre ?? '—'}</td>
                      <td style={{ ...s, color:'var(--text3)' }}>{p.fabrica}</td>
                      <td style={{ ...s, color:'var(--text3)', maxWidth:240, overflow:'hidden', textOverflow:'ellipsis' }}>
                        {p.lineas_pedido.map(l=>`${l.tela}${l.variante?` (${l.variante})`:''}`).join(' · ')}
                      </td>
                      <td style={{ ...s, textAlign:'right', fontWeight:600, color:'var(--text)' }}>
                        {metros.toLocaleString()} m
                      </td>
                      <td style={{ ...s, position:'relative' }} onClick={e => { e.stopPropagation(); setChangingId(changingId === p.id ? null : p.id) }}>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500, cursor:'pointer', ...badge }}>
                          {p.estado} ▾
                        </span>
                        {changingId === p.id && (
                          <div style={{ position:'absolute', top:'100%', left:0, zIndex:100, background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:8, padding:6, minWidth:200, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}
                            onClick={e => e.stopPropagation()}
                          >
                            {(['📥 Nuevo pedido','🏭 En producción','En Acabado','En acabado Externo','En revisión','Listo para entregar','Entregado','🔍 Verificando stock'] as const).map(est => (
                              <button key={est} onClick={() => cambiarEstado(p.id, est, p.estado)}
                                style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', background: est===p.estado ? 'var(--surface2)' : 'transparent', border:'none', borderRadius:6, fontSize:12, cursor:'pointer', color: est===p.estado ? 'var(--accent)' : 'var(--text2)', fontWeight: est===p.estado ? 700 : 400 }}
                                onMouseEnter={e => { if (est!==p.estado) e.currentTarget.style.background='var(--surface2)' }}
                                onMouseLeave={e => { if (est!==p.estado) e.currentTarget.style.background='transparent' }}
                              >
                                {est===p.estado ? '✓ ' : '   '}{est}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ ...s, fontSize:12, fontWeight:600, color:rc }}>{RIESGO_CONFIG[riesgo].label}</td>
                      <td style={{ ...s, fontSize:12, color: diasRestantes !== null && diasRestantes < 0 ? 'var(--red)' : 'var(--text3)' }}>
                        {p.fecha_compromiso ? format(new Date(p.fecha_compromiso),'dd MMM yy',{locale:es}) : '—'}
                        {diasRestantes !== null && p.estado !== 'Entregado' && (
                          <span style={{ marginLeft:6, fontSize:11 }}>
                            ({diasRestantes >= 0 ? `${diasRestantes}d` : `${Math.abs(diasRestantes)}d venc.`})
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function PedidosPage() {
  return <Suspense><PedidosContent /></Suspense>
}
