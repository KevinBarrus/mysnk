import type { Position2D } from '@/types/coords'

export type TableAxisSpec = {
  x: 'short_side'
  y: 'long_side_positive_to_black'
}

export type PocketKind = 'corner' | 'middle'
export type TableSide = 'top' | 'bottom' | 'left' | 'right'

export interface LineSegment2D {
  start: Position2D
  end: Position2D
}

export interface TableArc2D {
  center: Position2D
  radius: number
  startAngle: number
  endAngle: number
  clockwise?: boolean
}

export interface CushionSegment {
  id: string
  side: TableSide
  line: LineSegment2D
  normal: Position2D
  collisionInset: number
  pocketAdjacency: string[]
}

export interface PocketJawSpec {
  id: string
  side: TableSide
  line: LineSegment2D
  normal: Position2D
}

export interface PocketCaptureSpec {
  kind: 'circle' | 'rounded_rect' | 'polygon'
  radius?: number
  width?: number
  depth?: number
  points?: Position2D[]
  entryDepth: number
}

export interface PocketSpec {
  id: string
  kind: PocketKind
  mouthCenter: Position2D
  fallCenter: Position2D
  mouthWidth: number
  jaws: PocketJawSpec[]
  cutoutArc?: TableArc2D
  capture: PocketCaptureSpec
}

export interface SpotLayout {
  blue: Position2D
  pink: Position2D
  black: Position2D
  yellow: Position2D
  green: Position2D
  brown: Position2D
  baulk: Position2D
  dRadius: number
}

export interface CueConstraintSpec {
  railProximityThreshold: number
  ballOverlapTolerance: number
  minBackswingLength: number
  defaultTipClearance: number
  defaultElevation: number
  maxElevation: number
  railElevationCurve: {
    startClearance: number
    fullElevationClearance: number
  }
  jawBlockers: string[]
}

export interface TableVisualSpec {
  clothColor: number
  cushionColor: number
  woodColor: number
  cushionVisibleWidth: number
  cushionHeight: number
  woodRailWidth: number
  woodRailDepth: number
  pocketRimColor: number
  pocketInteriorColor: number
  pocketDropDepth: number
  spotMarkerRadius: number
  baulkLineColor: number
  baulkLineOpacity: number
  // Cushion chrome trim strip
  cushionTrimColor: number
  cushionTrimHeight: number
  cushionTrimWidth: number
  // Pocket blocks (above-table visible geometry)
  pocketBlockHeight: number
  cornerBlockSize: number
  middleBlockDepth: number
}

export interface TableSpec {
  version: string
  units: 'mm'
  origin: 'blue_spot'
  axes: TableAxisSpec
  playfield: {
    width: number
    length: number
  }
  spots: SpotLayout
  pockets: PocketSpec[]
  cushions: CushionSegment[]
  cueZones: CueConstraintSpec
  visuals: TableVisualSpec
}

export interface TableRenderModel {
  specVersion: string
  playfield: {
    width: number
    length: number
  }
  cushions: Array<{
    id: string
    side: TableSide
    visibleWidth: number
    height: number
    segments: LineSegment2D[]
  }>
  pocketCutouts: Array<{
    pocketId: string
    kind: PocketKind
    mouthCenter: Position2D
    cutoutArc?: TableArc2D
    rimColor: number
    interiorColor: number
    dropDepth: number
  }>
  frame: {
    woodColor: number
    railWidth: number
    railDepth: number
  }
  markings: {
    spots: SpotLayout
    spotMarkerRadius: number
    baulkLine: {
      y: number
      color: number
      opacity: number
    }
  }
}

export interface TableCollisionModel {
  specVersion: string
  playfieldBounds: {
    halfWidth: number
    halfLength: number
  }
  railSegments: Array<{
    id: string
    segment: LineSegment2D
    normal: Position2D
    collisionInset: number
  }>
  pocketCaptureZones: Array<{
    pocketId: string
    kind: PocketKind
    mouthCenter: Position2D
    fallCenter: Position2D
    capture: PocketCaptureSpec
  }>
  spawnExclusionZones: Array<{
    id: string
    kind: 'pocket_mouth' | 'cushion_overlap'
    points: Position2D[]
  }>
}

export interface TableCueModel {
  specVersion: string
  railSegments: Array<{
    id: string
    side: TableSide
    segment: LineSegment2D
    normal: Position2D
  }>
  pocketJaws: Array<{
    pocketId: string
    jawId: string
    side: TableSide
    line: LineSegment2D
    normal: Position2D
  }>
  constraints: CueConstraintSpec
}
