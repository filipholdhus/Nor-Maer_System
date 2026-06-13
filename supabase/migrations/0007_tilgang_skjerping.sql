-- =============================================================
-- Nor-Mær produksjonssystem — tilgang-skjerping
-- Migrasjon 0007
--
-- 1. Splittar skriv_logg_admin (0005) i tre policyar etter hending:
--    - slepp = admin/leiar (BESLUTNINGSLOGG: produksjonsplanlegging)
--    - godkjent + sendt_tilbake = admin/leiar/kvalitet (uendra)
--    Server Action `sleppJobbkort` har same liste, så RLS og app er
--    no garantert einige (ingen veg utanom).
-- 2. tegningar-bucket får file_size_limit (20 MB) og
--    allowed_mime_types = ['application/pdf']. Handheving skjer i
--    Supabase Storage før objektet blir lagra — klienten kan ikkje
--    omgå dette.
-- 3. DELETE-policy på storage.objects: admin/leiar kan rydde
--    foreldrelause filer (jf. PakkeDetalj.tsx orphan-cleanup).
-- =============================================================

-- ---------------------------------------------------------
-- 1. Splittar skriv_logg_admin etter hending
-- ---------------------------------------------------------
drop policy if exists skriv_logg_admin on steg_logg;

create policy skriv_logg_slepp on steg_logg for insert to authenticated
  with check (
    hending = 'sleppt'
    and min_rolle() in ('admin', 'leiar')
  );

create policy skriv_logg_godkjent on steg_logg for insert to authenticated
  with check (
    hending = 'godkjent'
    and min_rolle() in ('admin', 'leiar', 'kvalitet')
  );

create policy skriv_logg_sendt_tilbake on steg_logg for insert to authenticated
  with check (
    hending = 'sendt_tilbake'
    and min_rolle() in ('admin', 'leiar', 'kvalitet')
  );

-- ---------------------------------------------------------
-- 2. Serverside MIME/storleik på tegningar-bucket
-- ---------------------------------------------------------
update storage.buckets
  set file_size_limit = 20971520,                  -- 20 MB
      allowed_mime_types = array['application/pdf']
  where id = 'tegningar';

-- ---------------------------------------------------------
-- 3. DELETE-policy på storage.objects
--    Slik at app-orphan-cleanup faktisk får sletta fila.
-- ---------------------------------------------------------
create policy "slett_tegningar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tegningar'
    and min_rolle() in ('admin', 'leiar')
  );
