#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3720491cd100f4ee5e3944350c68a37d0138d3fccf26a13253cfd69c3273082d/contract';
import startContract from '../../snapshots/3720491cd100f4ee5e3944350c68a37d0138d3fccf26a13253cfd69c3273082d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d32e8d2cf5996e22db3e9738d1f1ab2588a15144e347265c856a833c04c3c4df/contract';
import endContract from '../../snapshots/d32e8d2cf5996e22db3e9738d1f1ab2588a15144e347265c856a833c04c3c4df/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'TrainingLessonCompletion',
        columns: [
          col('completedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('difficultyRating', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lessonId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ratingAfter', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingBefore', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingChange', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'TrainingRating',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lessonsCompleted', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('rating', 'int4', {
            notNull: true,
            default: lit(400),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['userId'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TrainingLessonCompletion',
        constraint: 'TrainingLessonCompletion_userId_lessonId_key',
        columns: ['userId', 'lessonId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TrainingLessonCompletion',
        index: 'TrainingLessonCompletion_userId_completedAt_idx_97946ef5',
        columns: ['userId', 'completedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TrainingLessonCompletion',
        index: 'TrainingLessonCompletion_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TrainingLessonCompletion',
        foreignKey: {
          name: 'TrainingLessonCompletion_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TrainingRating',
        foreignKey: {
          name: 'TrainingRating_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
