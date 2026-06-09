-- Stage 2: explicit pricing classifier so behaviour generalises beyond module_key 'CM'.
create type pricing_type as enum ('composite', 'multiplier', 'tier');

alter table public.modules add column pricing_type pricing_type;

update public.modules set pricing_type = 'composite' where module_key in ('DSPM', 'DATA_FLOW', 'DAM');
update public.modules set pricing_type = 'multiplier' where module_key = 'ROPA_STANDALONE';
update public.modules set pricing_type = 'tier' where module_key = 'CM';

alter table public.modules alter column pricing_type set not null;
