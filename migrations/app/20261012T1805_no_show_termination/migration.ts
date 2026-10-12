#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/ab5348b847e4004bbb52e4b52df9f7abf9ba17cbbd3749a75113ec17b5d09908/contract';
import startContract from '../../snapshots/ab5348b847e4004bbb52e4b52df9f7abf9ba17cbbd3749a75113ec17b5d09908/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b7818c5d354030fc918c504f733cce7cbc969eaf233af50a374c0f84dec04d12/contract';
import endContract from '../../snapshots/b7818c5d354030fc918c504f733cce7cbc969eaf233af50a374c0f84dec04d12/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Game',
        constraint: 'Game_terminationReason_check_47aab425',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Game',
        constraint: 'Game_terminationReason_check_813b6864',
        expression:
          "\"terminationReason\" IN ('CHECKMATE', 'TIMEOUT', 'RESIGNATION', 'ABANDONMENT', 'DISCONNECTION', 'AGREEMENT', 'STALEMATE', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'INSUFFICIENT_MATERIAL', 'CANCELLED', 'NO_SHOW')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
