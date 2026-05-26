/** Snooker dimensions in mm. Origin = blue ball spot. +y = black/pink end. */

export const BALL_DIAMETER = 52.5
export const BALL_RADIUS = BALL_DIAMETER / 2

/** Inner playing surface (between cushions). */
export const TABLE_WIDTH = 1778
export const TABLE_LENGTH = 3569

export const HALF_WIDTH = TABLE_WIDTH / 2
export const HALF_LENGTH = TABLE_LENGTH / 2

/** Cushion thickness (visual + collision inset). */
export const CUSHION_WIDTH = 90
export const CUSHION_HEIGHT = 40

/** Pocket capture radius (center to ball center). */
export const POCKET_RADIUS = 85

export const BALL_MASS = 0.17

/** Spot positions (mm), standard snooker layout. */
export const D_RADIUS = 292.1

export const SPOTS = {
  blue: { x: 0, y: 0 },
  pink: { x: 0, y: HALF_LENGTH - 686 },
  black: { x: 0, y: HALF_LENGTH - 324 },
  green: { x: -D_RADIUS, y: -HALF_LENGTH + 879 },
  brown: { x: 0, y: -HALF_LENGTH + 879 },
  yellow: { x: D_RADIUS, y: -HALF_LENGTH + 879 },
  baulk: { x: 0, y: -HALF_LENGTH + 879 },
} as const

/** Six pocket centres on the playing surface. */
export const POCKETS = [
  // Corner pockets
  { x: -HALF_WIDTH, y: -HALF_LENGTH },
  { x: HALF_WIDTH, y: -HALF_LENGTH },
  { x: -HALF_WIDTH, y: HALF_LENGTH },
  { x: HALF_WIDTH, y: HALF_LENGTH },
  // Middle pockets (long sides)
  { x: -HALF_WIDTH, y: 0 },
  { x: HALF_WIDTH, y: 0 },
] as const

export type BallColor =
  | 'white'
  | 'red'
  | 'yellow'
  | 'green'
  | 'brown'
  | 'blue'
  | 'pink'
  | 'black'

export const BALL_COLORS: Record<BallColor, number> = {
  white: 0xf5f5f0,
  red: 0xb22222,
  yellow: 0xffd700,
  green: 0x228b22,
  brown: 0x8b4513,
  blue: 0x1e4dd8,
  pink: 0xff69b4,
  black: 0x111111,
}
