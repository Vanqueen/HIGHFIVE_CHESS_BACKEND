#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8fc7e33115bf3e62de0bd4fefdbf854517b7c0439fffbec4640cf121c1997d79/contract';
import endContract from '../../snapshots/8fc7e33115bf3e62de0bd4fefdbf854517b7c0439fffbec4640cf121c1997d79/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e866da003f676be1e334d94394a20631b24c276f76b8a64f079e38e72fa5135f/contract';
import startContract from '../../snapshots/e866da003f676be1e334d94394a20631b24c276f76b8a64f079e38e72fa5135f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('avatarPublicId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
