'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PROVEEDORES_ACABADO } from '@/lib/constants'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'

type Acabado = {
  id: string; folio_proceso: string; tipo_proceso: string; proveedor: string
  metros_enviados: number; metros_recibidos: number | null; segundas: number | null
  fecha_envio: string; fecha_retorno_estimada: string | null; fecha_retorno_real: string | null
  estado: string; notas: string | null
  pedidos: { folio: string; clientes: { nombre: string } | null } | null
}

function estadoBadge(estado: string) {
  if (estado === 'Recibido') return { background:'#0e2a1a', color:'#4ade80' }
  if (estado === 'Atrasado') return { background:'#2a0e0e', color:'#f87171' }
  return { background:'#0e1f3a', color:'#60a5fa' }
}

function AcabadosContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [acabados, setAcabados] = useState<Acabado[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado]       = useState(params.get('estado') ?? 'En Proceso')
  const [filtroProveedor, setFiltroProveedor] = useState(params.get('proveedor') ?? 'all')

  useEffect(() => {
    supabase.from('acabados').select('*,pedidos(folio,clientes(nombre))').order('fecha_envio', { ascending: false })
      .then(({ data }) => { setAcabados((data as unknown as Acabado[]) ?? []); setLoading(false) })
  }, [])

  // Sync URL params
  useEffect(() => {
    const p = params.get('proveedor')
    const e = params.get('estado')
    if (p) setFiltroProveedor(p)
    if (e) setFiltroEstado(e)
  }, [params])

  const filtrados = acabados.filter(a => {
    if (filtroProveedor !== 'all' && a.proveedor !== filtroProveedor) return false
    if (filtroEstado !== 'all' && a.estado !== filtroEstado) return false
    return true
  })

  const enProceso      = acabados.filter(a => a.estado === 'En Proceso')
  const atrasados      = acabados.filter(a => a.estado === 'Atrasado')
  const mermaTotal     = acabados.filter(a => a.metros_recibidos != null).reduce((s,a) =>
    s + Math.max(0, a.metros_enviados - (a.metros_recibidos??0) - (a.segundas??0)), 0)
  const metrosEnProceso = enProceso.reduce((s,a)=>s+a.metros_enviados,0)

  const paramProveedor = params.get('proveedor') ?? ''
  const paramEstadoURL = params.get('estado') ?? ''

  const chips = [
    paramProveedor && { label: `Proveedor: ${paramProveedor}`, clear: () => { setFiltroProveedor('all'); router.push('/acabados') }},
    paramEstadoURL && { label: `Estado: ${paramEstadoURL}`,   clear: () => { setFiltroEstado('En Proceso'); router.push('/acabados') }},
  ].filter(Boolean) as { label: string; clear: () => void }[]

  const s: React.CSSProperties  = { padding:'10px 14px', textAlign:'left', fontSize:13, color:'var(--text)', borderBottom:'1px solid var(--border)' }
  const sh: React.CSSProperties = { ...s, fontSize:11, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', background:'var(--surface2)' }

  const statCards = [
    { label:'En proceso',       value:enProceso.length,                   color:'var(--blue)',   onClick:() => setFiltroEstado('En Proceso') },
    { label:'Metros en proceso',value:`${metrosEnProceso.toLocaleString()} m`, color:'var(--text)', onClick:() => setFiltroEstado('En Proceso') },
    { label:'Atrasados',        value:atrasados.length,                   color:'var(--red)',    onClick:() => setFiltroEstado('Atrasado') },
    { label:'Merma total',      value:`${mermaTotal.toFixed(0)} m`,       color:'var(--yellow)', onClick:() => {} },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:0 }}>Acabados externos</h1>
        <Link href="/acabados/nuevo" className="btn-primary">+ Nuevo proceso</Link>
      </div>

      {/* Stats clickeables */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {statCards.map(({ label, value, color, onClick }) => (
          <div key={label} onClick={onClick} style={{
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8,
            padding:'14px 16px', cursor:'pointer', transition:'border-color 0.15s',
          }}
            onMouseEnter={e=>(e.currentTarget.style.borderColor=color)}
            onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}
          >
            <div style={{ fontSize:22, fontWeight:700, color }}>{value}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Chips */}
      {chips.length > 0 && (
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {chips.map(c => (
            <span key={c.label} style={{
              display:'flex', alignItems:'center', gap:6, fontSize:12, padding:'3px 10px',
              background:'var(--accent-dim)', color:'var(--accent)', borderRadius:99, border:'1px solid var(--accent)',
            }}>
              {c.label}
              <button onClick={c.clear} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:14, padding:0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="input" style={{ width:'auto' }}>
          <option value="all">Todos los proveedores</option>
          {PROVEEDORES_ACABADO.map(p => <option key={p}>{p}</option>)}
        </select>
        <div style={{ display:'flex', border:'1px solid var(--border2)', borderRadius:6, overflow:'hidden' }}>
          {['En Proceso','Atrasado','Recibido','all'].map(v => (
            <button key={v} onClick={() => setFiltroEstado(v)} style={{
              padding:'8px 12px', fontSize:12, cursor:'pointer', border:'none',
              background: filtroEstado===v ? 'var(--accent)' : 'var(--surface2)',
              color: filtroEstado===v ? '#0c0c0c' : 'var(--text2)',
              fontWeight: filtroEstado===v ? 600 : 400,
            }}>{v === 'all' ? 'Todos' : v}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text3)' }}>Cargando...</div>
      ) : (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
          <div className="table-scroll">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={sh}>Folio</th>
                <th style={sh}>Pedido</th>
                <th style={sh}>Proceso</th>
                <th style={sh}>Proveedor</th>
                <th style={{ ...sh, textAlign:'right' }}>Enviados</th>
                <th style={{ ...sh, textAlign:'right' }}>Recibidos</th>
                <th style={{ ...sh, textAlign:'right' }}>Merma</th>
                <th style={sh}>Envío</th>
                <th style={sh}>Retorno est.</th>
                <th style={sh}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(a => {
                const merma = a.metros_recibidos != null ? a.metros_enviados - a.metros_recibidos - (a.segundas??0) : null
                const pct   = merma != null ? (merma/a.metros_enviados*100).toFixed(1) : null
                const dias  = a.fecha_retorno_estimada && a.estado !== 'Recibido'
                  ? differenceInDays(new Date(), new Date(a.fecha_retorno_estimada)) : null
                const badge = estadoBadge(a.estado)
                return (
                  <tr key={a.id} style={{ cursor:'pointer' }}
                    onClick={() => router.push(`/acabados/${a.id}`)}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                  >
                    <td style={{ ...s, fontWeight:700 }}>{a.folio_proceso}</td>
                    <td style={{ ...s, color:'var(--text2)' }}>
                      {a.pedidos?.folio ?? '—'}
                      {a.pedidos?.clientes?.nombre && <span style={{ color:'var(--text3)', fontSize:12, marginLeft:4 }}>· {a.pedidos.clientes.nombre}</span>}
                    </td>
                    <td style={{ ...s, color:'var(--text2)' }}>{a.tipo_proceso}</td>
                    <td style={{ ...s, color:'var(--text2)' }}>{a.proveedor}</td>
                    <td style={{ ...s, textAlign:'right', fontWeight:600 }}>{a.metros_enviados.toLocaleString()} m</td>
                    <td style={{ ...s, textAlign:'right', color:'var(--text2)' }}>
                      {a.metros_recibidos != null ? `${a.metros_recibidos.toLocaleString()} m` : '—'}
                    </td>
                    <td style={{ ...s, textAlign:'right', color: merma && merma>0 ? 'var(--red)' : 'var(--text3)' }}>
                      {merma != null ? `${merma} m (${pct}%)` : '—'}
                    </td>
                    <td style={{ ...s, color:'var(--text3)', fontSize:12 }}>
                      {a.fecha_envio ? format(new Date(a.fecha_envio),'dd MMM',{locale:es}) : '—'}
                    </td>
                    <td style={{ ...s, color: dias != null && dias>0 ? 'var(--red)' : 'var(--text3)', fontSize:12 }}>
                      {a.fecha_retorno_estimada ? format(new Date(a.fecha_retorno_estimada),'dd MMM',{locale:es}) : '—'}
                      {dias != null && dias>0 && <span style={{ marginLeft:4, fontSize:11 }}>+{dias}d</span>}
                    </td>
                    <td style={s}>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500, ...badge }}>{a.estado}</span>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={10} style={{ ...s, textAlign:'center', padding:40, color:'var(--text3)' }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AcabadosPage() {
  return <Suspense><AcabadosContent /></Suspense>
}
