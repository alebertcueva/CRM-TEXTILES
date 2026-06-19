'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FABRICAS, ESTADOS_PEDIDO } from '@/lib/constants'

type Linea = {
  tipo: 'metros' | 'producto'
  tela: string
  variante: string
  metros_solicitados: string
  precio: string
  // producto terminado
  descripcion_producto: string
  unidades: string
  precio_unitario: string
  consumo_por_unidad: string
}

type Cliente = { id: string; nombre: string }

const lineaVacia = (): Linea => ({
  tipo: 'metros', tela: '', variante: '', metros_solicitados: '', precio: '',
  descripcion_producto: '', unidades: '', precio_unitario: '', consumo_por_unidad: '',
})

const S = {
  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 } as React.CSSProperties,
  title: { fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,
  // note: apply className="form-grid-2" alongside style={S.grid2}
  error: { color: 'var(--red)', fontSize: 13, background: '#2a0e0e', border: '1px solid #5a1a1a', borderRadius: 6, padding: '10px 14px' },
}

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [savingCliente, setSavingCliente] = useState(false)
  const [form, setForm] = useState({
    folioMode: 'auto' as 'auto' | 'manual',
    folioManual: '',
    cliente_id: '', fabrica: 'Asturcon',
    fecha_pedido: new Date().toISOString().split('T')[0],
    fecha_compromiso: '', estado: '📥 Nuevo pedido', notas: '',
  })
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])

  useEffect(() => {
    supabase.from('clientes').select('id,nombre').order('nombre').then(({ data }) => setClientes(data ?? []))
  }, [])

  async function crearCliente(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault()
    if (!nuevoClienteNombre.trim()) return
    setSavingCliente(true)
    const { data } = await supabase.from('clientes').insert({ nombre: nuevoClienteNombre.trim() }).select().single()
    if (data) {
      setClientes(prev => [...prev, data as Cliente].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setForm(f => ({ ...f, cliente_id: (data as Cliente).id }))
    }
    setNuevoClienteNombre('')
    setCreandoCliente(false)
    setSavingCliente(false)
  }

  function setLinea(i: number, field: keyof Linea, value: string) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function toggleTipo(i: number) {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, tipo: l.tipo === 'metros' ? 'producto' : 'metros' } : l))
  }

  // metros auto-calculated for producto lines
  function metrosProducto(l: Linea) {
    const u = parseFloat(l.unidades) || 0
    const c = parseFloat(l.consumo_por_unidad) || 0
    return u * c
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.cliente_id) { setError('Selecciona un cliente'); return }
    for (const l of lineas) {
      if (!l.tela) { setError('Todas las líneas necesitan una tela'); return }
      if (l.tipo === 'metros' && !l.metros_solicitados) { setError('Completa los metros en todas las líneas de tipo metros'); return }
      if (l.tipo === 'producto' && (!l.unidades || !l.consumo_por_unidad)) { setError('Completa unidades y consumo en líneas de producto terminado'); return }
    }
    setSaving(true)
    try {
      let folio: string
      if (form.folioMode === 'manual') {
        if (!form.folioManual.trim()) { setError('Ingresa el número de folio'); setSaving(false); return }
        folio = form.folioManual.trim().toUpperCase()
      } else {
        const yy = new Date().getFullYear().toString().slice(-2)
        const prefix = `P${yy}`
        const { data: ultimos } = await supabase.from('pedidos')
          .select('folio').ilike('folio', `${prefix}%`).order('folio', { ascending: false }).limit(1)
        const ultimo = ultimos?.[0]?.folio
        const siguienteNum = ultimo ? (parseInt(ultimo.replace(prefix, '')) || 0) + 1 : 1
        folio = `${prefix}${String(siguienteNum).padStart(3, '0')}`
      }
      const { data: pedido, error: pErr } = await supabase.from('pedidos').insert({
        folio, cliente_id: form.cliente_id, fabrica: form.fabrica,
        fecha_pedido: form.fecha_pedido, fecha_compromiso: form.fecha_compromiso || null,
        estado: form.estado, notas: form.notas || null,
      }).select().single()
      if (pErr) throw new Error(pErr.message ?? pErr.code ?? JSON.stringify(pErr))

      await supabase.from('lineas_pedido').insert(lineas.map(l => ({
        pedido_id: pedido.id,
        tipo: l.tipo,
        tela: l.tela,
        variante: l.variante || null,
        metros_solicitados: l.tipo === 'metros' ? parseFloat(l.metros_solicitados) : metrosProducto(l),
        precio: l.tipo === 'metros' ? (parseFloat(l.precio) || 0) : 0,
        descripcion_producto: l.tipo === 'producto' ? (l.descripcion_producto || null) : null,
        unidades: l.tipo === 'producto' ? (parseFloat(l.unidades) || null) : null,
        precio_unitario: l.tipo === 'producto' ? (parseFloat(l.precio_unitario) || null) : null,
        consumo_por_unidad: l.tipo === 'producto' ? (parseFloat(l.consumo_por_unidad) || null) : null,
      })))
      router.push(`/pedidos/${pedido.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? JSON.stringify(err)
      setError(msg || 'Error al guardar')
      setSaving(false)
    }
  }

  const totalMetros = lineas.reduce((s, l) =>
    s + (l.tipo === 'metros' ? (parseFloat(l.metros_solicitados) || 0) : metrosProducto(l)), 0)

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }}>← Volver</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Nuevo pedido</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Cabecera */}
        <div style={S.section}>
          <div style={S.title}>Datos del pedido</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="label">Cliente</label>
              {creandoCliente ? (
                <div style={{ display:'flex', gap:8 }}>
                  <input
                    autoFocus type="text" value={nuevoClienteNombre}
                    onChange={e => setNuevoClienteNombre(e.target.value)}
                    placeholder="Nombre del cliente nuevo..."
                    className="input" style={{ flex:1 }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crearCliente(e as any) } if (e.key === 'Escape') setCreandoCliente(false) }}
                  />
                  <button type="button" disabled={savingCliente || !nuevoClienteNombre.trim()} className="btn-primary"
                    onClick={e => crearCliente(e as any)}>
                    {savingCliente ? '...' : 'Crear'}
                  </button>
                  <button type="button" onClick={() => setCreandoCliente(false)} className="btn-ghost">✕</button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:8 }}>
                  <select value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))} className="input" style={{ flex:1 }} required>
                    <option value="">Seleccionar cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <button type="button" onClick={() => setCreandoCliente(true)}
                    className="btn-ghost" style={{ whiteSpace:'nowrap', flexShrink:0 }}>
                    + Nuevo cliente
                  </button>
                </div>
              )}
            </div>
            <div className="form-grid-2" style={S.grid2}>
              <div>
                <label className="label">Fábrica</label>
                <select value={form.fabrica} onChange={e => setForm(f => ({ ...f, fabrica: e.target.value }))} className="input">
                  {FABRICAS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Estado</label>
                <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} className="input">
                  {ESTADOS_PEDIDO.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fecha pedido</label>
                <div className="input" style={{ color: 'var(--text3)', cursor: 'default' }}>
                  {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })} — automática
                </div>
              </div>
              <div>
                <label className="label">Fecha compromiso</label>
                <input type="date" value={form.fecha_compromiso} onChange={e => setForm(f => ({ ...f, fecha_compromiso: e.target.value }))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Folio / Número de pedido</label>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ display:'flex', border:'1px solid var(--border2)', borderRadius:6, overflow:'hidden', flexShrink:0 }}>
                  {(['auto','manual'] as const).map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setForm(f => ({ ...f, folioMode: mode }))}
                      style={{ padding:'8px 14px', fontSize:12, border:'none', cursor:'pointer',
                        background: form.folioMode===mode ? 'var(--accent)' : 'var(--surface2)',
                        color: form.folioMode===mode ? '#0c0c0c' : 'var(--text2)',
                        fontWeight: form.folioMode===mode ? 600 : 400,
                      }}>
                      {mode === 'auto' ? '⚡ Auto-generar' : '✏ Ingresar'}
                    </button>
                  ))}
                </div>
                {form.folioMode === 'manual' ? (
                  <input type="text" value={form.folioManual}
                    onChange={e => setForm(f => ({ ...f, folioManual: e.target.value }))}
                    placeholder="Ej. P25001 ó 001-A"
                    className="input" style={{ flex:1, minWidth:160, textTransform:'uppercase' }} />
                ) : (
                  <span style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>
                    Se generará automáticamente al guardar
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className="input" style={{ height: 68, resize: 'none' }} />
            </div>
          </div>
        </div>

        {/* Líneas */}
        <div style={S.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={S.title}>Líneas ({lineas.length})</div>
            {totalMetros > 0 && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{totalMetros.toLocaleString()} m producción total</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lineas.map((l, i) => (
              <LineaForm key={i} linea={l} index={i}
                onChange={(f, v) => setLinea(i, f, v)}
                onToggle={() => toggleTipo(i)}
                onRemove={lineas.length > 1 ? () => setLineas(prev => prev.filter((_, idx) => idx !== i)) : undefined}
                metrosCalculados={l.tipo === 'producto' ? metrosProducto(l) : null}
              />
            ))}
          </div>

          <button type="button" onClick={() => setLineas(prev => [...prev, lineaVacia()])}
            style={{ marginTop: 12, width: '100%', padding: '8px 0', background: 'transparent', border: '1px dashed var(--border2)', color: 'var(--text3)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text3)' }}
          >+ Agregar línea</button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={saving} className="btn-primary" style={{ flex: 1, padding: '11px 0', fontSize: 14 }}>
            {saving ? 'Guardando...' : 'Guardar pedido'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-ghost" style={{ padding: '11px 20px' }}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function LineaForm({ linea, index, onChange, onToggle, onRemove, metrosCalculados }: {
  linea: Linea; index: number
  onChange: (f: keyof Linea, v: string) => void
  onToggle: () => void
  onRemove?: () => void
  metrosCalculados: number | null
}) {
  const isProducto = linea.tipo === 'producto'
  return (
    <div style={{ background: 'var(--surface2)', border: `1px solid ${isProducto ? '#2a1f00' : 'var(--border)'}`, borderRadius: 8, padding: 14 }}>
      {/* Header de la línea */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => isProducto && onToggle()}
            style={{ padding: '3px 10px', fontSize: 12, borderRadius: '4px 0 0 4px', border: '1px solid var(--border2)', cursor: 'pointer', fontWeight: !isProducto ? 700 : 400, background: !isProducto ? 'var(--accent)' : 'var(--surface)', color: !isProducto ? '#0c0c0c' : 'var(--text3)' }}>
            Metros
          </button>
          <button type="button" onClick={() => !isProducto && onToggle()}
            style={{ padding: '3px 10px', fontSize: 12, borderRadius: '0 4px 4px 0', border: '1px solid var(--border2)', borderLeft: 'none', cursor: 'pointer', fontWeight: isProducto ? 700 : 400, background: isProducto ? '#fbbf24' : 'var(--surface)', color: isProducto ? '#0c0c0c' : 'var(--text3)' }}>
            Producto terminado
          </button>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove}
            style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text3)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
        )}
      </div>

      {isProducto ? (
        /* ── PRODUCTO TERMINADO ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Descripción del producto</label>
              <input type="text" value={linea.descripcion_producto} onChange={e => onChange('descripcion_producto', e.target.value)}
                placeholder="Ej. Sábana individual" className="input" />
            </div>
            <div>
              <label className="label">Unidades</label>
              <input type="number" value={linea.unidades} onChange={e => onChange('unidades', e.target.value)}
                placeholder="0" className="input" min="0" step="any" required />
            </div>
            <div>
              <label className="label">Precio / unidad</label>
              <input type="number" value={linea.precio_unitario} onChange={e => onChange('precio_unitario', e.target.value)}
                placeholder="$0" className="input" min="0" step="any" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label className="label">Tela a utilizar</label>
              <input type="text" value={linea.tela} onChange={e => onChange('tela', e.target.value)}
                placeholder="Ej. B1" className="input" required />
            </div>
            <div>
              <label className="label">Variante</label>
              <input type="text" value={linea.variante} onChange={e => onChange('variante', e.target.value)}
                placeholder="Color..." className="input" />
            </div>
            <div>
              <label className="label">Consumo m/u</label>
              <input type="number" value={linea.consumo_por_unidad} onChange={e => onChange('consumo_por_unidad', e.target.value)}
                placeholder="1.90" className="input" min="0" step="0.01" required />
            </div>
            <div style={{ paddingBottom: 2 }}>
              {metrosCalculados !== null && metrosCalculados > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', paddingBottom: 8 }}>
                  = {metrosCalculados.toLocaleString()} m
                </div>
              )}
            </div>
          </div>
          {/* Resumen */}
          {linea.unidades && linea.precio_unitario && (
            <div style={{ background: '#2a1f00', border: '1px solid #4a3800', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
              <span style={{ color: '#fbbf24' }}>
                {parseFloat(linea.unidades).toLocaleString()} {linea.descripcion_producto || 'unidades'} × ${parseFloat(linea.precio_unitario).toLocaleString()} = <strong>${(parseFloat(linea.unidades) * parseFloat(linea.precio_unitario)).toLocaleString()}</strong>
              </span>
              {metrosCalculados !== null && metrosCalculados > 0 && (
                <span style={{ color: 'var(--text3)', marginLeft: 12 }}>· {metrosCalculados.toLocaleString()} m de tela a producir</span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── METROS ── */
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 1.5fr 1.5fr', gap: 10 }}>
          <div>
            <label className="label">Tela</label>
            <input type="text" value={linea.tela} onChange={e => onChange('tela', e.target.value)} placeholder="Ej. Molleton" className="input" required />
          </div>
          <div>
            <label className="label">Variante / Color</label>
            <input type="text" value={linea.variante} onChange={e => onChange('variante', e.target.value)} placeholder="Ej. Azul" className="input" />
          </div>
          <div>
            <label className="label">Metros</label>
            <input type="number" value={linea.metros_solicitados} onChange={e => onChange('metros_solicitados', e.target.value)} placeholder="0" className="input" min="0" step="any" required />
          </div>
          <div>
            <label className="label">Precio $/m</label>
            <input type="number" value={linea.precio} onChange={e => onChange('precio', e.target.value)} placeholder="0" className="input" min="0" step="any" />
          </div>
        </div>
      )}
    </div>
  )
}
