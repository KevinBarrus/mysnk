import type { BallOnIndicator, FoulInfo, RulesState } from '@/rules/SnookerRules'
import { buildSessionSummary } from '@/summary/buildSessionSummary'
import type {
  PotDifficulty,
  SessionSummary,
  ShotSummary,
  SnapshotBall,
  TableSnapshot,
} from '@/summary/types'
import type { Position2D } from '@/types/coords'

const BALL_KINDS: SnapshotBall['kind'][] = ['white', 'red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black']
type SimulatedPatternEntry = {
  difficulty: PotDifficulty
  outcome: ShotSummary['outcome']
  ballOn: BallOnIndicator
}

const SIMULATION_PATTERNS: Array<{
  id: string
  label: string
  shots: SimulatedPatternEntry[]
}> = [
  {
    id: 'easy_meltdown',
    label: 'easy_meltdown',
    shots: [
      { difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { difficulty: 'easy', outcome: 'miss', ballOn: 'red' },
      { difficulty: 'easy', outcome: 'miss', ballOn: 'red' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { difficulty: 'easy', outcome: 'miss', ballOn: 'red' },
      { difficulty: 'hard', outcome: 'foul', ballOn: 'color' },
    ],
  },
  {
    id: 'hard_decisions',
    label: 'hard_decisions',
    shots: [
      { difficulty: 'medium', outcome: 'score', ballOn: 'red' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'red' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { difficulty: 'hard', outcome: 'foul', ballOn: 'red' },
    ],
  },
  {
    id: 'break_then_fade',
    label: 'break_then_fade',
    shots: [
      { difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
      { difficulty: 'medium', outcome: 'miss', ballOn: 'red' },
      { difficulty: 'easy', outcome: 'miss', ballOn: 'red' },
    ],
  },
  {
    id: 'steady_control',
    label: 'steady_control',
    shots: [
      { difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'red' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { difficulty: 'medium', outcome: 'score', ballOn: 'red' },
      { difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
    ],
  },
]

function createBalls(seed: number): SnapshotBall[] {
  return BALL_KINDS.map((kind, index) => ({
    id: kind === 'red' ? `red_${seed}_${index}` : kind,
    kind,
    x: -1200 + index * 320,
    y: -800 + ((seed + index) % 5) * 340,
    potted: kind !== 'white' && kind !== 'red' ? (seed + index) % 9 === 0 : false,
  }))
}

function createFoulInfo(ballOn: BallOnIndicator): FoulInfo {
  return {
    type: 'wrongBallFirst',
    penalty: 4,
    message: 'Must hit the correct ball first',
    beneficiary: 'none',
    ballOnAtFoul: ballOn,
  }
}

function chanceFromDifficulty(difficulty: PotDifficulty): ShotSummary['nextShotChance'] {
  if (difficulty === 'easy') return 'created'
  if (difficulty === 'medium') return 'limited'
  if (difficulty === 'hard') return 'none'
  return 'unknown'
}

function cueControlFromOutcome(
  difficulty: PotDifficulty,
  outcome: ShotSummary['outcome'],
): ShotSummary['cueBallPositionResult'] {
  if (outcome === 'foul') return 'poor'
  if (outcome === 'score') return difficulty === 'hard' ? 'acceptable' : 'ideal'
  return difficulty === 'hard' ? 'acceptable' : 'poor'
}

function createShot(params: {
  shotIndex: number
  beforeState: RulesState
  score: number
  breakScore: number
  difficulty: PotDifficulty
  outcome: ShotSummary['outcome']
  ballOn: BallOnIndicator
  previousBalls: SnapshotBall[]
}): ShotSummary {
  const before: TableSnapshot = {
    shotIndex: params.shotIndex,
    mode: 'practice',
    actor: 'player',
    currentActor: 'player',
    phase: params.beforeState.phase,
    ballOn: params.ballOn,
    redsRemaining: params.beforeState.redsRemaining,
    score: {
      player: params.beforeState.playerScore,
      ai: params.beforeState.aiScore,
    },
    breakScore: params.beforeState.breakScore,
    balls: params.previousBalls,
  }

  const scoredPoints = params.outcome === 'score'
    ? (params.ballOn === 'red' ? 1 : params.ballOn === 'color' ? 4 : params.ballOn === 'black' ? 7 : 3)
    : 0
  const simplePotChance = params.difficulty === 'easy'
  const foul = params.outcome === 'foul' ? createFoulInfo(params.ballOn) : null
  const nextShotChance = params.outcome === 'score'
    ? chanceFromDifficulty(params.difficulty)
    : params.outcome === 'miss'
      ? 'none'
      : 'unknown'
  const cueBallEndPosition: Position2D = {
    x: 300 - params.shotIndex * 25,
    y: 400 + params.shotIndex * 22,
  }
  const afterBreak = params.outcome === 'score' ? params.breakScore + scoredPoints : 0
  const afterState: RulesState & { cueBallEndPosition: Position2D | null } = {
    playerScore: params.score + scoredPoints,
    aiScore: 0,
    breakScore: afterBreak,
    ballOn: params.outcome === 'score'
      ? params.ballOn === 'red' ? 'color' : 'red'
      : params.ballOn,
    redsRemaining: Math.max(0, params.beforeState.redsRemaining - (params.outcome === 'score' && params.ballOn === 'red' ? 1 : 0)),
    phase: params.beforeState.phase,
    currentActor: 'player',
    cueBallEndPosition,
  }

  return {
    shotIndex: params.shotIndex,
    mode: 'practice',
    actor: 'player',
    before,
    firstContactBallId: params.outcome === 'foul'
      ? 'yellow'
      : params.ballOn === 'red'
        ? `red_${params.shotIndex}_1`
        : params.ballOn === 'color'
          ? 'blue'
          : params.ballOn,
    hitLegalFirstTarget: params.outcome !== 'foul',
    pottedBallIds: params.outcome === 'score'
      ? [params.ballOn === 'red' ? `red_${params.shotIndex}_1` : params.ballOn === 'color' ? 'blue' : params.ballOn]
      : [],
    pottedAnyBall: params.outcome === 'score',
    pottedBalls: params.outcome === 'score'
      ? [{
          id: params.ballOn === 'red' ? `red_${params.shotIndex}_1` : params.ballOn === 'color' ? 'blue' : params.ballOn,
          kind: params.ballOn === 'color' ? 'blue' : params.ballOn === 'red' ? 'red' : params.ballOn,
          points: scoredPoints,
        }]
      : [],
    scoredPoints,
    foul,
    foulBeneficiary: foul?.beneficiary,
    foulBallOn: foul?.ballOnAtFoul,
    outcome: params.outcome,
    simplePotChance,
    simplePotMiss: params.outcome === 'miss' && params.difficulty === 'easy',
    potDifficulty: params.difficulty,
    cueBallPositionResult: cueControlFromOutcome(params.difficulty, params.outcome),
    nextShotChance,
    turnChanged: false,
    after: afterState,
  }
}

export function simulatePracticeSession(): {
  latestShot: ShotSummary
  latestTable: TableSnapshot
  session: SessionSummary
  patternId: string
} {
  const pattern = SIMULATION_PATTERNS[Math.floor(Math.random() * SIMULATION_PATTERNS.length)] ?? SIMULATION_PATTERNS[0]

  let score = 0
  let breakScore = 0
  let redsRemaining = 15

  const shots = pattern.shots.map((entry, index) => {
    const beforeState: RulesState = {
      playerScore: score,
      aiScore: 0,
      breakScore,
      ballOn: entry.ballOn,
      redsRemaining,
      phase: 'reds',
      currentActor: 'player',
    }
    const shot = createShot({
      shotIndex: index + 1,
      beforeState,
      score,
      breakScore,
      difficulty: entry.difficulty,
      outcome: entry.outcome,
      ballOn: entry.ballOn,
      previousBalls: createBalls(index + 1),
    })
    score = shot.after.playerScore
    breakScore = shot.after.breakScore
    redsRemaining = shot.after.redsRemaining
    return shot
  })

  const latestShot = shots[shots.length - 1]
  const latestTable = latestShot.before
  const session = buildSessionSummary('practice', shots)

  return {
    latestShot,
    latestTable,
    session,
    patternId: pattern.id,
  }
}
