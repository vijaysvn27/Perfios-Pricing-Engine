# Project: Perfios Pricing Engine (partner-facing, config-driven)

## What this is
A configurable pricing calculator for Perfios data-privacy and Consent Manager modules.
An admin (Aakash) defines the pricing logic through the UI (no code, no formula typing).
A user picks modules, answers a short quantity questionnaire, and gets a Year 1 and Year 2
base cost. The tool outputs BASE COST ONLY. No margin, ever. Partners add margin outside the tool.

## Stack (fixed)
- React 19 + Vite + TypeScript + Tailwind 4
- Supabase (Postgres + Auth + Row Level Security) as the only backend. Do not use Firestore.
- Deploy target: Vercel (later stage, not now)

## Non-negotiable product rules
1. The calculator NEVER shows: per-unit prices, the sum of per-unit lines, or any margin.
   It shows only the final Year 1 and Year 2 numbers per the published config.
2. All pricing logic is DATA in Supabase, not hardcoded. Changing a rate, adding a field,
   or re-tagging a module is a row edit through the admin UI, never a code change.
3. There is NO free-text formula box anywhere. Logic changes happen only through bounded
   building blocks (unit rate, field-to-module tagging, percentage, multiplier, frequency).
   This is the core safety requirement: the admin must never be able to break the engine.
4. Admin edits happen in a DRAFT. A draft must pass validation, then be PUBLISHED to go live.
   The calculator always reads the latest PUBLISHED version. Every publish is versioned and
   one-click reversible (rollback).

## Engineering standards
- Typed throughout. The pricing engine is a pure, deterministic, unit-tested function:
  same config plus same inputs always returns the same numbers.
- Pricing math lives in ONE module (lib/engine). UI never does arithmetic.
- Currency stored as integer paise or rupees (no floats for money). Format Indian style (1,00,000).
- After each stage, write tests for the engine and run them before reporting done.

## Thinking guidance
- Use deep reasoning (ultrathink) for the data model and the combination engine.
- Default effort for CRUD screens and styling.
