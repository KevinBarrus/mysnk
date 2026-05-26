import * as CANNON from 'cannon-es'
import {
  BALL_MASS,
  BALL_RADIUS,
  CUSHION_HEIGHT,
  CUSHION_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  POCKET_RADIUS,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from '@/constants/table'
import { isBallInPocket } from '@/physics/pockets'
import type { BallColor } from '@/constants/table'
import type { Position2D } from '@/types/coords'

export interface PhysicsBall {
  id: string
  color: BallColor
  body: CANNON.Body
  potted: boolean
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
    this.world.solver.iterations = 25
    this.world.defaultContactMaterial.friction = 0.35
    this.world.defaultContactMaterial.restitution = 0.75

    this.buildCushions()
  }

  private buildCushions(): void {
    const wallH = CUSHION_HEIGHT
    const t = CUSHION_WIDTH
    const outerW = TABLE_WIDTH + t * 2

    // Gap on each long side for the middle pocket
    const halfGap = POCKET_RADIUS * 1.1
    const longSegLen = HALF_LENGTH - halfGap
    const longSegZ = longSegLen / 2  // half-size for Box shape

    const walls: Array<{ pos: CANNON.Vec3; size: CANNON.Vec3 }> = [
      // Short sides (full width)
      { pos: new CANNON.Vec3(0, wallH / 2, -HALF_LENGTH - t / 2), size: new CANNON.Vec3(outerW, wallH, t) },
      { pos: new CANNON.Vec3(0, wallH / 2, HALF_LENGTH + t / 2), size: new CANNON.Vec3(outerW, wallH, t) },
      // Left long side: two segments with gap for middle pocket
      { pos: new CANNON.Vec3(-HALF_WIDTH - t / 2, wallH / 2, -(HALF_LENGTH + halfGap) / 2), size: new CANNON.Vec3(t, wallH, longSegLen) },
      { pos: new CANNON.Vec3(-HALF_WIDTH - t / 2, wallH / 2, (HALF_LENGTH + halfGap) / 2), size: new CANNON.Vec3(t, wallH, longSegLen) },
      // Right long side: two segments with gap for middle pocket
      { pos: new CANNON.Vec3(HALF_WIDTH + t / 2, wallH / 2, -(HALF_LENGTH + halfGap) / 2), size: new CANNON.Vec3(t, wallH, longSegLen) },
      { pos: new CANNON.Vec3(HALF_WIDTH + t / 2, wallH / 2, (HALF_LENGTH + halfGap) / 2), size: new CANNON.Vec3(t, wallH, longSegLen) },
    ]

    for (const w of walls) {
      const shape = new CANNON.Box(new CANNON.Vec3(w.size.x / 2, w.size.y / 2, w.size.z / 2))
      const body = new CANNON.Body({ mass: 0, material: new CANNON.Material({ friction: 0.25, restitution: 0.8 }) })
      body.addShape(shape)
      body.position.copy(w.pos)
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

  step(dt: number): string[] {
    this.world.step(1 / 60, dt, 3)

    const potted: string[] = []
    const escapeMargin = BALL_RADIUS * 2
    const maxX = HALF_WIDTH + CUSHION_WIDTH + escapeMargin
    const maxZ = HALF_LENGTH + CUSHION_WIDTH + escapeMargin
    for (const ball of this.balls.values()) {
      if (ball.potted) continue

      // Clamp escaped balls back to the table
      const pos = worldToTable(ball.body.position)
      const clamped = { x: pos.x, y: pos.y }
      if (Math.abs(clamped.x) > maxX) {
        clamped.x = Math.sign(clamped.x) * (HALF_WIDTH + CUSHION_WIDTH)
        ball.body.velocity.set(0, 0, 0)
        ball.body.angularVelocity.set(0, 0, 0)
      }
      if (Math.abs(clamped.y) > maxZ) {
        clamped.y = Math.sign(clamped.y) * (HALF_LENGTH + CUSHION_WIDTH)
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
