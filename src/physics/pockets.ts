import { BALL_RADIUS } from '@/constants/table'
import { pcolTableCollisionModel } from '@/table/pcolTable'
import type { Position2D } from '@/types/coords'

export function isBallInPocket(position: Position2D): boolean {
  for (const pocket of pcolTableCollisionModel.pocketCaptureZones) {
    const dx = position.x - pocket.mouthCenter.x
    const dy = position.y - pocket.mouthCenter.y
    const distToFall = Math.hypot(position.x - pocket.fallCenter.x, position.y - pocket.fallCenter.y)
    const { capture } = pocket

    if (capture.kind === 'rounded_rect') {
      const halfWidth = (capture.width ?? 0) / 2
      const halfDepth = (capture.depth ?? 0) / 2

      if (pocket.kind === 'middle') {
        if (Math.abs(dy) > halfWidth) continue
        if (pocket.mouthCenter.x < 0 && dx > capture.entryDepth) continue
        if (pocket.mouthCenter.x > 0 && -dx > capture.entryDepth) continue
      } else {
        if (Math.abs(dx) > halfWidth) continue
        if (Math.abs(dy) > halfDepth) continue
        if ((pocket.mouthCenter.x < 0 ? dx > capture.entryDepth : dx < -capture.entryDepth)) continue
        if ((pocket.mouthCenter.y < 0 ? dy > capture.entryDepth : dy < -capture.entryDepth)) continue
      }

      if (capture.radius !== undefined && distToFall > capture.radius + BALL_RADIUS) continue
      return true
    }

    if (capture.kind === 'circle' && capture.radius !== undefined) {
      if (distToFall <= capture.radius + BALL_RADIUS) {
        return true
      }
    }
  }
  return false
}
