CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
  SELECT lower(public.unaccent('public.unaccent', $1));
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
ALTER TABLE "Story" ADD COLUMN search_vector tsvector NOT NULL DEFAULT ''::tsvector;
CREATE FUNCTION update_story_search(story_id text) RETURNS void AS $$
  UPDATE "Story" s SET search_vector =
    setweight(to_tsvector('simple', immutable_unaccent(s.title)), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce((SELECT string_agg(t.name, ' ') FROM "StoryTag" st JOIN "Tag" t ON t.id=st."tagId" WHERE st."storyId"=s.id), ''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(s.description)), 'C')
  WHERE s.id=story_id;
$$ LANGUAGE sql;
CREATE FUNCTION story_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('simple', immutable_unaccent(NEW.title)), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce((SELECT string_agg(t.name,' ') FROM "StoryTag" st JOIN "Tag" t ON t.id=st."tagId" WHERE st."storyId"=NEW.id),''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(NEW.description)), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER story_search BEFORE INSERT OR UPDATE OF title, description ON "Story" FOR EACH ROW EXECUTE FUNCTION story_search_trigger();
CREATE FUNCTION tag_link_search_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM update_story_search(OLD."storyId"); RETURN OLD; END IF;
  PERFORM update_story_search(NEW."storyId"); RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tag_link_search AFTER INSERT OR UPDATE OR DELETE ON "StoryTag" FOR EACH ROW EXECUTE FUNCTION tag_link_search_trigger();
CREATE FUNCTION tag_name_search_trigger() RETURNS trigger AS $$
DECLARE row_record RECORD;
BEGIN
  FOR row_record IN SELECT "storyId" FROM "StoryTag" WHERE "tagId"=NEW.id LOOP PERFORM update_story_search(row_record."storyId"); END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tag_name_search AFTER UPDATE OF name ON "Tag" FOR EACH ROW EXECUTE FUNCTION tag_name_search_trigger();
CREATE INDEX story_search_gin ON "Story" USING gin(search_vector);
CREATE INDEX story_title_trgm ON "Story" USING gin(immutable_unaccent(title) gin_trgm_ops);
CREATE INDEX author_name_trgm ON "User" USING gin(immutable_unaccent(name) gin_trgm_ops);
CREATE INDEX tag_name_trgm ON "Tag" USING gin(immutable_unaccent(name) gin_trgm_ops);
