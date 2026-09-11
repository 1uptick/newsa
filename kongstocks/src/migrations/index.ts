import * as migration_20260911_125856_initial from './20260911_125856_initial';

export const migrations = [
  {
    up: migration_20260911_125856_initial.up,
    down: migration_20260911_125856_initial.down,
    name: '20260911_125856_initial'
  },
];
