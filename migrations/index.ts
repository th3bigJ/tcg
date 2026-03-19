import * as migration_1731880000000_merge_master_card_list_into_one from './1731880000000_merge_master_card_list_into_one';
import * as migration_1731900000000_drop_media_table from './1731900000000_drop_media_table';
import * as migration_1731920000000_add_master_card_list_image_urls from './1731920000000_add_master_card_list_image_urls';
import * as migration_20260318_235757 from './20260318_235757';

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
    up: migration_20260318_235757.up,
    down: migration_20260318_235757.down,
    name: '20260318_235757'
  },
];
