import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, POCKETS } from '@/constants/table'
import type { BallColor } from '@/constants/table'
import type { BallOnIndicator, FoulInfo, ShotResult, RulesState } from '@/rules/SnookerRules'
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

function distance(a: Position2D, b: Position2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distancePointToSegment(point: Position2D, segA: Position2D, segB: Position2D): number {
  const dx = segB.x - segA.x
  const dy = segB.y - segA.y
  if (dx === 0 && dy === 0) return distance(point, segA)
  const t = Math.max(0, Math.min(1, ((point.x - segA.x) * dx + (point.y - segA.y) * dy) / (dx * dx + dy * dy)))
  const projection = { x: segA.x + t * dx, y: segA.y + t * dy }
  return distance(point, projection)
}

function legalTargetKinds(ballOn: BallOnIndicator): BallColor[] {
  if (ballOn === 'red') return ['red']
  if (ballOn === 'color') return ['yellow', 'green', 'brown', 'blue', 'pink', 'black']
  return [ballOn]
}

function findBall(snapshot: TableSnapshot, id: string): Position2D | null {
  const ball = snapshot.balls.find((candidate) => candidate.id === id)
  if (!ball || ball.potted) return null
  return { x: ball.x, y: ball.y }
}

function isBlockedPath(
  start: Position2D,
  end: Position2D,
  blockers: TableSnapshot['balls'],
  excludedIds: Set<string>,
): boolean {
  return blockers.some((ball) => {
    if (ball.potted || excludedIds.has(ball.id)) return false
    return distancePointToSegment({ x: ball.x, y: ball.y }, start, end) < BALL_RADIUS * 2.1
  })
}

function classifyPotChance(snapshot: TableSnapshot): {
  openTargetIds: string[]
  simplePotChance: boolean
  simpleTargetIds: string[]
} {
  const cueBall = findBall(snapshot, 'white')
  if (!cueBall) return { openTargetIds: [], simplePotChance: false, simpleTargetIds: [] }

  const targetKinds = new Set(legalTargetKinds(snapshot.ballOn))
  const openTargetIds: string[] = []
  const simpleTargetIds: string[] = []

  for (const ball of snapshot.balls) {
    if (ball.potted || ball.id === 'white' || !targetKinds.has(ball.kind)) continue

    const targetPos = { x: ball.x, y: ball.y }
    const cueBlocked = isBlockedPath(cueBall, targetPos, snapshot.balls, new Set(['white', ball.id]))
    if (cueBlocked) continue

    for (const pocket of POCKETS) {
      const pocketPos = { x: pocket.x, y: pocket.y }
      const pocketBlocked = isBlockedPath(targetPos, pocketPos, snapshot.balls, new Set([ball.id]))
      if (pocketBlocked) continue

      const cueDistance = distance(cueBall, targetPos)
      const pocketDistance = distance(targetPos, pocketPos)
      const toPocketRailMargin = Math.min(HALF_WIDTH - Math.abs(targetPos.x), HALF_LENGTH - Math.abs(targetPos.y))
      const looksSimple = cueDistance <= 1800 && pocketDistance <= 2200 && toPocketRailMargin >= BALL_RADIUS * 1.5

      openTargetIds.push(ball.id)
      if (looksSimple) {
        simpleTargetIds.push(ball.id)
      }
      break
    }
  }

  return {
    openTargetIds,
    simplePotChance: simpleTargetIds.length > 0,
    simpleTargetIds,
  }
}

function inferNextShotChanceFromTable(params: {
  foul: FoulInfo | null
  afterState: RulesState
  cueBallEndPosition: Position2D | null
  afterBalls: TableSnapshot['balls']
}): ShotSummary['nextShotChance'] {
  if (params.foul || !params.cueBallEndPosition) return 'none'

  const afterSnapshot: TableSnapshot = {
    shotIndex: 0,
    mode: 'practice',
    actor: 'player',
    phase: params.afterState.phase,
    ballOn: params.afterState.ballOn,
    redsRemaining: params.afterState.redsRemaining,
    score: {
      player: params.afterState.playerScore,
    },
    breakScore: params.afterState.breakScore,
    balls: params.afterBalls.map((ball) => ball.id === 'white'
      ? { ...ball, x: params.cueBallEndPosition!.x, y: params.cueBallEndPosition!.y, potted: false }
      : ball),
  }

  const { simplePotChance, openTargetIds } = classifyPotChance(afterSnapshot)
  if (simplePotChance) return 'created'

  if (openTargetIds.length > 0) return 'limited'

  const cueBall = findBall(afterSnapshot, 'white')
  if (!cueBall) return 'none'
  const targetKinds = new Set(legalTargetKinds(afterSnapshot.ballOn))
  const hasLine = afterSnapshot.balls.some((ball) => {
    if (ball.potted || ball.id === 'white' || !targetKinds.has(ball.kind)) return false
    return !isBlockedPath(cueBall, { x: ball.x, y: ball.y }, afterSnapshot.balls, new Set(['white', ball.id]))
  })
  return hasLine ? 'limited' : 'none'
}

function inferCueBallPositionResultFromTable(params: {
  foul: FoulInfo | null
  cueBallEndPosition: Position2D | null
  nextShotChance: ShotSummary['nextShotChance']
}): ShotSummary['cueBallPositionResult'] {
  if (params.foul?.type === 'whitePotted') return 'poor'
  if (!params.cueBallEndPosition) return 'unknown'

  const railMargin = Math.min(
    HALF_WIDTH - Math.abs(params.cueBallEndPosition.x),
    HALF_LENGTH - Math.abs(params.cueBallEndPosition.y),
  )

  if (railMargin < BALL_RADIUS * 1.25) return 'poor'
  return inferCueBallPositionResult(params.nextShotChance)
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
  const beforePotChance = classifyPotChance(params.before)
  const pottedBalls = params.pottedBallIds.map((id) => {
    const kind = toBallKind(id)
    return {
      id,
      kind,
      points: BALL_POINTS[kind],
    }
  })
  const pottedAnyBall = params.pottedBallIds.length > 0
  const nonWhitePottedBalls = pottedBalls.filter((ball) => ball.kind !== 'white')
  const simplePotChance: boolean | 'unknown' = beforePotChance.simplePotChance
  const simplePotMiss: boolean | 'unknown' = simplePotChance
    ? nonWhitePottedBalls.length === 0
    : false
  const afterBalls = params.before.balls
    .map((ball) => {
      const pottedMatch = params.pottedBallIds.includes(ball.id)
      if (ball.id === 'white') {
        return {
          ...ball,
          x: params.cueBallEndPosition?.x ?? ball.x,
          y: params.cueBallEndPosition?.y ?? ball.y,
          potted: params.pottedBallIds.includes('white'),
        }
      }
      return pottedMatch ? { ...ball, potted: true } : ball
    })
  const nextShotChance = inferNextShotChanceFromTable({
    foul: params.result.foul,
    afterState: params.afterState,
    cueBallEndPosition: params.cueBallEndPosition,
    afterBalls,
  })
  const cueBallPositionResult = inferCueBallPositionResultFromTable({
    foul: params.result.foul,
    cueBallEndPosition: params.cueBallEndPosition,
    nextShotChance,
  })
  const resultWithContract = params.result as ShotResult & {
    turnChanged?: boolean
  }
  const foulWithContract = params.result.foul as (FoulInfo & {
    beneficiary?: ShotSummary['foulBeneficiary']
    ballOnAtFoul?: BallOnIndicator
  }) | null
  const afterStateWithContract = params.afterState as RulesState & {
    aiScore?: number
    currentActor?: ShotSummary['actor']
  }
  const fallbackNextShotChance = inferNextShotChance({
    foul: params.result.foul,
    scoredPoints: params.result.scored,
    hitLegalFirstTarget,
  })

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
    foulBeneficiary: foulWithContract?.beneficiary ?? (params.before.mode === 'practice' ? 'none' : undefined),
    foulBallOn: foulWithContract?.ballOnAtFoul ?? (params.result.foul ? params.before.ballOn : undefined),
    outcome: params.result.foul ? 'foul' : params.result.scored > 0 ? 'score' : 'miss',
    simplePotChance,
    simplePotMiss,
    cueBallPositionResult,
    nextShotChance: nextShotChance === 'unknown' ? fallbackNextShotChance : nextShotChance,
    turnChanged: resultWithContract.turnChanged,
    after: {
      ...params.afterState,
      aiScore: afterStateWithContract.aiScore,
      currentActor: afterStateWithContract.currentActor,
      cueBallEndPosition: params.cueBallEndPosition,
    },
  }
}
