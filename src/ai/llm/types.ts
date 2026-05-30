import type { BallOnIndicator } from '@/rules/SnookerRules'
import type { ChanceResult, PositionResult, SessionSummary, ShotActor, ShotOutcome, ShotSummary, TableSnapshot } from '@/summary/types'
import type { Position2D } from '@/types/coords'

export interface LlmFactContext {
  mode: 'practice' | 'match'
  actor: ShotActor
  currentActor: ShotActor
  phase: 'reds' | 'clearance'
  ballOn: BallOnIndicator
  redsRemaining: number
  score: {
    player: number
    ai: number
  }
  breakScore: number
}

export interface LlmShotDigest {
  shotIndex: number
  actor: ShotActor
  outcome: ShotOutcome
  scoredPoints: number
  pottedBallIds: string[]
  pottedBalls: Array<{
    id: string
    kind: string
    points: number
  }>
  foul: {
    happened: boolean
    type?: string
    message?: string
    penalty?: number
    beneficiary?: 'player' | 'ai' | 'none'
  }
  hitLegalFirstTarget: boolean
  turnChanged: boolean
  cueBallPositionResult: PositionResult
  nextShotChance: ChanceResult
  before: LlmFactContext
  after: LlmFactContext
}

export interface LlmTableDigest {
  cueBallEndPosition: Position2D | null
  remaining: {
    reds: number
    colorsOnTable: string[]
  }
  notableBalls: Array<{
    id: string
    kind: string
    x: number
    y: number
  }>
}

export interface LlmSessionDigest {
  mode: SessionSummary['mode']
  shotCount: number
  score: {
    player: number
    ai: number
  }
  totalScore: number
  highestBreak: number
  foulCount: number
  potCount: number
  legalFirstHitCount: number
  simplePotMissCount: number
  goodCueBallPositionCount: number
  nextChanceCreatedCount: number
  recentShots: LlmShotDigest[]
}

export interface LlmNarrationRequest {
  scene: 'ai_pre_turn' | 'ai_post_turn' | 'player_post_turn' | 'frame_update' | 'session_review'
  personaId: string
  fact: LlmFactContext
  shot?: LlmShotDigest
  table?: LlmTableDigest
  session?: LlmSessionDigest
  recentShots?: LlmShotDigest[]
  style: {
    maxSentences: number
    tone: string
    language: 'zh-CN' | 'en'
  }
}

export type LlmShotSource = ShotSummary
export type LlmSessionSource = SessionSummary
export type LlmTableSource = TableSnapshot
