-- =============================================
-- CRM Textiles — Schema SQL para Supabase
-- Pega esto en el SQL Editor de Supabase
-- =============================================

-- Clientes
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz default now()
);

-- Pedidos
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  cliente_id uuid references clientes(id) on delete restrict,
  fabrica text not null,
  fecha_pedido date not null,
  fecha_compromiso date,
  fecha_entregado date,
  estado text not null default '📥 Nuevo pedido',
  notas text,
  created_at timestamptz default now()
);

-- Líneas de pedido (telas dentro de cada pedido)
create table if not exists lineas_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references pedidos(id) on delete cascade,
  tela text not null,
  variante text,
  metros_solicitados numeric not null,
  metros_entregados numeric,
  precio numeric not null default 0,
  created_at timestamptz default now()
);

-- Acabados externos
create table if not exists acabados (
  id uuid primary key default gen_random_uuid(),
  folio_proceso text not null unique,
  pedido_id uuid references pedidos(id) on delete restrict,
  tipo_proceso text not null,
  proveedor text not null,
  metros_enviados numeric not null,
  metros_recibidos numeric,
  segundas numeric,
  fecha_envio date not null,
  fecha_retorno_estimada date,
  fecha_retorno_real date,
  estado text not null default 'En Proceso',
  notas text,
  created_at timestamptz default now()
);

-- Índices útiles
create index if not exists idx_pedidos_estado on pedidos(estado);
create index if not exists idx_pedidos_cliente on pedidos(cliente_id);
create index if not exists idx_acabados_estado on acabados(estado);
create index if not exists idx_acabados_pedido on acabados(pedido_id);

-- Row Level Security (desactivado para uso personal, puedes activarlo después)
alter table clientes disable row level security;
alter table pedidos disable row level security;
alter table lineas_pedido disable row level security;
alter table acabados disable row level security;
