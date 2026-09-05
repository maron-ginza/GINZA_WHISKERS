import * as migration_20260812_042504_initial_schema from './20260812_042504_initial_schema';
import * as migration_20260903_120000_article_facts_common_fields from './20260903_120000_article_facts_common_fields';
import * as migration_20260903_180000_official_snapshots from './20260903_180000_official_snapshots';

export const migrations = [
  {
    up: migration_20260812_042504_initial_schema.up,
    down: migration_20260812_042504_initial_schema.down,
    name: '20260812_042504_initial_schema'
  },
  {
    up: migration_20260903_120000_article_facts_common_fields.up,
    down: migration_20260903_120000_article_facts_common_fields.down,
    name: '20260903_120000_article_facts_common_fields'
  },
  {
    up: migration_20260903_180000_official_snapshots.up,
    down: migration_20260903_180000_official_snapshots.down,
    name: '20260903_180000_official_snapshots'
  },
];
