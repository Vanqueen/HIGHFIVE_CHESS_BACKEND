#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8fc7e33115bf3e62de0bd4fefdbf854517b7c0439fffbec4640cf121c1997d79/contract';
import startContract from '../../snapshots/8fc7e33115bf3e62de0bd4fefdbf854517b7c0439fffbec4640cf121c1997d79/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ab5348b847e4004bbb52e4b52df9f7abf9ba17cbbd3749a75113ec17b5d09908/contract';
import endContract from '../../snapshots/ab5348b847e4004bbb52e4b52df9f7abf9ba17cbbd3749a75113ec17b5d09908/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Conversation',
        column: col('gameId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Game',
        column: col('pendingUndoParticipantId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Move',
        column: col('fenBefore', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'Conversation',
        constraint: 'Conversation_gameId_key',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_pendingUndoParticipantId_idx_b4de87a4',
        columns: ['pendingUndoParticipantId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Conversation',
        foreignKey: {
          name: 'Conversation_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Game',
        foreignKey: {
          name: 'Game_pendingUndoParticipantId_fkey',
          columns: ['pendingUndoParticipantId'],
          references: { schema: 'public', table: 'GameParticipant', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
