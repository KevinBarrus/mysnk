import { createOpeningBalls } from '@/game/ballLayout'
import { PlanePhysics } from '@/physics/PlanePhysics'
import { SnookerRenderer } from '@/render/SnookerRenderer'
import type { Position2D } from '@/types/coords'

export type GamePhase = 'general' | 'aiming' | 'simulating' | 'ended'

export class SnookerGame {
  private physics = new PlanePhysics()
  private renderer: SnookerRenderer
  private raf = 0
  private lastTime = 0

  private phase: GamePhase = 'general'
  private aimAngle = 0
  private aimAngleDirty = true
  private power = 0.35
  private readonly cueBallId = 'white'

  /** Set of currently-held key codes. */
  private keys = new Set<string>()

  /** Mouse drag state for yaw/pitch rotation. */
  private isDragging = false
  private dragLastX = 0
  private dragLastY = 0

  /** True while waiting for camera to finish standing up after a shot. */
  private standingUp = false

  private onPhaseChange?: (phase: GamePhase) => void
  private onPotted?: (ids: string[]) => void

  constructor(container: HTMLElement) {
    this.renderer = new SnookerRenderer(container)
    this.resetBalls()
    this.bindInput(container)
    this.loop(0)
  }

  setCallbacks(cb: {
    onPhaseChange?: (phase: GamePhase) => void
    onPotted?: (ids: string[]) => void
  }): void {
    this.onPhaseChange = cb.onPhaseChange
    this.onPotted = cb.onPotted
  }

  private resetBalls(): void {
    for (const ball of createOpeningBalls()) {
      this.physics.addBall(ball.id, ball.color, ball.position)
      this.renderer.syncBall(ball.id, ball.color, ball.position, false)
    }
    this.physics.settle()
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase
    this.renderer.setCueVisible(phase === 'aiming')
    this.renderer.setAimLineVisible(phase === 'aiming')
    this.onPhaseChange?.(phase)
  }

  private bindInput(container: HTMLElement): void {
    // --- Drag: yaw/pitch in general, aim in aiming ---
    container.addEventListener('mousedown', (e) => {
      this.isDragging = true
      this.dragLastX = e.clientX
      this.dragLastY = e.clientY
    })

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return
      const dx = e.clientX - this.dragLastX
      const dy = e.clientY - this.dragLastY
      this.dragLastX = e.clientX
      this.dragLastY = e.clientY

      if (this.phase === 'general') {
        // Inverted horizontal: left drag → look right
        this.renderer.rotateYaw(-dx * 0.002)
        this.renderer.rotatePitch(dy * 0.002)
      } else if (this.phase === 'aiming') {
        this.renderer.rotateAimView(-dx * 0.002, dy * 0.002)
      }
    })

    window.addEventListener('mouseup', () => {
      this.isDragging = false
    })

    // --- Scroll: power in aiming only ---
    window.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (this.phase === 'aiming') {
        this.power = Math.max(0.05, Math.min(1, this.power + (e.deltaY > 0 ? -0.05 : 0.05)))
      }
    }, { passive: false })

    // --- Keyboard ---
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)

      if (e.code === 'KeyW' && this.phase === 'general') {
        e.preventDefault()
        this.enterAimMode()
      }

      if (e.code === 'KeyS' && this.phase === 'aiming') {
        e.preventDefault()
        this.exitAimMode()
      }

      if (e.code === 'Space') {
        e.preventDefault()
        if (this.phase === 'aiming') this.shoot()
      }

      if (e.code === 'KeyR') {
        e.preventDefault()
        if (this.phase === 'general') {
          this.renderer.resetView()
          this.aimAngleDirty = true
        } else {
          this.restart()
        }
      }

      // Prevent page scroll
      if (e.code.startsWith('Arrow') || e.code === 'KeyW' || e.code === 'KeyS') {
        e.preventDefault()
      }
    })

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
  }

  private enterAimMode(): void {
    this.setPhase('aiming')
    const cuePos = this.physics.getPosition(this.cueBallId)
    if (!cuePos) return

    // Recompute aim direction from standing gaze on "first entry" only
    if (this.aimAngleDirty) {
      const gazePoint = this.renderer.getGazeTablePoint()
      if (gazePoint) {
        const tx = gazePoint.x * 1000
        const ty = gazePoint.z * 1000
        const dx = tx - cuePos.x
        const dy = ty - cuePos.y
        if (Math.hypot(dx, dy) > 10) {
          this.aimAngle = Math.atan2(dx, dy)
        }
      }
      this.aimAngleDirty = false
    }

    this.renderer.enterAimingMode(cuePos, this.aimDirection())
  }

  private exitAimMode(): void {
    this.renderer.exitAimingMode()
    this.setPhase('general')
  }

  private syncAimCamera(): void {
    const cuePos = this.physics.getPosition(this.cueBallId)
    if (cuePos) {
      this.renderer.updateAimingCamera(cuePos, this.aimDirection())
    }
  }

  private aimDirection(): Position2D {
    return { x: Math.sin(this.aimAngle), y: Math.cos(this.aimAngle) }
  }

  private findTargetBall(): Position2D | null {
    const cuePos = this.physics.getPosition(this.cueBallId)
    if (!cuePos) return null
    const dir = this.aimDirection()

    let best: Position2D | null = null
    let bestAngle = Infinity

    for (const ball of this.physics.getActiveBalls()) {
      if (ball.id === this.cueBallId) continue
      const pos = this.physics.getPosition(ball.id)
      if (!pos) continue
      const dx = pos.x - cuePos.x
      const dy = pos.y - cuePos.y
      const dist = Math.hypot(dx, dy)
      if (dist < 1) continue
      const dot = (dx * dir.x + dy * dir.y) / dist
      if (dot < 0) continue // behind cue ball
      const angle = Math.acos(Math.min(1, dot))
      if (angle < bestAngle) {
        bestAngle = angle
        best = pos
      }
    }
    return best
  }

  private shoot(): void {
    const dir = this.aimDirection()
    this.physics.strikeBall(this.cueBallId, dir, this.power)
    this.setPhase('simulating')
    this.aimAngleDirty = true
    const target = this.findTargetBall() ?? undefined
    this.renderer.exitAimingMode(target)
    this.standingUp = true
  }

  private restart(): void {
    this.physics = new PlanePhysics()
    this.renderer.clearAllBalls()
    this.resetBalls()
    this.aimAngle = 0
    this.aimAngleDirty = true
    this.power = 0.35
    this.standingUp = false
    this.isDragging = false
    this.renderer.resetView()
    this.setPhase('general')
  }

  getPower(): number {
    return this.power
  }

  getPhase(): GamePhase {
    return this.phase
  }

  private loop = (time: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((time - this.lastTime) / 1000, 0.05)
    this.lastTime = time

    // Step physics while any ball is moving (shot settling)
    if (!this.physics.allSleeping()) {
      const potted = this.physics.step(dt)
      if (potted.length) this.onPotted?.(potted)
    }

    // General-mode keyboard orbit: A/D orbit around the table
    if (this.phase === 'general') {
      const orbitSpeed = 0.03
      let dOrbit = 0
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dOrbit -= orbitSpeed
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dOrbit += orbitSpeed
      if (dOrbit !== 0) {
        this.renderer.rotateOrbit(dOrbit)
        this.aimAngleDirty = true
      }
    }

    // Aiming-mode keyboard: A/D nudge aim angle
    if (this.phase === 'aiming') {
      const nudge = 0.008
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.aimAngle -= nudge
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.aimAngle += nudge
      this.syncAimCamera()
    }

    if (this.phase === 'simulating') {
      if (this.standingUp && !this.renderer.isTransitionActive()) {
        this.setPhase('general')
        this.standingUp = false
      }
    }

    for (const ball of this.physics.getAllBalls()) {
      const pos = this.physics.getPosition(ball.id)
      if (pos) {
        this.renderer.syncBall(ball.id, ball.color, pos, ball.potted)
      }
    }

    const cuePos = this.physics.getPosition(this.cueBallId)
    if (cuePos && this.phase === 'aiming') {
      this.renderer.updateCue(cuePos, this.aimDirection(), this.power)
      this.renderer.setAimLineVisible(true)
    } else {
      this.renderer.setCueVisible(false)
      this.renderer.setAimLineVisible(false)
    }

    this.renderer.tickTransition(dt)
    this.renderer.render()
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
  }
}
