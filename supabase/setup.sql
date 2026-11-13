-- Atril: configuración de Supabase. Pégalo completo en el SQL Editor y dale "Run".
-- Se puede correr más de una vez sin problema. No toca nada de Fibra ni de Trazo.

create table if not exists public.atril_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.atril_state enable row level security;

drop policy if exists "atril leer lo propio" on public.atril_state;
drop policy if exists "atril crear lo propio" on public.atril_state;
drop policy if exists "atril actualizar lo propio" on public.atril_state;
drop policy if exists "atril borrar lo propio" on public.atril_state;
create policy "atril leer lo propio" on public.atril_state for select to authenticated using (auth.uid() = user_id);
create policy "atril crear lo propio" on public.atril_state for insert to authenticated with check (auth.uid() = user_id);
create policy "atril actualizar lo propio" on public.atril_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "atril borrar lo propio" on public.atril_state for delete to authenticated using (auth.uid() = user_id);
