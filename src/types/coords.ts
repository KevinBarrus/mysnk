/** Table-plane coordinates in mm (blue spot = origin). */

export interface Position2D {
  x: number
  y: number
}

/** Optional z for future 2.5D — not used in v1 physics. */
export interface Position3D extends Position2D {
  z?: number
}
