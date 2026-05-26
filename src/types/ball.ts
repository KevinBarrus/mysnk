import type { BallColor } from '@/constants/table'
import type { Position2D } from '@/types/coords'

export interface BallState {
  id: string
  color: BallColor
  position: Position2D
  potted: boolean
}
