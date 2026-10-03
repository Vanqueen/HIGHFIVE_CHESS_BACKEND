#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/34a1bf1225376bd559928aa05f3a70a70142915251543c53f96b3aacbd85984a/contract';
import endContract from '../../snapshots/34a1bf1225376bd559928aa05f3a70a70142915251543c53f96b3aacbd85984a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Achievement',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('iconUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isActive', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requirementType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('requirementValue', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Achievement_category_check_77213be3',
            "\"category\" IN ('GAMES', 'WINS', 'RATING', 'TOURNAMENT', 'SOCIAL', 'SPECIAL')",
          ),
          checkExpression(
            'Achievement_requirementType_check_44dd90a8',
            "\"requirementType\" IN ('GAMES_PLAYED', 'WINS', 'DRAWS', 'TOURNAMENTS_PLAYED', 'TOURNAMENTS_WON', 'RATING_REACHED', 'FRIENDS_COUNT', 'STREAK')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'BlockedUser',
        columns: [
          col('blockedUserId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('blockerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Challenge',
        columns: [
          col('acceptedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('creatorId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('invitedUserId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Challenge_status_check_b5ea3388',
            "\"status\" IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Conversation',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Conversation_type_check_9e08b007',
            "\"type\" IN ('DIRECT', 'GROUP', 'TOURNAMENT', 'GAME')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ConversationParticipant',
        columns: [
          col('conversationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lastReadAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('leftAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Friendship',
        columns: [
          col('addresseeId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('requesterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('respondedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Friendship_status_check_904c6455',
            "\"status\" IN ('PENDING', 'ACCEPTED', 'REJECTED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Game',
        columns: [
          col('activeColor', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('blackTimeRemainingMs', 'int8', {
            notNull: true,
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('challengeId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('clockStartedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('currentFen', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('drawOfferParticipantId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('endedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('incrementSeconds', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('initialTimeSeconds', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isRated', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('lastActivityAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lastMoveAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('ratingCategory', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('result', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('WAITING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('terminationReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tournamentRoundId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('whiteTimeRemainingMs', 'int8', {
            notNull: true,
            codecRef: { codecId: 'pg/int8@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Game_activeColor_check_7e94350b',
            "\"activeColor\" IN ('WHITE', 'BLACK')",
          ),
          checkExpression(
            'Game_ratingCategory_check_4467f7fa',
            "\"ratingCategory\" IN ('BLITZ', 'RAPID', 'CLASSICAL')",
          ),
          checkExpression(
            'Game_result_check_59b55c28',
            "\"result\" IN ('WHITE_WIN', 'BLACK_WIN', 'DRAW')",
          ),
          checkExpression(
            'Game_status_check_3b0189e9',
            "\"status\" IN ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')",
          ),
          checkExpression(
            'Game_terminationReason_check_47aab425',
            "\"terminationReason\" IN ('CHECKMATE', 'TIMEOUT', 'RESIGNATION', 'ABANDONMENT', 'DISCONNECTION', 'AGREEMENT', 'STALEMATE', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'INSUFFICIENT_MATERIAL', 'CANCELLED')",
          ),
          checkExpression(
            'Game_type_check_fffd59f3',
            "\"type\" IN ('LOCAL', 'ONLINE', 'AI', 'CHALLENGE', 'TOURNAMENT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'GameAnalysis',
        columns: [
          col('accuracyBlack', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('accuracyWhite', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('analysisData', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('analyzedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('bestLine', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('depth', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('engine', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('engineVersion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('evaluation', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('gameId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'GameParticipant',
        columns: [
          col('color', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('displayName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gameId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('participantType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tournamentParticipantId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'GameParticipant_color_check_1b276a2b',
            "\"color\" IN ('WHITE', 'BLACK')",
          ),
          checkExpression(
            'GameParticipant_participantType_check_a37f8cda',
            "\"participantType\" IN ('USER', 'GUEST', 'AI')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'InvitationLink',
        columns: [
          col('challengeId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('creatorId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('currentUses', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('expiresAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('maxUses', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tournamentId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'InvitationLink_status_check_af5151dc',
            "\"status\" IN ('ACTIVE', 'EXPIRED', 'DISABLED', 'EXHAUSTED')",
          ),
          checkExpression(
            'InvitationLink_type_check_8cddd8c4',
            "\"type\" IN ('FRIEND_CHALLENGE', 'TOURNAMENT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Message',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('conversationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deletedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('editedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('messageType', 'text', {
            notNull: true,
            default: lit('TEXT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('senderId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Message_messageType_check_a7dcd370',
            "\"messageType\" IN ('TEXT', 'SYSTEM')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Move',
        columns: [
          col('fenAfter', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('from', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('gameId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('moveNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('participantId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('playedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('ply', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('promotion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('san', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('to', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Move_promotion_check_35b942cf',
            "\"promotion\" IN ('QUEEN', 'ROOK', 'BISHOP', 'KNIGHT')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Notification',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('data', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('expiresAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('readAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Notification_type_check_dbad3a07',
            "\"type\" IN ('FRIEND_REQUEST', 'FRIEND_REQUEST_ACCEPTED', 'CHALLENGE_RECEIVED', 'CHALLENGE_ACCEPTED', 'GAME_STARTED', 'GAME_FINISHED', 'GAME_YOUR_TURN', 'TOURNAMENT_INVITATION', 'TOURNAMENT_STARTED', 'TOURNAMENT_ROUND_STARTED', 'TOURNAMENT_ROUND_FINISHED', 'SYSTEM')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PasswordResetCode',
        columns: [
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('usedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Rating',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
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
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('losses', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('provisional', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('rating', 'int4', {
            notNull: true,
            default: lit(1500),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('wins', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Rating_category_check_7ced85f0',
            "\"category\" IN ('BLITZ', 'RAPID', 'CLASSICAL')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'RatingHistory',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('gameId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('opponentRating', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingAfter', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingBefore', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingChange', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('result', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'RatingHistory_result_check_59b55c28',
            "\"result\" IN ('WHITE_WIN', 'BLACK_WIN', 'DRAW')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'RefreshToken',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('sessionId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Report',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gameId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('messageId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reportedUserId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reporterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('resolutionNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('reviewedById', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Report_reason_check_83e296a3',
            "\"reason\" IN ('CHEATING', 'HARASSMENT', 'INSULT', 'SPAM', 'INAPPROPRIATE_CONTENT', 'FAKE_ACCOUNT', 'OTHER')",
          ),
          checkExpression(
            'Report_status_check_2b23e86d',
            "\"status\" IN ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'Session',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastActivityAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Tournament',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endsAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('format', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isRated', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('maxParticipants', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('organizerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ratingCategory', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registrationEndsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('registrationStartsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('startsAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Tournament_format_check_287fe12d',
            "\"format\" IN ('SWISS', 'ROUND_ROBIN')",
          ),
          checkExpression(
            'Tournament_ratingCategory_check_4467f7fa',
            "\"ratingCategory\" IN ('BLITZ', 'RAPID', 'CLASSICAL')",
          ),
          checkExpression(
            'Tournament_status_check_5c8c11eb',
            "\"status\" IN ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'TournamentParticipant',
        columns: [
          col('accessTokenHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('displayName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('draws', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('eliminatedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('invitationLinkId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('leftAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('losses', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('participantType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('score', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('seed', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('REGISTERED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tournamentId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('wins', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'TournamentParticipant_participantType_check_9f0a184d',
            "\"participantType\" IN ('USER', 'GUEST')",
          ),
          checkExpression(
            'TournamentParticipant_status_check_58e5f6d0',
            "\"status\" IN ('REGISTERED', 'ACTIVE', 'WITHDRAWN', 'DISQUALIFIED', 'FINISHED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'TournamentRound',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('endsAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('roundNumber', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('startsAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tournamentId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'TournamentRound_status_check_f8ea8ff2',
            "\"status\" IN ('PENDING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('accountStatus', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('avatarUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('connectionStatus', 'text', {
            notNull: true,
            default: lit('OFFLINE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deletedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('failedLoginAttempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastLoginAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('lockedUntil', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('passwordHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('USER'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('username', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'User_accountStatus_check_f586ef52',
            "\"accountStatus\" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')",
          ),
          checkExpression(
            'User_connectionStatus_check_345ac023',
            "\"connectionStatus\" IN ('ONLINE', 'OFFLINE')",
          ),
          checkExpression('User_role_check_ce52134d', "\"role\" IN ('USER', 'ORGANIZER', 'ADMIN')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'UserAchievement',
        columns: [
          col('achievementId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('progress', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('unlockedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Achievement',
        constraint: 'Achievement_code_key',
        columns: ['code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'BlockedUser',
        constraint: 'BlockedUser_blockerId_blockedUserId_key',
        columns: ['blockerId', 'blockedUserId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ConversationParticipant',
        constraint: 'ConversationParticipant_conversationId_userId_key',
        columns: ['conversationId', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Friendship',
        constraint: 'Friendship_requesterId_addresseeId_key',
        columns: ['requesterId', 'addresseeId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'GameParticipant',
        constraint: 'GameParticipant_gameId_color_key',
        columns: ['gameId', 'color'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'InvitationLink',
        constraint: 'InvitationLink_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Move',
        constraint: 'Move_gameId_ply_key',
        columns: ['gameId', 'ply'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Rating',
        constraint: 'Rating_userId_category_key',
        columns: ['userId', 'category'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'RefreshToken',
        constraint: 'RefreshToken_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TournamentParticipant',
        constraint: 'TournamentParticipant_accessTokenHash_key',
        columns: ['accessTokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'TournamentRound',
        constraint: 'TournamentRound_tournamentId_roundNumber_key',
        columns: ['tournamentId', 'roundNumber'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_username_key',
        columns: ['username'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'UserAchievement',
        constraint: 'UserAchievement_userId_achievementId_key',
        columns: ['userId', 'achievementId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Achievement',
        index: 'Achievement_category_idx_f2600f8e',
        columns: ['category'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Achievement',
        index: 'Achievement_isActive_idx_77fe3ba1',
        columns: ['isActive'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Achievement',
        index: 'Achievement_requirementType_idx_0f152f52',
        columns: ['requirementType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlockedUser',
        index: 'BlockedUser_blockedUserId_idx_a318a61f',
        columns: ['blockedUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'BlockedUser',
        index: 'BlockedUser_blockerId_idx_a25bd35c',
        columns: ['blockerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Challenge',
        index: 'Challenge_creatorId_idx_3a77d800',
        columns: ['creatorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Challenge',
        index: 'Challenge_invitedUserId_idx_6d7a33d8',
        columns: ['invitedUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Conversation',
        index: 'Conversation_type_idx_b6b604ea',
        columns: ['type'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ConversationParticipant',
        index: 'ConversationParticipant_conversationId_idx_669215a6',
        columns: ['conversationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ConversationParticipant',
        index: 'ConversationParticipant_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Friendship',
        index: 'Friendship_addresseeId_idx_d745efab',
        columns: ['addresseeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Friendship',
        index: 'Friendship_requesterId_idx_a5f4af92',
        columns: ['requesterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Friendship',
        index: 'Friendship_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_drawOfferParticipantId_idx_2d4d6f09',
        columns: ['drawOfferParticipantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_lastActivityAt_idx_49f89ccf',
        columns: ['lastActivityAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_tournamentRoundId_idx_6ec826a2',
        columns: ['tournamentRoundId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Game',
        index: 'Game_type_idx_b6b604ea',
        columns: ['type'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GameAnalysis',
        index: 'GameAnalysis_analyzedAt_idx_105c0c57',
        columns: ['analyzedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GameAnalysis',
        index: 'GameAnalysis_engine_idx_da260d1b',
        columns: ['engine'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GameAnalysis',
        index: 'GameAnalysis_gameId_idx_6cdb47f8',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GameParticipant',
        index: 'GameParticipant_gameId_idx_6cdb47f8',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GameParticipant',
        index: 'GameParticipant_tournamentParticipantId_idx_eb531a7e',
        columns: ['tournamentParticipantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'GameParticipant',
        index: 'GameParticipant_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'InvitationLink',
        index: 'InvitationLink_challengeId_idx_73b8115d',
        columns: ['challengeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'InvitationLink',
        index: 'InvitationLink_creatorId_idx_3a77d800',
        columns: ['creatorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'InvitationLink',
        index: 'InvitationLink_tournamentId_idx_d0bd97a6',
        columns: ['tournamentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_conversationId_idx_669215a6',
        columns: ['conversationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_senderId_idx_4689c490',
        columns: ['senderId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Move',
        index: 'Move_gameId_idx_6cdb47f8',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Move',
        index: 'Move_participantId_idx_e6c70ceb',
        columns: ['participantId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_readAt_idx_1b4c936e',
        columns: ['readAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_type_idx_b6b604ea',
        columns: ['type'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PasswordResetCode',
        index: 'PasswordResetCode_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PasswordResetCode',
        index: 'PasswordResetCode_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Rating',
        index: 'Rating_category_rating_idx_431f0af6',
        columns: ['category', 'rating'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Rating',
        index: 'Rating_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RatingHistory',
        index: 'RatingHistory_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RatingHistory',
        index: 'RatingHistory_gameId_idx_6cdb47f8',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RatingHistory',
        index: 'RatingHistory_ratingId_idx_5fb55689',
        columns: ['ratingId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RefreshToken',
        index: 'RefreshToken_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RefreshToken',
        index: 'RefreshToken_sessionId_idx_29f415d4',
        columns: ['sessionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'RefreshToken',
        index: 'RefreshToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_gameId_idx_6cdb47f8',
        columns: ['gameId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_messageId_idx_3cdded8d',
        columns: ['messageId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_reportedUserId_idx_3f833bb2',
        columns: ['reportedUserId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_reporterId_idx_aa245831',
        columns: ['reporterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_reviewedById_idx_e2835478',
        columns: ['reviewedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Report',
        index: 'Report_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Session',
        index: 'Session_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Tournament',
        index: 'Tournament_organizerId_idx_17a44ca9',
        columns: ['organizerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Tournament',
        index: 'Tournament_startsAt_idx_5ff0df68',
        columns: ['startsAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Tournament',
        index: 'Tournament_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TournamentParticipant',
        index: 'TournamentParticipant_invitationLinkId_idx_b4ef4e91',
        columns: ['invitationLinkId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TournamentParticipant',
        index: 'TournamentParticipant_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TournamentParticipant',
        index: 'TournamentParticipant_tournamentId_idx_d0bd97a6',
        columns: ['tournamentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TournamentParticipant',
        index: 'TournamentParticipant_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TournamentRound',
        index: 'TournamentRound_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'TournamentRound',
        index: 'TournamentRound_tournamentId_idx_d0bd97a6',
        columns: ['tournamentId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserAchievement',
        index: 'UserAchievement_achievementId_idx_05a27a05',
        columns: ['achievementId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserAchievement',
        index: 'UserAchievement_unlockedAt_idx_478f3bd2',
        columns: ['unlockedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserAchievement',
        index: 'UserAchievement_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlockedUser',
        foreignKey: {
          name: 'BlockedUser_blockerId_fkey',
          columns: ['blockerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'BlockedUser',
        foreignKey: {
          name: 'BlockedUser_blockedUserId_fkey',
          columns: ['blockedUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Challenge',
        foreignKey: {
          name: 'Challenge_creatorId_fkey',
          columns: ['creatorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Challenge',
        foreignKey: {
          name: 'Challenge_invitedUserId_fkey',
          columns: ['invitedUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ConversationParticipant',
        foreignKey: {
          name: 'ConversationParticipant_conversationId_fkey',
          columns: ['conversationId'],
          references: { schema: 'public', table: 'Conversation', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ConversationParticipant',
        foreignKey: {
          name: 'ConversationParticipant_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Friendship',
        foreignKey: {
          name: 'Friendship_requesterId_fkey',
          columns: ['requesterId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Friendship',
        foreignKey: {
          name: 'Friendship_addresseeId_fkey',
          columns: ['addresseeId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Game',
        foreignKey: {
          name: 'Game_drawOfferParticipantId_fkey',
          columns: ['drawOfferParticipantId'],
          references: { schema: 'public', table: 'GameParticipant', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Game',
        foreignKey: {
          name: 'Game_tournamentRoundId_fkey',
          columns: ['tournamentRoundId'],
          references: { schema: 'public', table: 'TournamentRound', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Game',
        foreignKey: {
          name: 'Game_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'Challenge', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GameAnalysis',
        foreignKey: {
          name: 'GameAnalysis_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GameParticipant',
        foreignKey: {
          name: 'GameParticipant_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GameParticipant',
        foreignKey: {
          name: 'GameParticipant_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'GameParticipant',
        foreignKey: {
          name: 'GameParticipant_tournamentParticipantId_fkey',
          columns: ['tournamentParticipantId'],
          references: { schema: 'public', table: 'TournamentParticipant', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InvitationLink',
        foreignKey: {
          name: 'InvitationLink_creatorId_fkey',
          columns: ['creatorId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InvitationLink',
        foreignKey: {
          name: 'InvitationLink_tournamentId_fkey',
          columns: ['tournamentId'],
          references: { schema: 'public', table: 'Tournament', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InvitationLink',
        foreignKey: {
          name: 'InvitationLink_challengeId_fkey',
          columns: ['challengeId'],
          references: { schema: 'public', table: 'Challenge', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Message',
        foreignKey: {
          name: 'Message_conversationId_fkey',
          columns: ['conversationId'],
          references: { schema: 'public', table: 'Conversation', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Message',
        foreignKey: {
          name: 'Message_senderId_fkey',
          columns: ['senderId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Move',
        foreignKey: {
          name: 'Move_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Move',
        foreignKey: {
          name: 'Move_participantId_fkey',
          columns: ['participantId'],
          references: { schema: 'public', table: 'GameParticipant', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Notification',
        foreignKey: {
          name: 'Notification_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PasswordResetCode',
        foreignKey: {
          name: 'PasswordResetCode_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Rating',
        foreignKey: {
          name: 'Rating_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'RatingHistory',
        foreignKey: {
          name: 'RatingHistory_ratingId_fkey',
          columns: ['ratingId'],
          references: { schema: 'public', table: 'Rating', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'RatingHistory',
        foreignKey: {
          name: 'RatingHistory_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'RefreshToken',
        foreignKey: {
          name: 'RefreshToken_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'RefreshToken',
        foreignKey: {
          name: 'RefreshToken_sessionId_fkey',
          columns: ['sessionId'],
          references: { schema: 'public', table: 'Session', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Report',
        foreignKey: {
          name: 'Report_reporterId_fkey',
          columns: ['reporterId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Report',
        foreignKey: {
          name: 'Report_reportedUserId_fkey',
          columns: ['reportedUserId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Report',
        foreignKey: {
          name: 'Report_reviewedById_fkey',
          columns: ['reviewedById'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Report',
        foreignKey: {
          name: 'Report_gameId_fkey',
          columns: ['gameId'],
          references: { schema: 'public', table: 'Game', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Report',
        foreignKey: {
          name: 'Report_messageId_fkey',
          columns: ['messageId'],
          references: { schema: 'public', table: 'Message', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Session',
        foreignKey: {
          name: 'Session_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Tournament',
        foreignKey: {
          name: 'Tournament_organizerId_fkey',
          columns: ['organizerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TournamentParticipant',
        foreignKey: {
          name: 'TournamentParticipant_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TournamentParticipant',
        foreignKey: {
          name: 'TournamentParticipant_tournamentId_fkey',
          columns: ['tournamentId'],
          references: { schema: 'public', table: 'Tournament', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TournamentParticipant',
        foreignKey: {
          name: 'TournamentParticipant_invitationLinkId_fkey',
          columns: ['invitationLinkId'],
          references: { schema: 'public', table: 'InvitationLink', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'TournamentRound',
        foreignKey: {
          name: 'TournamentRound_tournamentId_fkey',
          columns: ['tournamentId'],
          references: { schema: 'public', table: 'Tournament', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserAchievement',
        foreignKey: {
          name: 'UserAchievement_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserAchievement',
        foreignKey: {
          name: 'UserAchievement_achievementId_fkey',
          columns: ['achievementId'],
          references: { schema: 'public', table: 'Achievement', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
