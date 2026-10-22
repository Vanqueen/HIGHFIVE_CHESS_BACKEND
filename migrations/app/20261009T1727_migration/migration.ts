#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/34a1bf1225376bd559928aa05f3a70a70142915251543c53f96b3aacbd85984a/contract';
import startContract from '../../snapshots/34a1bf1225376bd559928aa05f3a70a70142915251543c53f96b3aacbd85984a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e866da003f676be1e334d94394a20631b24c276f76b8a64f079e38e72fa5135f/contract';
import endContract from '../../snapshots/e866da003f676be1e334d94394a20631b24c276f76b8a64f079e38e72fa5135f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('emailChangeCodeHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('emailChangeExpiresAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('pendingEmail', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_pendingEmail_key',
        columns: ['pendingEmail'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
