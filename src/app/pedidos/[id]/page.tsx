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
type Acabado = {
  id: string; folio_proceso: string; tipo_proceso: string; proveedor: string
  metros_enviados: number; metros_recibidos: number | null; segundas: number | null
  fecha_envio: string; fecha_retorno_estimada: string | null; estado: string; notas: string | null
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
  acabados: Acabado[]
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
  type EditingField = 'metros_entregados' | 'metros_solicitados'
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

  async function load() {
    const [{ data: p }, { data: c }, { data: h }] = await Promise.all([
      supabase.from('pedidos').select('*, clientes(nombre), lineas_pedido(*), acabados(*)').eq('id', id).single(),
      supabase.from('comentarios').select('*').eq('pedido_id', id).order('created_at', { ascending: true }),
      supabase.from('estado_historial').select('*').eq('pedido_id', id).order('created_at', { ascending: true }),
    ])
    setPedido(p as Pedido)
    setComentarios((c as Comentario[]) ?? [])
    setHistorial((h as EstadoHistorial[]) ?? [])
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

  function startEdit(linea: LineaPedido, field: EditingField) {
    setEditingLinea(linea.id)
    setEditingField(field)
    setFieldInput(field === 'metros_entregados'
      ? (linea.metros_entregados?.toString() ?? '')
      : linea.metros_solicitados.toString()
    )
  }

  async function saveField(lineaId: string) {
    setSavingLinea(true)
    const val = fieldInput === '' ? null : parseFloat(fieldInput)
    // metros_solicitados cannot be null
    const update = editingField === 'metros_entregados'
      ? { metros_entregados: val }
      : { metros_solicitados: val ?? 0 }
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
  const totalEntreg  = pedido.lineas_pedido.reduce((s,l)=>s+(l.metros_entregados??0),0)
  // Valor de metros: metros × precio/m
  const totalValorMetros = lineasMetros.reduce((s,l)=>s+(l.metros_solicitados*l.precio),0)
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
            {pedido.fecha_compromiso && (
              <div style={{ color:'var(--text3)', marginBottom:3 }}>
                Compromiso: <span style={{ color:'var(--text)', fontWeight:500 }}>
                  {format(new Date(pedido.fecha_compromiso),'dd MMM yyyy',{locale:es})}
                </span>
              </div>
            )}
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
            <Link href={`/acabados/nuevo?pedido=${id}`} style={{
              fontSize:12, padding:'7px 14px', background:'var(--surface2)', border:'1px solid var(--border2)',
              color:'var(--text2)', borderRadius:6, textDecoration:'none',
            }}>
              + Acabado externo
            </Link>
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
            {totalValorMetros > 0 && <span>${totalValorMetros.toLocaleString()}</span>}
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
              <th style={{ textAlign:'left', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Tela</th>
              <th style={{ textAlign:'left', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Variante</th>
              <th style={{ textAlign:'right', padding:'6px 8px', color:'var(--text3)', fontWeight:500 }}>
                Metros <span style={{ opacity:0.5 }}>✏</span>
              </th>
              <th style={{ textAlign:'right', padding:'6px 8px', color:'var(--text3)', fontWeight:500 }}>
                Entregados <span style={{ opacity:0.5 }}>✏</span>
              </th>
              <th style={{ textAlign:'right', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>Pendiente</th>
              <th style={{ textAlign:'right', padding:'6px 0', color:'var(--text3)', fontWeight:500 }}>
                {lineasProducto.length > 0 ? 'Origen' : 'Precio'}
              </th>
            </tr>
          </thead>
          <tbody>
            {pedido.lineas_pedido.map(l => {
              const pendiente = l.metros_solicitados - (l.metros_entregados ?? 0)
              const isEditingSolic  = editingLinea === l.id && editingField === 'metros_solicitados'
              const isEditingEntreg = editingLinea === l.id && editingField === 'metros_entregados'
              const esProducto = l.tipo === 'producto'
              return (
                <tr key={l.id} style={{ borderBottom:'1px solid var(--border)', background: esProducto ? 'rgba(251,191,36,0.03)' : 'transparent' }}>
                  <td style={{ padding:'10px 0', fontWeight:600, color:'var(--text)' }}>
                    {esProducto && <span style={{ fontSize:10, marginRight:5, color:'#fbbf24' }}>📦</span>}
                    {l.tela}
                  </td>
                  <td style={{ padding:'10px 0', color:'var(--text3)' }}>{l.variante ?? '—'}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {isEditingSolic ? (
                      <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} />
                    ) : (
                      <EditableCell value={`${l.metros_solicitados.toLocaleString()} m`} onClick={() => startEdit(l, 'metros_solicitados')} color="var(--text)" title="Click para modificar metros" />
                    )}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {isEditingEntreg ? (
                      <InlineInput value={fieldInput} onChange={setFieldInput} onSave={() => saveField(l.id)} onCancel={cancelEdit} saving={savingLinea} />
                    ) : (
                      <EditableCell
                        value={l.metros_entregados != null ? `${l.metros_entregados.toLocaleString()} m` : '—'}
                        onClick={() => startEdit(l, 'metros_entregados')}
                        color={l.metros_entregados != null ? (l.metros_entregados >= l.metros_solicitados ? 'var(--accent)' : 'var(--yellow)') : 'var(--text3)'}
                        title="Click para registrar metros entregados"
                      />
                    )}
                  </td>
                  <td style={{ padding:'10px 0', textAlign:'right', color: pendiente > 0 ? 'var(--text2)' : 'var(--accent)', fontSize:12 }}>
                    {pendiente > 0 ? `${pendiente.toLocaleString()} m` : '✓'}
                  </td>
                  <td style={{ padding:'10px 0', textAlign:'right', color:'var(--text3)', fontSize:12 }}>
                    {esProducto
                      ? `${(l.unidades??0).toLocaleString()} u × ${l.consumo_por_unidad}m`
                      : (l.precio > 0 ? `$${l.precio}/m` : '—')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ fontSize:11, color:'var(--text3)', marginTop:10, opacity:0.6 }}>
          💡 Click en Metros para modificar · Click en Entregados para registrar entrega parcial · Enter guarda · Escape cancela
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

      {/* ── ACABADOS ─────────────────────────────────────── */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h2 style={{ fontSize:14, fontWeight:600, margin:0, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Acabados externos</h2>
          <Link href={`/acabados/nuevo?pedido=${id}`} className="btn-primary" style={{ fontSize:12, padding:'6px 12px' }}>
            + Agregar proceso
          </Link>
        </div>
        {pedido.acabados.length === 0 ? (
          <p style={{ textAlign:'center', color:'var(--text3)', padding:'20px 0', fontSize:13 }}>Sin acabados registrados</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pedido.acabados.map(a => (
              <Link key={a.id} href={`/acabados/${a.id}`} style={{
                display:'block', border:'1px solid var(--border)', borderRadius:6, padding:'10px 14px',
                textDecoration:'none', transition:'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor='var(--border2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor='var(--border)')}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:600, color:'var(--text)' }}>{a.folio_proceso}</span>
                    <span style={{ color:'var(--text3)', fontSize:12, marginLeft:8 }}>{a.tipo_proceso} · {a.proveedor}</span>
                  </div>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:500,
                    background: a.estado==='Recibido'?'#0e2a1a':a.estado==='Atrasado'?'#2a0e0e':'#0e1f3a',
                    color: a.estado==='Recibido'?'#4ade80':a.estado==='Atrasado'?'#f87171':'#60a5fa',
                  }}>{a.estado}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>
                  {a.metros_enviados.toLocaleString()} m enviados
                  {a.metros_recibidos != null && ` · ${a.metros_recibidos.toLocaleString()} m recibidos`}
                  {a.fecha_retorno_estimada && ` · Retorno: ${format(new Date(a.fecha_retorno_estimada),'dd MMM',{locale:es})}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Helper components ──────────────────────────────────────────────────────

function InlineInput({ value, onChange, onSave, onCancel, saving }: {
  value: string; onChange: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
      <input
        type="number" value={value} autoFocus
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key==='Enter') onSave(); if (e.key==='Escape') onCancel() }}
        style={{ width:80, padding:'4px 8px', background:'var(--surface2)', border:'1px solid var(--accent)', borderRadius:6, color:'var(--text)', fontSize:13, textAlign:'right' }}
        min="0" step="any"
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

function EditableCell({ value, onClick, color, title }: {
  value: string; onClick: () => void; color: string; title: string
}) {
  return (
    <button onClick={onClick} title={title} style={{
      background:'none', border:'none', cursor:'pointer', fontSize:13, textAlign:'right',
      color, padding:'4px 8px', borderRadius:6, transition:'background 0.1s', width:'100%',
    }}
      onMouseEnter={e => (e.currentTarget.style.background='var(--surface2)')}
      onMouseLeave={e => (e.currentTarget.style.background='transparent')}
    >
      {value} ✏
    </button>
  )
}
