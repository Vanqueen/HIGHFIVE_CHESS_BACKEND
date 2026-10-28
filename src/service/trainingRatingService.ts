import { db } from "../prisma/db.ts";
import HttpError from "./errorService";

const SPECIAL_COURSE_UNLOCK_RATING = 800;
const INTERMEDIATE_LEVEL_UNLOCK_RATING = 500;
const ADVANCED_LEVEL_UNLOCK_RATING = 800;
const FINAL_BEGINNER_LESSON_UNLOCK_RATING = 220;
const RATING_LOCKED_BEGINNER_LESSONS = new Set(["queen", "king", "check"]);
const INTERMEDIATE_LESSONS = new Set(["intermediateTactics", "intermediateStrategy", "intermediateEndgames"]);
const ADVANCED_LESSONS = new Set(["advancedCalculation", "advancedPin", "advancedEndgames"]);

// Beginner curriculum: rewards rise with lesson complexity and total 500 points.
// The first three intermediate lessons will each award 100 points, so 800
// represents the complete beginner curriculum plus initial intermediate progress.
const LESSON_RATING_POINTS: Record<string, number> = {
  pawn: 40,
  knight: 55,
  bishop: 60,
  rook: 65,
  queen: 85,
  king: 90,
  check: 105,
  intermediateTactics: 100,
  intermediateStrategy: 100,
  intermediateEndgames: 100,
  advancedCalculation: 150,
  advancedPin: 175,
  advancedEndgames: 200,
};

// Only lessons with server-validated interactive steps can currently award points.
const AVAILABLE_LESSONS: Record<string, { difficultyRating: number; requiredMoves: string[] }> = {
  pawn: { difficultyRating: 500, requiredMoves: ["e2e3", "e2e4", "e4d5"] },
  knight: { difficultyRating: 550, requiredMoves: ["g1f3", "f3e5"] },
  bishop: { difficultyRating: 600, requiredMoves: ["f1c4", "c4f7"] },
  rook: { difficultyRating: 650, requiredMoves: ["a1a4", "a4h4"] },
  queen: { difficultyRating: 850, requiredMoves: ["d1d4", "d4h8"] },
  king: { difficultyRating: 900, requiredMoves: ["e1e2", "e2d3"] },
  check: { difficultyRating: 1000, requiredMoves: ["e1f1", "h1g1"] },
  intermediateTactics: { difficultyRating: 1200, requiredMoves: ["f2e4", "e4f6"] },
  intermediateStrategy: { difficultyRating: 1250, requiredMoves: ["e5e6", "e6e7", "e7e8"] },
  intermediateEndgames: { difficultyRating: 1300, requiredMoves: ["e2e3", "e3d4"] },
  advancedCalculation: { difficultyRating: 1500, requiredMoves: ["h5f7", "f7e8"] },
  advancedPin: { difficultyRating: 1550, requiredMoves: ["c4b5", "b5c6"] },
  advancedEndgames: { difficultyRating: 1600, requiredMoves: ["a1a4", "a6a7"] },
};

function ratingForCompletedLessons(lessonIds: string[]) {
  return lessonIds.reduce((total, lessonId) => total + (LESSON_RATING_POINTS[lessonId] ?? 0), 0);
}

function getUnlockProgress(rating: number) {
  return {
    specialCoursesUnlocked: rating >= SPECIAL_COURSE_UNLOCK_RATING,
    specialCoursesUnlockRating: SPECIAL_COURSE_UNLOCK_RATING,
  };
}

export class TrainingRatingService {
  static async getForUser(userId: number) {
    const completions = await db.orm.public.TrainingLessonCompletion
      .select("lessonId")
      .where({ userId })
      .orderBy((completion) => completion.completedAt.asc())
      .all();

    // Derive the score from the completion ledger so accounts that finished a
    // lesson before the fixed point values were introduced receive the new value.
    const rating = ratingForCompletedLessons(completions.map((completion) => completion.lessonId));
    return {
      rating,
      lessonsCompleted: completions.length,
      completedLessons: completions.map((completion) => completion.lessonId),
      ...getUnlockProgress(rating),
    };
  }

  static async completeLesson(userId: number, lessonId: string, moves: string[]) {
    const lesson = AVAILABLE_LESSONS[lessonId];
    const ratingChange = LESSON_RATING_POINTS[lessonId];
    if (!lesson || ratingChange === undefined) {
      throw new HttpError("Cette leçon n’est pas disponible pour le moment.", 404, false);
    }
    if (JSON.stringify(moves) !== JSON.stringify(lesson.requiredMoves)) {
      throw new HttpError("Les étapes de la leçon ne sont pas toutes validées.", 422, false);
    }

    return db.transaction(async (tx) => {
      // Serialize this user's completions so parallel requests cannot award Elo twice
      // or overwrite a rating update from another lesson.
      const lock = db.raw.sql`
        SELECT pg_advisory_xact_lock(117835, ${userId})
      `.affectedCount().build();
      await tx.execute(lock);

      const [completions, progress] = await Promise.all([
        tx.orm.public.TrainingLessonCompletion
          .select("lessonId")
          .where({ userId })
          .orderBy((completion) => completion.completedAt.asc())
          .all(),
        tx.orm.public.TrainingRating.where({ userId }).first(),
      ]);
      const completedLessonIds = completions.map((completion) => completion.lessonId);
      const ratingBefore = ratingForCompletedLessons(completedLessonIds);
      const existingCompletion = completedLessonIds.includes(lessonId);

      if (existingCompletion) {
        if (progress && (progress.rating !== ratingBefore || progress.lessonsCompleted !== completedLessonIds.length)) {
          await tx.orm.public.TrainingRating.where({ userId }).update({
            rating: ratingBefore,
            lessonsCompleted: completedLessonIds.length,
          });
        }
        return {
          rating: ratingBefore,
          lessonsCompleted: completedLessonIds.length,
          completedLessons: completedLessonIds,
          ...getUnlockProgress(ratingBefore),
          ratingChange: 0,
          alreadyCompleted: true,
        };
      }

      if (RATING_LOCKED_BEGINNER_LESSONS.has(lessonId) && ratingBefore < FINAL_BEGINNER_LESSON_UNLOCK_RATING) {
        throw new HttpError("Atteins 220 Elo d’entraînement pour débloquer cette leçon.", 403, false);
      }
      if (INTERMEDIATE_LESSONS.has(lessonId) && ratingBefore < INTERMEDIATE_LEVEL_UNLOCK_RATING) {
        throw new HttpError("Termine le parcours débutant pour débloquer les leçons intermédiaires.", 403, false);
      }
      if (ADVANCED_LESSONS.has(lessonId) && ratingBefore < ADVANCED_LEVEL_UNLOCK_RATING) {
        throw new HttpError("Atteins 800 Elo d’entraînement pour débloquer le parcours avancé.", 403, false);
      }

      const ratingAfter = ratingBefore + ratingChange;

      await tx.orm.public.TrainingLessonCompletion.create({
        userId,
        lessonId,
        difficultyRating: lesson.difficultyRating,
        ratingBefore,
        ratingAfter,
        ratingChange,
      });

      if (progress) {
        await tx.orm.public.TrainingRating.where({ userId }).update({
          rating: ratingAfter,
          lessonsCompleted: completedLessonIds.length + 1,
        });
      } else {
        await tx.orm.public.TrainingRating.create({
          userId,
          rating: ratingAfter,
          lessonsCompleted: completedLessonIds.length + 1,
        });
      }

      const completedLessons = [...completedLessonIds, lessonId];

      return {
        rating: ratingAfter,
        lessonsCompleted: completedLessons.length,
        completedLessons,
        ...getUnlockProgress(ratingAfter),
        ratingChange,
        alreadyCompleted: false,
      };
    });
  }
}
