import {
  CUSHION_HEIGHT,
  CUSHION_WIDTH,
  D_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  POCKET_RADIUS,
  SPOTS,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from '@/constants/table'
import type {
  CushionSegment,
  PocketJawSpec,
  PocketSpec,
  TableCollisionModel,
  TableCueModel,
  TableRenderModel,
  TableSpec,
} from '@/types/table'
import {
  buildTableCollisionModel,
  buildTableCueModel,
  buildTableRenderModel,
} from '@/table/buildTableModels'

const MIDDLE_POCKET_HALF_GAP = 50                // mm — cushion gap half-width at middle pocket
const CORNER_JAW_OFFSET = POCKET_RADIUS * 0.7    // 59.5 mm — diagonal opening ≈84 mm (standard ~85 mm)
const MIDDLE_JAW_OFFSET = 43                     // mm — total opening 86 mm (standard snooker)
const POCKET_ENTRY_DEPTH = 52.5 / 2 * 1.2

function makeCushions(): CushionSegment[] {
  return [
    {
      id: 'bottom_rail',
      side: 'bottom',
      line: {
        start: { x: -HALF_WIDTH + CORNER_JAW_OFFSET, y: -HALF_LENGTH },
        end: { x: HALF_WIDTH - CORNER_JAW_OFFSET, y: -HALF_LENGTH },
      },
      normal: { x: 0, y: 1 },
      collisionInset: 0,
      pocketAdjacency: ['bottom_left', 'bottom_right'],
    },
    {
      id: 'top_rail',
      side: 'top',
      line: {
        start: { x: -HALF_WIDTH + CORNER_JAW_OFFSET, y: HALF_LENGTH },
        end: { x: HALF_WIDTH - CORNER_JAW_OFFSET, y: HALF_LENGTH },
      },
      normal: { x: 0, y: -1 },
      collisionInset: 0,
      pocketAdjacency: ['top_left', 'top_right'],
    },
    {
      id: 'left_rail_lower',
      side: 'left',
      line: {
        start: { x: -HALF_WIDTH, y: -HALF_LENGTH + CORNER_JAW_OFFSET },
        end: { x: -HALF_WIDTH, y: -MIDDLE_POCKET_HALF_GAP },
      },
      normal: { x: 1, y: 0 },
      collisionInset: 0,
      pocketAdjacency: ['bottom_left', 'left_middle'],
    },
    {
      id: 'left_rail_upper',
      side: 'left',
      line: {
        start: { x: -HALF_WIDTH, y: MIDDLE_POCKET_HALF_GAP },
        end: { x: -HALF_WIDTH, y: HALF_LENGTH - CORNER_JAW_OFFSET },
      },
      normal: { x: 1, y: 0 },
      collisionInset: 0,
      pocketAdjacency: ['left_middle', 'top_left'],
    },
    {
      id: 'right_rail_lower',
      side: 'right',
      line: {
        start: { x: HALF_WIDTH, y: -HALF_LENGTH + CORNER_JAW_OFFSET },
        end: { x: HALF_WIDTH, y: -MIDDLE_POCKET_HALF_GAP },
      },
      normal: { x: -1, y: 0 },
      collisionInset: 0,
      pocketAdjacency: ['bottom_right', 'right_middle'],
    },
    {
      id: 'right_rail_upper',
      side: 'right',
      line: {
        start: { x: HALF_WIDTH, y: MIDDLE_POCKET_HALF_GAP },
        end: { x: HALF_WIDTH, y: HALF_LENGTH - CORNER_JAW_OFFSET },
      },
      normal: { x: -1, y: 0 },
      collisionInset: 0,
      pocketAdjacency: ['right_middle', 'top_right'],
    },
  ]
}

function makeCornerJaws(
  pocketId: string,
  xSign: -1 | 1,
  ySign: -1 | 1,
): PocketJawSpec[] {
  const mouthX = xSign * HALF_WIDTH
  const mouthY = ySign * HALF_LENGTH

  return [
    {
      id: `${pocketId}_x_jaw`,
      side: xSign < 0 ? 'left' : 'right',
      line: {
        start: { x: mouthX, y: mouthY - ySign * CORNER_JAW_OFFSET },
        end: { x: mouthX, y: mouthY },
      },
      normal: { x: -xSign, y: 0 },
    },
    {
      id: `${pocketId}_y_jaw`,
      side: ySign < 0 ? 'bottom' : 'top',
      line: {
        start: { x: mouthX - xSign * CORNER_JAW_OFFSET, y: mouthY },
        end: { x: mouthX, y: mouthY },
      },
      normal: { x: 0, y: -ySign },
    },
  ]
}

function makeMiddleJaws(pocketId: string, xSign: -1 | 1): PocketJawSpec[] {
  const mouthX = xSign * HALF_WIDTH

  return [
    {
      id: `${pocketId}_lower_jaw`,
      side: xSign < 0 ? 'left' : 'right',
      line: {
        start: { x: mouthX, y: -MIDDLE_JAW_OFFSET },
        end: { x: mouthX, y: 0 },
      },
      normal: { x: -xSign, y: 0 },
    },
    {
      id: `${pocketId}_upper_jaw`,
      side: xSign < 0 ? 'left' : 'right',
      line: {
        start: { x: mouthX, y: 0 },
        end: { x: mouthX, y: MIDDLE_JAW_OFFSET },
      },
      normal: { x: -xSign, y: 0 },
    },
  ]
}

function makePockets(): PocketSpec[] {
  return [
    {
      id: 'bottom_left',
      kind: 'corner',
      mouthCenter: { x: -HALF_WIDTH, y: -HALF_LENGTH },
      fallCenter: { x: -HALF_WIDTH - POCKET_RADIUS * 0.45, y: -HALF_LENGTH - POCKET_RADIUS * 0.45 },
      mouthWidth: CORNER_JAW_OFFSET * 2,
      jaws: makeCornerJaws('bottom_left', -1, -1),
      cutoutArc: {
        center: { x: -HALF_WIDTH - POCKET_RADIUS, y: -HALF_LENGTH - POCKET_RADIUS },
        radius: POCKET_RADIUS,
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      capture: {
        kind: 'rounded_rect',
        radius: POCKET_RADIUS,
        width: CORNER_JAW_OFFSET * 2,
        depth: CORNER_JAW_OFFSET * 2,
        entryDepth: POCKET_ENTRY_DEPTH,
      },
    },
    {
      id: 'bottom_right',
      kind: 'corner',
      mouthCenter: { x: HALF_WIDTH, y: -HALF_LENGTH },
      fallCenter: { x: HALF_WIDTH + POCKET_RADIUS * 0.45, y: -HALF_LENGTH - POCKET_RADIUS * 0.45 },
      mouthWidth: CORNER_JAW_OFFSET * 2,
      jaws: makeCornerJaws('bottom_right', 1, -1),
      cutoutArc: {
        center: { x: HALF_WIDTH + POCKET_RADIUS, y: -HALF_LENGTH - POCKET_RADIUS },
        radius: POCKET_RADIUS,
        startAngle: Math.PI / 2,
        endAngle: Math.PI,
      },
      capture: {
        kind: 'rounded_rect',
        radius: POCKET_RADIUS,
        width: CORNER_JAW_OFFSET * 2,
        depth: CORNER_JAW_OFFSET * 2,
        entryDepth: POCKET_ENTRY_DEPTH,
      },
    },
    {
      id: 'top_left',
      kind: 'corner',
      mouthCenter: { x: -HALF_WIDTH, y: HALF_LENGTH },
      fallCenter: { x: -HALF_WIDTH - POCKET_RADIUS * 0.45, y: HALF_LENGTH + POCKET_RADIUS * 0.45 },
      mouthWidth: CORNER_JAW_OFFSET * 2,
      jaws: makeCornerJaws('top_left', -1, 1),
      cutoutArc: {
        center: { x: -HALF_WIDTH - POCKET_RADIUS, y: HALF_LENGTH + POCKET_RADIUS },
        radius: POCKET_RADIUS,
        startAngle: -Math.PI / 2,
        endAngle: 0,
      },
      capture: {
        kind: 'rounded_rect',
        radius: POCKET_RADIUS,
        width: CORNER_JAW_OFFSET * 2,
        depth: CORNER_JAW_OFFSET * 2,
        entryDepth: POCKET_ENTRY_DEPTH,
      },
    },
    {
      id: 'top_right',
      kind: 'corner',
      mouthCenter: { x: HALF_WIDTH, y: HALF_LENGTH },
      fallCenter: { x: HALF_WIDTH + POCKET_RADIUS * 0.45, y: HALF_LENGTH + POCKET_RADIUS * 0.45 },
      mouthWidth: CORNER_JAW_OFFSET * 2,
      jaws: makeCornerJaws('top_right', 1, 1),
      cutoutArc: {
        center: { x: HALF_WIDTH + POCKET_RADIUS, y: HALF_LENGTH + POCKET_RADIUS },
        radius: POCKET_RADIUS,
        startAngle: Math.PI,
        endAngle: Math.PI * 1.5,
      },
      capture: {
        kind: 'rounded_rect',
        radius: POCKET_RADIUS,
        width: CORNER_JAW_OFFSET * 2,
        depth: CORNER_JAW_OFFSET * 2,
        entryDepth: POCKET_ENTRY_DEPTH,
      },
    },
    {
      id: 'left_middle',
      kind: 'middle',
      mouthCenter: { x: -HALF_WIDTH, y: 0 },
      fallCenter: { x: -HALF_WIDTH - POCKET_RADIUS * 0.8, y: 0 },
      mouthWidth: MIDDLE_JAW_OFFSET * 2,
      jaws: makeMiddleJaws('left_middle', -1),
      cutoutArc: {
        center: { x: -HALF_WIDTH - POCKET_RADIUS, y: 0 },
        radius: POCKET_RADIUS,
        startAngle: -Math.PI / 2,
        endAngle: Math.PI / 2,
      },
      capture: {
        kind: 'rounded_rect',
        radius: POCKET_RADIUS,
        width: MIDDLE_JAW_OFFSET * 2,
        depth: POCKET_RADIUS,
        entryDepth: POCKET_ENTRY_DEPTH,
      },
    },
    {
      id: 'right_middle',
      kind: 'middle',
      mouthCenter: { x: HALF_WIDTH, y: 0 },
      fallCenter: { x: HALF_WIDTH + POCKET_RADIUS * 0.8, y: 0 },
      mouthWidth: MIDDLE_JAW_OFFSET * 2,
      jaws: makeMiddleJaws('right_middle', 1),
      cutoutArc: {
        center: { x: HALF_WIDTH + POCKET_RADIUS, y: 0 },
        radius: POCKET_RADIUS,
        startAngle: Math.PI / 2,
        endAngle: Math.PI * 1.5,
      },
      capture: {
        kind: 'rounded_rect',
        radius: POCKET_RADIUS,
        width: MIDDLE_JAW_OFFSET * 2,
        depth: POCKET_RADIUS,
        entryDepth: POCKET_ENTRY_DEPTH,
      },
    },
  ]
}

export const pcolTableSpec: TableSpec = {
  version: 'pcol-v1',
  units: 'mm',
  origin: 'blue_spot',
  axes: {
    x: 'short_side',
    y: 'long_side_positive_to_black',
  },
  playfield: {
    width: TABLE_WIDTH,
    length: TABLE_LENGTH,
  },
  spots: {
    ...SPOTS,
    dRadius: D_RADIUS,
  },
  pockets: makePockets(),
  cushions: makeCushions(),
  cueZones: {
    railProximityThreshold: 31.5,
    ballOverlapTolerance: 1,
    minBackswingLength: 140,
    defaultTipClearance: 0.28,
    defaultElevation: 0.16,
    maxElevation: 0.62,
    railElevationCurve: {
      startClearance: 42,
      fullElevationClearance: 0,
    },
    jawBlockers: [
      'bottom_left_x_jaw',
      'bottom_left_y_jaw',
      'bottom_right_x_jaw',
      'bottom_right_y_jaw',
      'top_left_x_jaw',
      'top_left_y_jaw',
      'top_right_x_jaw',
      'top_right_y_jaw',
      'left_middle_lower_jaw',
      'left_middle_upper_jaw',
      'right_middle_lower_jaw',
      'right_middle_upper_jaw',
    ],
  },
  visuals: {
    clothColor: 0x1d5c2a,
    cushionColor: 0x1a5426,
    woodColor: 0x3a2416,
    cushionVisibleWidth: 14,
    cushionHeight: CUSHION_HEIGHT,
    woodRailWidth: 165,
    woodRailDepth: 45,
    pocketRimColor: 0x111111,
    pocketInteriorColor: 0x050505,
    pocketDropDepth: 160,
    spotMarkerRadius: 4,
    baulkLineColor: 0xffffff,
    baulkLineOpacity: 0.35,
    // Chrome trim strip on cushion top edge
    cushionTrimColor: 0xd4d4d0,
    cushionTrimHeight: 5,
    cushionTrimWidth: 8,
    // Above-table pocket block geometry
    pocketBlockHeight: 38,
    cornerBlockSize: 110,
    middleBlockDepth: 55,
  },
}

export const pcolTableRenderModel: TableRenderModel = buildTableRenderModel(pcolTableSpec)
export const pcolTableCollisionModel: TableCollisionModel = buildTableCollisionModel(pcolTableSpec)
export const pcolTableCueModel: TableCueModel = buildTableCueModel(pcolTableSpec)
export const PCOL_TABLE_OUTER_CUSHION_WIDTH = CUSHION_WIDTH
