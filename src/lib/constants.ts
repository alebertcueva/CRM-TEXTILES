export const FABRICAS = ['Asturcon', 'Cobitel', 'Fábrica'] as const
export type Fabrica = typeof FABRICAS[number]

export const ESTADOS_PEDIDO = [
  '📥 Nuevo pedido',
  '🏭 En producción',
  'En Acabado',
  'En acabado Externo',
  'En revisión',
  'Listo para entregar',
  'Entregado',
  '🔍 Verificando stock',
] as const
export type EstadoPedido = typeof ESTADOS_PEDIDO[number]

export const TIPOS_PROCESO = [
  'Teñido',
  'Estampado',
  'Esmerilado',
  'Sanforizado',
  'Teñido Pig',
] as const

export const PROVEEDORES_ACABADO = [
  'La Maria',
  'Santa Barbara',
  'Cobitel',
  'Acafintex',
] as const

export const ESTADOS_ACABADO = ['En Proceso', 'Recibido', 'Atrasado'] as const

export const ESTADO_COLORES: Record<string, string> = {
  '📥 Nuevo pedido': 'bg-cyan-100 text-cyan-800',
  '🏭 En producción': 'bg-teal-100 text-teal-800',
  'En Acabado': 'bg-teal-100 text-teal-800',
  'En acabado Externo': 'bg-yellow-100 text-yellow-800',
  'En revisión': 'bg-pink-100 text-pink-800',
  'Listo para entregar': 'bg-green-100 text-green-800',
  'Entregado': 'bg-green-200 text-green-900',
  '🔍 Verificando stock': 'bg-green-100 text-green-800',
}

export const RIESGO_CONFIG = {
  ok: { label: '🟢 OK', color: 'text-green-600' },
  revisar: { label: '🟡 REVISAR', color: 'text-yellow-600' },
  atrasado: { label: '🔴 ATRASADO', color: 'text-red-600' },
  entregado: { label: '⚫ ENTREGADO', color: 'text-gray-500' },
}

export function calcularRiesgo(fechaCompromiso: string | null, estado: string): keyof typeof RIESGO_CONFIG {
  if (estado === 'Entregado') return 'entregado'
  if (!fechaCompromiso) return 'ok'
  const hoy = new Date()
  const compromiso = new Date(fechaCompromiso)
  const diasRestantes = Math.floor((compromiso.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
  if (diasRestantes < 0) return 'atrasado'
  if (diasRestantes <= 7) return 'revisar'
  return 'ok'
}
