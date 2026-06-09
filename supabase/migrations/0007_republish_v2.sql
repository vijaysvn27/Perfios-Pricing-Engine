-- Stage 2: republish the current config as a NEW version (v2) that carries
-- pricing_type. v1 is left immutable. Uses the publish_snapshot RPC.
select public.publish_snapshot(
  jsonb_build_object(
    'fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field_key', f.field_key, 'label', f.label, 'unit_price_inr', f.unit_price_inr,
        'frequency', f.frequency::text, 'active', f.active, 'sort_order', f.sort_order
      ) order by f.sort_order), '[]'::jsonb) from public.fields f
    ),
    'modules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'module_key', m.module_key, 'label', m.label, 'kind', m.kind::text,
        'pricing_type', m.pricing_type::text, 'deployment_pct', m.deployment_pct,
        'amc_pct', m.amc_pct, 'multiplier', m.multiplier,
        'applies_multiplier', m.applies_multiplier, 'active', m.active
      ) order by m.module_key), '[]'::jsonb) from public.modules m
    ),
    'module_fields', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'module_key', m.module_key, 'field_key', f.field_key
      ) order by m.module_key, f.sort_order), '[]'::jsonb)
      from public.module_fields mf
      join public.modules m on m.id = mf.module_id
      join public.fields  f on f.id = mf.field_id
    ),
    'cm_tiers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'tier_key', t.tier_key, 'label', t.label, 'license_fee_inr', t.license_fee_inr,
        'amc_pct', t.amc_pct, 'implementation_fee_inr', t.implementation_fee_inr
      ) order by t.license_fee_inr), '[]'::jsonb) from public.cm_tiers t
    ),
    'settings', (
      select jsonb_build_object(
        'currency', s.currency, 'deployment_pct', s.deployment_pct, 'amc_pct', s.amc_pct,
        'y2_includes_deployment', s.y2_includes_deployment, 'cm_model', s.cm_model::text,
        'rounding', s.rounding
      ) from public.settings s where s.id = true
    )
  ),
  'stage2-migration'
);
