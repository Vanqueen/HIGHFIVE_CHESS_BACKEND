import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { db } from "../prisma/db.ts";
import { findGameAnalysesByGameId, createGameAnalysis } from "../repository/game-analysis.repository";
import { findMovesByGameId } from "../repository/move.repository";

const POLL_INTERVAL_MS = 30_000;
const ANALYSIS_TIMEOUT_MS = 20_000;
const MAX_ANALYZED_PLIES = 200;
const MAX_BATCH_SIZE = 2;
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type UciResult = {
  bestMove: string | null;
  evaluation: number | null;
  principalVariation: string;
  depth: number;
};

class UciSession {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly lines: ReturnType<typeof createInterface>;
  private readonly bufferedLines: string[] = [];
  private readonly waiting: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private failure: Error | undefined;

  constructor(enginePath: string) {
    this.process = spawn(enginePath, [], { stdio: "pipe", shell: false, windowsHide: true });
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on("line", (line) => {
      const next = this.waiting.shift();
      if (next) next.resolve(line);
      else this.bufferedLines.push(line);
    });
    this.process.stderr.on("data", (chunk: Buffer) => {
      const output = chunk.toString().trim();
      if (output) console.warn("[stockfish] stderr:", output.slice(0, 500));
    });
    this.process.once("error", (error) => this.fail(error));
    this.process.once("close", (code) => {
      this.fail(new Error(`Stockfish exited with code ${code ?? "unknown"}.`));
    });
  }

  private fail(error: Error) {
    this.failure = error;
    for (const waiter of this.waiting.splice(0)) waiter.reject(error);
  }

  private async nextLine(timeoutMs = ANALYSIS_TIMEOUT_MS): Promise<string> {
    if (this.failure) throw this.failure;
    const buffered = this.bufferedLines.shift();
    if (buffered !== undefined) return buffered;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(new Error(`Stockfish did not respond within ${timeoutMs} ms.`));
      }, timeoutMs);
      const waiter = {
        resolve: (line: string) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.waiting.push(waiter);
    });
  }

  private send(command: string) {
    if (!this.process.stdin.writable) throw new Error("Stockfish input stream is closed.");
    this.process.stdin.write(`${command}\n`);
  }

  async initialize() {
    this.send("uci");
    while (true) {
      const line = await this.nextLine();
      if (line.startsWith("id name ")) this.engineVersion = line.slice("id name ".length).trim();
      if (line === "uciok") break;
    }
    this.send("isready");
    while (await this.nextLine() !== "readyok") {
      if (this.failure) throw this.failure;
    }
  }

  engineVersion = "Stockfish";

  async analyze(fen: string, depth: number): Promise<UciResult> {
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth} movetime 1000`);
    let best: UciResult = {
      bestMove: null,
      evaluation: null,
      principalVariation: "",
      depth: 0,
    };
    while (true) {
      const line = await this.nextLine();
      const info = /^info depth (\d+).*?score (cp|mate) (-?\d+).*?(?: pv (.+))?$/.exec(line);
      if (info) {
        const currentDepth = Number(info[1]);
        if (currentDepth >= best.depth) {
          const score = Number(info[3]);
          best = {
            ...best,
            evaluation: info[2] === "mate" ? Math.sign(score || 1) * 100_000 : score,
            principalVariation: info[4] ?? "",
            depth: currentDepth,
          };
        }
      }
      const move = /^bestmove (\S+)/.exec(line);
      if (move) {
        return { ...best, bestMove: move[1] === "(none)" ? null : move[1] };
      }
    }
  }

  async close() {
    if (this.process.exitCode === null && this.process.signalCode === null) {
      try {
        this.send("quit");
      } catch {
        this.process.kill();
      }
      await Promise.race([
        new Promise<void>((resolve) => this.process.once("close", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
      ]);
      if (this.process.exitCode === null && this.process.signalCode === null) {
        this.process.kill();
      }
    }
    this.lines.close();
  }
}

function configuredDepth() {
  const value = process.env.STOCKFISH_DEPTH?.trim();
  if (!value) return 10;
  const depth = Number(value);
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 20) {
    throw new Error("STOCKFISH_DEPTH must be an integer between 1 and 20.");
  }
  return depth;
}

function whitePerspectiveEvaluation(fen: string, score: number | null) {
  if (score === null) return null;
  return fen.split(" ")[1] === "b" ? -score : score;
}

async function analyzeFinishedGame(gameId: number, enginePath: string, depth: number) {
  const game = await db.orm.public.Game.where({ id: gameId, status: "FINISHED" }).first();
  if (!game) return false;
  const existing = await findGameAnalysesByGameId(gameId);
  if (existing.length > 0) return false;

  const moves = await findMovesByGameId(gameId);
  const firstAnalyzedMoveIndex = Math.max(0, moves.length - MAX_ANALYZED_PLIES);
  const analyzedMoves = moves.slice(firstAnalyzedMoveIndex);
  const engine = new UciSession(enginePath);
  try {
    await engine.initialize();
    let previousFen = firstAnalyzedMoveIndex > 0
      ? moves[firstAnalyzedMoveIndex - 1].fenAfter
      : START_FEN;
    const positions = [];
    for (const move of analyzedMoves) {
      const fen = move.fenBefore ?? previousFen;
      const result = await engine.analyze(fen, depth);
      positions.push({
        ply: move.ply,
        san: move.san,
        fen,
        evaluationCpWhite: whitePerspectiveEvaluation(fen, result.evaluation),
        bestMove: result.bestMove,
        playedMove: `${move.from}${move.to}${move.promotion?.toLowerCase() ?? ""}`,
        principalVariation: result.principalVariation,
        depth: result.depth,
      });
      previousFen = move.fenAfter;
    }

    const finalPosition = await engine.analyze(game.currentFen, depth);
    const finalEvaluation = whitePerspectiveEvaluation(game.currentFen, finalPosition.evaluation);
    try {
      await createGameAnalysis({
        gameId,
        engine: "Stockfish",
        engineVersion: engine.engineVersion,
        depth: finalPosition.depth || depth,
        analyzedAt: new Date(),
        accuracyWhite: null,
        accuracyBlack: null,
        evaluation: finalEvaluation === null ? null : finalEvaluation / 100,
        bestLine: finalPosition.principalVariation,
        analysisData: {
          positions,
          positionsTruncated: firstAnalyzedMoveIndex > 0,
          finalPosition: {
            fen: game.currentFen,
            bestMove: finalPosition.bestMove,
            principalVariation: finalPosition.principalVariation,
            evaluationCpWhite: finalEvaluation,
            depth: finalPosition.depth,
          },
        },
      });
    } catch (error) {
      const databaseCode = error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
      if (databaseCode !== "23505" && databaseCode !== "P2002") throw error;
      if ((await findGameAnalysesByGameId(gameId)).length === 0) throw error;
      return false;
    }
    return true;
  } finally {
    await engine.close();
  }
}

const queuedGameIds = new Set<number>();
const processingGameIds = new Set<number>();
const retryAfter = new Map<number, number>();
let interval: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let missingEngineLogged = false;

export function enqueueGameAnalysis(gameId: number) {
  if (!process.env.STOCKFISH_PATH?.trim()) return false;
  queuedGameIds.add(gameId);
  return true;
}

async function runAnalysisBatch() {
  if (running) return running;
  running = (async () => {
    const enginePath = process.env.STOCKFISH_PATH?.trim();
    if (!enginePath) {
      if (!missingEngineLogged) {
        console.warn("[stockfish] Analysis worker disabled: STOCKFISH_PATH is not configured.");
        missingEngineLogged = true;
      }
      return;
    }
    const depth = configuredDepth();
    const games = await db.orm.public.Game
      .where({ status: "FINISHED" })
      .where((game) => game.analyses.none())
      .orderBy((game) => game.endedAt.asc())
      .limit(100)
      .all();
    for (const game of games) {
      if (
        !processingGameIds.has(game.id) &&
        (retryAfter.get(game.id) ?? 0) <= Date.now()
      ) {
        queuedGameIds.add(game.id);
      }
    }

    for (const gameId of [...queuedGameIds].slice(0, MAX_BATCH_SIZE)) {
      if (processingGameIds.has(gameId) || (retryAfter.get(gameId) ?? 0) > Date.now()) continue;
      queuedGameIds.delete(gameId);
      processingGameIds.add(gameId);
      try {
        if (await analyzeFinishedGame(gameId, enginePath, depth)) {
          retryAfter.delete(gameId);
          console.info(`[stockfish] Analysis saved for game ${gameId}.`);
        }
      } catch (error) {
        retryAfter.set(gameId, Date.now() + 5 * 60_000);
        console.error(`[stockfish] Analysis failed for game ${gameId}:`, error);
      } finally {
        processingGameIds.delete(gameId);
      }
    }
  })().catch((error: unknown) => {
    console.error("[stockfish] Worker batch failed:", error);
  }).finally(() => {
    running = undefined;
  });
  return running;
}

export function startStockfishAnalysisWorker() {
  if (interval) return;
  void runAnalysisBatch();
  interval = setInterval(() => void runAnalysisBatch(), POLL_INTERVAL_MS);
  interval.unref();
}

export function stopStockfishAnalysisWorker() {
  if (!interval) return;
  clearInterval(interval);
  interval = undefined;
}
