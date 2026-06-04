'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type Acabado = {
  id: string; folio_proceso: string; tipo_proceso: string; proveedor: string
  metros_enviados: number; metros_recibidos: number | null; segundas: number | null
  fecha_envio: string; fecha_retorno_estimada: string | null; fecha_retorno_real: string | null
  estado: string; notas: string | null
  pedidos: { id: string; folio: string; clientes: { nombre: string } | null } | null
  lineas_pedido: { tela: string; variante: string | null; metros_solicitados: number } | null
}

function estadoBadge(estado: string) {
  if (estado === 'Recibido') return { background:'#0e2a1a', color:'#4ade80' }
  if (estado === 'Atrasado') return { background:'#2a0e0e', color:'#f87171' }
  return { background:'#0e1f3a', color:'#60a5fa' }
}

export default function AcabadoDetalle() {
  const { id }    = useParams<{ id: string }>()
  const router    = useRouter()
  const [acabado, setAcabado] = useState<Acabado | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({ metros_recibidos:'', segundas:'', fecha_retorno_real:'', estado:'', notas:'' })

  async function load() {
    const { data } = await supabase
      .from('acabados')
      .select('*, pedidos(id,folio,clientes(nombre)), lineas_pedido(tela,variante,metros_solicitados)')
      .eq('id', id).single()
    const a = data as unknown as Acabado
    setAcabado(a)
    setForm({
      metros_recibidos: a.metros_recibidos?.toString() ?? '',
      segundas:         a.segundas?.toString() ?? '',
      fecha_retorno_real: a.fecha_retorno_real ?? '',
      estado:           a.estado,
      notas:            a.notas ?? '',
    })
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function handleSave() {
    setSaving(true)
    await supabase.from('acabados').update({
      metros_recibidos:  form.metros_recibidos  ? parseFloat(form.metros_recibidos)  : null,
      segundas:          form.segundas          ? parseFloat(form.segundas)          : null,
      fecha_retorno_real: form.fecha_retorno_real || null,
      estado:            form.estado,
      notas:             form.notas || null,
    }).eq('id', id)
    setEditing(false)
    setSaving(false)
    load()
  }

  if (loading) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>Cargando...</div>
  if (!acabado) return <div style={{ textAlign:'center', padding:80, color:'var(--text3)' }}>No encontrado</div>

  const merma    = acabado.metros_recibidos != null ? acabado.metros_enviados - acabado.metros_recibidos - (acabado.segundas??0) : null
  const pctMerma = merma != null ? (merma/acabado.metros_enviados*100).toFixed(1) : null
  const badge    = estadoBadge(acabado.estado)

  return (
    <div style={{ maxWidth:560 }}>
      <button onClick={() => router.back()} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, marginBottom:20 }}>
        ← Volver
      </button>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:20 }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <h1 style={{ fontSize:24, fontWeight:800, margin:0 }}>{acabado.folio_proceso}</h1>
            <div style={{ marginTop:4, fontSize:13, color:'var(--text2)' }}>
              Pedido:{' '}
              <Link href={`/pedidos/${acabado.pedidos?.id}`} style={{ color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>
                {acabado.pedidos?.folio}
              </Link>
              {acabado.pedidos?.clientes && <span style={{ color:'var(--text3)' }}> · {acabado.pedidos.clientes.nombre}</span>}
            </div>
            {/* Tela específica */}
            {acabado.lineas_pedido && (
              <div style={{ marginTop:4, fontSize:13, display:'inline-flex', alignItems:'center', gap:6, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px' }}>
                <span style={{ color:'var(--text3)', fontSize:11 }}>Tela:</span>
                <span style={{ color:'var(--text)', fontWeight:600 }}>
                  {acabado.lineas_pedido.tela}{acabado.lineas_pedido.variante ? ` — ${acabado.lineas_pedido.variante}` : ''}
                </span>
                <span style={{ color:'var(--text3)', fontSize:11 }}>({acabado.lineas_pedido.metros_solicitados.toLocaleString()} m)</span>
              </div>
            )}
          </div>
          <span style={{ fontSize:12, padding:'3px 10px', borderRadius:99, fontWeight:600, ...badge }}>{acabado.estado}</span>
        </div>

        {/* Info grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
          {[
            { label:'Tipo de proceso', value: acabado.tipo_proceso },
            { label:'Proveedor',       value: acabado.proveedor },
            { label:'Metros enviados', value: `${acabado.metros_enviados.toLocaleString()} m` },
            { label:'Fecha envío',     value: format(new Date(acabado.fecha_envio),'dd MMM yyyy',{locale:es}) },
            acabado.fecha_retorno_estimada ? { label:'Retorno estimado', value: format(new Date(acabado.fecha_retorno_estimada),'dd MMM yyyy',{locale:es}) } : null,
            acabado.fecha_retorno_real     ? { label:'Retorno real',     value: format(new Date(acabado.fecha_retorno_real),'dd MMM yyyy',{locale:es}) } : null,
            acabado.metros_recibidos != null ? { label:'Metros recibidos', value:`${acabado.metros_recibidos.toLocaleString()} m` } : null,
            acabado.segundas ? { label:'Segundas', value:`${acabado.segundas} m` } : null,
            merma != null ? { label:'Merma', value:`${merma} m (${pctMerma}%)`, red: merma > 0 } : null,
          ].filter(Boolean).map((row: any) => (
            <div key={row.label}>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{row.label}</div>
              <div style={{ fontSize:13, fontWeight:600, marginTop:2, color: row.red ? 'var(--red)' : 'var(--text)' }}>{row.value}</div>
            </div>
          ))}
        </div>

        {acabado.notas && (
          <p style={{ fontSize:13, color:'var(--text2)', background:'var(--surface2)', borderRadius:6, padding:'8px 12px', marginBottom:16, border:'1px solid var(--border)' }}>
            {acabado.notas}
          </p>
        )}

        {/* Registrar retorno */}
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn-ghost" style={{ width:'100%', fontSize:13 }}>
            Registrar retorno / actualizar
          </button>
        ) : (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
            <h3 style={{ fontSize:13, fontWeight:600, color:'var(--text2)', margin:0, textTransform:'uppercase', letterSpacing:'0.5px' }}>Registrar retorno</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label className="label">Estado</label>
                <select value={form.estado} onChange={e => setForm(f=>({...f,estado:e.target.value}))} className="input">
                  <option>En Proceso</option><option>Recibido</option><option>Atrasado</option>
                </select>
              </div>
              <div>
                <label className="label">Fecha retorno real</label>
                <input type="date" value={form.fecha_retorno_real} onChange={e => setForm(f=>({...f,fecha_retorno_real:e.target.value}))} className="input" />
              </div>
              <div>
                <label className="label">Metros recibidos</label>
                <input type="number" value={form.metros_recibidos} onChange={e => setForm(f=>({...f,metros_recibidos:e.target.value}))} className="input" min="0" step="any" placeholder="0" />
              </div>
              <div>
                <label className="label">Metros segundas</label>
                <input type="number" value={form.segundas} onChange={e => setForm(f=>({...f,segundas:e.target.value}))} className="input" min="0" step="any" placeholder="0" />
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea value={form.notas} onChange={e => setForm(f=>({...f,notas:e.target.value}))} className="input" style={{ height:64, resize:'none' }} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex:1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-ghost" style={{ padding:'8px 16px' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
