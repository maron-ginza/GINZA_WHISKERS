import * as migration_20260812_042504_initial_schema from './20260812_042504_initial_schema';
import * as migration_20260903_120000_article_facts_common_fields from './20260903_120000_article_facts_common_fields';
import * as migration_20260903_180000_official_snapshots from './20260903_180000_official_snapshots';
import * as migration_20260909_120000_article_facts_admission_applicable from './20260909_120000_article_facts_admission_applicable';
import * as migration_20260910_120000_articles_paid_lane from './20260910_120000_articles_paid_lane';
import * as migration_20260910_150000_articles_paywall_anchor from './20260910_150000_articles_paywall_anchor';

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
  {
    up: migration_20260909_120000_article_facts_admission_applicable.up,
    down: migration_20260909_120000_article_facts_admission_applicable.down,
    name: '20260909_120000_article_facts_admission_applicable'
  },
  {
    up: migration_20260910_120000_articles_paid_lane.up,
    down: migration_20260910_120000_articles_paid_lane.down,
    name: '20260910_120000_articles_paid_lane'
  },
  {
    up: migration_20260910_150000_articles_paywall_anchor.up,
    down: migration_20260910_150000_articles_paywall_anchor.down,
    name: '20260910_150000_articles_paywall_anchor'
  },
];
