-- ---------------------------------------------------------------------------
-- Metrics nobody has measured should read as unknown, not as zero
--
-- `traffic_change_pct`, `top_country_share` and `spam_score` were NOT NULL
-- with a default of 0, so a listing added by hand or imported from a CSV that
-- does not carry them arrived with three measurements of zero.
--
-- On the public listing page that became:
--
--   "0% of the audience is based in United Kingdom"
--   "Spam score 0%"
--   "6 month trend +0%"
--
-- None of which anyone had measured. A zero is a claim; absence is the truth.
-- The distinction cannot be made while the column cannot be null, so these
-- three become nullable and lose their defaults. Existing rows keep whatever
-- they hold - this migration changes what *new* rows can express, and does not
-- rewrite history.
--
-- traffic_trend stays NOT NULL: an empty array already says "no series", which
-- is a distinction the type can carry on its own.
-- ---------------------------------------------------------------------------

alter table public.websites
  alter column traffic_change_pct drop default,
  alter column traffic_change_pct drop not null,
  alter column top_country_share drop default,
  alter column top_country_share drop not null,
  alter column spam_score drop default,
  alter column spam_score drop not null;

comment on column public.websites.top_country_share is
  'Share of audience in the primary country, 0-100. Null means not measured - do not render it as 0.';
comment on column public.websites.spam_score is
  'Null means not measured. Zero is a real, and good, value.';
comment on column public.websites.traffic_change_pct is
  'Six month change. Null means not measured; zero means measured as flat.';

-- ---------------------------------------------------------------------------
-- Clear the zeros that were never measurements
--
-- A top country share of zero is not a value any real listing can have: the
-- primary country is the one the audience is mostly in, so zero can only mean
-- the field was never filled. Those are set to null so they stop being
-- published as a fact.
--
-- spam_score and traffic_change_pct are deliberately left alone. Zero is a
-- legitimate reading for both, and this cannot tell a measured zero from an
-- unset one - so it changes neither rather than guessing wrong in either
-- direction. Anything showing a misleading zero can be corrected in the admin.
-- ---------------------------------------------------------------------------
update public.websites set top_country_share = null where top_country_share = 0;
