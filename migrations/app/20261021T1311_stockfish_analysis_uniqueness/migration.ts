#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3720491cd100f4ee5e3944350c68a37d0138d3fccf26a13253cfd69c3273082d/contract';
import endContract from '../../snapshots/3720491cd100f4ee5e3944350c68a37d0138d3fccf26a13253cfd69c3273082d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d15ebefa65df50f0887536ca861fb7bcc242b99e287b350046dd307917370709/contract';
import startContract from '../../snapshots/d15ebefa65df50f0887536ca861fb7bcc242b99e287b350046dd307917370709/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addUnique({
        schema: 'public',
        table: 'GameAnalysis',
        constraint: 'GameAnalysis_gameId_engine_key',
        columns: ['gameId', 'engine'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
