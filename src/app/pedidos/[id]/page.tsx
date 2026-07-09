'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ESTADOS_PEDIDO, RIESGO_CONFIG, calcularRiesgo } from '@/lib/constants'
import { format, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'

type LineaPedido = {
  id: string; tela: string; variante: string | null
  metros_solicitados: number; metros_entregados: number | null; precio: number
  tipo: 'metros' | 'producto'
  descripcion_producto: string | null
  unidades: number | null
  precio_unitario: number | null
  consumo_por_unidad: number | null
}
type Entrega = {
  id: string; linea_pedido_id: string; metros: number; fecha: string; notas: string | null; created_at: string
}
type Comentario = {
  id: string; texto: string; created_at: string
}
type EstadoHistorial = {
  id: string; estado_anterior: string | null; estado_nuevo: string; created_at: string
}
type Pedido = {
  id: string; folio: string; fabrica: string; estado: string
  fecha_pedido: string; fecha_compromiso: string | null; fecha_entregado: string | null
  notas: string | null
  clientes: { nombre: string } | null
  lineas_pedido: LineaPedido[]
}

function badgeStyle(estado: string) {
  const m: Record<string,{background:string;color:string}> = {
    '📥 Nuevo pedido':     {background:'#0e2a2a',color:'#5eead4'},
    '🏭 En producción':    {background:'#0e1f3a',color:'#60a5fa'},
    'En Acabado':          {background:'#0e1f3a',color:'#60a5fa'},
    'En acabado Externo':  {background:'#2a1f00',color:'#fbbf24'},
    'En revisión':         {background:'#2a0e1f',color:'#f472b6'},
    'Listo para entregar': {background:'#0e2a1a',color:'#4ade80'},
    'Entregado':           {background:'#1c1c1c',color:'#888'},
    '🔍 Verificando stock':{background:'#0e2a1a',color:'#4ade80'},
  }
  return m[estado] ?? {background:'var(--surface2)',color:'var(--text2)'}
}

export default function PedidoDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [pedido, setPedido]           = useState<Pedido | null>(null)
  const [loading, setLoading]         = useState(true)
  const [editingEstado, setEditingEstado] = useState(false)
  const [nuevoEstado, setNuevoEstado] = useState('')
  // Inline editing — tracks which linea+field is being edited
  type EditingField = 'metros_solicitados' | 'precio' | 'variante' | 'tela' | 'metros_entregados'
  const [editingLinea, setEditingLinea]   = useState<string | null>(null)
  const [editingField, setEditingField]   = useState<EditingField>('metros_entregados')
  const [fieldInput, setFieldInput]       = useState('')
  const [savingLinea, setSavingLinea]     = useState(false)
  // Comments
  const [comentarios, setComentarios]       = useState<Comentario[]>([])
  const [nuevoComentario, setNuevoComentario] = useState('')
  const [savingComment, setSavingComment]   = useState(false)
  // Estado historial
  const [historial, setHistorial]           = useState<EstadoHistorial[]>([])
  // Edición inline de fecha compromiso
  const [editingFecha, setEditingFecha]     = useState(false)
  const [fechaInput, setFechaInput]         = useState('')
  const [savingFecha, setSavingFecha]       = useState(false)
  // Entregas parciales
  const [entregas, setEntregas]             = useState<Record<string, Entrega[]>>({})
  const [addingEntrega, setAddingEntrega]   = useState<LineaPedido | null>(null)
  const [editingEntrega, setEditingEntrega] = useState<Entrega | null>(null)
  const [entregaMetros, setEntregaMetros]   = useState('')
  const [entregaFecha, setEntregaFecha]     = useState(new Date().toISOString().split('T')[0])
  const [entregaNotas, setEntregaNotas]     = useState('')
  const [savingEntrega, setSavingEntrega]   = useState(false)

  async function load() {
    const [{ data: p }, { data: c }, { data: h }] = await Promise.all([
      supabase.from('pedidos').select('*, clientes(nombre), lineas_pedido(*)').eq('id', id).single(),
      supabase.from('comentarios').select('*').eq('pedido_id', id).order('created_at', { ascending: true }),
      supabase.from('estado_historial').select('*').eq('pedido_id', id).order('created_at', { ascending: true }),
    ])
    setPedido(p as Pedido)
    setComentarios((c as Comentario[]) ?? [])
    setHistorial((h as EstadoHistorial[]) ?? [])
    // Cargar entregas de todas las líneas de este pedido
    const lineaIds = ((p as Pedido)?.lineas_pedido ?? []).map(l => l.id)
    if (lineaIds.length > 0) {
      const { data: e } = await supabase
        .from('entregas').select('*')
        .in('linea_pedido_id', lineaIds)
        .order('fecha', { ascending: true })
      const map: Record<string, Entrega[]> = {}
      ;(e ?? []).forEach((ent: Entrega) => {
        if (!map[ent.linea_pedido_id]) map[ent.linea_pedido_id] = []
        map[ent.linea_pedido_id].push(ent)
      })
      setEntregas(map)
    }
    setLoading(false)
  }

  async function agregarComentario(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoComentario.trim()) return
    setSavingComment(true)
    await supabase.from('comentarios').insert({ pedido_id: id, texto: nuevoComentario.trim() })
    setNuevoComentario('')
    setSavingComment(false)
    // Reload only comments
    const { data } = await supabase.from('comentarios').select('*').eq('pedido_id', id).order('created_at', { ascending: true })
    setComentarios((data as Comentario[]) ?? [])
  }

  async function borrarComentario(comentarioId: string) {
    await supabase.from('comentarios').delete().eq('id', comentarioId)
    setComentarios(prev => prev.filter(c => c.id !== comentarioId))
  }

  useEffect(() => { load() }, [id])

  async function agregarEntrega(e: React.FormEvent) {
    e.preventDefault()
    if (!addingEntrega || !entregaMetros) return
    setSavingEntrega(true)
    await supabase.from('entregas').insert({
      linea_pedido_id: addingEntrega.id,
      metros: parseFloat(entregaMetros),
      fecha: entregaFecha,
      notas: entregaNotas || null,
    })
    // Actualizar metros_entregados en la linea = suma de todas las entregas
    const nuevasEntregas = [...(entregas[addingEntrega.id] ?? []), { metros: parseFloat(entregaMetros) }]
    const nuevoTotal = nuevasEntregas.reduce((s, en) => s + en.metros, 0)
    await supabase.from('lineas_pedido').update({ metros_entregados: nuevoTotal }).eq('id', addingEntrega.id)
    setAddingEntrega(null); setEntregaMetros(''); setEntregaNotas('')
    setSavingEntrega(false)
    load()
  }

  async function guardarEdicionEntrega(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEntrega || !entregaMetros) return
    setSavingEntrega(true)
    await supabase.from('entregas').update({
      metros: parseFloat(entregaMetros),
      fecha: entregaFecha,
      notas: entregaNotas || null,
    }).eq('id', editingEntrega.id)
    // Recalcular metros_entregados en la linea
    const todasEntregas = (entregas[editingEntrega.linea_pedido_id] ?? []).map(en =>
      en.id === editingEntrega.id ? { ...en, metros: parseFloat(entregaMetros) } : en
    )
    const nuevoTotal = todasEntregas.reduce((s, en) => s + en.metros, 0)
    await supabase.from('lineas_pedido').update({ metros_entregados: nuevoTotal }).eq('id', editingEntrega.linea_pedido_id)
    setEditingEntrega(null); setEntregaMetros(''); setEntregaNotas('')
    setSavingEntrega(false)
    load()
  }

  async function borrarEntrega(entrega: Entrega) {
    await supabase.from('entregas').delete().eq('id', entrega.id)
    const restantes = (entregas[entrega.linea_pedido_id] ?? []).filter(e => e.id !== entrega.id)
    const nuevoTotal = restantes.reduce((s, e) => s + e.metros, 0)
    await supabase.from('lineas_pedido').update({ metros_entregados: nuevoTotal > 0 ? nuevoTotal : null }).eq('id', entrega.linea_pedido_id)
    load()
  }

  async function cambiarEstado() {
    const updates: Record<string, string | null> = { estado: nuevoEstado }
    if (nuevoEstado === 'Entregado' && !pedido?.fecha_entregado)
      updates.fecha_entregado = new Date().toISOString().split('T')[0]
    if (nuevoEstado !== 'Entregado' && pedido?.estado === 'Entregado')
      updates.fecha_entregado = null
    await Promise.all([
      supabase.from('pedidos').update(updates).eq('id', id),
      supabase.from('estado_historial').insert({
        pedido_id: id,
        estado_anterior: pedido?.estado ?? null,
        estado_nuevo: nuevoEstado,
      }),
    ])
    setEditingEstado(false)
    load()
  }

  async function guardarFechaCompromiso() {
    setSavingFecha(true)
    await supabase.from('pedidos').update({ fecha_compromiso: fechaInput || null }).eq('id', id)
    setSavingFecha(false)
    setEditingFecha(false)
    load()
  }

  function startEdit(linea: LineaPedido, field: EditingField) {
    setEditingLinea(linea.id)
    setEditingField(field)
    const val =
      field === 'metros_entregados' ? (linea.metros_entregados?.toString() ?? '') :
      field === 'metros_solicitados' ? linea.metros_solicitados.toString() :
      field === 'precio'    ? linea.precio.toString() :
      field === 'variante'  ? (linea.variante ?? '') :
      field === 'tela'      ? linea.tela : ''
    setFieldInput(val)
  }

  async function saveField(lineaId: string) {
    setSavingLinea(true)
    let update: Record<string, string | number | null>
    if (editingField === 'metros_entregados') {
      update = { metros_entregados: fieldInput === '' ? null : parseFloat(fieldInput) }
    } else if (editingField === 'metros_solicitados') {
      update = { metros_solicitados: parseFloat(fieldInput) || 0 }
    } else if (editingField === 'precio') {
      update = { precio: parseFloat(fieldInput) || 0 }
    } else if (editingField === 'variante') {
      update = { variante: fieldInput.trim() || null }
    } else {
      // tela
      update = { tela: fieldInput.trim() }
    }
    await supabase.from('lineas_pedido').update(update).eq('id', lineaId)
    setEditingLinea(null)
    setSavingLinea(false)
    load()
  }

  function cancelEdit() { setEditingLinea(null); setFieldInput('') }

  if (loading) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>Cargando...</div>
  if (!pedido)  return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>Pedido no encontrado</div>

  const riesgo       = calcularRiesgo(pedido.fecha_compromiso, pedido.estado)
  const rColor       = riesgo==='atrasado'?'var(--red)':riesgo==='revisar'?'var(--yellow)':riesgo==='entregado'?'var(--text3)':'var(--accent)'
  const lineasMetros   = pedido.lineas_pedido.filter(l => l.tipo !== 'producto')
  const lineasProducto = pedido.lineas_pedido.filter(l => l.tipo === 'producto')
  const totalSolic   = pedido.lineas_pedido.reduce((s,l)=>s+l.metros_solicitados,0)
  const metrosEntregadosPorLinea = (lineaId: string) =>
    (entregas[lineaId] ?? []).reduce((s, e) => s + e.metros, 0) || (pedido.lineas_pedido.find(l=>l.id===lineaId)?.metros_entregados ?? 0)
  const totalEntreg  = pedido.lineas_pedido.reduce((s,l)=>s+metrosEntregadosPorLinea(l.id),0)
  const esEntregado = pedido.estado === 'Entregado'
  // Entregado → metros reales; en curso → proyección con metros del pedido
  const totalValorMetros   = lineasMetros.reduce((s,l)=>s+((esEntregado && l.metros_entregados != null ? l.metros_entregados : l.metros_solicitados)*l.precio),0)
  const totalValorEstimado = lineasMetros.reduce((s,l)=>s+(l.metros_solicitados*l.precio),0)
  const valorDifiere       = esEntregado && totalValorMetros !== totalValorEstimado
  // Valor de productos: unidades × precio_unitario
  const totalValorProducto = lineasProducto.reduce((s,l)=>s+((l.unidades??0)*(l.precio_unitario??0)),0)
  const totalValor = totalValorMetros + totalValorProducto
  const pctEntrega   = totalSolic > 0 ? Math.round(totalEntreg/totalSolic*100) : 0
  const diasEntrega  = pedido.fecha_entregado && pedido.fecha_pedido
    ? differenceInDays(new Date(pedido.fecha_entregado), new Date(pedido.fecha_pedido)) : null

  const card: React.CSSProperties = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20, marginBottom:12 }
  const badge = badgeStyle(pedido.estado)

  return (
    <div style={{ maxWidth:800 }}>
      <button onClick={() => router.back()} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, marginBottom:20 }}>
        ← Volver
      </button>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:800, margin:0, letterSpacing:'-0.5px' }}>{pedido.folio}</h1>
            <p style={{ fontSize:16, color:'var(--text2)', margin:'4px 0 10px' }}>{pedido.clientes?.nombre}</p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:12, padding:'2px 10px', borderRadius:4, background:'var(--surface2)', color:'var(--text3)', border:'1px solid var(--border)' }}>
                {pedido.fabrica}
              </span>
              <span style={{ fontSize:12, padding:'2px 10px', borderRadius:99, fontWeight:600, ...badge }}>{pedido.estado}</span>
              <span style={{ fontSize:13, fontWeight:700, color:rColor }}>{RIESGO_CONFIG[riesgo].label}</span>
            </div>
          </div>

          {/* Fechas y métricas */}
          <div style={{ textAlign:'right', fontSize:13 }}>
            <div style={{ color:'var(--text3)', marginBottom:3 }}>
              Pedido: <span style={{ color:'var(--text)', fontWeight:500 }}>
                {format(new Date(pedido.fecha_pedido),'dd MMM yyyy',{locale:es})}
              </span>
            </div>
            <div style={{ color:'var(--text3)', marginBottom:3, display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
              Compromiso:
              {editingFecha ? (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                  <input type="date" value={fechaInput} onChange={e => setFechaInput(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter') guardarFechaCompromiso(); if (e.key==='Escape') setEditingFecha(false) }}
                    autoFocus
                    style={{ background:'var(--surface2)', border:'1px solid var(--accent)', borderRadius:5, color:'var(--text)', fontSize:12, padding:'3px 8px' }}
                  />
                  <button onClick={guardarFechaCompromiso} disabled={savingFecha}
                    style={{ background:'var(--accent)', border:'none', color:'#0c0c0c', borderRadius:4, padding:'3px 8px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    {savingFecha ? '...' : '✓'}
                  </button>
                  <button onClick={() => setEditingFecha(false)}
                    style={{ background:'none', border:'1px solid var(--border2)', color:'var(--text3)', borderRadius:4, padding:'3px 6px', fontSize:12, cursor:'pointer' }}>
                    ✕
                  </button>
                </span>
              ) : (
                <button onClick={() => { setFechaInput(pedido.fecha_compromiso ?? ''); setEditingFecha(true) }}
                  title="Click para editar fecha compromiso"
                  style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 6px', borderRadius:4, fontSize:13, color:'var(--text)', fontWeight:500, transition:'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
                  onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                >
                  {pedido.fecha_compromiso
                    ? `${format(new Date(pedido.fecha_compromiso),'dd MMM yyyy',{locale:es})} ✏`
                    : <span style={{ color:'var(--text3)', fontStyle:'italic' }}>Sin fecha ✏</span>
                  }
                </button>
              )}
            </div>
            {pedido.fecha_entregado && (
              <div style={{ color:'var(--text3)', marginBottom:3 }}>
                Entregado: <span style={{ color:'var(--accent)', fontWeight:600 }}>
                  {format(new Date(pedido.fecha_entregado),'dd MMM yyyy',{locale:es})}
                </span>
              </div>
            )}
            {diasEntrega !== null && (
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:6, padding:'3px 8px', background:'var(--surface2)', borderRadius:6, display:'inline-block' }}>
                ⏱ {diasEntrega} días de entrega
              </div>
            )}
          </div>
        </div>

        {pedido.notas && (
          <p style={{ marginTop:12, fontSize:13, color:'var(--text2)', background:'var(--surface2)', borderRadius:6, padding:'8px 12px', border:'1px solid var(--border)' }}>
            {pedido.notas}
          </p>
        )}

        {/* Cambiar estado */}
        {editingEstado ? (
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)} className="input" style={{ flex:1 }}>
              {ESTADOS_PEDIDO.map(e => <option key={e}>{e}</option>)}
            </select>
            <button onClick={cambiarEstado} className="btn-primary">Guardar</button>
            <button onClick={() => setEditingEstado(false)} className="btn-ghost">Cancelar</button>
          </div>
        ) : (
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={() => { setNuevoEstado(pedido.estado); setEditingEstado(true) }} className="btn-ghost" style={{ fontSize:12 }}>
              Cambiar estado
            </button>
            <button onClick={async () => {
              if (!confirm(`¿Eliminar el pedido ${pedido.folio}? Esta acción no se puede deshacer.`)) return
              await supabase.from('pedidos').delete().eq('id', id)
              router.push('/pedidos')
            }} style={{ fontSize:12, padding:'7px 14px', background:'none', border:'1px solid rgba(239,68,68,0.3)',
              color:'var(--red)', borderRadius:6, cursor:'pointer' }}>
              Eliminar
            </button>
          </div>
        )}
      </div>

      {/* ── PRODUCTOS TERMINADOS (vista cliente) ─────────── */}
      {lineasProducto.length > 0 && (
        <div style={{ ...card, border:'1px solid #4a3800' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h2 style={{ fontSize:14, fontWeight:600, margin:0, color:'#fbbf24', textTransform:'uppercase', letterSpacing:'0.5px' }}>
              📦 Vista cliente — Producto terminado
            </h2>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>
              ${totalValorProducto.toLocaleString()}
            </span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                <th style={{ textAlign:'left', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Producto</th>
                <th style={{ textAlign:'right', padding:'6px 8px', color:'var(--text3)', fontWeight:500 }}>Unidades <span style={{ opacity:0.5 }}>✏</span></th>
                <th style={{ textAlign:'right', padding:'6px 8px', color:'var(--text3)', fontWeight:500 }}>Precio/u</th>
                <th style={{ textAlign:'right', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Total cliente</th>
                <th style={{ textAlign:'right', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Tela / Consumo</th>
              </tr>
            </thead>
            <tbody>
              {lineasProducto.map(l => {
                const totalLinea = (l.unidades??0) * (l.precio_unitario??0)
                const isEditingU = editingLinea === l.id && editingField === 'metros_solicitados'
                return (
                  <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'10px 0', fontWeight:600, color:'var(--text)' }}>{l.descripcion_producto ?? l.tela}</td>
                    <td style={{ padding:'4px 8px', textAlign:'right' }}>
                      {isEditingU ? (
                        <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} />
                      ) : (
                        <EditableCell value={`${(l.unidades??0).toLocaleString()} u`} onClick={() => startEdit(l, 'metros_solicitados')} color="var(--text)" title="Click para modificar unidades" />
                      )}
                    </td>
                    <td style={{ padding:'10px 8px', textAlign:'right', color:'var(--text2)' }}>${(l.precio_unitario??0).toLocaleString()}</td>
                    <td style={{ padding:'10px 0', textAlign:'right', fontWeight:700, color:'var(--accent)' }}>${totalLinea.toLocaleString()}</td>
                    <td style={{ padding:'10px 0', textAlign:'right', color:'var(--text3)', fontSize:12 }}>
                      {l.tela}{l.variante ? ` — ${l.variante}` : ''} · {l.consumo_por_unidad}m/u = {l.metros_solicitados.toLocaleString()}m
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TELAS / PRODUCCIÓN ───────────────────────────── */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:0, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>
            {lineasProducto.length > 0 ? '🏭 Producción — Telas' : 'Telas'}
          </h2>
          <div style={{ display:'flex', gap:16, fontSize:13, color:'var(--text3)' }}>
            <span>{totalSolic.toLocaleString()} m totales</span>
            {totalEntreg > 0 && (
              <span style={{ color: pctEntrega >= 100 ? 'var(--accent)' : 'var(--yellow)', fontWeight:600 }}>
                {totalEntreg.toLocaleString()} m entregados ({pctEntrega}%)
              </span>
            )}
            {totalValorMetros > 0 && (
              <span>
                ${totalValorMetros.toLocaleString()}
                {valorDifiere && (
                  <span title={`Pedido original: $${totalValorEstimado.toLocaleString()}`}
                    style={{ marginLeft:6, fontSize:11, color:'var(--yellow)' }}>
                    (pedido: ${totalValorEstimado.toLocaleString()})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {totalEntreg > 0 && (
          <div style={{ height:4, background:'var(--surface2)', borderRadius:99, marginBottom:14, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min(pctEntrega,100)}%`, background: pctEntrega>=100?'var(--accent)':'var(--yellow)', borderRadius:99, transition:'width 0.3s' }} />
          </div>
        )}

        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              <th style={{ textAlign:'left', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Tela <span style={{ opacity:0.4 }}>✏</span></th>
              <th style={{ textAlign:'left', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Variante / Color <span style={{ opacity:0.4 }}>✏</span></th>
              <th style={{ textAlign:'right', padding:'6px 8px', color:'var(--text3)', fontWeight:500 }}>Metros <span style={{ opacity:0.4 }}>✏</span></th>
              <th style={{ textAlign:'right', padding:'6px 8px', color:'var(--text3)', fontWeight:500 }}>Entregados <span style={{ opacity:0.4 }}>✏</span></th>
              <th style={{ textAlign:'right', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Pendiente</th>
              <th style={{ textAlign:'right', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>
                {lineasProducto.length > 0 ? 'Origen' : <span>Precio $/m <span style={{ opacity:0.4 }}>✏</span></span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {pedido.lineas_pedido.map(l => {
              const totalEntregL = metrosEntregadosPorLinea(l.id)
              const pendiente = l.metros_solicitados - totalEntregL
              const isEditingSolic   = editingLinea === l.id && editingField === 'metros_solicitados'
              const isEditingTela    = editingLinea === l.id && editingField === 'tela'
              const isEditingVariant = editingLinea === l.id && editingField === 'variante'
              const isEditingPrecio  = editingLinea === l.id && editingField === 'precio'
              const esProducto = l.tipo === 'producto'
              return (
                <tr key={l.id} style={{ borderBottom:'1px solid var(--border)', background: esProducto ? 'rgba(251,191,36,0.03)' : 'transparent' }}>
                  <td style={{ padding:'4px 0' }}>
                    {isEditingTela ? (
                      <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} type="text" />
                    ) : (
                      <EditableCell
                        value={<>{esProducto && <span style={{ fontSize:10, marginRight:5, color:'#fbbf24' }}>📦</span>}{l.tela}</>}
                        onClick={() => startEdit(l, 'tela')}
                        color="var(--text)" fontWeight={600} title="Click para editar tela"
                      />
                    )}
                  </td>
                  <td style={{ padding:'4px 0' }}>
                    {isEditingVariant ? (
                      <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} type="text" placeholder="Color o variante..." />
                    ) : (
                      <EditableCell
                        value={l.variante ?? '—'}
                        onClick={() => startEdit(l, 'variante')}
                        color="var(--text3)" title="Click para editar variante / color"
                      />
                    )}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {isEditingSolic ? (
                      <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} />
                    ) : (
                      <EditableCell value={`${l.metros_solicitados.toLocaleString()} m`} onClick={() => startEdit(l, 'metros_solicitados')} color="var(--text)" title="Click para modificar metros" />
                    )}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                      <span style={{ fontSize:13, fontWeight: totalEntregL > 0 ? 600 : 400,
                        color: totalEntregL >= l.metros_solicitados ? 'var(--accent)' : totalEntregL > 0 ? 'var(--yellow)' : 'var(--text3)' }}>
                        {totalEntregL > 0 ? `${totalEntregL.toLocaleString()} m` : '—'}
                      </span>
                      {l.tipo !== 'producto' && (
                        <button onClick={() => { setAddingEntrega(l); setEntregaMetros(''); setEntregaFecha(new Date().toISOString().split('T')[0]); setEntregaNotas('') }}
                          title="Registrar entrega parcial"
                          style={{ fontSize:11, padding:'2px 7px', borderRadius:99, border:'1px solid var(--border2)',
                            background:'var(--surface2)', color:'var(--text2)', cursor:'pointer', whiteSpace:'nowrap' }}>
                          +
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding:'10px 0', textAlign:'right', color: pendiente > 0 ? 'var(--text2)' : 'var(--accent)', fontSize:12 }}>
                    {pendiente > 0 ? `${pendiente.toLocaleString()} m` : '✓'}
                  </td>
                  <td style={{ padding:'4px 0', textAlign:'right', fontSize:12 }}>
                    {esProducto ? (
                      <span style={{ color:'var(--text3)' }}>{(l.unidades??0).toLocaleString()} u × {l.consumo_por_unidad}m</span>
                    ) : isEditingPrecio ? (
                      <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} type="number" />
                    ) : (
                      <EditableCell
                        value={l.precio > 0 ? `$${l.precio}/m` : '— $/m'}
                        onClick={() => startEdit(l, 'precio')}
                        color="var(--text3)" title="Click para editar precio por metro"
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* Historial de entregas por línea */}
        {lineasMetros.some(l => (entregas[l.id] ?? []).length > 0 || (l.metros_entregados != null && l.metros_entregados > 0 && (entregas[l.id] ?? []).length === 0)) && (
          <div style={{ marginTop:14, borderTop:'1px solid var(--border)', paddingTop:14, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Historial de entregas</div>
            {lineasMetros.filter(l => (entregas[l.id] ?? []).length > 0 || (l.metros_entregados != null && l.metros_entregados > 0)).map(l => {
              const tieneEntregas = (entregas[l.id] ?? []).length > 0
              const esLegacy = !tieneEntregas && l.metros_entregados != null && l.metros_entregados > 0
              return (
                <div key={l.id}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', marginBottom:4 }}>
                    {l.tela}{l.variante ? ` — ${l.variante}` : ''}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {/* Entradas nuevas (tabla entregas) */}
                    {(entregas[l.id] ?? []).map(en => (
                      <span key={en.id} style={{ display:'inline-flex', alignItems:'center', gap:5,
                        background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:12 }}>
                        <span style={{ color:'var(--accent)', fontWeight:600 }}>{en.metros.toLocaleString()} m</span>
                        <span style={{ color:'var(--text3)' }}>{format(new Date(en.fecha), 'dd MMM yy', { locale: es })}</span>
                        {en.notas && <span style={{ color:'var(--text3)' }}>· {en.notas}</span>}
                        <button onClick={() => { setEditingEntrega(en); setEntregaMetros(String(en.metros)); setEntregaFecha(en.fecha); setEntregaNotas(en.notas ?? '') }}
                          title="Editar entrega"
                          style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:11, padding:0, lineHeight:1 }}
                          onMouseEnter={e => (e.currentTarget.style.color='var(--text)')}
                          onMouseLeave={e => (e.currentTarget.style.color='var(--text3)')}>✏</button>
                        <button onClick={() => borrarEntrega(en)}
                          style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}
                          onMouseEnter={e => (e.currentTarget.style.color='var(--red)')}
                          onMouseLeave={e => (e.currentTarget.style.color='var(--text3)')}>✕</button>
                      </span>
                    ))}
                    {/* Entrada legacy (metros_entregados directo en la línea) */}
                    {esLegacy && (
                      editingLinea === l.id && editingField === 'metros_entregados' ? (
                        <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} />
                      ) : (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5,
                          background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 10px', fontSize:12 }}>
                          <span style={{ color:'var(--accent)', fontWeight:600 }}>{l.metros_entregados!.toLocaleString()} m</span>
                          <button onClick={() => startEdit(l, 'metros_entregados')}
                            title="Editar metros entregados"
                            style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:11, padding:0, lineHeight:1 }}
                            onMouseEnter={e => (e.currentTarget.style.color='var(--text)')}
                            onMouseLeave={e => (e.currentTarget.style.color='var(--text3)')}>✏</button>
                        </span>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p style={{ fontSize:11, color:'var(--text3)', marginTop:10, opacity:0.6 }}>
          💡 Click en Metros para modificar · Botón + para registrar entrega parcial · Enter guarda · Escape cancela
        </p>
      </div>

      {/* ── HISTORIAL DE ESTADOS ─────────────────────────── */}
      {historial.length > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:'0 0 14px', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Historial de estados
          </h2>
          <div style={{ position:'relative', paddingLeft:20 }}>
            {/* Vertical line */}
            <div style={{ position:'absolute', left:6, top:6, bottom:6, width:1, background:'var(--border)' }} />
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {historial.map((h, i) => (
                <div key={h.id} style={{ display:'flex', alignItems:'flex-start', gap:10, position:'relative' }}>
                  {/* Dot */}
                  <div style={{ width:10, height:10, borderRadius:'50%', background: i===historial.length-1 ? 'var(--accent)' : 'var(--border2)', border:'2px solid var(--surface)', flexShrink:0, marginTop:3, marginLeft:-2 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {h.estado_anterior && (
                        <>
                          <span style={{ fontSize:12, padding:'1px 8px', borderRadius:99, ...badgeStyle(h.estado_anterior) }}>{h.estado_anterior}</span>
                          <span style={{ color:'var(--text3)', fontSize:12 }}>→</span>
                        </>
                      )}
                      <span style={{ fontSize:12, padding:'1px 8px', borderRadius:99, fontWeight:600, ...badgeStyle(h.estado_nuevo) }}>{h.estado_nuevo}</span>
                    </div>
                    <span style={{ fontSize:11, color:'var(--text3)', marginTop:2, display:'block' }}>
                      {format(new Date(h.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── COMENTARIOS ──────────────────────────────────── */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20, marginTop:0 }}>
        <h2 style={{ fontSize:14, fontWeight:600, margin:'0 0 16px', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>
          Comentarios {comentarios.length > 0 && <span style={{ color:'var(--text3)', fontWeight:400 }}>({comentarios.length})</span>}
        </h2>

        {comentarios.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
            {comentarios.map(c => (
              <div key={c.id} style={{
                display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12,
                padding:'10px 14px', background:'var(--surface2)', borderRadius:6, border:'1px solid var(--border)',
              }}>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:13, color:'var(--text)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.texto}</p>
                  <span style={{ fontSize:11, color:'var(--text3)', marginTop:4, display:'block' }}>
                    {format(new Date(c.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                  </span>
                </div>
                <button onClick={() => borrarComentario(c.id)} title="Borrar"
                  style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:14, padding:'2px 4px', borderRadius:4, flexShrink:0, lineHeight:1 }}
                  onMouseEnter={e => (e.currentTarget.style.color='var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color='var(--text3)')}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={agregarComentario} style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <textarea
            value={nuevoComentario} onChange={e => setNuevoComentario(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) agregarComentario(e as any) }}
            placeholder="Agregar un comentario... (Ctrl+Enter para enviar)"
            className="input" style={{ height:72, resize:'none' }}
          />
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button type="submit" disabled={savingComment || !nuevoComentario.trim()} className="btn-primary" style={{ fontSize:12, padding:'7px 16px' }}>
              {savingComment ? 'Guardando...' : 'Agregar comentario'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal editar entrega */}
      {editingEntrega && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setEditingEntrega(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:'16px 16px 0 0',
            padding:24, width:'100%', maxWidth:480, boxShadow:'0 -8px 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'var(--border2)', borderRadius:99, margin:'0 auto 20px' }} />
            <h2 style={{ fontSize:16, fontWeight:700, margin:'0 0 18px' }}>Editar entrega</h2>
            <form onSubmit={guardarEdicionEntrega} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label className="label">Metros entregados</label>
                <input type="number" value={entregaMetros} onChange={e => setEntregaMetros(e.target.value)}
                  className="input" autoFocus min="0" step="any" required />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input type="date" value={entregaFecha} onChange={e => setEntregaFecha(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">Notas <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional)</span></label>
                <input type="text" value={entregaNotas} onChange={e => setEntregaNotas(e.target.value)} className="input" placeholder="Ej. 1ª remesa..." />
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button type="submit" disabled={savingEntrega} className="btn-primary" style={{ flex:1, padding:'13px 0', fontSize:15 }}>
                  {savingEntrega ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button type="button" onClick={() => setEditingEntrega(null)} className="btn-ghost" style={{ padding:'13px 16px' }}>✕</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nueva entrega */}
      {addingEntrega && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setAddingEntrega(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:'16px 16px 0 0',
            padding:24, width:'100%', maxWidth:480, boxShadow:'0 -8px 40px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'var(--border2)', borderRadius:99, margin:'0 auto 20px' }} />
            <h2 style={{ fontSize:16, fontWeight:700, margin:'0 0 4px' }}>Registrar entrega</h2>
            <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 18px' }}>
              {addingEntrega.tela}{addingEntrega.variante ? ` — ${addingEntrega.variante}` : ''}
              {' · '}{addingEntrega.metros_solicitados.toLocaleString()} m solicitados
            </p>
            <form onSubmit={agregarEntrega} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label className="label">Metros entregados</label>
                <input type="number" value={entregaMetros} onChange={e => setEntregaMetros(e.target.value)}
                  className="input" autoFocus min="0" step="any" required placeholder="0" />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input type="date" value={entregaFecha} onChange={e => setEntregaFecha(e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">Notas <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional)</span></label>
                <input type="text" value={entregaNotas} onChange={e => setEntregaNotas(e.target.value)} className="input" placeholder="Ej. 1ª remesa, color revisado..." />
              </div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button type="submit" disabled={savingEntrega} className="btn-primary" style={{ flex:1, padding:'13px 0', fontSize:15 }}>
                  {savingEntrega ? 'Guardando...' : 'Registrar entrega'}
                </button>
                <button type="button" onClick={() => setAddingEntrega(null)} className="btn-ghost" style={{ padding:'13px 16px' }}>✕</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper components ──────────────────────────────────────────────────────

function InlineInput({ value, onChange, onSave, onCancel, saving, type = 'number', placeholder }: {
  value: string; onChange: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean
  type?: 'number' | 'text'; placeholder?: string
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
      <input
        type={type} value={value} autoFocus placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key==='Enter') onSave(); if (e.key==='Escape') onCancel() }}
        style={{ width: type === 'text' ? 130 : 80, padding:'4px 8px', background:'var(--surface2)', border:'1px solid var(--accent)', borderRadius:6, color:'var(--text)', fontSize:13, textAlign: type === 'number' ? 'right' : 'left' }}
        min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined}
      />
      <button onClick={onSave} disabled={saving}
        style={{ background:'var(--accent)', border:'none', color:'#0c0c0c', borderRadius:5, padding:'4px 9px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
        ✓
      </button>
      <button onClick={onCancel}
        style={{ background:'none', border:'1px solid var(--border2)', color:'var(--text3)', borderRadius:5, padding:'4px 7px', fontSize:12, cursor:'pointer' }}>
        ✕
      </button>
    </div>
  )
}

function EditableCell({ value, onClick, color, title, fontWeight }: {
  value: React.ReactNode; onClick: () => void; color: string; title: string; fontWeight?: number
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background:'none', border:'none', cursor:'pointer', fontSize:13, textAlign:'left',
      color, fontWeight: fontWeight ?? 400,
      padding:'6px 8px', borderRadius:6, transition:'background 0.1s', width:'100%', display:'block',
    }}
      onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
      onMouseLeave={e => (e.currentTarget.style.background='transparent')}
    >
      {value} <span style={{ opacity:0.4, fontSize:11 }}>✏</span>
    </button>
  )
}
