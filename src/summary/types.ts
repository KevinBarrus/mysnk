import type { BallColor } from '@/constants/table'
import type { Position2D } from '@/types/coords'
import type { BallOnIndicator, FoulInfo, RulesState } from '@/rules/SnookerRules'

export type SummaryMode = 'practice' | 'match'
export type ShotActor = 'player' | 'ai'
export type ShotOutcome = 'score' | 'miss' | 'foul'
export type PositionResult = 'ideal' | 'acceptable' | 'poor' | 'unknown'
export type ChanceResult = 'created' | 'limited' | 'none' | 'unknown'

export interface SnapshotBall {
  id: string
  kind: BallColor
  x: number
  y: number
  potted: boolean
}

export interface TableSnapshot {
  shotIndex: number
  mode: SummaryMode
  actor: ShotActor
  currentActor: ShotActor
  phase: RulesState['phase']
  ballOn: BallOnIndicator
  redsRemaining: number
  score: {
    player: number
    ai: number
  }
  breakScore: number
  balls: SnapshotBall[]
}

export interface PottedBallSummary {
  id: string
  kind: BallColor
  points: number
}

export interface ShotSummary {
  shotIndex: number
  mode: SummaryMode
  actor: ShotActor
  before: TableSnapshot
  firstContactBallId: string | null
  hitLegalFirstTarget: boolean
  pottedBallIds: string[]
  pottedAnyBall: boolean
  pottedBalls: PottedBallSummary[]
  scoredPoints: number
  foul: FoulInfo | null
  foulBeneficiary?: ShotActor | 'none'
  foulBallOn?: BallOnIndicator
  outcome: ShotOutcome
  simplePotChance: boolean | 'unknown'
  simplePotMiss: boolean | 'unknown'
  cueBallPositionResult: PositionResult
  nextShotChance: ChanceResult
  turnChanged: boolean
  after: RulesState & {
    cueBallEndPosition: Position2D | null
  }
}

export interface SessionSummary {
  mode: SummaryMode
  shotCount: number
  totalScore: number
  score: {
    player: number
    ai: number
  }
  highestBreak: number
  foulCount: number
  potCount: number
  legalFirstHitCount: number
  simplePotMissCount: number
  goodCueBallPositionCount: number
  nextChanceCreatedCount: number
  shots: ShotSummary[]
}
