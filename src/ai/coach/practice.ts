import { renderSessionCoachFeedback, renderShotCoachFeedback } from '@/ai/coach/render'
import type {
  CoachPersona,
  CoachRenderedFeedback,
  CoachSessionSource,
  CoachShotSource,
  PracticeReviewInput,
  PracticeReviewShotDigest,
} from '@/ai/coach/types'

const DEFAULT_REVIEW_RECENT_SHOTS = 6

export function getPracticeInstantFeedback(
  shot: CoachShotSource,
  persona: CoachPersona = 'strict',
): CoachRenderedFeedback | null {
  if (shot.mode !== 'practice' || shot.actor !== 'player') return null
  return renderShotCoachFeedback(shot, persona)
}

function toPracticeReviewShotDigest(shot: CoachShotSource): PracticeReviewShotDigest {
  return {
    shotIndex: shot.shotIndex,
    outcome: shot.outcome,
    scoredPoints: shot.scoredPoints,
    foul: Boolean(shot.foul),
    foulMessage: shot.foul?.message ?? null,
    hitLegalFirstTarget: shot.hitLegalFirstTarget,
    breakScoreAfterShot: shot.after.breakScore,
    cueBallPositionResult: shot.cueBallPositionResult,
    nextShotChance: shot.nextShotChance,
  }
}

export function buildPracticeReviewInput(
  session: CoachSessionSource,
  recentShotLimit = DEFAULT_REVIEW_RECENT_SHOTS,
): PracticeReviewInput {
  const recentShots = session.shots
    .slice(-recentShotLimit)
    .map(toPracticeReviewShotDigest)

  return {
    mode: session.mode,
    shotCount: session.shotCount,
    totalScore: session.totalScore,
    highestBreak: session.highestBreak,
    foulCount: session.foulCount,
    potCount: session.potCount,
    legalFirstHitCount: session.legalFirstHitCount,
    simplePotMissCount: session.simplePotMissCount,
    goodCueBallPositionCount: session.goodCueBallPositionCount,
    nextChanceCreatedCount: session.nextChanceCreatedCount,
    recentShots,
  }
}

export function getPracticeReviewTemplate(
  session: CoachSessionSource,
  persona: CoachPersona = 'calm',
): CoachRenderedFeedback | null {
  if (session.mode !== 'practice') return null
  return renderSessionCoachFeedback(session, persona)
}
