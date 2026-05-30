import type { SessionSummary, ShotSummary, TableSnapshot } from '@/summary/types'
import type {
  LlmFactContext,
  LlmSessionDigest,
  LlmShotDigest,
  LlmTableDigest,
} from '@/ai/llm/types'

const NOTABLE_COLOR_IDS = new Set(['white', 'yellow', 'green', 'brown', 'blue', 'pink', 'black'])

function toFactContextFromSnapshot(snapshot: TableSnapshot): LlmFactContext {
  return {
    mode: snapshot.mode,
    actor: snapshot.actor,
    currentActor: snapshot.currentActor,
    phase: snapshot.phase,
    ballOn: snapshot.ballOn,
    redsRemaining: snapshot.redsRemaining,
    score: {
      player: snapshot.score.player,
      ai: snapshot.score.ai,
    },
    breakScore: snapshot.breakScore,
  }
}

function toFactContextFromShotAfter(shot: ShotSummary): LlmFactContext {
  return {
    mode: shot.mode,
    actor: shot.actor,
    currentActor: shot.after.currentActor,
    phase: shot.after.phase,
    ballOn: shot.after.ballOn,
    redsRemaining: shot.after.redsRemaining,
    score: {
      player: shot.after.playerScore,
      ai: shot.after.aiScore,
    },
    breakScore: shot.after.breakScore,
  }
}

export function buildLlmShotDigest(shot: ShotSummary): LlmShotDigest {
  return {
    shotIndex: shot.shotIndex,
    actor: shot.actor,
    outcome: shot.outcome,
    scoredPoints: shot.scoredPoints,
    pottedBallIds: [...shot.pottedBallIds],
    pottedBalls: shot.pottedBalls.map((ball) => ({
      id: ball.id,
      kind: ball.kind,
      points: ball.points,
    })),
    foul: {
      happened: Boolean(shot.foul),
      type: shot.foul?.type,
      message: shot.foul?.message,
      penalty: shot.foul?.penalty,
      beneficiary: shot.foul?.beneficiary,
    },
    hitLegalFirstTarget: shot.hitLegalFirstTarget,
    turnChanged: shot.turnChanged,
    cueBallPositionResult: shot.cueBallPositionResult,
    nextShotChance: shot.nextShotChance,
    before: toFactContextFromSnapshot(shot.before),
    after: toFactContextFromShotAfter(shot),
  }
}

export function buildLlmTableDigest(snapshot: TableSnapshot, cueBallEndPosition?: { x: number; y: number } | null): LlmTableDigest {
  const activeBalls = snapshot.balls.filter((ball) => !ball.potted)
  const notableBalls = activeBalls.filter((ball) => (
    NOTABLE_COLOR_IDS.has(ball.id)
    || ball.id === snapshot.ballOn
    || (snapshot.ballOn === 'red' && ball.kind === 'red')
  ))

  return {
    cueBallEndPosition: cueBallEndPosition ?? null,
    remaining: {
      reds: snapshot.redsRemaining,
      colorsOnTable: activeBalls
        .filter((ball) => ball.kind !== 'white' && ball.kind !== 'red')
        .map((ball) => ball.id),
    },
    notableBalls: notableBalls.map((ball) => ({
      id: ball.id,
      kind: ball.kind,
      x: ball.x,
      y: ball.y,
    })),
  }
}

export function buildLlmSessionDigest(
  session: SessionSummary,
  recentShotCount = 5,
): LlmSessionDigest {
  return {
    mode: session.mode,
    shotCount: session.shotCount,
    score: {
      player: session.score.player,
      ai: session.score.ai,
    },
    totalScore: session.totalScore,
    highestBreak: session.highestBreak,
    foulCount: session.foulCount,
    potCount: session.potCount,
    legalFirstHitCount: session.legalFirstHitCount,
    simplePotMissCount: session.simplePotMissCount,
    goodCueBallPositionCount: session.goodCueBallPositionCount,
    nextChanceCreatedCount: session.nextChanceCreatedCount,
    recentShots: session.shots.slice(-recentShotCount).map(buildLlmShotDigest),
  }
}
