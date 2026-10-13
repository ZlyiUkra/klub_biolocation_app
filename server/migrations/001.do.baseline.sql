-- Baseline migration (T010 of specs/001-self-hosted-club-site).
--
-- It creates nothing the data model needs; its job is to prove the pipeline end to end on an empty database:
-- postgrator records its version and checksum in schema_version, and every later migration builds on that.
-- The tables of the data model arrive in 002 and later, each with its story.
comment on schema public is 'klub_biolocation_app: schema owned by server/migrations, applied by postgrator';
