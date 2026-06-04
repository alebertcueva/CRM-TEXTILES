'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TIPOS_PROCESO, PROVEEDORES_ACABADO } from '@/lib/constants'

type Linea = { id: string; tela: string; variante: string | null; metros_solicitados: number }
type Pedido = { id: string; folio: string; clientes: { nombre: string } | null; lineas_pedido: Linea[] }

function NuevoAcabadoForm() {
  const router = useRouter()
  const params = useSearchParams()
  const pedidoIdInicial = params.get('pedido') ?? ''

  const [pedidos, setPedidos]       = useState<Pedido[]>([])
  const [lineas, setLineas]         = useState<Linea[]>([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const [form, setForm] = useState({
    pedido_id:            pedidoIdInicial,
    linea_pedido_id:      '',
    tipo_proceso:         'Teñido',
    proveedor:            'La Maria',
    metros_enviados:      '',
    fecha_envio:          new Date().toISOString().split('T')[0],
    fecha_retorno_estimada: '',
    estado:               'En Proceso',
    notas:                '',
  })

  useEffect(() => {
    supabase.from('pedidos')
      .select('id,folio,clientes(nombre),lineas_pedido(id,tela,variante,metros_solicitados)')
      .neq('estado', 'Entregado')
      .order('fecha_pedido', { ascending: false })
      .then(({ data }) => {
        setPedidos((data as unknown as Pedido[]) ?? [])
        // If pedido pre-selected, load its lines
        if (pedidoIdInicial) {
          const p = (data as unknown as Pedido[])?.find(x => x.id === pedidoIdInicial)
          if (p) setLineas(p.lineas_pedido)
        }
      })
  }, [])

  function onPedidoChange(pedidoId: string) {
    setForm(f => ({ ...f, pedido_id: pedidoId, linea_pedido_id: '' }))
    const p = pedidos.find(x => x.id === pedidoId)
    setLineas(p?.lineas_pedido ?? [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.pedido_id)       { setError('Selecciona un pedido'); return }
    if (!form.metros_enviados) { setError('Ingresa los metros enviados'); return }
    setSaving(true)
    try {
      const { count } = await supabase.from('acabados').select('id', { count:'exact', head:true })
      const folio_proceso = `A${new Date().getFullYear().toString().slice(-2)}${String((count??0)+1).padStart(3,'0')}`
      const { error: err } = await supabase.from('acabados').insert({
        folio_proceso,
        pedido_id:            form.pedido_id,
        linea_pedido_id:      form.linea_pedido_id || null,
        tipo_proceso:         form.tipo_proceso,
        proveedor:            form.proveedor,
        metros_enviados:      parseFloat(form.metros_enviados),
        fecha_envio:          form.fecha_envio,
        fecha_retorno_estimada: form.fecha_retorno_estimada || null,
        estado:               form.estado,
        notas:                form.notas || null,
      })
      if (err) throw err
      router.back()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth:560 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13 }}>← Volver</button>
        <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>Nuevo acabado externo</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20, display:'flex', flexDirection:'column', gap:14 }}>

        {/* Pedido */}
        <div>
          <label className="label">Pedido</label>
          <select value={form.pedido_id} onChange={e => onPedidoChange(e.target.value)} className="input" required>
            <option value="">Seleccionar pedido...</option>
            {pedidos.map(p => (
              <option key={p.id} value={p.id}>{p.folio} — {p.clientes?.nombre ?? ''}</option>
            ))}
          </select>
        </div>

        {/* Línea de tela específica */}
        {lineas.length > 0 && (
          <div>
            <label className="label">Tela específica <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional — si el proceso es de una tela en particular)</span></label>
            <select value={form.linea_pedido_id} onChange={e => setForm(f=>({...f, linea_pedido_id:e.target.value}))} className="input">
              <option value="">Todo el pedido (sin especificar tela)</option>
              {lineas.map(l => (
                <option key={l.id} value={l.id}>
                  {l.tela}{l.variante ? ` — ${l.variante}` : ''} ({l.metros_solicitados.toLocaleString()} m)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Proceso y proveedor */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="label">Tipo de proceso</label>
            <select value={form.tipo_proceso} onChange={e => setForm(f=>({...f,tipo_proceso:e.target.value}))} className="input">
              {TIPOS_PROCESO.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Proveedor</label>
            <select value={form.proveedor} onChange={e => setForm(f=>({...f,proveedor:e.target.value}))} className="input">
              {PROVEEDORES_ACABADO.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Metros y estado */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="label">Metros enviados</label>
            <input type="number" value={form.metros_enviados} onChange={e => setForm(f=>({...f,metros_enviados:e.target.value}))}
              className="input" min="0" step="any" required placeholder="0" />
          </div>
          <div>
            <label className="label">Estado</label>
            <select value={form.estado} onChange={e => setForm(f=>({...f,estado:e.target.value}))} className="input">
              <option>En Proceso</option><option>Recibido</option><option>Atrasado</option>
            </select>
          </div>
        </div>

        {/* Fechas */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label className="label">Fecha de envío</label>
            <input type="date" value={form.fecha_envio} onChange={e => setForm(f=>({...f,fecha_envio:e.target.value}))} className="input" required />
          </div>
          <div>
            <label className="label">Retorno estimado</label>
            <input type="date" value={form.fecha_retorno_estimada} onChange={e => setForm(f=>({...f,fecha_retorno_estimada:e.target.value}))} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Notas</label>
          <textarea value={form.notas} onChange={e => setForm(f=>({...f,notas:e.target.value}))}
            className="input" style={{ height:68, resize:'none' }} placeholder="Observaciones..." />
        </div>

        {error && <p style={{ color:'var(--red)', fontSize:13, background:'#2a0e0e', border:'1px solid #5a1a1a', borderRadius:6, padding:'10px 14px' }}>{error}</p>}

        <div style={{ display:'flex', gap:10, paddingTop:4 }}>
          <button type="submit" disabled={saving} className="btn-primary" style={{ flex:1, padding:'11px 0', fontSize:14 }}>
            {saving ? 'Guardando...' : 'Guardar proceso'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost" style={{ padding:'11px 20px' }}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

export default function NuevoAcabadoPage() {
  return <Suspense><NuevoAcabadoForm /></Suspense>
}
