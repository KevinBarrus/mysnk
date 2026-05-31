import type { BallOnIndicator, FoulInfo, RulesState } from '@/rules/SnookerRules'
import { buildSessionSummary } from '@/summary/buildSessionSummary'
import type {
  PotDifficulty,
  SessionSummary,
  ShotActor,
  ShotSummary,
  SnapshotBall,
  TableSnapshot,
} from '@/summary/types'
import type { Position2D } from '@/types/coords'

const BALL_KINDS: SnapshotBall['kind'][] = ['white', 'red', 'yellow', 'green', 'brown', 'blue', 'pink', 'black']

type MatchPatternEntry = {
  actor: ShotActor
  difficulty: PotDifficulty
  outcome: ShotSummary['outcome']
  ballOn: BallOnIndicator
}

const MATCH_SIMULATION_PATTERNS: Array<{
  id: string
  label: string
  shots: MatchPatternEntry[]
}> = [
  {
    id: 'player_edges_it',
    label: 'player_edges_it',
    shots: [
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'player', difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
      { actor: 'ai', difficulty: 'medium', outcome: 'score', ballOn: 'red' },
      { actor: 'ai', difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'player', difficulty: 'hard', outcome: 'foul', ballOn: 'red' },
      { actor: 'ai', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'ai', difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
    ],
  },
  {
    id: 'ai_pressure_then_crack',
    label: 'ai_pressure_then_crack',
    shots: [
      { actor: 'player', difficulty: 'medium', outcome: 'miss', ballOn: 'red' },
      { actor: 'ai', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'ai', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'ai', difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { actor: 'ai', difficulty: 'medium', outcome: 'foul', ballOn: 'red' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
    ],
  },
  {
    id: 'scrappy_finish',
    label: 'scrappy_finish',
    shots: [
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'hard', outcome: 'miss', ballOn: 'color' },
      { actor: 'ai', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'ai', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'ai', difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'player', difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
      { actor: 'ai', difficulty: 'medium', outcome: 'foul', ballOn: 'red' },
      { actor: 'player', difficulty: 'easy', outcome: 'score', ballOn: 'red' },
      { actor: 'player', difficulty: 'medium', outcome: 'score', ballOn: 'color' },
      { actor: 'player', difficulty: 'hard', outcome: 'miss', ballOn: 'red' },
    ],
  },
]

function createBalls(seed: number): SnapshotBall[] {
  return BALL_KINDS.map((kind, index) => ({
    id: kind === 'red' ? `red_${seed}_${index}` : kind,
    kind,
    x: -1180 + index * 305,
    y: -760 + ((seed * 3 + index) % 5) * 320,
    potted: kind !== 'white' && kind !== 'red' ? (seed + index) % 8 === 0 : false,
  }))
}

function createFoulInfo(ballOn: BallOnIndicator, beneficiary: ShotActor): FoulInfo {
  return {
    type: 'wrongBallFirst',
    penalty: 4,
    message: 'Must hit the correct ball first',
    beneficiary,
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

function pointsForBallOn(ballOn: BallOnIndicator): number {
  if (ballOn === 'red') return 1
  if (ballOn === 'black') return 7
  if (ballOn === 'color') return 4
  return 3
}

function createShot(params: {
  shotIndex: number
  actor: ShotActor
  beforeState: RulesState
  difficulty: PotDifficulty
  outcome: ShotSummary['outcome']
  ballOn: BallOnIndicator
  previousBalls: SnapshotBall[]
}): ShotSummary {
  const before: TableSnapshot = {
    shotIndex: params.shotIndex,
    mode: 'match',
    actor: params.actor,
    currentActor: params.actor,
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

  const opponent: ShotActor = params.actor === 'player' ? 'ai' : 'player'
  const scoredPoints = params.outcome === 'score' ? pointsForBallOn(params.ballOn) : 0
  const penalty = params.outcome === 'foul' ? 4 : 0
  const foul = params.outcome === 'foul' ? createFoulInfo(params.ballOn, opponent) : null
  const cueBallEndPosition: Position2D = {
    x: 280 - params.shotIndex * 20,
    y: 360 + params.shotIndex * 18,
  }
  const turnChanged = params.outcome !== 'score'
  const nextActor = turnChanged ? opponent : params.actor
  const breakScore = params.outcome === 'score' ? params.beforeState.breakScore + scoredPoints : 0
  const playerScore = params.beforeState.playerScore
    + (params.actor === 'player' ? scoredPoints : 0)
    + (params.actor === 'ai' ? penalty : 0)
  const aiScore = params.beforeState.aiScore
    + (params.actor === 'ai' ? scoredPoints : 0)
    + (params.actor === 'player' ? penalty : 0)

  const afterState: RulesState & { cueBallEndPosition: Position2D | null } = {
    playerScore,
    aiScore,
    breakScore,
    ballOn: params.outcome === 'score'
      ? params.ballOn === 'red' ? 'color' : 'red'
      : params.ballOn,
    redsRemaining: Math.max(
      0,
      params.beforeState.redsRemaining - (params.outcome === 'score' && params.ballOn === 'red' ? 1 : 0),
    ),
    phase: params.beforeState.phase,
    currentActor: nextActor,
    cueBallEndPosition,
  }

  const contactBallId = params.ballOn === 'red'
    ? `red_${params.shotIndex}_1`
    : params.ballOn === 'color'
      ? 'blue'
      : params.ballOn

  return {
    shotIndex: params.shotIndex,
    mode: 'match',
    actor: params.actor,
    before,
    firstContactBallId: params.outcome === 'foul' ? 'yellow' : contactBallId,
    hitLegalFirstTarget: params.outcome !== 'foul',
    pottedBallIds: params.outcome === 'score' ? [contactBallId] : [],
    pottedAnyBall: params.outcome === 'score',
    pottedBalls: params.outcome === 'score'
      ? [{
          id: contactBallId,
          kind: params.ballOn === 'color' ? 'blue' : params.ballOn === 'red' ? 'red' : params.ballOn,
          points: scoredPoints,
        }]
      : [],
    scoredPoints,
    foul,
    foulBeneficiary: foul?.beneficiary,
    foulBallOn: foul?.ballOnAtFoul,
    outcome: params.outcome,
    simplePotChance: params.difficulty === 'easy',
    simplePotMiss: params.outcome === 'miss' && params.difficulty === 'easy',
    potDifficulty: params.difficulty,
    cueBallPositionResult: cueControlFromOutcome(params.difficulty, params.outcome),
    nextShotChance: params.outcome === 'score' ? chanceFromDifficulty(params.difficulty) : params.outcome === 'miss' ? 'none' : 'unknown',
    turnChanged,
    after: afterState,
  }
}

export function simulateMatchSession(): {
  latestShot: ShotSummary
  latestTable: TableSnapshot
  session: SessionSummary
  patternId: string
} {
  const pattern = MATCH_SIMULATION_PATTERNS[Math.floor(Math.random() * MATCH_SIMULATION_PATTERNS.length)] ?? MATCH_SIMULATION_PATTERNS[0]

  let state: RulesState = {
    playerScore: 0,
    aiScore: 0,
    breakScore: 0,
    ballOn: 'red',
    redsRemaining: 15,
    phase: 'reds',
    currentActor: 'player',
  }

  const shots = pattern.shots.map((entry, index) => {
    const shot = createShot({
      shotIndex: index + 1,
      actor: entry.actor,
      beforeState: {
        ...state,
        currentActor: entry.actor,
        ballOn: entry.ballOn,
      },
      difficulty: entry.difficulty,
      outcome: entry.outcome,
      ballOn: entry.ballOn,
      previousBalls: createBalls(index + 1),
    })

    state = {
      playerScore: shot.after.playerScore,
      aiScore: shot.after.aiScore,
      breakScore: shot.after.breakScore,
      ballOn: shot.after.ballOn,
      redsRemaining: shot.after.redsRemaining,
      phase: shot.after.redsRemaining === 0 ? 'clearance' : 'reds',
      currentActor: shot.after.currentActor,
    }

    return shot
  })

  const latestShot = shots[shots.length - 1]
  const latestTable = latestShot.before
  const session = buildSessionSummary('match', shots)

  return {
    latestShot,
    latestTable,
    session,
    patternId: pattern.id,
  }
}
