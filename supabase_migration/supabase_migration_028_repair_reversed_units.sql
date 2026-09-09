-- Migration 028: repair ingredient units that were stored backwards by the
-- mobile IME bug (fixed in src/lib/imeComposition.js).
--
-- What happened
-- -------------
-- The ingredient editor repurposed Enter as "commit this field, focus the
-- next". On a phone that key is also the one a soft keyboard's IME uses to
-- accept the text it is still composing. The handler ran on the composing
-- Enter too: it preventDefault()ed the key and moved focus mid-composition,
-- which orphaned the IME's composing region and re-anchored it at offset 0 of
-- the newly focused input. Every character typed afterwards was inserted at
-- index 0, so the Unit field filled up backwards --- "TBsp" reached this table
-- as "psBT". (The double capital is the same bug: with the caret pinned at 0
-- the keyboard kept seeing an empty field and re-armed auto-capitalisation.)
--
-- The code fix stops new rows being written this way; this migration repairs
-- the rows already written. 13 rows across 2 recipes at time of writing
-- ("Braised Eggs", "Butter Chicken").
--
-- Safety
-- ------
-- `unit` is deliberately free text (authors legitimately store 'pouch',
-- 'large spoons', 'Bottle'), so this does NOT normalise the column. It rewrites
-- only the exact damaged strings listed below, each of which is the reverse of
-- a canonical unit in src/lib/measurementUnits.js and is not itself a word.
-- Values are repaired to the canonical label the unit combobox would have
-- stored had the suggestion been picked from the dropdown.
--
-- Mirrors repairReversedUnit() in src/lib/measurementUnits.js — the specs in
-- src/lib/measurementUnits.test.js cover this exact mapping.
--
-- ============================================================
-- Run in Supabase Dashboard → SQL Editor.
-- Idempotent — a second run matches nothing and updates 0 rows.

BEGIN;

WITH repairs (damaged, canonical) AS (
  VALUES
    ('noopselbAT', 'tablespoon'),  -- typed "TAblespoon"
    ('psBT',       'tablespoon'),  -- typed "TBsp"
    ('pST',        'teaspoon'),    -- typed "TSp"
    ('pUC',        'cup'),         -- typed "CUp"
    ('sklaTS',     'stalk'),       -- typed "STalks"
    ('sevoLC',     'clove'),       -- typed "CLoves"
    ('seceIP',     'piece')        -- typed "PIeces"
)
UPDATE public.ingredients AS i
   SET unit = r.canonical
  FROM repairs AS r
 WHERE i.unit = r.damaged;

COMMIT;

-- Verification — expect 0 rows after the update.
-- SELECT id, recipe_id, name, quantity, unit
--   FROM public.ingredients
--  WHERE unit IN ('noopselbAT','psBT','pST','pUC','sklaTS','sevoLC','seceIP');
