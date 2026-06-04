import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://tkwrrgieeymdhbxwaakm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrd3JyZ2llZXltZGhieHdhYWttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NzU0NjgsImV4cCI6MjA5NjE1MTQ2OH0.SLT5VPwlhQiEvwsTTcWCw85NJ40Scxs6O85OBTsAzfM'
)

// ── 1. CLIENTES ──────────────────────────────────────────────────────────────
const clientesData = [
  { _at: 'rec8gRBwotTQyiHqX', nombre: 'Toño Jaques' },
  { _at: 'recEsbxnHdPqRIHSL', nombre: 'Textiles Del Futuro' },
  { _at: 'recMN708wLFI4pu0u', nombre: 'Silvon' },
  { _at: 'recY5YYCaAWz3QBVj', nombre: 'Eduardo Gonzalez' },
  { _at: 'recpMuq663vuodaa0', nombre: 'Prod. Médicos y Mat. Salud' },
  { _at: 'recpSQvQDAZkjCgvO', nombre: 'Yale' },
  { _at: 'rectBEccQB8jDLJEN', nombre: 'Higienica' },
]

// ── 2. PEDIDOS (agrupados por folio) ─────────────────────────────────────────
// Cada entrada = un pedido. Las lineas van en el array `lineas`.
const pedidosData = [
  {
    folio: 'J2601', cliente_at: 'rec8gRBwotTQyiHqX', fabrica: 'Asturcon',
    fecha_pedido: '2026-06-02', fecha_compromiso: '2026-06-26',
    estado: '📥 Nuevo pedido', notas: null,
    lineas: [
      { tela: 'TRAPO 45 X 40', variante: 'MANTA DE SEGUNDA', metros_solicitados: 150, precio: 2 },
    ]
  },
  {
    folio: 'M2601', cliente_at: 'recpMuq663vuodaa0', fabrica: 'Asturcon',
    fecha_pedido: '2026-05-20', fecha_compromiso: '2026-06-10',
    estado: '🏭 En producción', notas: null,
    lineas: [
      { tela: 'MC1A', variante: 'Doble — Campo Chico 60x60 Blanco', metros_solicitados: 25, precio: 72 },
      { tela: 'MC1A', variante: 'Sencillo — Campo Chico 60x60 Blanco', metros_solicitados: 25, precio: 21.6 },
      { tela: 'MC1A', variante: 'Doble — Campo Mediano 97x97 Blanco', metros_solicitados: 25, precio: 36 },
      { tela: 'MC1A', variante: 'Sencillo — Campo Mediano 97x97 Blanco', metros_solicitados: 25, precio: 43.2 },
      { tela: 'MC1A', variante: 'Doble — Campo Grande 110x110 Blanco', metros_solicitados: 200, precio: 72 },
      { tela: 'I2A',  variante: 'Sencillo — Campo Grande 110x110 Blanco', metros_solicitados: 200, precio: 36 },
    ]
  },
  {
    folio: 'M2602', cliente_at: 'recMN708wLFI4pu0u', fabrica: 'Cobitel',
    fecha_pedido: '2026-05-20', fecha_compromiso: '2026-05-22', fecha_entregado: '2026-05-22',
    estado: 'Entregado', notas: null,
    lineas: [
      { tela: 'Molleton', variante: 'Retratos Rosa',    metros_solicitados: 180, precio: 21 },
      { tela: 'Molleton', variante: 'Retratos Azul',    metros_solicitados: 360, precio: 21 },
      { tela: 'Molleton', variante: 'Retratos Verde',   metros_solicitados: 360, precio: 21 },
      { tela: 'Molleton', variante: 'Retratos Amarillo',metros_solicitados: 360, precio: 21 },
      { tela: 'Molleton', variante: 'Osos Rosa',        metros_solicitados: 180, precio: 21 },
      { tela: 'Molleton', variante: 'Osos Amarillo',    metros_solicitados: 360, precio: 21 },
      { tela: 'Molleton', variante: 'Osos Verde',       metros_solicitados: 360, precio: 21 },
      { tela: 'Molleton', variante: 'Osos Azul',        metros_solicitados: 360, precio: 21 },
    ]
  },
  {
    folio: 'M2603', cliente_at: 'recY5YYCaAWz3QBVj', fabrica: 'Asturcon',
    fecha_pedido: '2026-05-20', fecha_compromiso: '2026-07-15',
    estado: '📥 Nuevo pedido', notas: null,
    lineas: [
      { tela: 'IJ', variante: 'Estampado — Diseño 1', metros_solicitados: 3000, precio: 53 },
      { tela: 'IJ', variante: 'Estampado — Diseño 2', metros_solicitados: 3000, precio: 53 },
      { tela: 'IJ', variante: 'Estampado — Diseño 3', metros_solicitados: 3000, precio: 53 },
      { tela: 'IJ', variante: 'Estampado — Diseño 4', metros_solicitados: 3000, precio: 53 },
      { tela: 'IJ', variante: 'Estampado — Diseño 5', metros_solicitados: 3000, precio: 53 },
      { tela: 'IJ', variante: 'Estampado — Diseño 6', metros_solicitados: 3000, precio: 53 },
      { tela: 'IJ', variante: 'Mostaza',              metros_solicitados: 3000, precio: 50 },
      { tela: 'IJ', variante: 'Arena',                metros_solicitados: 3000, precio: 50 },
      { tela: 'IJ', variante: 'Rosa',                 metros_solicitados: 3000, precio: 50 },
      { tela: 'IJ', variante: 'Hueso',                metros_solicitados: 3000, precio: 50 },
      { tela: 'IJ', variante: 'Lila',                 metros_solicitados: 3000, precio: 50 },
      { tela: 'IJ', variante: 'Perla',                metros_solicitados: 3000, precio: 50 },
    ]
  },
  {
    folio: 'M2604', cliente_at: 'recY5YYCaAWz3QBVj', fabrica: 'Asturcon',
    fecha_pedido: '2026-05-20', fecha_compromiso: '2026-05-26', fecha_entregado: '2026-05-28',
    estado: 'Entregado', notas: 'Artículos pendientes por agregar',
    lineas: [
      { tela: 'IJ',    variante: 'Blanco',               metros_solicitados: 1619, precio: 50 },
      { tela: 'PS1E',  variante: '00 Blanco',             metros_solicitados: 3692, precio: 50 },
      { tela: 'B1',    variante: 'Segunda — Liso Varios', metros_solicitados: 1495, precio: 30 },
      { tela: 'IJ',    variante: 'Segunda — Liso Varios', metros_solicitados: 1251, precio: 30 },
      { tela: 'Loneta',variante: 'Navideño Rojo',         metros_solicitados: 1,    precio: 0 },
      { tela: 'Loneta',variante: 'Navideños Rojo',        metros_solicitados: 1,    precio: 0 },
    ]
  },
  {
    folio: 'M2605', cliente_at: 'recEsbxnHdPqRIHSL', fabrica: 'Cobitel',
    fecha_pedido: '2026-05-20', fecha_compromiso: '2026-05-28',
    estado: 'En acabado Externo', notas: 'Enviado a sanforizado con La María',
    lineas: [
      { tela: 'Mezclilla', variante: 'Sanforizada', metros_solicitados: 3000, precio: 61 },
    ]
  },
  {
    folio: '11013', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2025-11-07', fecha_compromiso: '2026-01-14',
    estado: 'En acabado Externo', notas: null,
    lineas: [
      { tela: 'B1', variante: 'Estampado — Ha', metros_solicitados: 2585, precio: 55 },
    ]
  },
  {
    folio: '11418', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2026-02-04', fecha_compromiso: '2026-03-02',
    estado: '🏭 En producción', notas: null,
    lineas: [
      { tela: 'B1', variante: 'Est Lavartex', metros_solicitados: 1250, precio: 55 },
    ]
  },
  {
    folio: '11426', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2026-02-06', fecha_compromiso: '2026-03-06',
    estado: '🏭 En producción', notas: '5000 en acabado · 9000 pendientes',
    lineas: [
      { tela: 'B1', variante: 'Estampado — Ha', metros_solicitados: 11000, precio: 55 },
    ]
  },
  {
    folio: '11726', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2026-03-20', fecha_compromiso: '2026-06-05', fecha_entregado: '2026-05-12',
    estado: '🏭 En producción', notas: null,
    lineas: [
      { tela: 'B1', variante: 'Est Lavartex', metros_solicitados: 3000,  precio: 55 },
      { tela: 'B1', variante: '01',           metros_solicitados: 11000, precio: 47 },
    ]
  },
  {
    folio: '11786', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2026-03-27', fecha_compromiso: '2026-06-19',
    estado: '📥 Nuevo pedido', notas: null,
    lineas: [
      { tela: 'B1', variante: 'Est Lavartex', metros_solicitados: 6000, precio: 55 },
    ]
  },
  {
    folio: '11963', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2026-05-08', fecha_compromiso: '2026-05-21', fecha_entregado: '2026-05-27',
    estado: '🏭 En producción', notas: null,
    lineas: [
      { tela: 'B1', variante: '01', metros_solicitados: 10000, precio: 47 },
      { tela: 'B1', variante: '01', metros_solicitados: 6000,  precio: 47 },
    ]
  },
  {
    folio: '12002', cliente_at: 'rectBEccQB8jDLJEN', fabrica: 'Asturcon',
    fecha_pedido: '2026-05-12', fecha_compromiso: '2026-06-18',
    estado: '📥 Nuevo pedido', notas: null,
    lineas: [
      { tela: 'B1', variante: 'Est lavartex', metros_solicitados: 10000, precio: 55 },
    ]
  },
  {
    folio: '68227', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: '2026-02-22', fecha_compromiso: '2026-05-28',
    estado: 'Entregado', notas: 'Entrega parcial — falta 1300',
    lineas: [
      { tela: 'GC', variante: 'Oxford', metros_solicitados: 3000, precio: 67 },
    ]
  },
  {
    folio: '68297', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: '2026-02-12', fecha_compromiso: '2026-04-24',
    estado: 'Listo para entregar', notas: 'Sigue pendiente',
    lineas: [
      { tela: 'GC', variante: 'Oxford', metros_solicitados: 2000, precio: 67 },
    ]
  },
  {
    folio: '68787', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: '2026-03-27', fecha_compromiso: '2026-04-24', fecha_entregado: '2026-04-24',
    estado: 'Entregado', notas: 'Entrega parcial — falta 2321',
    lineas: [
      { tela: 'GC', variante: 'Oxford', metros_solicitados: 10000, metros_entregados: 9179, precio: 67 },
    ]
  },
  {
    folio: '68788', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: '2026-03-27', fecha_compromiso: '2026-06-10',
    estado: '🏭 En producción', notas: 'En proceso',
    lineas: [
      { tela: 'GCE', variante: 'Marino', metros_solicitados: 8000, precio: 67 },
      { tela: 'GCE', variante: 'Marino', metros_solicitados: 8000, precio: 67 },
      { tela: 'GCE', variante: 'Kakhi',  metros_solicitados: 7000, precio: 67 },
      { tela: 'GCE', variante: 'Oxford', metros_solicitados: 6000, precio: 67 },
    ]
  },
  {
    folio: '68930', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: '2026-04-13', fecha_compromiso: '2026-05-29',
    estado: '🏭 En producción', notas: null,
    lineas: [
      { tela: 'GCE', variante: 'Marino', metros_solicitados: 2000, precio: 67 },
      { tela: 'GC',  variante: 'Oxford', metros_solicitados: 2000, precio: 67 },
      { tela: 'GCE', variante: 'Arena',  metros_solicitados: 2000, precio: 67 },
      { tela: 'GCE', variante: 'Oxford', metros_solicitados: 1000, precio: 67 },
      { tela: 'GCE', variante: 'Kakhi',  metros_solicitados: 3000, precio: 67 },
    ]
  },
  {
    folio: '69038', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: '2026-03-21', fecha_compromiso: '2026-05-22',
    estado: '🏭 En producción', notas: null,
    lineas: [
      { tela: 'GCE', variante: 'Marino', metros_solicitados: 4500, precio: 67 },
    ]
  },
  {
    folio: '69598', cliente_at: 'recpSQvQDAZkjCgvO', fabrica: 'Asturcon',
    fecha_pedido: null, fecha_compromiso: null,
    estado: 'Listo para entregar', notas: null,
    lineas: [
      { tela: 'B7A', variante: '01', metros_solicitados: 10000, precio: 0 },
    ]
  },
]

// ── 3. ACABADOS ──────────────────────────────────────────────────────────────
// folio_pedido = el folio del pedido al que pertenece (para buscar el ID luego)
const acabadosData = [
  {
    folio_proceso: 'ALM01', folio_pedido: 'M2605',
    tipo_proceso: 'Sanforizado', proveedor: 'La Maria',
    metros_enviados: 2969, fecha_envio: '2026-05-25', fecha_retorno_estimada: '2026-05-28',
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: 'ALM02', folio_pedido: '68788',
    tipo_proceso: 'Teñido', proveedor: 'La Maria',
    metros_enviados: 4646, fecha_envio: '2026-05-15', fecha_retorno_estimada: null,
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: 'ALM03', folio_pedido: '68788',
    tipo_proceso: 'Teñido', proveedor: 'La Maria',
    metros_enviados: 1484, fecha_envio: '2026-05-12', fecha_retorno_estimada: null,
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: 'ALM04', folio_pedido: '68788',
    tipo_proceso: 'Teñido', proveedor: 'La Maria',
    metros_enviados: 1501, fecha_envio: '2026-05-12', fecha_retorno_estimada: null,
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: 'ASB01', folio_pedido: '12002',
    tipo_proceso: 'Estampado', proveedor: 'Santa Barbara',
    metros_enviados: 5074, fecha_envio: '2026-05-18', fecha_retorno_estimada: '2026-05-27',
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: '1447-11726a', folio_pedido: '11726',
    tipo_proceso: 'Estampado', proveedor: 'Santa Barbara',
    metros_enviados: 5000, fecha_envio: '2026-05-28', fecha_retorno_estimada: null,
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: '1447-11726b', folio_pedido: '11726',
    tipo_proceso: 'Estampado', proveedor: 'Santa Barbara',
    metros_enviados: 3610, fecha_envio: '2026-06-02', fecha_retorno_estimada: null,
    estado: 'En Proceso', notas: null,
  },
  {
    folio_proceso: '1447-11013', folio_pedido: '11013',
    tipo_proceso: 'Estampado', proveedor: 'Santa Barbara',
    metros_enviados: 3301, fecha_envio: '2026-05-28', fecha_retorno_estimada: null,
    estado: 'En Proceso', notas: null,
  },
]

// ── MIGRATION ────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('🚀 Iniciando migración de Airtable → Supabase...\n')

  // 1. Insert clientes
  console.log('📋 Insertando clientes...')
  const { data: clientes, error: cErr } = await supabase
    .from('clientes')
    .insert(clientesData.map(c => ({ nombre: c.nombre })))
    .select()
  if (cErr) { console.error('Error clientes:', cErr.message); process.exit(1) }

  // Map AT client id → supabase UUID
  const clienteMap = {}
  clientesData.forEach((c, i) => { clienteMap[c._at] = clientes[i].id })
  console.log(`   ✅ ${clientes.length} clientes insertados\n`)

  // 2. Insert pedidos + lineas
  console.log('📦 Insertando pedidos y líneas...')
  let totalPedidos = 0, totalLineas = 0
  const pedidoFolioMap = {} // folio → supabase UUID

  for (const p of pedidosData) {
    const { data: pedido, error: pErr } = await supabase
      .from('pedidos')
      .insert({
        folio: p.folio,
        cliente_id: clienteMap[p.cliente_at],
        fabrica: p.fabrica,
        fecha_pedido: p.fecha_pedido ?? new Date().toISOString().split('T')[0],
        fecha_compromiso: p.fecha_compromiso ?? null,
        fecha_entregado: p.fecha_entregado ?? null,
        estado: p.estado,
        notas: p.notas,
      })
      .select()
      .single()

    if (pErr) { console.error(`Error pedido ${p.folio}:`, pErr.message); continue }

    pedidoFolioMap[p.folio] = pedido.id
    totalPedidos++

    // Insert lineas
    const lineas = p.lineas.map(l => ({
      pedido_id: pedido.id,
      tela: l.tela,
      variante: l.variante ?? null,
      metros_solicitados: l.metros_solicitados,
      metros_entregados: l.metros_entregados ?? null,
      precio: l.precio ?? 0,
    }))
    const { error: lErr } = await supabase.from('lineas_pedido').insert(lineas)
    if (lErr) console.error(`Error líneas ${p.folio}:`, lErr.message)
    else totalLineas += lineas.length
  }
  console.log(`   ✅ ${totalPedidos} pedidos y ${totalLineas} líneas insertadas\n`)

  // 3. Insert acabados
  console.log('🏭 Insertando acabados...')
  let totalAcabados = 0
  for (const a of acabadosData) {
    const pedidoId = pedidoFolioMap[a.folio_pedido]
    if (!pedidoId) { console.warn(`   ⚠️  Pedido no encontrado para acabado ${a.folio_proceso}`); continue }

    const { error: aErr } = await supabase.from('acabados').insert({
      folio_proceso: a.folio_proceso,
      pedido_id: pedidoId,
      tipo_proceso: a.tipo_proceso,
      proveedor: a.proveedor,
      metros_enviados: a.metros_enviados,
      fecha_envio: a.fecha_envio,
      fecha_retorno_estimada: a.fecha_retorno_estimada ?? null,
      estado: a.estado,
      notas: a.notas ?? null,
    })
    if (aErr) console.error(`Error acabado ${a.folio_proceso}:`, aErr.message)
    else totalAcabados++
  }
  console.log(`   ✅ ${totalAcabados} acabados insertados\n`)

  console.log('🎉 ¡Migración completa!')
  console.log(`   Clientes: ${clientes.length}`)
  console.log(`   Pedidos:  ${totalPedidos}`)
  console.log(`   Líneas:   ${totalLineas}`)
  console.log(`   Acabados: ${totalAcabados}`)
}

migrate().catch(console.error)
