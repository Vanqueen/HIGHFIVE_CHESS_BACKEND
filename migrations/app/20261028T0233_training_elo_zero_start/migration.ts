#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2bc13d4e42dc713a948d2a1fb8b00b9110c7718cc22bb659cb6a308c579b5ee7/contract';
import endContract from '../../snapshots/2bc13d4e42dc713a948d2a1fb8b00b9110c7718cc22bb659cb6a308c579b5ee7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d32e8d2cf5996e22db3e9738d1f1ab2588a15144e347265c856a833c04c3c4df/contract';
import startContract from '../../snapshots/d32e8d2cf5996e22db3e9738d1f1ab2588a15144e347265c856a833c04c3c4df/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.setDefault({
        schema: 'public',
        table: 'TrainingRating',
        column: 'rating',
        defaultSql: 'DEFAULT 0',
        operationClass: 'widening',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
