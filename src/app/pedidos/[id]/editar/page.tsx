'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FABRICAS, ESTADOS_PEDIDO } from '@/lib/constants'

type Linea = { id?: string; tela: string; variante: string; metros_solicitados: string; precio: string; _delete?: boolean }
type Cliente = { id: string; nombre: string }

const lineaVacia = (): Linea => ({ tela:'', variante:'', metros_solicitados:'', precio:'' })

const S = {
  section: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20 } as React.CSSProperties,
  title:   { fontSize:11, fontWeight:600, color:'var(--text3)', textTransform:'uppercase' as const, letterSpacing:'0.5px', marginBottom:16 },
  grid2:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 } as React.CSSProperties,
  error:   { color:'var(--red)', fontSize:13, background:'#2a0e0e', border:'1px solid #5a1a1a', borderRadius:6, padding:'10px 14px' },
}

export default function EditarPedidoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(true)

  const [form, setForm] = useState({
    folio: '', cliente_id: '', fabrica: 'Asturcon', fecha_pedido: '',
    fecha_compromiso: '', fecha_entregado: '', estado: '📥 Nuevo pedido', notas: '',
  })
  const [lineas, setLineas] = useState<Linea[]>([])

  useEffect(() => {
    async function load() {
      const [{ data: clts }, { data: p }] = await Promise.all([
        supabase.from('clientes').select('id,nombre').order('nombre'),
        supabase.from('pedidos').select('*, lineas_pedido(*)').eq('id', id).single(),
      ])
      setClientes(clts ?? [])
      if (p) {
        setForm({
          folio:            p.folio ?? '',
          cliente_id:       p.cliente_id ?? '',
          fabrica:          p.fabrica,
          fecha_pedido:     p.fecha_pedido ?? '',
          fecha_compromiso: p.fecha_compromiso ?? '',
          fecha_entregado:  p.fecha_entregado ?? '',
          estado:           p.estado,
          notas:            p.notas ?? '',
        })
        setLineas(p.lineas_pedido.map((l: any) => ({
          id: l.id,
          tela: l.tela,
          variante: l.variante ?? '',
          metros_solicitados: String(l.metros_solicitados),
          precio: String(l.precio),
        })))
      }
      setLoading(false)
    }
    load()
  }, [id])

  function setLinea(i: number, field: keyof Linea, value: string) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }
  function markDelete(i: number) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, _delete: true } : l))
  }
  function restore(i: number) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, _delete: false } : l))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const active = lineas.filter(l => !l._delete)
    if (active.some(l => !l.tela || !l.metros_solicitados)) { setError('Completa tela y metros en todas las líneas'); return }
    setSaving(true)
    try {
      await supabase.from('pedidos').update({
        folio:            form.folio.trim(),
        cliente_id:       form.cliente_id,
        fabrica:          form.fabrica,
        fecha_pedido:     form.fecha_pedido || null,
        fecha_compromiso: form.fecha_compromiso || null,
        fecha_entregado:  form.fecha_entregado || null,
        estado:           form.estado,
        notas:            form.notas || null,
      }).eq('id', id)

      // Delete marked lines
      const toDelete = lineas.filter(l => l._delete && l.id)
      if (toDelete.length) await supabase.from('lineas_pedido').delete().in('id', toDelete.map(l => l.id!))

      // Update existing lines
      for (const l of lineas.filter(l => !l._delete && l.id)) {
        await supabase.from('lineas_pedido').update({
          tela: l.tela, variante: l.variante || null,
          metros_solicitados: parseFloat(l.metros_solicitados),
          precio: parseFloat(l.precio) || 0,
        }).eq('id', l.id!)
      }

      // Insert new lines
      const newLines = lineas.filter(l => !l._delete && !l.id)
      if (newLines.length) {
        await supabase.from('lineas_pedido').insert(newLines.map(l => ({
          pedido_id: id, tela: l.tela, variante: l.variante || null,
          metros_solicitados: parseFloat(l.metros_solicitados),
          precio: parseFloat(l.precio) || 0,
        })))
      }

      router.push(`/pedidos/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
      setSaving(false)
    }
  }

  if (loading) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>Cargando...</div>

  const activeLines = lineas.filter(l => !l._delete)
  const totalMetros = activeLines.reduce((s, l) => s + (parseFloat(l.metros_solicitados) || 0), 0)

  return (
    <div style={{ maxWidth:680 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => router.back()} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13 }}>← Volver</button>
        <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>Editar pedido</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div style={S.section}>
          <div style={S.title}>Datos del pedido</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={S.grid2}>
              <div>
                <label className="label">Folio</label>
                <input type="text" value={form.folio} onChange={e => setForm(f=>({...f,folio:e.target.value}))} className="input" required placeholder="Ej. M2601" />
              </div>
              <div>
                <label className="label">Fábrica</label>
                <select value={form.fabrica} onChange={e => setForm(f=>({...f,fabrica:e.target.value}))} className="input">
                  {FABRICAS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Cliente</label>
              <select value={form.cliente_id} onChange={e => setForm(f => ({...f, cliente_id:e.target.value}))} className="input" required>
                <option value="">Seleccionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Estado</label>
              <select value={form.estado} onChange={e => setForm(f=>({...f,estado:e.target.value}))} className="input">
                {ESTADOS_PEDIDO.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>

            <div style={S.grid2}>
              <div>
                <label className="label">Fecha pedido</label>
                <input type="date" value={form.fecha_pedido} onChange={e => setForm(f=>({...f,fecha_pedido:e.target.value}))} className="input" />
              </div>
              <div>
                <label className="label">Fecha compromiso</label>
                <input type="date" value={form.fecha_compromiso} onChange={e => setForm(f=>({...f,fecha_compromiso:e.target.value}))} className="input" />
              </div>
              <div>
                <label className="label">Fecha entregado</label>
                <input type="date" value={form.fecha_entregado} onChange={e => setForm(f=>({...f,fecha_entregado:e.target.value}))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea value={form.notas} onChange={e => setForm(f=>({...f,notas:e.target.value}))} className="input" style={{ height:72, resize:'none' }} />
            </div>
          </div>
        </div>

        <div style={S.section}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={S.title}>Telas — {activeLines.length} línea{activeLines.length !== 1 ? 's' : ''}</div>
            {totalMetros > 0 && <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600 }}>{totalMetros.toLocaleString()} m</span>}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {lineas.map((linea, i) => (
              <div key={i} style={{
                display:'grid', gridTemplateColumns:'3fr 2fr 1.5fr 1.5fr auto', gap:8, alignItems:'end',
                opacity: linea._delete ? 0.4 : 1,
              }}>
                <div>
                  {i === 0 && <label className="label">Tela</label>}
                  <input type="text" value={linea.tela} onChange={e => setLinea(i,'tela',e.target.value)}
                    placeholder="Ej. Molleton" className="input" disabled={linea._delete} required={!linea._delete} />
                </div>
                <div>
                  {i === 0 && <label className="label">Variante</label>}
                  <input type="text" value={linea.variante} onChange={e => setLinea(i,'variante',e.target.value)}
                    placeholder="Ej. Azul" className="input" disabled={linea._delete} />
                </div>
                <div>
                  {i === 0 && <label className="label">Metros</label>}
                  <input type="number" value={linea.metros_solicitados} onChange={e => setLinea(i,'metros_solicitados',e.target.value)}
                    placeholder="0" className="input" min="0" step="any" disabled={linea._delete} required={!linea._delete} />
                </div>
                <div>
                  {i === 0 && <label className="label">Precio $/m</label>}
                  <input type="number" value={linea.precio} onChange={e => setLinea(i,'precio',e.target.value)}
                    placeholder="0" className="input" min="0" step="any" disabled={linea._delete} />
                </div>
                <div style={{ paddingBottom:2 }}>
                  {linea._delete ? (
                    <button type="button" onClick={() => restore(i)}
                      style={{ background:'none', border:'1px solid var(--accent)', color:'var(--accent)', borderRadius:6, width:32, height:36, cursor:'pointer', fontSize:13 }}>↩</button>
                  ) : (
                    <button type="button" onClick={() => markDelete(i)}
                      style={{ background:'none', border:'1px solid var(--border2)', color:'var(--text3)', borderRadius:6, width:32, height:36, cursor:'pointer', fontSize:16 }}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setLineas(prev => [...prev, lineaVacia()])}
            style={{ marginTop:10, width:'100%', padding:'8px 0', background:'transparent', border:'1px dashed var(--border2)', color:'var(--text3)', borderRadius:6, cursor:'pointer', fontSize:13 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border2)'; e.currentTarget.style.color='var(--text3)' }}
          >+ Agregar línea</button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={{ display:'flex', gap:10 }}>
          <button type="submit" disabled={saving} className="btn-primary" style={{ flex:1, padding:'11px 0', fontSize:14 }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost" style={{ padding:'11px 20px' }}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
