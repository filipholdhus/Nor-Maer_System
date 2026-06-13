-- =============================================================
-- Nor-Mær produksjonssystem — Storage
-- Migrasjon 0004
--
-- Privat bucket "tegningar" for PDF-teikningar per jobbkort.
-- RLS: alle innlogga kan lese; berre admin/leiar kan laste opp.
-- =============================================================

insert into storage.buckets (id, name, public)
values ('tegningar', 'tegningar', false)
on conflict (id) do nothing;

create policy "les_tegningar"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tegningar');

create policy "last_opp_tegningar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tegningar'
    and min_rolle() in ('admin', 'leiar')
  );

create policy "oppdater_tegningar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tegningar'
    and min_rolle() in ('admin', 'leiar')
  );
