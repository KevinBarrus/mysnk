import type { SessionSummary, ShotSummary, SummaryMode } from '@/summary/types'

export function buildSessionSummary(mode: SummaryMode, shots: ShotSummary[]): SessionSummary {
  let highestBreak = 0
  let foulCount = 0
  let potCount = 0
  let legalFirstHitCount = 0
  let simplePotMissCount = 0
  let goodCueBallPositionCount = 0
  let nextChanceCreatedCount = 0

  for (const shot of shots) {
    highestBreak = Math.max(highestBreak, shot.after.breakScore)
    if (shot.foul) foulCount++
    potCount += shot.pottedBalls.filter((ball) => ball.kind !== 'white').length
    if (shot.hitLegalFirstTarget) legalFirstHitCount++
    if (shot.simplePotMiss === true) simplePotMissCount++
    if (shot.cueBallPositionResult === 'ideal') goodCueBallPositionCount++
    if (shot.nextShotChance === 'created') nextChanceCreatedCount++
  }

  const lastShot = shots.length > 0 ? shots[shots.length - 1] : null
  const totalScore = lastShot?.after.playerScore ?? 0

  return {
    mode,
    shotCount: shots.length,
    totalScore,
    score: {
      player: lastShot?.after.playerScore ?? 0,
      ai: lastShot?.after.aiScore ?? 0,
    },
    highestBreak,
    foulCount,
    potCount,
    legalFirstHitCount,
    simplePotMissCount,
    goodCueBallPositionCount,
    nextChanceCreatedCount,
    shots: [...shots],
  }
}
