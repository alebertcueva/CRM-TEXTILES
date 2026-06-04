import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      clientes: {
        Row: {
          id: string
          nombre: string
          created_at: string
        }
        Insert: {
          id?: string
          nombre: string
          created_at?: string
        }
        Update: {
          nombre?: string
        }
      }
      pedidos: {
        Row: {
          id: string
          folio: string
          cliente_id: string
          fabrica: string
          fecha_pedido: string
          fecha_compromiso: string | null
          fecha_entregado: string | null
          estado: string
          notas: string | null
          created_at: string
        }
        Insert: {
          id?: string
          folio?: string
          cliente_id: string
          fabrica: string
          fecha_pedido: string
          fecha_compromiso?: string | null
          fecha_entregado?: string | null
          estado?: string
          notas?: string | null
        }
        Update: {
          cliente_id?: string
          fabrica?: string
          fecha_pedido?: string
          fecha_compromiso?: string | null
          fecha_entregado?: string | null
          estado?: string
          notas?: string | null
        }
      }
      lineas_pedido: {
        Row: {
          id: string
          pedido_id: string
          tela: string
          variante: string | null
          metros_solicitados: number
          metros_entregados: number | null
          precio: number
          created_at: string
        }
        Insert: {
          id?: string
          pedido_id: string
          tela: string
          variante?: string | null
          metros_solicitados: number
          metros_entregados?: number | null
          precio: number
        }
        Update: {
          tela?: string
          variante?: string | null
          metros_solicitados?: number
          metros_entregados?: number | null
          precio?: number
        }
      }
      acabados: {
        Row: {
          id: string
          folio_proceso: string
          pedido_id: string
          tipo_proceso: string
          proveedor: string
          metros_enviados: number
          metros_recibidos: number | null
          segundas: number | null
          fecha_envio: string
          fecha_retorno_estimada: string | null
          fecha_retorno_real: string | null
          estado: string
          notas: string | null
          created_at: string
        }
        Insert: {
          id?: string
          folio_proceso?: string
          pedido_id: string
          tipo_proceso: string
          proveedor: string
          metros_enviados: number
          metros_recibidos?: number | null
          segundas?: number | null
          fecha_envio: string
          fecha_retorno_estimada?: string | null
          fecha_retorno_real?: string | null
          estado?: string
          notas?: string | null
        }
        Update: {
          tipo_proceso?: string
          proveedor?: string
          metros_enviados?: number
          metros_recibidos?: number | null
          segundas?: number | null
          fecha_envio?: string
          fecha_retorno_estimada?: string | null
          fecha_retorno_real?: string | null
          estado?: string
          notas?: string | null
        }
      }
    }
  }
}
