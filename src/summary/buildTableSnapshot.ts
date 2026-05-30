import type { BallColor } from '@/constants/table'
import type { PhysicsBall } from '@/physics/PlanePhysics'
import type { RulesState } from '@/rules/SnookerRules'
import type { ShotActor, SummaryMode, TableSnapshot } from '@/summary/types'
import type { Position2D } from '@/types/coords'

function sortSnapshotBalls(a: TableSnapshot['balls'][number], b: TableSnapshot['balls'][number]): number {
  if (a.potted !== b.potted) return a.potted ? 1 : -1
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
  return a.id.localeCompare(b.id)
}

export function buildTableSnapshot(params: {
  shotIndex: number
  mode: SummaryMode
  actor: ShotActor
  rulesState: RulesState
  balls: PhysicsBall[]
  getPosition: (id: string) => Position2D | null
}): TableSnapshot {
  const balls = params.balls.map((ball) => {
    const pos = params.getPosition(ball.id)
    return {
      id: ball.id,
      kind: ball.color as BallColor,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      potted: ball.potted,
    }
  }).sort(sortSnapshotBalls)

  return {
    shotIndex: params.shotIndex,
    mode: params.mode,
    actor: params.actor,
    phase: params.rulesState.phase,
    ballOn: params.rulesState.ballOn,
    redsRemaining: params.rulesState.redsRemaining,
    score: {
      player: params.rulesState.playerScore,
    },
    breakScore: params.rulesState.breakScore,
    balls,
  }
}
