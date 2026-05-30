import type { CareerRankingEntry, ChallengeTier } from '@/data/careerRanking'
import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, SPOTS } from '@/constants/table'
import type { RulesState } from '@/rules/SnookerRules'
import type { TableSnapshot } from '@/summary/types'
import type { Position2D } from '@/types/coords'

export interface AiAbilityProfile {
  tier: ChallengeTier
  potSuccessRate: number
  foulAvoidRate: number
  breakContinueRate: number
}

export interface AiTurnInput {
  rulesState: RulesState
  tableSnapshot: TableSnapshot
  ability: AiAbilityProfile
  rng?: () => number
}

export interface AiTurnResolution {
  firstContactBallId: string | null
  pottedBallIds: string[]
  cueBallEndPosition: Position2D | null
  selectedTargetId?: string
  intent: 'pot' | 'safety' | 'foul'
  outcome: 'pot_red' | 'pot_color' | 'miss' | 'foul'
  text: string
}

const DEFAULT_AI_ABILITY: AiAbilityProfile = {
  tier: 'C',
  potSuccessRate: 0.8,
  foulAvoidRate: 0.95,
  breakContinueRate: 0.72,
}

const COLOR_PRIORITY = ['black', 'pink', 'blue', 'brown', 'green', 'yellow'] as const

export function getAiAbilityProfile(
  challenger: Pick<CareerRankingEntry, 'challengeTier' | 'rank'> | null | undefined,
): AiAbilityProfile {
  if (!challenger) return { ...DEFAULT_AI_ABILITY }

  const normalizedRank = Math.max(1, Math.min(16, challenger.rank))
  const rankStrength = (16 - normalizedRank) / 15
  const tierModifier = getTierModifier(challenger.challengeTier)

  return {
    tier: challenger.challengeTier,
    potSuccessRate: clamp01(0.78 + rankStrength * 0.12 + tierModifier.pot),
    foulAvoidRate: clamp01(0.94 + rankStrength * 0.04 + tierModifier.foul),
    breakContinueRate: clamp01(0.68 + rankStrength * 0.16 + tierModifier.break),
  }
}

export function resolveAiTurn(input: AiTurnInput): AiTurnResolution {
  const rng = input.rng ?? Math.random
  const legalTargetIds = getLegalTargetIds(input.tableSnapshot)
  const targetId = chooseTargetId(legalTargetIds, input, rng)

  if (!targetId) {
    return {
      firstContactBallId: null,
      pottedBallIds: [],
      cueBallEndPosition: { ...SPOTS.baulk },
      intent: 'foul',
      outcome: 'foul',
      text: 'Failed to find a legal target',
    }
  }

  if (rng() > input.ability.foulAvoidRate) {
    const scratch = rng() < 0.45
    return {
      firstContactBallId: scratch ? targetId : null,
      pottedBallIds: scratch ? ['white'] : [],
      cueBallEndPosition: scratch
        ? null
        : chooseCueBallEndPosition(targetId, 'foul', input.tableSnapshot, rng),
      selectedTargetId: targetId,
      intent: 'foul',
      outcome: 'foul',
      text: scratch
        ? `scratched while attacking ${targetId}`
        : `missed the legal opening on ${targetId}`,
    }
  }

  const successRate = getSuccessRate(input.rulesState, input.ability)
  if (rng() <= successRate) {
    const pottedBallIds = [targetId]
    return {
      firstContactBallId: targetId,
      pottedBallIds,
      cueBallEndPosition: chooseCueBallEndPosition(targetId, 'pot', input.tableSnapshot, rng),
      selectedTargetId: targetId,
      intent: 'pot',
      outcome: targetId.startsWith('red_') || targetId === 'red' ? 'pot_red' : 'pot_color',
      text: `potted ${targetId}`,
    }
  }

  return {
    firstContactBallId: targetId,
    pottedBallIds: [],
    cueBallEndPosition: chooseCueBallEndPosition(targetId, 'miss', input.tableSnapshot, rng),
    selectedTargetId: targetId,
    intent: 'safety',
    outcome: 'miss',
    text: `missed ${targetId}`,
  }
}

function getSuccessRate(rulesState: RulesState, ability: AiAbilityProfile): number {
  if (rulesState.breakScore <= 0) return ability.potSuccessRate
  return Math.min(0.95, ability.potSuccessRate * 0.7 + ability.breakContinueRate * 0.3)
}

function getLegalTargetIds(snapshot: TableSnapshot): string[] {
  const activeBalls = snapshot.balls.filter((ball) => !ball.potted)

  if (snapshot.ballOn === 'red') {
    return activeBalls
      .filter((ball) => ball.kind === 'red')
      .map((ball) => ball.id)
  }

  if (snapshot.ballOn === 'color') {
    return COLOR_PRIORITY.filter((id) => activeBalls.some((ball) => ball.id === id))
  }

  return activeBalls
    .filter((ball) => ball.id === snapshot.ballOn)
    .map((ball) => ball.id)
}

function chooseTargetId(
  legalTargetIds: string[],
  input: AiTurnInput,
  rng: () => number,
): string | null {
  if (legalTargetIds.length === 0) return null

  if (input.tableSnapshot.ballOn === 'red') {
    const index = Math.floor(rng() * legalTargetIds.length)
    return legalTargetIds[index] ?? legalTargetIds[0]
  }

  return legalTargetIds[0] ?? null
}

function chooseCueBallEndPosition(
  targetId: string,
  outcome: 'pot' | 'miss' | 'foul',
  snapshot: TableSnapshot,
  rng: () => number,
): Position2D {
  const target = snapshot.balls.find((ball) => ball.id === targetId)
  const fallback = { x: 0, y: snapshot.ballOn === 'red' ? -HALF_LENGTH * 0.2 : 0 }
  if (!target) return clampCuePosition(fallback)

  if (outcome === 'pot') {
    return clampCuePosition({
      x: target.x * 0.35 + randomOffset(rng, 180),
      y: target.y * 0.2 + randomOffset(rng, 220),
    })
  }

  if (outcome === 'foul') {
    return clampCuePosition({
      x: target.x * 0.15 + randomOffset(rng, 260),
      y: -HALF_LENGTH * 0.28 + randomOffset(rng, 160),
    })
  }

  return clampCuePosition({
    x: target.x * 0.5 + randomOffset(rng, 220),
    y: target.y * 0.45 + randomOffset(rng, 260),
  })
}

function randomOffset(rng: () => number, amplitude: number): number {
  return (rng() - 0.5) * amplitude
}

function getTierModifier(tier: ChallengeTier): {
  pot: number
  foul: number
  break: number
} {
  switch (tier) {
    case 'A':
      return { pot: 0.025, foul: 0.01, break: 0.03 }
    case 'B':
      return { pot: 0.012, foul: 0.006, break: 0.015 }
    case 'D':
      return { pot: -0.015, foul: -0.01, break: -0.02 }
    case 'C':
    default:
      return { pot: 0, foul: 0, break: 0 }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(0.97, value))
}

function clampCuePosition(pos: Position2D): Position2D {
  const margin = BALL_RADIUS * 2.5
  return {
    x: Math.max(-HALF_WIDTH + margin, Math.min(HALF_WIDTH - margin, pos.x)),
    y: Math.max(-HALF_LENGTH + margin, Math.min(HALF_LENGTH - margin, pos.y)),
  }
}
