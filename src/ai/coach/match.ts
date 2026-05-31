import { renderSessionCoachFeedback } from '@/ai/coach/render'
import type {
  CoachPersona,
  CoachRenderedFeedback,
  CoachSessionSource,
  MatchReviewInput,
} from '@/ai/coach/types'

export function buildMatchReviewInput(
  session: CoachSessionSource,
  opponentName: string,
): MatchReviewInput {
  let playerPotCount = 0
  let aiPotCount = 0
  let playerFoulCount = 0
  let aiFoulCount = 0
  let playerHighestBreak = 0
  let aiHighestBreak = 0

  for (const shot of session.shots) {
    const pottedCount = shot.pottedBalls.filter((ball) => ball.kind !== 'white').length
    if (shot.actor === 'player') {
      playerPotCount += pottedCount
      if (shot.foul) playerFoulCount += 1
      playerHighestBreak = Math.max(playerHighestBreak, shot.after.currentActor === 'player' ? shot.after.breakScore : shot.scoredPoints > 0 ? shot.after.breakScore : 0)
    } else {
      aiPotCount += pottedCount
      if (shot.foul) aiFoulCount += 1
      aiHighestBreak = Math.max(aiHighestBreak, shot.after.currentActor === 'ai' ? shot.after.breakScore : shot.scoredPoints > 0 ? shot.after.breakScore : 0)
    }
  }

  const recentShots = session.shots.slice(-6).map((shot) => ({
    shotIndex: shot.shotIndex,
    outcome: shot.outcome,
    scoredPoints: shot.scoredPoints,
    foul: Boolean(shot.foul),
    foulMessage: shot.foul?.message ?? null,
    hitLegalFirstTarget: shot.hitLegalFirstTarget,
    breakScoreAfterShot: shot.after.breakScore,
    potDifficulty: shot.potDifficulty,
    cueBallPositionResult: shot.cueBallPositionResult,
    nextShotChance: shot.nextShotChance,
  }))

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
    playerScore: session.score.player,
    aiScore: session.score.ai,
    playerPotCount,
    aiPotCount,
    playerFoulCount,
    aiFoulCount,
    playerHighestBreak,
    aiHighestBreak,
    opponentName,
  }
}

export function getMatchReviewTemplate(
  session: CoachSessionSource,
  opponentName: string,
  persona: CoachPersona = 'strict',
): CoachRenderedFeedback | null {
  const fallback = renderSessionCoachFeedback(session, persona)
  if (!fallback) return null

  const result = session.score.player >= session.score.ai
    ? `你这局最后还是把 ${opponentName} 顶住了，关键分处理比前段更硬，但简单球和走位波动还是在送机会。对手风格偏耐心反击型，给到窗口就会咬分，下一局别把节奏白送回去。`
    : `你这局被 ${opponentName} 拖进对手节奏里了，进攻转换和失误后的止损都慢了一拍。对手风格偏持续施压型，只要你漏出中低级机会，他就会把局面往自己那边压。`

  return {
    ...fallback,
    text: result,
  }
}
