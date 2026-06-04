'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { RIESGO_CONFIG, calcularRiesgo } from '@/lib/constants'
import { differenceInDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell,
} from 'recharts'

type Pedido = {
  id: string; folio: string; fabrica: string; estado: string
  fecha_compromiso: string | null; fecha_pedido: string; fecha_entregado: string | null
  clientes: { nombre: string } | null
  lineas_pedido: { tela: string; variante: string | null; metros_solicitados: number; metros_entregados: number | null; precio: number }[]
  comentarios: { texto: string; created_at: string }[]
}
type Acabado = { id: string; proveedor: string; tipo_proceso: string; metros_enviados: number; estado: string; pedidos: { lineas_pedido: { tela: string }[] } | null }

const COLORS = ['#3ecf8e','#60a5fa','#fbbf24','#f87171','#a78bfa','#34d399','#fb923c','#e879f9']

// Normalize tela/variante names: trim + Title Case per word
const normTela = (s: string) =>
  s.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

const TT = {
  contentStyle: { background: '#1c1c1c', border: '1px solid #333', borderRadius: 6, fontSize: 12 },
  labelStyle: { color: '#ededed' },
  itemStyle: { color: '#ededed' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}

const fmtK = (v: number) => v >= 1000 ? `${(v/1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v)

function badgeStyle(estado: string) {
  const m: Record<string, {background:string;color:string}> = {
    '📥 Nuevo pedido':     { background:'#0e2a2a', color:'#5eead4' },
    '🏭 En producción':    { background:'#0e1f3a', color:'#60a5fa' },
    'En Acabado':          { background:'#0e1f3a', color:'#60a5fa' },
    'En acabado Externo':  { background:'#2a1f00', color:'#fbbf24' },
    'En revisión':         { background:'#2a0e1f', color:'#f472b6' },
    'Listo para entregar': { background:'#0e2a1a', color:'#4ade80' },
    'Entregado':           { background:'#1c1c1c', color:'#555' },
    '🔍 Verificando stock':{ background:'#0e2a1a', color:'#4ade80' },
  }
  return m[estado] ?? { background:'var(--surface2)', color:'var(--text2)' }
}

function rColor(r: string) {
  return r==='atrasado'?'var(--red)':r==='revisar'?'var(--yellow)':r==='entregado'?'var(--text3)':'var(--accent)'
}

export default function Dashboard() {
  const router = useRouter()
  const [pedidos, setPedidos]   = useState<Pedido[]>([])
  const [acabados, setAcabados] = useState<Acabado[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('pedidos').select('id,folio,fabrica,estado,fecha_compromiso,fecha_pedido,fecha_entregado,clientes(nombre),lineas_pedido(tela,variante,metros_solicitados,metros_entregados,precio),comentarios(texto,created_at)'),
      supabase.from('acabados').select('id,proveedor,tipo_proceso,metros_enviados,estado,pedidos(lineas_pedido(tela))'),
    ]).then(([{ data: p }, { data: a }]) => {
      setPedidos((p as unknown as Pedido[]) ?? [])
      setAcabados((a as unknown as Acabado[]) ?? [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>Cargando...</div>

  const activos   = pedidos.filter(p => p.estado !== 'Entregado')
  const atrasados = pedidos.filter(p => calcularRiesgo(p.fecha_compromiso, p.estado) === 'atrasado')
  const enProd    = pedidos.filter(p => p.estado === '🏭 En producción')
  const hoy       = new Date()
  const enSemana  = pedidos.filter(p => p.fecha_entregado && Math.abs(differenceInDays(new Date(p.fecha_entregado), hoy)) <= 7)
  const metrosPendientes = activos.reduce((s,p) => s + p.lineas_pedido.reduce((ls,l) => ls + Math.max(0, l.metros_solicitados - (l.metros_entregados??0)),0),0)
  const entregados = pedidos.filter(p => p.fecha_entregado && p.fecha_pedido)
  const promDias = entregados.length
    ? Math.round(entregados.reduce((s,p) => s+differenceInDays(new Date(p.fecha_entregado!),new Date(p.fecha_pedido)),0)/entregados.length) : 0

  // Chart data — stacked by variante, same color per tela, stroke lines as separators

  // Metros pendientes por tela × variante
  const telaVarianteMap: Record<string, Record<string,number>> = {}
  activos.forEach(p => p.lineas_pedido.forEach(l => {
    const t = normTela(l.tela); const v = l.variante ? normTela(l.variante) : '—'
    if (!telaVarianteMap[t]) telaVarianteMap[t] = {}
    const pendiente = Math.max(0, l.metros_solicitados - (l.metros_entregados??0))
    if (pendiente === 0) return
    telaVarianteMap[t][v] = (telaVarianteMap[t][v]??0)+pendiente
  }))
  const telaOrder = Object.entries(telaVarianteMap)
    .map(([tela, vs]) => [tela, Object.values(vs).reduce((s,v)=>s+v,0)] as [string,number])
    .sort((a,b)=>b[1]-a[1]).slice(0,8).map(([t])=>t)
  const allVariantesTela = [...new Set(activos.flatMap(p => p.lineas_pedido.map(l => l.variante ? normTela(l.variante) : '—')))]
  const chartTela = telaOrder.map(tela => ({ tela, ...telaVarianteMap[tela] }))

  // Metros totales por tela × variante (todos los pedidos, no solo activos)
  const telaVarianteVentas: Record<string, Record<string,number>> = {}
  pedidos.forEach(p => p.lineas_pedido.forEach(l => {
    const t = normTela(l.tela); const v = l.variante ? normTela(l.variante) : '—'
    if (!telaVarianteVentas[t]) telaVarianteVentas[t] = {}
    telaVarianteVentas[t][v] = (telaVarianteVentas[t][v]??0)+l.metros_solicitados
  }))
  const ventaTelaOrder = Object.entries(telaVarianteVentas)
    .map(([tela, vs]) => [tela, Object.values(vs).reduce((s,v)=>s+v,0)] as [string,number])
    .sort((a,b)=>b[1]-a[1]).slice(0,8).map(([t])=>t)
  const allVariantesVentas = [...new Set(pedidos.flatMap(p => p.lineas_pedido.map(l => l.variante ? normTela(l.variante) : '—')))]
  const chartVentas = ventaTelaOrder.map(tela => ({ tela, ...telaVarianteVentas[tela] }))

  // Monthly chart — keyed by sortable YYYY-MM so we can sort chronologically
  const ventasMes: Record<string,{metros:number;label:string}> = {}
  pedidos.forEach(p => {
    if (!p.fecha_pedido) return
    const key   = format(new Date(p.fecha_pedido), 'yyyy-MM')
    const label = format(new Date(p.fecha_pedido), 'MMM yy', { locale: es })
    if (!ventasMes[key]) ventasMes[key] = { metros: 0, label }
    ventasMes[key].metros += p.lineas_pedido.reduce((s,l)=>s+l.metros_solicitados,0)
  })
  const chartMensual = Object.entries(ventasMes)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([, { metros, label }]) => ({ mes: label, metros }))

  // Stacked by tela per proveedor
  const provTelaMap: Record<string, Record<string,number>> = {}
  acabados.filter(a=>a.estado==='En Proceso').forEach(a => {
    const tela = a.pedidos?.lineas_pedido?.[0]?.tela ?? 'Sin tela'
    if (!provTelaMap[a.proveedor]) provTelaMap[a.proveedor] = {}
    provTelaMap[a.proveedor][tela] = (provTelaMap[a.proveedor][tela]??0)+a.metros_enviados
  })
  const tiposProceso = [...new Set(
    acabados.filter(a=>a.estado==='En Proceso').map(a => a.pedidos?.lineas_pedido?.[0]?.tela ?? 'Sin tela')
  )]
  const chartProv = Object.entries(provTelaMap).map(([proveedor, telas]) => ({ proveedor, ...telas }))

  const pedidosActivos = activos.sort((a,b)=>{
    const order:{[k:string]:number} = {atrasado:0,revisar:1,ok:2,entregado:3}
    return order[calcularRiesgo(a.fecha_compromiso,a.estado)]-order[calcularRiesgo(b.fecha_compromiso,b.estado)]
  })

  const nav = (url: string) => () => router.push(url)

  const statsData = [
    { label:'Órdenes activas',     value:activos.length,                     color:'var(--text)',   url:'/pedidos?vista=activos' },
    { label:'Atrasadas',            value:atrasados.length,                   color:'var(--red)',    url:'/pedidos?riesgo=atrasado' },
    { label:'En producción',        value:enProd.length,                      color:'var(--blue)',   url:'/pedidos?estado=%F0%9F%8F%AD+En+producci%C3%B3n' },
    { label:'Entregas esta semana', value:enSemana.length,                    color:'var(--accent)', url:'/pedidos?vista=semana' },
    { label:'Metros pendientes',    value:metrosPendientes.toLocaleString(),  color:'var(--text)',   url:'/pedidos?vista=activos', suffix:'m' },
    { label:'Promedio entrega',     value:promDias,                           color:'var(--text)',   url:'/pedidos?vista=entregados', suffix:' días' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Dashboard</h1>
          <p style={{ color:'var(--text3)', margin:'2px 0 0', fontSize:13 }}>
            {format(new Date(),"EEEE d 'de' MMMM",{locale:es})}
          </p>
        </div>
        <Link href="/pedidos/nuevo" className="btn-primary">+ Nuevo pedido</Link>
      </div>

      {/* Stats */}
      <div className="stats-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {statsData.map(s => (
          <div key={s.label} onClick={nav(s.url)} style={{
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8,
            padding:'16px 18px', cursor:'pointer', transition:'border-color 0.15s',
          }}
            onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--accent)')}
            onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}
          >
            <div style={{ fontSize:26, fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}{s.suffix}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>{s.label}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:6, opacity:0.5 }}>Ver detalle →</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="charts-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <ChartCard title="Metros pendientes por tela" subtitle="Hover = variante · Click = filtrar pedidos">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartTela} margin={{ left:-10 }}
              onClick={(d:any) => d?.activePayload?.[0] && router.push(`/pedidos?tela=${encodeURIComponent(d.activePayload[0].payload.tela)}&vista=activos`)}
              style={{ cursor:'pointer' }}
            >
              <XAxis dataKey="tela" tick={{ fill:'var(--text3)', fontSize:10 }} />
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip {...TT} formatter={(v:any, name:any) => [`${Number(v).toLocaleString()} m`, name === '—' ? 'Sin variante' : name]} />
              {allVariantesTela.map(variante => (
                <Bar key={variante} dataKey={variante} stackId="a"
                  stroke="var(--bg)" strokeWidth={1.5} isAnimationActive={false}
                >
                  {chartTela.map((_,ti) => <Cell key={ti} fill={COLORS[ti%COLORS.length]} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Metros totales por tela" subtitle="Todos los pedidos · hover = variante">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartVentas} margin={{ left:-10 }}
              onClick={(d:any) => d?.activePayload?.[0] && router.push(`/pedidos?tela=${encodeURIComponent(d.activePayload[0].payload.tela)}`)}
              style={{ cursor:'pointer' }}
            >
              <XAxis dataKey="tela" tick={{ fill:'var(--text3)', fontSize:10 }} />
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip {...TT} formatter={(v:any, name:any) => [`${Number(v).toLocaleString()} m`, name === '—' ? 'Sin variante' : name]} />
              {allVariantesVentas.map(variante => (
                <Bar key={variante} dataKey={variante} stackId="a"
                  stroke="var(--bg)" strokeWidth={1.5} isAnimationActive={false}
                >
                  {chartVentas.map((_,ti) => <Cell key={ti} fill={COLORS[ti%COLORS.length]} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="charts-2" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
        <ChartCard title="Ventas mensuales (metros)" subtitle="Click en un mes para ver sus pedidos">
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={chartMensual} margin={{ left:-10 }}
              onClick={(d:any) => d?.activePayload?.[0] && router.push(`/pedidos?mes=${encodeURIComponent(d.activePayload[0].payload.mes)}`)}
              style={{ cursor:'pointer' }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fill:'var(--text3)', fontSize:10 }} />
              <YAxis tick={{ fill:'var(--text3)', fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip {...TT} formatter={(v:any) => [`${Number(v).toLocaleString()} m`,'Metros']} />
              <Line type="monotone" dataKey="metros" stroke="var(--accent)" strokeWidth={2}
                dot={{ fill:'var(--accent)', r:4, cursor:'pointer' }}
                activeDot={{ r:6, fill:'var(--accent)', stroke:'var(--bg)', strokeWidth:2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Metros en acabado por proveedor" subtitle="Click para ver acabados · colores por tipo de proceso">
          {/* Mini legend */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 12px', marginBottom:10 }}>
            {tiposProceso.map((t,i) => (
              <span key={t} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text3)' }}>
                <span style={{ width:8, height:8, borderRadius:2, background:COLORS[i%COLORS.length], flexShrink:0 }} />
                {t}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartProv} layout="vertical" margin={{ left:10 }}
              onClick={(d:any) => d?.activePayload?.[0] && router.push(`/acabados?proveedor=${encodeURIComponent(d.activePayload[0].payload.proveedor)}`)}
              style={{ cursor:'pointer' }}
            >
              <XAxis type="number" tick={{ fill:'var(--text3)', fontSize:10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="proveedor" tick={{ fill:'var(--text3)', fontSize:10 }} width={80} />
              <Tooltip {...TT} formatter={(v:any) => [`${Number(v).toLocaleString()} m`, '']} />
              {tiposProceso.map((tipo, i) => (
                <Bar key={tipo} dataKey={tipo} stackId="a" fill={COLORS[i%COLORS.length]}
                  radius={i === tiposProceso.length-1 ? [0,3,3,0] : [0,0,0,0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Pedidos activos */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <h2 style={{ fontSize:15, fontWeight:600, margin:0, color:'var(--text2)' }}>
            Pedidos activos — {pedidosActivos.length}
          </h2>
          <Link href="/pedidos?vista=activos" style={{ fontSize:12, color:'var(--accent)', textDecoration:'none' }}>
            Ver todos →
          </Link>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {pedidosActivos.map(p => (
            <PedidoCard key={p.id} p={p} onCommentSaved={() => {
              // refresh comments inline
              supabase.from('pedidos').select('id,comentarios(texto,created_at)').eq('id',p.id).single()
                .then(({data}) => {
                  if (data) setPedidos(prev => prev.map(x => x.id===p.id ? {...x, comentarios:(data as any).comentarios} : x))
                })
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PedidoCard({ p, onCommentSaved }: { p: Pedido; onCommentSaved: () => void }) {
  const router = useRouter()
  const [showComment, setShowComment] = useState(false)
  const [texto, setTexto]             = useState('')
  const [saving, setSaving]           = useState(false)

  const riesgo        = calcularRiesgo(p.fecha_compromiso, p.estado)
  const diasRestantes = p.fecha_compromiso ? differenceInDays(new Date(p.fecha_compromiso), new Date()) : null
  const metros        = p.lineas_pedido.reduce((s,l)=>s+l.metros_solicitados,0)
  const solic         = metros
  const entreg        = p.lineas_pedido.reduce((s,l)=>s+(l.metros_entregados??0),0)
  const pct           = solic > 0 ? Math.min(entreg/solic*100,100) : 0

  async function saveComment(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setSaving(true)
    await supabase.from('comentarios').insert({ pedido_id: p.id, texto: texto.trim() })
    setTexto('')
    setSaving(false)
    setShowComment(false)
    onCommentSaved()
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', transition:'border-color 0.15s' }}
      onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border2)')}
      onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}
    >
      {/* Clickeable main area */}
      <div onClick={() => router.push(`/pedidos/${p.id}`)} style={{ padding:'12px 16px', cursor:'pointer' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
              <span style={{ fontWeight:700, color:'var(--text)' }}>{p.folio}</span>
              <span style={{ color:'var(--text3)' }}>·</span>
              <span style={{ color:'var(--text2)', fontSize:13 }}>{p.clientes?.nombre}</span>
              <span style={{ fontSize:11, padding:'1px 8px', borderRadius:4, background:'var(--surface2)', color:'var(--text3)', border:'1px solid var(--border)' }}>{p.fabrica}</span>
            </div>
            <div style={{ color:'var(--text3)', fontSize:12, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
              {p.lineas_pedido.map((l,i) => `${l.tela}${l.variante?` — ${l.variante}`:''}${i<p.lineas_pedido.length-1?' · ':''}`)}
            </div>
            {entreg > 0 && (
              <div style={{ marginTop:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginBottom:3 }}>
                  <span>{entreg.toLocaleString()} m entregados de {solic.toLocaleString()} m</span>
                  <span style={{ color:pct>=100?'var(--accent)':'var(--yellow)', fontWeight:600 }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height:3, background:'var(--surface2)', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:pct>=100?'var(--accent)':'var(--yellow)', borderRadius:99 }} />
                </div>
              </div>
            )}
            {p.comentarios.length > 0 && (() => {
              const ultimo = [...p.comentarios].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
              return (
                <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:4, fontSize:12, color:'var(--text3)', overflow:'hidden' }}>
                  <span style={{ flexShrink:0 }}>💬</span>
                  <span style={{ overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', fontStyle:'italic' }}>{ultimo.texto}</span>
                  {p.comentarios.length > 1 && <span style={{ flexShrink:0, fontSize:11, padding:'1px 5px', background:'var(--surface2)', borderRadius:99, border:'1px solid var(--border)' }}>+{p.comentarios.length-1}</span>}
                </div>
              )
            })()}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500, ...badgeStyle(p.estado) }}>{p.estado}</span>
            <span style={{ fontSize:12, fontWeight:600, color:rColor(riesgo) }}>{RIESGO_CONFIG[riesgo].label}</span>
            <span style={{ fontSize:11, color:'var(--text3)' }}>
              {metros.toLocaleString()} m
              {diasRestantes!==null && ` · ${diasRestantes>=0?`${diasRestantes}d`:`${Math.abs(diasRestantes)}d venc.`}`}
            </span>
          </div>
        </div>
      </div>

      {/* Quick comment bar */}
      <div style={{ borderTop:'1px solid var(--border)', padding:'6px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        {!showComment ? (
          <button onClick={() => setShowComment(true)} style={{
            background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:12, padding:'2px 0',
            display:'flex', alignItems:'center', gap:5,
          }}
            onMouseEnter={e=>(e.currentTarget.style.color='var(--text)')}
            onMouseLeave={e=>(e.currentTarget.style.color='var(--text3)')}
          >
            💬 Agregar nota rápida
          </button>
        ) : (
          <form onSubmit={saveComment} style={{ display:'flex', gap:6, flex:1 }} onClick={e=>e.stopPropagation()}>
            <input
              autoFocus type="text" value={texto} onChange={e=>setTexto(e.target.value)}
              placeholder="Escribe una nota..." className="input"
              style={{ flex:1, height:30, fontSize:12, padding:'4px 10px' }}
              onKeyDown={e => e.key==='Escape' && (setShowComment(false), setTexto(''))}
            />
            <button type="submit" disabled={saving||!texto.trim()} className="btn-primary" style={{ padding:'4px 12px', fontSize:12 }}>
              {saving ? '...' : 'Guardar'}
            </button>
            <button type="button" onClick={()=>{setShowComment(false);setTexto('')}} className="btn-ghost" style={{ padding:'4px 10px', fontSize:12 }}>✕</button>
          </form>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title:string; subtitle?:string; children:React.ReactNode }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'16px 18px' }}>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{title}</div>
        {subtitle && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
