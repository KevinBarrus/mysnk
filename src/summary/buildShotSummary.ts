import type { BallColor } from '@/constants/table'
import type { ShotResult, RulesState } from '@/rules/SnookerRules'
import type { ShotSummary, TableSnapshot } from '@/summary/types'
import type { Position2D } from '@/types/coords'

const BALL_POINTS: Record<BallColor, number> = {
  white: 0,
  red: 1,
  yellow: 2,
  green: 3,
  brown: 4,
  blue: 5,
  pink: 6,
  black: 7,
}

function toBallKind(id: string): BallColor {
  if (id.startsWith('red_') || id === 'red') return 'red'
  if (id === 'white') return 'white'
  return id as BallColor
}

function didHitLegalFirstTarget(firstContactBallId: string | null, before: TableSnapshot): boolean {
  if (!firstContactBallId) return false
  const firstKind = toBallKind(firstContactBallId)
  if (before.ballOn === 'red') return firstKind === 'red'
  if (before.ballOn === 'color') return firstKind !== 'red' && firstKind !== 'white'
  return firstKind === before.ballOn
}

function inferNextShotChance(params: {
  foul: ShotResult['foul']
  scoredPoints: number
  hitLegalFirstTarget: boolean
}): ShotSummary['nextShotChance'] {
  if (params.foul) return 'none'
  if (params.scoredPoints > 0) return 'created'
  if (params.hitLegalFirstTarget) return 'limited'
  return 'none'
}

function inferCueBallPositionResult(nextShotChance: ShotSummary['nextShotChance']): ShotSummary['cueBallPositionResult'] {
  if (nextShotChance === 'created') return 'ideal'
  if (nextShotChance === 'limited') return 'acceptable'
  if (nextShotChance === 'none') return 'poor'
  return 'unknown'
}

export function buildShotSummary(params: {
  before: TableSnapshot
  firstContactBallId: string | null
  pottedBallIds: string[]
  result: ShotResult
  afterState: RulesState
  cueBallEndPosition: Position2D | null
}): ShotSummary {
  const hitLegalFirstTarget = didHitLegalFirstTarget(params.firstContactBallId, params.before)
  const pottedBalls = params.pottedBallIds.map((id) => {
    const kind = toBallKind(id)
    return {
      id,
      kind,
      points: BALL_POINTS[kind],
    }
  })

  const nextShotChance = inferNextShotChance({
    foul: params.result.foul,
    scoredPoints: params.result.scored,
    hitLegalFirstTarget,
  })
  const cueBallPositionResult = inferCueBallPositionResult(nextShotChance)
  const pottedAnyBall = params.pottedBallIds.length > 0
  const simplePotChance: boolean | 'unknown' = 'unknown'
  const simplePotMiss: boolean | 'unknown' = !pottedAnyBall ? 'unknown' : 'unknown'

  return {
    shotIndex: params.before.shotIndex,
    mode: params.before.mode,
    actor: params.before.actor,
    before: params.before,
    firstContactBallId: params.firstContactBallId,
    hitLegalFirstTarget,
    pottedBallIds: [...params.pottedBallIds],
    pottedAnyBall,
    pottedBalls,
    scoredPoints: params.result.scored,
    foul: params.result.foul,
    outcome: params.result.foul ? 'foul' : params.result.scored > 0 ? 'score' : 'miss',
    simplePotChance,
    simplePotMiss,
    cueBallPositionResult,
    nextShotChance,
    after: {
      ...params.afterState,
      cueBallEndPosition: params.cueBallEndPosition,
    },
  }
}
