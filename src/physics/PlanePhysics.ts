import * as CANNON from 'cannon-es'
import {
  BALL_MASS,
  BALL_RADIUS,
  CUSHION_HEIGHT,
} from '@/constants/table'
import { isBallInPocket } from '@/physics/pockets'
import { PCOL_TABLE_OUTER_CUSHION_WIDTH, pcolTableCollisionModel, pcolTableCueModel } from '@/table/pcolTable'
import type { BallColor } from '@/constants/table'
import type { Position2D } from '@/types/coords'

export interface PhysicsBall {
  id: string
  color: BallColor
  body: CANNON.Body
  potted: boolean
}

export type ShotBlockReason =
  | 'cueBallMissing'
  | 'cueBallPotted'
  | 'cueBallFrozenToRail'
  | 'cueBackswingBlockedByRail'
  | 'cueBackswingBlockedByBall'

export interface ShotBlockResult {
  blocked: boolean
  reason: ShotBlockReason | null
  blockingBallId?: string
}

export interface CueAddress {
  blocked: boolean
  reason: ShotBlockReason | null
  defaultTipOffsetY: number
  requiredElevation: number
  constrainedBy: 'none' | 'rail' | 'snookered' | 'railAndSnookered'
}

/** Game (x,y) mm → cannon world (x, z) with Y-up. */
export function tableToWorld(pos: Position2D): CANNON.Vec3 {
  return new CANNON.Vec3(pos.x, 0, pos.y)
}

export function worldToTable(vec: CANNON.Vec3): Position2D {
  return { x: vec.x, y: vec.z }
}

export class PlanePhysics {
  readonly world = new CANNON.World({
    gravity: new CANNON.Vec3(0, 0, 0),
  })

  private balls = new Map<string, PhysicsBall>()
  private lastCueContactTime = -1

  constructor() {
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    ;(this.world.solver as CANNON.GSSolver).iterations = 25
    this.world.defaultContactMaterial.friction = 0.35
    this.world.defaultContactMaterial.restitution = 0.75

    this.buildCushions()
  }

  private buildCushions(): void {
    const wallH = CUSHION_HEIGHT
    const t = PCOL_TABLE_OUTER_CUSHION_WIDTH

    for (const rail of pcolTableCollisionModel.railSegments) {
      const start = rail.segment.start
      const end = rail.segment.end
      const dx = end.x - start.x
      const dy = end.y - start.y
      const len = Math.hypot(dx, dy)
      const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
      const alongX = dx / (len || 1)
      const alongY = dy / (len || 1)
      const normal = rail.normal
      const bodyCenter = {
        x: center.x + normal.x * (t / 2),
        y: center.y + normal.y * (t / 2),
      }

      const shape = new CANNON.Box(new CANNON.Vec3(len / 2, wallH / 2, t / 2))
      const body = new CANNON.Body({ mass: 0, material: new CANNON.Material({ friction: 0.25, restitution: 0.8 }) })
      body.addShape(shape)
      body.position.copy(tableToWorld(bodyCenter))
      const yaw = Math.atan2(alongY, alongX)
      body.quaternion.setFromEuler(0, -yaw, 0, 'XYZ')
      this.world.addBody(body)
    }
  }

  addBall(id: string, color: BallColor, position: Position2D): PhysicsBall {
    const shape = new CANNON.Sphere(BALL_RADIUS)
    const body = new CANNON.Body({
      mass: BALL_MASS,
      shape,
      linearDamping: 0.35,
      angularDamping: 0.4,
      material: new CANNON.Material({ friction: 0.2, restitution: 0.9 }),
    })
    body.position.copy(tableToWorld(position))
    body.allowSleep = true
    body.sleepSpeedLimit = 50
    body.sleepTimeLimit = 0.25
    this.world.addBody(body)

    const ball: PhysicsBall = { id, color, body, potted: false }
    this.balls.set(id, ball)

    if (id === 'white') {
      body.addEventListener('collide', () => {
        this.lastCueContactTime = this.world.time
      })
    }

    return ball
  }

  getBall(id: string): PhysicsBall | undefined {
    return this.balls.get(id)
  }

  getActiveBalls(): PhysicsBall[] {
    return [...this.balls.values()].filter((b) => !b.potted)
  }

  getAllBalls(): PhysicsBall[] {
    return [...this.balls.values()]
  }

  removeBall(id: string): void {
    const ball = this.balls.get(id)
    if (!ball) return
    this.world.removeBody(ball.body)
    this.balls.delete(id)
  }

  evaluateCueAddress(id: string, direction: Position2D): CueAddress {
    const ball = this.balls.get(id)
    if (!ball) {
      return this.blockedCueAddress('cueBallMissing')
    }
    if (ball.potted) {
      return this.blockedCueAddress('cueBallPotted')
    }

    const cuePos = worldToTable(ball.body.position)
    const len = Math.hypot(direction.x, direction.y)
    if (len < 1e-6) {
      return this.blockedCueAddress('cueBackswingBlockedByRail')
    }

    const dir = { x: direction.x / len, y: direction.y / len }
    if (this.isCueBallOverlappingRail(cuePos)) {
      return this.blockedCueAddress('cueBallFrozenToRail')
    }

    const backwards = { x: -dir.x, y: -dir.y }
    const overlapBallId = this.findOverlappingBall(id, cuePos)
    if (overlapBallId) {
      return this.blockedCueAddress('cueBackswingBlockedByBall')
    }

    const railConstraint = this.measureRailConstraint(cuePos, backwards)
    const snookerConstraint = this.measureSnookerConstraint(id, cuePos, backwards)

    const defaultTipOffsetY = Math.max(railConstraint.tipOffsetY, snookerConstraint.tipOffsetY)
    const requiredElevation = Math.max(railConstraint.elevation, snookerConstraint.elevation)

    let constrainedBy: CueAddress['constrainedBy'] = 'none'
    if (railConstraint.active && snookerConstraint.active) constrainedBy = 'railAndSnookered'
    else if (railConstraint.active) constrainedBy = 'rail'
    else if (snookerConstraint.active) constrainedBy = 'snookered'

    return {
      blocked: false,
      reason: null,
      defaultTipOffsetY,
      requiredElevation,
      constrainedBy,
    }
  }

  /** Impulse in table plane (mm/s scale tuned for demo). */
  strikeBall(id: string, direction: Position2D, power: number): void {
    const ball = this.balls.get(id)
    if (!ball || ball.potted) return

    // Freeze all non-cue balls so solver doesn't wake them with contact impulses
    for (const [, b] of this.balls) {
      if (b.id === id) continue
      b.body.velocity.setZero()
      b.body.angularVelocity.setZero()
      b.body.sleepState = CANNON.Body.SLEEPING
    }

    this.lastCueContactTime = -1

    const len = Math.hypot(direction.x, direction.y) || 1
    const nx = direction.x / len
    const ny = direction.y / len
    const impulse = (0.45 + power * 2.8) * 1000

    ball.body.wakeUp()
    ball.body.velocity.set(nx * impulse, 0, ny * impulse)
    ball.body.angularVelocity.set(0, 0, 0)
  }

  private getRailClearance(pos: Position2D): number {
    let minClearance = Number.POSITIVE_INFINITY

    for (const rail of pcolTableCueModel.railSegments) {
      const { segment, normal } = rail
      const clearance = (pos.x - segment.start.x) * normal.x + (pos.y - segment.start.y) * normal.y - BALL_RADIUS
      minClearance = Math.min(minClearance, clearance)
    }

    return minClearance
  }

  private blockedCueAddress(reason: ShotBlockReason): CueAddress {
    return {
      blocked: true,
      reason,
      defaultTipOffsetY: 0,
      requiredElevation: 0,
      constrainedBy: 'none',
    }
  }

  private isCueBallOverlappingRail(pos: Position2D): boolean {
    return this.getRailClearance(pos) < -1
  }

  private findOverlappingBall(cueBallId: string, cuePos: Position2D): string | null {
    for (const ball of this.getActiveBalls()) {
      if (ball.id === cueBallId) continue
      const pos = worldToTable(ball.body.position)
      const dist = Math.hypot(pos.x - cuePos.x, pos.y - cuePos.y)
      if (dist < BALL_RADIUS * 2 - 1) {
        return ball.id
      }
    }
    return null
  }

  private measureRailConstraint(pos: Position2D, backwards: Position2D): {
    active: boolean
    tipOffsetY: number
    elevation: number
  } {
    const clearance = Math.max(0, this.getRailClearance(pos))
    const closeThreshold = pcolTableCueModel.constraints.railElevationCurve.startClearance
    if (clearance >= closeThreshold) {
      return { active: false, tipOffsetY: 0, elevation: 0 }
    }

    const severity = 1 - clearance / closeThreshold
    const directionBias = Math.max(Math.abs(backwards.x), Math.abs(backwards.y))
    const tipOffsetY = pcolTableCueModel.constraints.defaultTipClearance
      + severity * 0.5 * (0.75 + directionBias * 0.25)
    const elevation = Math.min(
      pcolTableCueModel.constraints.maxElevation,
      pcolTableCueModel.constraints.defaultElevation + severity * 0.35,
    )

    return {
      active: severity > 0.02,
      tipOffsetY,
      elevation,
    }
  }

  private measureSnookerConstraint(
    cueBallId: string,
    cuePos: Position2D,
    backwards: Position2D,
  ): {
    active: boolean
    tipOffsetY: number
    elevation: number
  } {
    let severity = 0
    const shaftRadius = BALL_RADIUS * 0.5
    const maxDistance = BALL_RADIUS * 3.6

    for (const ball of this.getActiveBalls()) {
      if (ball.id === cueBallId) continue
      const pos = worldToTable(ball.body.position)
      const rel = { x: pos.x - cuePos.x, y: pos.y - cuePos.y }
      const along = rel.x * backwards.x + rel.y * backwards.y
      if (along <= BALL_RADIUS * 0.15 || along >= maxDistance) continue

      const perpX = rel.x - backwards.x * along
      const perpY = rel.y - backwards.y * along
      const perpDist = Math.hypot(perpX, perpY)
      const channelRadius = BALL_RADIUS + shaftRadius
      if (perpDist >= channelRadius) continue

      const overlapRatio = 1 - perpDist / channelRadius
      const closenessRatio = 1 - (along - BALL_RADIUS * 0.15) / (maxDistance - BALL_RADIUS * 0.15)
      severity = Math.max(severity, overlapRatio * 0.7 + closenessRatio * 0.3)
    }

    if (severity <= 0.02) {
      return { active: false, tipOffsetY: 0, elevation: 0 }
    }

    return {
      active: true,
      tipOffsetY: 0.28 + severity * 0.45,
      elevation: 0.12 + severity * 0.32,
    }
  }

  step(dt: number): string[] {
    this.world.step(1 / 60, dt, 3)

    const potted: string[] = []
    const escapeMargin = BALL_RADIUS * 2
    const maxX = pcolTableCollisionModel.playfieldBounds.halfWidth + PCOL_TABLE_OUTER_CUSHION_WIDTH + escapeMargin
    const maxZ = pcolTableCollisionModel.playfieldBounds.halfLength + PCOL_TABLE_OUTER_CUSHION_WIDTH + escapeMargin
    for (const ball of this.balls.values()) {
      if (ball.potted) continue

      // Clamp escaped balls back to the table
      const pos = worldToTable(ball.body.position)
      const clamped = { x: pos.x, y: pos.y }
      if (Math.abs(clamped.x) > maxX) {
        clamped.x = Math.sign(clamped.x) * (pcolTableCollisionModel.playfieldBounds.halfWidth + PCOL_TABLE_OUTER_CUSHION_WIDTH)
        ball.body.velocity.set(0, 0, 0)
        ball.body.angularVelocity.set(0, 0, 0)
      }
      if (Math.abs(clamped.y) > maxZ) {
        clamped.y = Math.sign(clamped.y) * (pcolTableCollisionModel.playfieldBounds.halfLength + PCOL_TABLE_OUTER_CUSHION_WIDTH)
        ball.body.velocity.set(0, 0, 0)
        ball.body.angularVelocity.set(0, 0, 0)
      }
      if (clamped.x !== pos.x || clamped.y !== pos.y) {
        ball.body.position.set(clamped.x, ball.body.position.y, clamped.y)
        continue // skip pocket check for escaped balls
      }

      if (isBallInPocket(pos)) {
        ball.potted = true
        ball.body.velocity.set(0, 0, 0)
        ball.body.angularVelocity.set(0, 0, 0)
        ball.body.position.y = -80
        potted.push(ball.id)
      }
    }
    return potted
  }

  allSleeping(): boolean {
    return this.getActiveBalls().every((b) => b.body.sleepState === CANNON.Body.SLEEPING)
  }

  getPosition(id: string): Position2D | null {
    const ball = this.balls.get(id)
    if (!ball) return null
    return worldToTable(ball.body.position)
  }

  getLastCueContactTime(): number {
    return this.lastCueContactTime
  }

  /** Resolve any initial contact stresses and force all balls to sleep. */
  settle(): void {
    for (let i = 0; i < 20; i++) {
      this.world.step(1 / 60, 1 / 60, 10)
    }
    for (const ball of this.balls.values()) {
      ball.body.velocity.setZero()
      ball.body.angularVelocity.setZero()
      ball.body.sleepState = CANNON.Body.SLEEPING
    }
  }
}
