export type ColorBall = 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black'

/** 'color' = 打完红球后可选任意彩球 */
export type BallOnIndicator = 'red' | 'color' | ColorBall

export type FoulType =
  | 'whitePotted'
  | 'wrongBallFirst'
  | 'noBallHit'
  | 'colorPottedOnRed'

export interface FoulInfo {
  type: FoulType
  penalty: number
  message: string
}

export interface ShotResult {
  scored: number
  foul: FoulInfo | null
  ballOn: BallOnIndicator
  redsRemaining: number
}

export interface RulesState {
  playerScore: number
  breakScore: number
  ballOn: BallOnIndicator
  redsRemaining: number
  phase: 'reds' | 'clearance'
}

export type GameMode = 'practice' | 'match'

const BALL_VALUE: Record<string, number> = {
  red: 1,
  yellow: 2,
  green: 3,
  brown: 4,
  blue: 5,
  pink: 6,
  black: 7,
}

const CLEARANCE_ORDER: ColorBall[] = ['yellow', 'green', 'brown', 'blue', 'pink', 'black']

export class SnookerRules {
  private redsRemaining = 15
  private expectingColor = false
  private clearanceIndex = 0
  private phase: 'reds' | 'clearance' = 'reds'
  private playerScore = 0
  private breakScore = 0

  getBallOn(): BallOnIndicator {
    if (this.phase === 'clearance') {
      return CLEARANCE_ORDER[this.clearanceIndex] ?? 'black'
    }
    return this.expectingColor ? 'color' : 'red'
  }

  getState(): RulesState {
    return {
      playerScore: this.playerScore,
      breakScore: this.breakScore,
      ballOn: this.getBallOn(),
      redsRemaining: this.redsRemaining,
      phase: this.phase,
    }
  }

  /**
   * 每杆结束后调用。
   * firstContact: 白球首次接触的球 ID（null = 未碰任何球）
   * potted: 本杆进袋的球 ID 列表（含白球）
   * mode: 'practice' 犯规只提示；'match' 犯规加对方分（由调用方处理 penalty）
   */
  processShot(
    firstContact: string | null,
    potted: string[],
    _mode: GameMode = 'practice',
  ): ShotResult {
    const whitePotted = potted.includes('white')
    const nonWhitePotted = potted.filter((id) => id !== 'white')

    const foul = this.detectFoul(firstContact, potted, whitePotted)

    if (foul) {
      this.breakScore = 0
      // 在 match 模式下，调用方可读取 foul.penalty 给对方加分
      return {
        scored: 0,
        foul,
        ballOn: this.getBallOn(),
        redsRemaining: this.redsRemaining,
      }
    }

    // 合法出杆，结算进球
    let scored = 0
    for (const id of nonWhitePotted) {
      const value = this.getBallValue(id)
      scored += value
      this.applyPot(id)
    }

    this.playerScore += scored
    this.breakScore += scored

    // 若本杆没进球，单杆结束
    if (scored === 0) {
      this.breakScore = 0
    }

    // 推进阶段
    this.advancePhase(nonWhitePotted)

    return {
      scored,
      foul: null,
      ballOn: this.getBallOn(),
      redsRemaining: this.redsRemaining,
    }
  }

  reset(): void {
    this.redsRemaining = 15
    this.expectingColor = false
    this.clearanceIndex = 0
    this.phase = 'reds'
    this.playerScore = 0
    this.breakScore = 0
  }

  // ── private ──────────────────────────────────────────────

  private detectFoul(
    firstContact: string | null,
    potted: string[],
    whitePotted: boolean,
  ): FoulInfo | null {
    const penaltyBase = this.getBallOnValue()

    if (whitePotted) {
      return {
        type: 'whitePotted',
        penalty: Math.max(4, penaltyBase),
        message: 'Cue ball potted',
      }
    }

    if (firstContact === null) {
      return {
        type: 'noBallHit',
        penalty: Math.max(4, penaltyBase),
        message: 'No ball contacted',
      }
    }

    if (this.phase === 'reds') {
      if (!this.expectingColor) {
        // 应打红球
        if (!firstContact.startsWith('red_') && firstContact !== 'red') {
          return {
            type: 'wrongBallFirst',
            penalty: Math.max(4, BALL_VALUE[firstContact] ?? 4),
            message: 'Must hit a red ball first',
          }
        }
        // 进了彩球（非红球）
        const colorPotted = potted.filter(
          (id) => id !== 'white' && !id.startsWith('red_') && id !== 'red',
        )
        if (colorPotted.length > 0) {
          const maxVal = Math.max(...colorPotted.map((id) => BALL_VALUE[id] ?? 4))
          return {
            type: 'colorPottedOnRed',
            penalty: Math.max(4, maxVal),
            message: 'Cannot pot a colour when red is on',
          }
        }
      } else {
        // 应打彩球
        if (firstContact.startsWith('red_') || firstContact === 'red') {
          return {
            type: 'wrongBallFirst',
            penalty: Math.max(4, penaltyBase),
            message: 'Must hit a colour ball first',
          }
        }
      }
    } else {
      // 清彩阶段：必须先碰当前目标彩球
      const target = CLEARANCE_ORDER[this.clearanceIndex]
      if (firstContact !== target) {
        return {
          type: 'wrongBallFirst',
          penalty: Math.max(4, BALL_VALUE[target] ?? 4),
          message: `Must hit the ${target} ball first`,
        }
      }
    }

    return null
  }

  private applyPot(id: string): void {
    if (id.startsWith('red_') || id === 'red') {
      this.redsRemaining = Math.max(0, this.redsRemaining - 1)
    }
    // 彩球在清彩阶段进袋后不复位（物理层已处理），reds 阶段彩球由物理层 respawn（暂未实现，规则层不管）
  }

  private advancePhase(pottedNonWhite: string[]): void {
    if (this.phase === 'reds') {
      if (!this.expectingColor) {
        const redPotted = pottedNonWhite.some(
          (id) => id.startsWith('red_') || id === 'red',
        )
        if (redPotted) {
          if (this.redsRemaining === 0) {
            // 最后一颗红球进袋，下一杆打彩球，之后进入清彩
            this.expectingColor = true
          } else {
            this.expectingColor = true
          }
        }
        // 没进红球：单杆结束，expectingColor 保持 false
      } else {
        // 打完彩球这杆
        const colorPotted = pottedNonWhite.some(
          (id) => !id.startsWith('red_') && id !== 'red',
        )
        this.expectingColor = false
        if (this.redsRemaining === 0 && colorPotted) {
          // 所有红球已消失，进入清彩
          this.phase = 'clearance'
          this.clearanceIndex = 0
        }
      }
    } else {
      // 清彩阶段：进了目标球则推进
      const target = CLEARANCE_ORDER[this.clearanceIndex]
      if (pottedNonWhite.includes(target)) {
        this.clearanceIndex++
      }
    }
  }

  private getBallValue(id: string): number {
    if (id.startsWith('red_') || id === 'red') return 1
    return BALL_VALUE[id] ?? 0
  }

  private getBallOnValue(): number {
    const ballOn = this.getBallOn()
    if (ballOn === 'red') return 1
    if (ballOn === 'color') return 1 // 接彩球时最低罚分由 max(4,...) 保证
    return BALL_VALUE[ballOn] ?? 1
  }
}
