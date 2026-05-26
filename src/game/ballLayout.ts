import { BALL_RADIUS, SPOTS } from '@/constants/table'
import type { BallColor } from '@/constants/table'
import type { BallState } from '@/types/ball'

/** Standard 15-red triangle + colours on spots (P1 test layout). */
export function createOpeningBalls(): BallState[] {
  const balls: BallState[] = []

  balls.push({
    id: 'white',
    color: 'white',
    position: { x: SPOTS.baulk.x, y: SPOTS.baulk.y - 200 },
    potted: false,
  })

  const colours: Array<{ id: string; color: BallColor; spot: keyof typeof SPOTS }> = [
    { id: 'yellow', color: 'yellow', spot: 'yellow' },
    { id: 'green', color: 'green', spot: 'green' },
    { id: 'brown', color: 'brown', spot: 'brown' },
    { id: 'blue', color: 'blue', spot: 'blue' },
    { id: 'pink', color: 'pink', spot: 'pink' },
    { id: 'black', color: 'black', spot: 'black' },
  ]

  for (const c of colours) {
    balls.push({
      id: c.id,
      color: c.color,
      position: { ...SPOTS[c.spot] },
      potted: false,
    })
  }

  const pinkY = SPOTS.pink.y
  const spacing = BALL_RADIUS * 2.05
  const rows = 5
  let n = 0
  for (let row = 0; row < rows; row++) {
    const count = row + 1
    const rowY = pinkY + BALL_RADIUS * 2.1 + spacing * row * 0.866
    const startX = (-(count - 1) * spacing) / 2
    for (let col = 0; col < count; col++) {
      n++
      balls.push({
        id: `red_${n}`,
        color: 'red',
        position: { x: startX + col * spacing, y: rowY },
        potted: false,
      })
    }
  }

  return balls
}
