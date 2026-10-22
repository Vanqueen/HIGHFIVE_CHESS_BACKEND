#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b7818c5d354030fc918c504f733cce7cbc969eaf233af50a374c0f84dec04d12/contract';
import startContract from '../../snapshots/b7818c5d354030fc918c504f733cce7cbc969eaf233af50a374c0f84dec04d12/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d15ebefa65df50f0887536ca861fb7bcc242b99e287b350046dd307917370709/contract';
import endContract from '../../snapshots/d15ebefa65df50f0887536ca861fb7bcc242b99e287b350046dd307917370709/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'GamePlayerStatistic',
        columns: [
          col('color', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('gameId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('gameType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('outcome', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'GamePlayerStatistic_color_check_1b276a2b',
            "\"color\" IN ('WHITE', 'BLACK')",
          ),
          checkExpression(
            'GamePlayerStatistic_gameType_check_603adf18',
            "\"gameType\" IN ('LOCAL', 'ONLINE', 'AI', 'CHALLENGE', 'TOURNAMENT')",
          ),
          checkExpression(
            'GamePlayerStatistic_outcome_check_badde9c1',
            "\"outcome\" IN ('WIN', 'LOSS', 'DRAW')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'GuestNotification',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('data', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('expiresAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('guestParticipantId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('readAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'GuestNotification_type_check_dbad3a07',
            "\"type\" IN ('FRIEND_REQUEST', 'FRIEND_REQUEST_ACCEPTED', 'CHALLENGE_RECEIVED', 'CHALLENGE_ACCEPTED', 'GAME_STARTED', 'GAME_FINISHED', 'GAME_YOUR_TURN', 'TOURNAMENT_INVITATION', 'TOURNAMENT_STARTED', 'TOURNAMENT_ROUND_STARTED', 'TOURNAMENT_ROUND_FINISHED', 'SYSTEM')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'UserStatistics',
        columns: [
          col('draws', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('gamesPlayed', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('losses', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('wins', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['userId'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GamePlayerStatistic',
        constraint: 'GamePlayerStatistic_gameId_userId_key',
        columns: ['gameId', 'userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GamePlayerStatistic',
        index: 'GamePlayerStatistic_gameId_idx_6cdb47f8',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GamePlayerStatistic',
        index: 'GamePlayerStatistic_userId_createdAt_idx_f726f04a',
        columns: ['userId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GamePlayerStatistic',
        index: 'GamePlayerStatistic_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GuestNotification',
        index: 'GuestNotification_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GuestNotification',
        index: 'GuestNotification_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GuestNotification',
        index: 'GuestNotification_guestParticipantId_idx_9a282615',
        columns: ['guestParticipantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GuestNotification',
        index: 'GuestNotification_readAt_idx_1b4c936e',
        columns: ['readAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GuestNotification',
        index: 'GuestNotification_type_idx_b6b604ea',
        columns: ['type'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GamePlayerStatistic',
        foreignKey: {
          name: 'GamePlayerStatistic_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GamePlayerStatistic',
        foreignKey: {
          name: 'GamePlayerStatistic_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GuestNotification',
        foreignKey: {
          name: 'GuestNotification_guestParticipantId_fkey',
          columns: ['guestParticipantId'],
          references: { schema: 'public', table: 'GameParticipant', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserStatistics',
        foreignKey: {
          name: 'UserStatistics_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
