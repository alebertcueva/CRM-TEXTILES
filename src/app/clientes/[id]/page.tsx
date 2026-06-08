'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { RIESGO_CONFIG, calcularRiesgo } from '@/lib/constants'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'

type Linea = { metros_solicitados: number; metros_entregados: number | null; precio: number }
// Entregado → metros reales; en curso → proyección (metros pedidos)
const metrosReales = (l: Linea, estado: string) =>
  estado === 'Entregado' && l.metros_entregados != null ? l.metros_entregados : l.metros_solicitados
type Pedido = {
  id: string; folio: string; fabrica: string; estado: string
  fecha_pedido: string; fecha_compromiso: string | null; fecha_entregado: string | null
  notas: string | null
  lineas_pedido: Linea[]
}
type Cliente = { id: string; nombre: string }

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

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos'|'activos'|'entregados'>('activos')

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clientes').select('id,nombre').eq('id', id).single(),
        supabase.from('pedidos')
          .select('id,folio,fabrica,estado,fecha_pedido,fecha_compromiso,fecha_entregado,notas,lineas_pedido(metros_solicitados,metros_entregados,precio)')
          .eq('cliente_id', id)
          .order('fecha_pedido', { ascending: false }),
      ])
      setCliente(c as Cliente)
      setPedidos((p as unknown as Pedido[]) ?? [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>Cargando...</div>
  if (!cliente) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>No encontrado</div>

  const hoy = new Date()

  // Stats
  const totalPedidos   = pedidos.length
  const activos        = pedidos.filter(p => p.estado !== 'Entregado')
  const entregados     = pedidos.filter(p => p.estado === 'Entregado')
  const totalMetros    = pedidos.reduce((s,p) => s + p.lineas_pedido.reduce((ls,l) => ls+l.metros_solicitados,0), 0)
  const totalValor     = pedidos.reduce((s,p) => s + p.lineas_pedido.reduce((ls,l) => ls+(metrosReales(l,p.estado)*l.precio),0), 0)
  const promDias       = entregados.filter(p=>p.fecha_entregado && p.fecha_pedido).length
    ? Math.round(entregados.filter(p=>p.fecha_entregado).reduce((s,p) =>
        s + differenceInDays(new Date(p.fecha_entregado!), new Date(p.fecha_pedido)), 0
      ) / entregados.filter(p=>p.fecha_entregado).length)
    : null

  const filtrados = pedidos.filter(p => {
    if (filtro === 'activos')    return p.estado !== 'Entregado'
    if (filtro === 'entregados') return p.estado === 'Entregado'
    return true
  })

  const s: React.CSSProperties  = { padding:'10px 14px', textAlign:'left', fontSize:13, color:'var(--text)', borderBottom:'1px solid var(--border)' }
  const sh: React.CSSProperties = { ...s, fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', background:'var(--surface2)' }

  return (
    <div style={{ maxWidth:900 }}>
      <button onClick={() => router.back()} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, marginBottom:20 }}>
        ← Volver
      </button>

      {/* Header */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20, marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:800, margin:0 }}>{cliente.nombre}</h1>
            <p style={{ color:'var(--text3)', margin:'4px 0 0', fontSize:13 }}>{totalPedidos} pedidos en total</p>
          </div>
          <Link href="/pedidos/nuevo" className="btn-primary">+ Nuevo pedido</Link>
        </div>

        {/* Stats */}
        <div className="client-stats" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginTop:16 }}>
          {[
            { label:'Pedidos activos',    value: activos.length,                     color:'var(--blue)' },
            { label:'Total metros',       value: `${totalMetros.toLocaleString()} m`, color:'var(--text)' },
            { label:'Valor histórico',    value: `$${Math.round(totalValor/1000)}K`,  color:'var(--accent)' },
            { label:'Prom. días entrega', value: promDias ? `${promDias}d` : '—',     color:'var(--text)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background:'var(--surface2)', borderRadius:6, padding:'12px 14px', border:'1px solid var(--border)' }}>
              <div style={{ fontSize:20, fontWeight:700, color }}>{value}</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtro */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {(['activos','todos','entregados'] as const).map(v => (
          <button key={v} onClick={() => setFiltro(v)} style={{
            padding:'7px 14px', fontSize:12, cursor:'pointer', border:'1px solid var(--border2)', borderRadius:6, textTransform:'capitalize',
            background: filtro===v ? 'var(--accent)' : 'var(--surface)',
            color: filtro===v ? '#0c0c0c' : 'var(--text2)',
            fontWeight: filtro===v ? 600 : 400,
          }}>{v}</button>
        ))}
      </div>

      {/* Tabla de pedidos */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={sh}>Folio</th>
              <th style={sh}>Fábrica</th>
              <th style={{ ...sh, textAlign:'right' }}>Metros</th>
              <th style={{ ...sh, textAlign:'right' }}>Valor</th>
              <th style={sh}>Estado</th>
              <th style={sh}>Riesgo</th>
              <th style={sh}>Compromiso</th>
              <th style={sh}>Entregado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(p => {
              const riesgo  = calcularRiesgo(p.fecha_compromiso, p.estado)
              const metros  = p.lineas_pedido.reduce((s,l) => s+l.metros_solicitados, 0)
              const valor   = p.lineas_pedido.reduce((s,l) => s+(metrosReales(l,p.estado)*l.precio), 0)
              const badge   = badgeStyle(p.estado)
              const rc      = riesgo==='atrasado'?'var(--red)':riesgo==='revisar'?'var(--yellow)':riesgo==='entregado'?'var(--text3)':'var(--accent)'
              const dias    = p.fecha_compromiso ? differenceInDays(new Date(p.fecha_compromiso), hoy) : null
              return (
                <tr key={p.id} style={{ cursor:'pointer' }}
                  onClick={() => router.push(`/pedidos/${p.id}`)}
                  onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                >
                  <td style={{ ...s, fontWeight:700 }}>{p.folio}</td>
                  <td style={{ ...s, color:'var(--text3)' }}>{p.fabrica}</td>
                  <td style={{ ...s, textAlign:'right', fontWeight:600 }}>{metros.toLocaleString()} m</td>
                  <td style={{ ...s, textAlign:'right', color:'var(--text2)' }}>{valor > 0 ? `$${Math.round(valor).toLocaleString()}` : '—'}</td>
                  <td style={s}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500, ...badge }}>{p.estado}</span>
                  </td>
                  <td style={{ ...s, fontSize:12, fontWeight:600, color:rc }}>{RIESGO_CONFIG[riesgo].label}</td>
                  <td style={{ ...s, fontSize:12, color: dias !== null && dias < 0 ? 'var(--red)' : 'var(--text3)' }}>
                    {p.fecha_compromiso ? format(new Date(p.fecha_compromiso),'dd MMM yy',{locale:es}) : '—'}
                    {dias !== null && p.estado !== 'Entregado' && (
                      <span style={{ marginLeft:4, fontSize:11 }}>({dias>=0?`${dias}d`:`${Math.abs(dias)}d venc.`})</span>
                    )}
                  </td>
                  <td style={{ ...s, fontSize:12, color:'var(--accent)' }}>
                    {p.fecha_entregado ? format(new Date(p.fecha_entregado),'dd MMM yy',{locale:es}) : '—'}
                  </td>
                </tr>
              )
            })}
            {filtrados.length === 0 && (
              <tr><td colSpan={8} style={{ ...s, textAlign:'center', padding:40, color:'var(--text3)' }}>Sin pedidos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
