import * as migration_1731880000000_merge_master_card_list_into_one from './1731880000000_merge_master_card_list_into_one';
import * as migration_1731900000000_drop_media_table from './1731900000000_drop_media_table';
import * as migration_1731920000000_add_master_card_list_image_urls from './1731920000000_add_master_card_list_image_urls';
import * as migration_1731930000000_add_relationship_columns_for_brands_sets from './1731930000000_add_relationship_columns_for_brands_sets';
import * as migration_1731940000000_drop_master_card_list_boosters_pricing_updated from './1731940000000_drop_master_card_list_boosters_pricing_updated';
import * as migration_1731950000000_drop_sets_variant_count_columns from './1731950000000_drop_sets_variant_count_columns';
import * as migration_1731960000000_drop_sets_legality_columns from './1731960000000_drop_sets_legality_columns';
import * as migration_1731970000000_update_product_type_category_relationship from './1731970000000_update_product_type_category_relationship';
import * as migration_1731980000000_add_series_collection from './1731980000000_add_series_collection';
import * as migration_1731990000000_link_sets_series_name_to_series_table from './1731990000000_link_sets_series_name_to_series_table';
import * as migration_1732000000000_drop_sets_serie_id_column from './1732000000000_drop_sets_serie_id_column';
import * as migration_1732010000000_drop_unused_master_card_list_fields from './1732010000000_drop_unused_master_card_list_fields';
import * as migration_1732020000000_drop_more_master_card_list_fields from './1732020000000_drop_more_master_card_list_fields';
import * as migration_1732030000000_drop_master_card_list_level_suffix from './1732030000000_drop_master_card_list_level_suffix';
import * as migration_1732040000000_drop_master_card_list_supertype from './1732040000000_drop_master_card_list_supertype';
import * as migration_1732050000000_drop_master_card_list_image_url_columns from './1732050000000_drop_master_card_list_image_url_columns';
import * as migration_1732060000000_add_sets_tcgdex_id from './1732060000000_add_sets_tcgdex_id';
import * as migration_1732070000000_add_catalog_card_pricing from './1732070000000_add_catalog_card_pricing';
import * as migration_1732080000000_add_master_card_list_cardmarket_listing_version from './1732080000000_add_master_card_list_cardmarket_listing_version';

export const migrations = [
  {
    up: migration_1731880000000_merge_master_card_list_into_one.up,
    down: migration_1731880000000_merge_master_card_list_into_one.down,
    name: '1731880000000_merge_master_card_list_into_one',
  },
  {
    up: migration_1731900000000_drop_media_table.up,
    down: migration_1731900000000_drop_media_table.down,
    name: '1731900000000_drop_media_table',
  },
  {
    up: migration_1731920000000_add_master_card_list_image_urls.up,
    down: migration_1731920000000_add_master_card_list_image_urls.down,
    name: '1731920000000_add_master_card_list_image_urls',
  },
  {
    up: migration_1731930000000_add_relationship_columns_for_brands_sets.up,
    down: migration_1731930000000_add_relationship_columns_for_brands_sets.down,
    name: '1731930000000_add_relationship_columns_for_brands_sets',
  },
  {
    up: migration_1731940000000_drop_master_card_list_boosters_pricing_updated.up,
    down: migration_1731940000000_drop_master_card_list_boosters_pricing_updated.down,
    name: '1731940000000_drop_master_card_list_boosters_pricing_updated',
  },
  {
    up: migration_1731950000000_drop_sets_variant_count_columns.up,
    down: migration_1731950000000_drop_sets_variant_count_columns.down,
    name: '1731950000000_drop_sets_variant_count_columns',
  },
  {
    up: migration_1731960000000_drop_sets_legality_columns.up,
    down: migration_1731960000000_drop_sets_legality_columns.down,
    name: '1731960000000_drop_sets_legality_columns',
  },
  {
    up: migration_1731970000000_update_product_type_category_relationship.up,
    down: migration_1731970000000_update_product_type_category_relationship.down,
    name: '1731970000000_update_product_type_category_relationship',
  },
  {
    up: migration_1731980000000_add_series_collection.up,
    down: migration_1731980000000_add_series_collection.down,
    name: '1731980000000_add_series_collection',
  },
  {
    up: migration_1731990000000_link_sets_series_name_to_series_table.up,
    down: migration_1731990000000_link_sets_series_name_to_series_table.down,
    name: '1731990000000_link_sets_series_name_to_series_table',
  },
  {
    up: migration_1732000000000_drop_sets_serie_id_column.up,
    down: migration_1732000000000_drop_sets_serie_id_column.down,
    name: '1732000000000_drop_sets_serie_id_column',
  },
  {
    up: migration_1732010000000_drop_unused_master_card_list_fields.up,
    down: migration_1732010000000_drop_unused_master_card_list_fields.down,
    name: '1732010000000_drop_unused_master_card_list_fields',
  },
  {
    up: migration_1732020000000_drop_more_master_card_list_fields.up,
    down: migration_1732020000000_drop_more_master_card_list_fields.down,
    name: '1732020000000_drop_more_master_card_list_fields',
  },
  {
    up: migration_1732030000000_drop_master_card_list_level_suffix.up,
    down: migration_1732030000000_drop_master_card_list_level_suffix.down,
    name: '1732030000000_drop_master_card_list_level_suffix',
  },
  {
    up: migration_1732040000000_drop_master_card_list_supertype.up,
    down: migration_1732040000000_drop_master_card_list_supertype.down,
    name: '1732040000000_drop_master_card_list_supertype',
  },
  {
    up: migration_1732050000000_drop_master_card_list_image_url_columns.up,
    down: migration_1732050000000_drop_master_card_list_image_url_columns.down,
    name: '1732050000000_drop_master_card_list_image_url_columns',
  },
  {
    up: migration_1732060000000_add_sets_tcgdex_id.up,
    down: migration_1732060000000_add_sets_tcgdex_id.down,
    name: '1732060000000_add_sets_tcgdex_id',
  },
  {
    up: migration_1732070000000_add_catalog_card_pricing.up,
    down: migration_1732070000000_add_catalog_card_pricing.down,
    name: '1732070000000_add_catalog_card_pricing',
  },
  {
    up: migration_1732080000000_add_master_card_list_cardmarket_listing_version.up,
    down: migration_1732080000000_add_master_card_list_cardmarket_listing_version.down,
    name: '1732080000000_add_master_card_list_cardmarket_listing_version',
  },
];
