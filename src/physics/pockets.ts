import { BALL_RADIUS, POCKET_RADIUS, POCKETS } from '@/constants/table'
import type { Position2D } from '@/types/coords'

export function isBallInPocket(position: Position2D): boolean {
  for (const pocket of POCKETS) {
    const dx = position.x - pocket.x
    const dy = position.y - pocket.y
    const dist = Math.hypot(dx, dy)
    const isMiddle = pocket.y === 0

    if (isMiddle) {
      // Middle pocket: rectangular mouth
      const mouthHalfW = POCKET_RADIUS * 0.65
      const entryDepth = BALL_RADIUS * 1.2

      // Must be within the mouth width
      if (Math.abs(dy) > mouthHalfW) continue

      // Must be close to or past the cushion face
      if (pocket.x < 0 && dx > entryDepth) continue
      if (pocket.x > 0 && -dx > entryDepth) continue

      // Distance guard
      if (dist > POCKET_RADIUS + BALL_RADIUS) continue

      return true
    } else {
      // Corner pocket: square capture zone at the table corner
      const mouthHalfW = POCKET_RADIUS * 0.70
      const entryDepth = BALL_RADIUS * 1.2

      if (Math.abs(dx) > mouthHalfW) continue
      if (Math.abs(dy) > mouthHalfW) continue

      // Ball must be past the rail faces (into the corner)
      if ((pocket.x < 0 ? dx > entryDepth : dx < -entryDepth)) continue
      if ((pocket.y < 0 ? dy > entryDepth : dy < -entryDepth)) continue

      if (dist > POCKET_RADIUS + BALL_RADIUS) continue

      return true
    }
  }
  return false
}
