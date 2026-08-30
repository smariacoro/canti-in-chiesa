-- Canti in Chiesa — schema per la condivisione fra i coristi.
--
-- Come si usa:
--   1. crea un progetto gratuito su https://supabase.com
--   2. apri "SQL Editor", incolla tutto questo file ed esegui
--   3. da "Project Settings > API" copia Project URL e chiave "anon public"
--      dentro app/config.js
--
-- Modello: ogni riga contiene il record completo in JSON. Serve a far evolvere
-- l'app senza dover migrare il database ogni volta che si aggiunge un campo.

-- ---------------------------------------------------------------- tabelle

create table if not exists public.songs (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) default auth.uid()
);

create table if not exists public.setlists (
  id          text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) default auth.uid()
);

-- Stato condiviso minore (per ora: l'elenco dei canti nascosti).
create table if not exists public.app_state (
  key         text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id) default auth.uid()
);

-- La sincronizzazione scarica solo le righe cambiate: questi indici la tengono
-- veloce anche fra qualche anno di scalette.
create index if not exists songs_updated_at_idx    on public.songs    (updated_at);
create index if not exists setlists_updated_at_idx on public.setlists (updated_at);

-- --------------------------------------------------- orologio lato server
-- L'ora la decide il database, non il telefono: se un dispositivo avesse la
-- data sbagliata, il cursore di sincronizzazione salterebbe delle modifiche.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists songs_touch    on public.songs;
drop trigger if exists setlists_touch on public.setlists;
drop trigger if exists app_state_touch on public.app_state;

create trigger songs_touch     before insert or update on public.songs
  for each row execute function public.touch_updated_at();
create trigger setlists_touch  before insert or update on public.setlists
  for each row execute function public.touch_updated_at();
create trigger app_state_touch before insert or update on public.app_state
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- RLS
-- La chiave "anon" sta nel telefono di tutti: la protezione vera è qui.
-- Solo chi ha fatto l'accesso può leggere e scrivere; gli anonimi non vedono
-- nulla. Il coro è una comunità di fiducia, quindi chi è dentro può modificare
-- tutto: la cronologia di chi ha toccato cosa resta in updated_by.

alter table public.songs     enable row level security;
alter table public.setlists  enable row level security;
alter table public.app_state enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['songs', 'setlists', 'app_state'] loop
    execute format('drop policy if exists "coro_select" on public.%I', t);
    execute format('drop policy if exists "coro_insert" on public.%I', t);
    execute format('drop policy if exists "coro_update" on public.%I', t);
    execute format('drop policy if exists "coro_delete" on public.%I', t);

    execute format('create policy "coro_select" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "coro_insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "coro_update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "coro_delete" on public.%I for delete to authenticated using (true)', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ note
--
-- Chi può iscriversi
--   Di serie chiunque conosca l'indirizzo dell'app può crearsi un account.
--   Per limitarlo al solo coro, in Authentication > Providers > Email spegni
--   "Enable sign ups" e crea tu gli utenti da Authentication > Users.
--
-- Conferma via email
--   Se lasci attivo "Confirm email", dopo la registrazione arriva un messaggio
--   da aprire prima del primo accesso: l'app lo dice esplicitamente.
--
-- Cancellazioni
--   Le scalette eliminate restano come riga con data.deleted = true, così la
--   cancellazione arriva anche agli altri dispositivi. Per fare pulizia:
--     delete from public.setlists
--      where (data->>'deleted')::boolean and updated_at < now() - interval '1 year';
