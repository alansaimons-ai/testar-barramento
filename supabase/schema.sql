-- TESTAR BARRAMENTO — banco de dados (Supabase)
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Acesso aberto a todos (sem login), conforme combinado.

-- 1) Trechos/barramentos cadastrados (visíveis para todos)
create table if not exists public.tb_trechos (
  id            bigserial primary key,
  barramento    text    not null,
  descricao     text    not null,
  sentido       text    not null,           -- LR ou RL
  ponta_a       text    not null default '',
  ponta_b       text    not null default '',
  at_referencia numeric not null default 0,
  estacao_a     text    not null default '',
  estacao_b     text    not null default '',
  distancia     numeric not null default 0,
  created_at    timestamptz not null default now(),
  unique (barramento, descricao, sentido, ponta_a, ponta_b)
);

-- 2) Testes registrados (histórico para comparar no tempo)
create table if not exists public.tb_testes (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  barramento  text    not null,
  trecho      text    not null,
  distancia   numeric,
  veredito    text    not null,
  pior_dif    numeric not null,
  dados       jsonb   not null default '{}'::jsonb
);
create index if not exists tb_testes_trecho_data on public.tb_testes (trecho, created_at desc);
create index if not exists tb_testes_data on public.tb_testes (created_at desc);

-- 3) Regras de acesso: qualquer pessoa lê e grava; histórico de testes não pode ser editado/apagado
alter table public.tb_trechos enable row level security;
alter table public.tb_testes  enable row level security;

drop policy if exists tb_trechos_select on public.tb_trechos;
drop policy if exists tb_trechos_insert on public.tb_trechos;
drop policy if exists tb_trechos_update on public.tb_trechos;
create policy tb_trechos_select on public.tb_trechos for select to anon, authenticated using (true);
create policy tb_trechos_insert on public.tb_trechos for insert to anon, authenticated with check (true);
create policy tb_trechos_update on public.tb_trechos for update to anon, authenticated using (true) with check (true);

drop policy if exists tb_testes_select on public.tb_testes;
drop policy if exists tb_testes_insert on public.tb_testes;
create policy tb_testes_select on public.tb_testes for select to anon, authenticated using (true);
create policy tb_testes_insert on public.tb_testes for insert to anon, authenticated with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.tb_trechos to anon, authenticated;
grant select, insert on public.tb_testes to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
