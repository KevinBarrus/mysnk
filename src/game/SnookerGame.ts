import { createOpeningBalls } from '@/game/ballLayout'
import { PlanePhysics, type CueAddress, type ShotBlockReason } from '@/physics/PlanePhysics'
import { SnookerRenderer } from '@/render/SnookerRenderer'
import { SnookerRules, type FoulInfo, type RulesState, type ShotResult } from '@/rules/SnookerRules'
import { buildSessionSummary } from '@/summary/buildSessionSummary'
import { buildShotSummary } from '@/summary/buildShotSummary'
import { buildTableSnapshot } from '@/summary/buildTableSnapshot'
import type { SessionSummary, ShotSummary, SummaryMode, TableSnapshot } from '@/summary/types'
import { D_RADIUS, SPOTS, BALL_RADIUS } from '@/constants/table'
import type { Position2D } from '@/types/coords'

const BAULK_Y = SPOTS.baulk.y

export type GamePhase = 'general' | 'aiming' | 'simulating' | 'ballInHand' | 'ended'
type CueStrokePhase = 'idle' | 'frontPause' | 'backswing' | 'forward' | 'followThroughHold' | 'postShot'

interface CueStrokeState {
  phase: CueStrokePhase
  elapsed: number
  backswingDistance: number
  recoveryStartOffset: number
  strikePending: boolean
}

const FRONT_PAUSE_CUE_OFFSET_MM = 12
const BASE_BACKSWING_MM = 32
const MAX_BACKSWING_MM = 188
const BACKSWING_REDUCTION_MM = 92
const FRONT_PAUSE_DURATION = 0.09
const BACKSWING_BASE_DURATION = 0.12
const BACKSWING_POWER_DURATION = 0.18
const FORWARD_DURATION = 0.1
const FOLLOW_THROUGH_HOLD_DURATION = 0.18
const POST_SHOT_PRESENTATION_DURATION = 1.05
const FORWARD_CONTACT_CUE_OFFSET_MM = 0
const STRIKE_CONTACT_OFFSET_MM = 4

export class SnookerGame {
  private physics = new PlanePhysics()
  private renderer: SnookerRenderer
  private rules = new SnookerRules()
  private raf = 0
  private lastTime = 0
  private inputEnabled = false

  /** Balls potted during the current shot, accumulated until settlement. */
  private shotPottedIds: string[] = []
  /** Prevents the settlement handler from firing more than once per shot. */
  private shotSettledFired = false
  /** Timestamp when postShot ended, used for settlement timeout. */
  private postShotEndTime = -1

  private phase: GamePhase = 'general'
  private aimAngle = 0
  private aimAngleDirty = true
  private power = 0.35
  private readonly cueBallId = 'white'
  private mode: SummaryMode = 'practice'
  private shotIndex = 0
  private currentShotSnapshot: TableSnapshot | null = null
  private shotSummaries: ShotSummary[] = []

  /** Set of currently-held key codes. */
  private keys = new Set<string>()

  /** Mouse drag state for yaw/pitch rotation. */
  private isDragging = false
  private dragLastX = 0
  private dragLastY = 0

  private pendingStandTarget?: Position2D
  private postShotCuePos: Position2D | null = null
  private postShotAimDir: Position2D | null = null
  private cueStroke: CueStrokeState = {
    phase: 'idle',
    elapsed: 0,
    backswingDistance: 0,
    recoveryStartOffset: FRONT_PAUSE_CUE_OFFSET_MM,
    strikePending: false,
  }
  private cueAddress: CueAddress = {
    blocked: false,
    reason: null,
    defaultTipOffsetY: 0,
    requiredElevation: 0,
    constrainedBy: 'none',
  }

  private onPhaseChange?: (phase: GamePhase) => void
  private onPotted?: (ids: string[]) => void
  private onShotBlocked?: (message: string | null) => void
  private onScoreUpdate?: (state: RulesState) => void
  private onFoul?: (foul: FoulInfo | null) => void
  private onBallInHand?: () => void
  private onTableSnapshot?: (snapshot: TableSnapshot) => void
  private onShotSummary?: (summary: ShotSummary) => void
  private onSessionSummary?: (summary: SessionSummary) => void

  constructor(container: HTMLElement) {
    this.renderer = new SnookerRenderer(container)
    this.resetBalls()
    this.bindInput(container)
    this.loop(0)
  }

  setCallbacks(cb: {
    onPhaseChange?: (phase: GamePhase) => void
    onPotted?: (ids: string[]) => void
    onShotBlocked?: (message: string | null) => void
    onScoreUpdate?: (state: RulesState) => void
    onFoul?: (foul: FoulInfo | null) => void
    onBallInHand?: () => void
    onTableSnapshot?: (snapshot: TableSnapshot) => void
    onShotSummary?: (summary: ShotSummary) => void
    onSessionSummary?: (summary: SessionSummary) => void
  }): void {
    this.onPhaseChange = cb.onPhaseChange
    this.onPotted = cb.onPotted
    this.onShotBlocked = cb.onShotBlocked
    this.onScoreUpdate = cb.onScoreUpdate
    this.onFoul = cb.onFoul
    this.onBallInHand = cb.onBallInHand
    this.onTableSnapshot = cb.onTableSnapshot
    this.onShotSummary = cb.onShotSummary
    this.onSessionSummary = cb.onSessionSummary
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled
    this.keys.clear()
    this.isDragging = false
    this.onShotBlocked?.(null)

    if (!enabled && this.phase === 'aiming') {
      this.exitAimMode()
    }

    // On first enable, enter ball-in-hand so player places the cue ball
    if (enabled && this.phase === 'general') {
      this.enterBallInHand()
    }
  }

  setMode(mode: SummaryMode): void {
    this.mode = mode
    this.restart()
  }

  private resetBalls(): void {
    for (const ball of createOpeningBalls()) {
      this.physics.addBall(ball.id, ball.color, ball.position)
      this.renderer.syncBall(ball.id, ball.color, ball.position, false)
    }
    this.physics.settle()
  }

  private setPhase(phase: GamePhase): void {
    console.log('[SnookerGame] Phase change:', this.phase, '->', phase)
    this.phase = phase
    this.onPhaseChange?.(phase)
  }

  private bindInput(container: HTMLElement): void {
    // --- Drag: yaw/pitch in general, aim in aiming ---
    container.addEventListener('mousedown', (e) => {
      if (!this.inputEnabled) return
      if (this.phase === 'ballInHand') {
        this.handleBallInHandClick(e.clientX, e.clientY)
        return
      }
      this.isDragging = true
      this.dragLastX = e.clientX
      this.dragLastY = e.clientY
    })

    window.addEventListener('mousemove', (e) => {
      if (this.phase === 'ballInHand') {
        this.handleBallInHandMove(e.clientX, e.clientY)
        return
      }
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
      if (!this.inputEnabled) return
      e.preventDefault()
      if (this.phase === 'aiming' && !this.isCueStrokeAnimating()) {
        this.power = Math.max(0.05, Math.min(1, this.power + (e.deltaY > 0 ? -0.05 : 0.05)))
      }
    }, { passive: false })

    // --- Keyboard ---
    window.addEventListener('keydown', (e) => {
      if (!this.inputEnabled) return
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
      if (!this.inputEnabled) return
      this.keys.delete(e.code)
    })
  }

  private isInDZone(pos: Position2D): boolean {
    const dx = pos.x
    const dy = pos.y - BAULK_Y
    return dy >= 0 && Math.hypot(dx, dy) <= D_RADIUS - BALL_RADIUS
  }

  private enterBallInHand(): void {
    this.setPhase('ballInHand')
    this.onBallInHand?.()
  }

  /** Called on mousemove during ballInHand phase. Updates the placement ring. */
  handleBallInHandMove(clientX: number, clientY: number): void {
    if (this.phase !== 'ballInHand') return
    const pos = this.renderer.raycastTablePoint(clientX, clientY)
    if (!pos) {
      this.renderer.updateBallInHandRing(null, false)
      return
    }
    const valid = this.isInDZone(pos)
    this.renderer.updateBallInHandRing(pos, valid)
  }

  /** Called on mousedown during ballInHand phase. Places cue ball if valid. */
  handleBallInHandClick(clientX: number, clientY: number): void {
    if (this.phase !== 'ballInHand') return
    const pos = this.renderer.raycastTablePoint(clientX, clientY)
    if (!pos || !this.isInDZone(pos)) return

    this.renderer.hideBallInHandRing()
    this.physics.placeCueBall(this.cueBallId, pos)
    this.renderer.syncBall(this.cueBallId, 'white', pos, false)
    this.aimAngleDirty = true
    this.setPhase('general')
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

    this.updateCueAddress()
    this.renderer.enterAimingMode(cuePos, this.aimDirection())
  }

  private exitAimMode(): void {
    this.renderer.exitAimingMode()
    this.setPhase('general')
  }

  private syncAimCamera(): void {
    const cuePos = this.physics.getPosition(this.cueBallId)
    if (cuePos) {
      this.updateCueAddress()
      this.renderer.updateAimingCamera(cuePos, this.aimDirection())
    }
  }

  private updateCueAddress(): void {
    this.cueAddress = this.physics.evaluateCueAddress(this.cueBallId, this.aimDirection())
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
    const shotCheck = this.physics.evaluateCueAddress(this.cueBallId, dir)
    this.cueAddress = shotCheck
    if (shotCheck.blocked) {
      this.onShotBlocked?.(this.getShotBlockedMessage(shotCheck.reason))
      return
    }

    this.onShotBlocked?.(null)
    if (this.isCueStrokeAnimating()) return

    this.shotIndex += 1
    this.currentShotSnapshot = buildTableSnapshot({
      shotIndex: this.shotIndex,
      mode: this.mode,
      actor: this.rules.getState().currentActor,
      rulesState: this.rules.getState(),
      balls: this.physics.getAllBalls(),
      getPosition: (id) => this.physics.getPosition(id),
    })
    this.onTableSnapshot?.(this.currentShotSnapshot)

    this.cueStroke = {
      phase: 'backswing',
      elapsed: 0,
      backswingDistance: this.computeBackswingDistance(shotCheck),
      recoveryStartOffset: FRONT_PAUSE_CUE_OFFSET_MM,
      strikePending: true,
    }
  }

  private getShotBlockedMessage(reason: ShotBlockReason | null): string {
    switch (reason) {
      case 'cueBallMissing':
      case 'cueBallPotted':
        return 'Cue ball unavailable'
      case 'cueBallFrozenToRail':
        return 'Cue ball overlaps the cushion'
      case 'cueBackswingBlockedByRail':
        return 'Cue direction unavailable'
      case 'cueBackswingBlockedByBall':
        return 'Cue ball overlaps another ball'
      default:
        return 'Shot blocked'
    }
  }

  private restart(): void {
    this.emitSessionSummary()
    this.physics = new PlanePhysics()
    this.renderer.clearAllBalls()
    this.resetBalls()
    this.rules.reset()
    this.shotPottedIds = []
    this.shotSettledFired = false
    this.postShotEndTime = -1
    this.currentShotSnapshot = null
    this.shotSummaries = []
    this.shotIndex = 0
    this.aimAngle = 0
    this.aimAngleDirty = true
    this.power = 0.35
    this.pendingStandTarget = undefined
    this.postShotCuePos = null
    this.postShotAimDir = null
    this.cueStroke = {
      phase: 'idle',
      elapsed: 0,
      backswingDistance: 0,
      recoveryStartOffset: FRONT_PAUSE_CUE_OFFSET_MM,
      strikePending: false,
    }
    this.isDragging = false
    this.renderer.resetView()
    this.setPhase('general')
    this.onScoreUpdate?.(this.rules.getState())
    this.onFoul?.(null)
  }

  getPower(): number {
    return this.power
  }

  getPhase(): GamePhase {
    return this.phase
  }

  private isCueStrokeAnimating(): boolean {
    return this.cueStroke.phase === 'backswing'
      || this.cueStroke.phase === 'forward'
      || this.cueStroke.phase === 'followThroughHold'
      || this.cueStroke.phase === 'postShot'
  }

  private isCueStrokeVisiblePhase(): boolean {
    return this.cueStroke.phase === 'frontPause'
      || this.cueStroke.phase === 'backswing'
      || this.cueStroke.phase === 'forward'
      || this.cueStroke.phase === 'followThroughHold'
      || this.cueStroke.phase === 'postShot'
  }

  private computeBackswingDistance(cueAddress: CueAddress): number {
    const baseDistance = BASE_BACKSWING_MM + this.power * (MAX_BACKSWING_MM - BASE_BACKSWING_MM)

    if (cueAddress.constrainedBy === 'none') return baseDistance

    const severity = Math.min(
      1,
      Math.max(cueAddress.defaultTipOffsetY, cueAddress.requiredElevation) / 0.55,
    )

    return Math.max(
      FRONT_PAUSE_CUE_OFFSET_MM + 10,
      baseDistance - BACKSWING_REDUCTION_MM * severity,
    )
  }

  private startShotSimulation(): void {
    this.setPhase('simulating')
    this.aimAngleDirty = true
    this.pendingStandTarget = this.findTargetBall() ?? undefined
  }

  private updateCueStroke(dt: number): void {
    if (
      this.phase !== 'aiming'
      && this.cueStroke.phase !== 'followThroughHold'
      && this.cueStroke.phase !== 'postShot'
    ) {
      this.cueStroke.phase = 'idle'
      this.cueStroke.elapsed = 0
      this.cueStroke.backswingDistance = 0
      this.cueStroke.recoveryStartOffset = FRONT_PAUSE_CUE_OFFSET_MM
      this.cueStroke.strikePending = false
      return
    }

    if (this.cueStroke.phase === 'idle') {
      this.cueStroke.phase = 'frontPause'
      this.cueStroke.elapsed = 0
      return
    }

    this.cueStroke.elapsed += dt

    if (this.cueStroke.phase === 'frontPause') {
      if (this.cueStroke.elapsed >= FRONT_PAUSE_DURATION) {
        this.cueStroke.elapsed = 0
      }
      return
    }

    if (this.cueStroke.phase === 'backswing') {
      const duration = BACKSWING_BASE_DURATION + this.power * BACKSWING_POWER_DURATION
      if (this.cueStroke.elapsed >= duration) {
        this.cueStroke.phase = 'forward'
        this.cueStroke.elapsed = 0
      }
      return
    }

    if (this.cueStroke.phase === 'forward') {
      const contactProgress = Math.min(1, this.cueStroke.elapsed / FORWARD_DURATION)
      const currentOffset = this.computeCueOffset()
      if (this.cueStroke.strikePending && currentOffset <= STRIKE_CONTACT_OFFSET_MM) {
        this.cueStroke.strikePending = false
        this.cueStroke.recoveryStartOffset = Math.max(
          0,
          Math.min(2, currentOffset),
        )
        this.postShotCuePos = this.physics.getPosition(this.cueBallId)
        this.postShotAimDir = this.aimDirection()
        this.cueStroke.phase = 'followThroughHold'
        this.cueStroke.elapsed = 0
        this.shotPottedIds = []
        this.shotSettledFired = false
        this.postShotEndTime = -1
        this.physics.strikeBall(this.cueBallId, this.aimDirection(), this.power)
        this.startShotSimulation()
        return
      }
      if (contactProgress >= 1) {
        this.cueStroke.recoveryStartOffset = Math.max(
          0,
          Math.min(2, currentOffset),
        )
        this.postShotCuePos = this.physics.getPosition(this.cueBallId)
        this.postShotAimDir = this.aimDirection()
        this.cueStroke.phase = 'followThroughHold'
        this.cueStroke.elapsed = 0
      }
      return
    }

    if (this.cueStroke.phase === 'followThroughHold') {
      if (this.cueStroke.elapsed >= FOLLOW_THROUGH_HOLD_DURATION) {
        this.cueStroke.phase = 'postShot'
        this.cueStroke.elapsed = 0
        if (this.postShotCuePos && this.postShotAimDir) {
          this.renderer.beginPostShotPresentation(
            this.postShotCuePos,
            this.postShotAimDir,
            this.pendingStandTarget,
          )
        }
      }
      return
    }

    if (this.cueStroke.phase === 'postShot') {
      if (this.cueStroke.elapsed >= POST_SHOT_PRESENTATION_DURATION) {
        this.cueStroke.phase = this.phase === 'aiming' ? 'frontPause' : 'idle'
        this.cueStroke.elapsed = 0
        this.cueStroke.backswingDistance = 0
        this.cueStroke.recoveryStartOffset = FRONT_PAUSE_CUE_OFFSET_MM
        this.cueStroke.strikePending = false
        this.postShotCuePos = null
        this.postShotAimDir = null
        this.renderer.finishPostShotPresentation()
        if (this.phase === 'simulating') {
          // Mark postShot end time; settlement fires in loop once balls sleep
          this.postShotEndTime = performance.now()
        }
      }
    }
  }

  private computeCueOffset(): number {
    if (this.cueStroke.phase === 'backswing') {
      const duration = BACKSWING_BASE_DURATION + this.power * BACKSWING_POWER_DURATION
      const progress = Math.min(1, this.cueStroke.elapsed / duration)
      return FRONT_PAUSE_CUE_OFFSET_MM + this.cueStroke.backswingDistance * progress
    }

    if (this.cueStroke.phase === 'forward') {
      const progress = Math.min(1, this.cueStroke.elapsed / FORWARD_DURATION)
      return FORWARD_CONTACT_CUE_OFFSET_MM
        + (FRONT_PAUSE_CUE_OFFSET_MM + this.cueStroke.backswingDistance - FORWARD_CONTACT_CUE_OFFSET_MM) * (1 - progress)
    }

    if (this.cueStroke.phase === 'followThroughHold') {
      return this.cueStroke.recoveryStartOffset
    }

    if (this.cueStroke.phase === 'postShot') {
      return this.cueStroke.recoveryStartOffset
    }

    return FRONT_PAUSE_CUE_OFFSET_MM
  }

  private shouldEnterBallInHand(result: ShotResult): boolean {
    return result.foul?.type === 'whitePotted'
      || this.shotPottedIds.includes(this.cueBallId)
  }

  private loop = (time: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min((time - this.lastTime) / 1000, 0.05)
    this.lastTime = time

    // Step physics while any ball is moving (shot settling)
    if (!this.physics.allSleeping()) {
      const potted = this.physics.step(dt)
      if (potted.length) this.shotPottedIds.push(...potted)
    }

    // Wait for all balls to sleep after postShot ends, then settle.
    // Timeout after 5s to guard against balls that never fully sleep.
    const SETTLE_TIMEOUT_MS = 5000
    if (
      this.phase === 'simulating'
      && this.postShotEndTime >= 0
      && !this.shotSettledFired
      && (this.physics.allSleeping() || performance.now() - this.postShotEndTime > SETTLE_TIMEOUT_MS)
    ) {
      this.shotSettledFired = true
      this.postShotEndTime = -1
      const firstContact = this.physics.getFirstContact()
      const result = this.rules.processShot(firstContact, this.shotPottedIds, this.mode)
      for (const id of result.respottedColorIds) {
        this.physics.respotBall(id, SPOTS[id])
      }
      const afterState = this.rules.getState()
      if (this.currentShotSnapshot) {
        const shotSummary = buildShotSummary({
          before: this.currentShotSnapshot,
          firstContactBallId: firstContact,
          pottedBallIds: this.shotPottedIds,
          result,
          afterState,
          cueBallEndPosition: this.physics.getPosition(this.cueBallId),
        })
        this.shotSummaries.push(shotSummary)
        this.onShotSummary?.(shotSummary)
      }
      this.onPotted?.(this.shotPottedIds)
      this.onScoreUpdate?.(afterState)
      this.onFoul?.(result.foul)
      this.currentShotSnapshot = null
      this.pendingStandTarget = undefined
      // White potted → ball in hand
      if (this.shouldEnterBallInHand(result)) {
        this.enterBallInHand()
      } else {
        this.setPhase('general')
      }
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
    if (this.phase === 'aiming' && !this.isCueStrokeAnimating()) {
      const nudge = 0.008
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.aimAngle -= nudge
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.aimAngle += nudge
      this.syncAimCamera()
    } else if (this.phase === 'aiming') {
      this.syncAimCamera()
    }

    this.updateCueStroke(dt)

    if (this.phase === 'simulating' && this.cueStroke.phase === 'postShot') {
      const postShotProgress = Math.min(1, this.cueStroke.elapsed / POST_SHOT_PRESENTATION_DURATION)
      if (this.postShotCuePos && this.postShotAimDir) {
        this.renderer.updatePostShotPresentation(
          postShotProgress,
          this.postShotCuePos,
          this.postShotAimDir,
          this.pendingStandTarget,
        )
      }
    }

    for (const ball of this.physics.getAllBalls()) {
      const pos = this.physics.getPosition(ball.id)
      if (pos) {
        this.renderer.syncBall(ball.id, ball.color, pos, ball.potted)
      }
    }

    const liveCuePos = this.physics.getPosition(this.cueBallId)
    const renderCuePos =
      (this.cueStroke.phase === 'followThroughHold' || this.cueStroke.phase === 'postShot')
        ? this.postShotCuePos
        : liveCuePos
    const renderAimDir =
      (this.cueStroke.phase === 'followThroughHold' || this.cueStroke.phase === 'postShot')
        ? this.postShotAimDir
        : this.aimDirection()
    const shouldRenderCue = renderCuePos && renderAimDir && (
      this.phase === 'aiming'
      || this.isCueStrokeVisiblePhase()
    )
    if (shouldRenderCue && renderCuePos && renderAimDir) {
      const postShotProgress = this.cueStroke.phase === 'postShot'
        ? Math.min(1, this.cueStroke.elapsed / POST_SHOT_PRESENTATION_DURATION)
        : 0
      this.renderer.updateCue(
        renderCuePos,
        renderAimDir,
        this.computeCueOffset(),
        this.cueAddress.defaultTipOffsetY,
        this.cueAddress.requiredElevation,
        postShotProgress,
      )
      this.renderer.setCueVisible(true)
      this.renderer.setAimLineVisible(this.phase === 'aiming')
    } else {
      this.renderer.setCueVisible(false)
      this.renderer.setAimLineVisible(false)
    }

    this.renderer.tickTransition(dt)
    this.renderer.render()
  }

  dispose(): void {
    this.emitSessionSummary()
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
  }

  private emitSessionSummary(): void {
    if (this.shotSummaries.length === 0) return
    this.onSessionSummary?.(buildSessionSummary(this.mode, this.shotSummaries))
  }
}
