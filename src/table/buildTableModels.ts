import type {
  LineSegment2D,
  PocketSpec,
  TableCollisionModel,
  TableCueModel,
  TableRenderModel,
  TableSide,
  TableSpec,
} from '@/types/table'

function groupCushionSegmentsBySide(
  cushions: TableSpec['cushions'],
): Array<{
  side: TableSide
  segments: Array<{
    id: string
    line: LineSegment2D
  }>
}> {
  const bySide = new Map<TableSide, Array<{ id: string; line: LineSegment2D }>>()

  for (const cushion of cushions) {
    const existing = bySide.get(cushion.side) ?? []
    existing.push({ id: cushion.id, line: cushion.line })
    bySide.set(cushion.side, existing)
  }

  return [...bySide.entries()].map(([side, segments]) => ({ side, segments }))
}

function buildPocketMouthPolygon(pocket: PocketSpec): LineSegment2D['start'][] {
  const jawPoints = pocket.jaws.flatMap((jaw) => [jaw.line.start, jaw.line.end])
  const unique = new Map(jawPoints.map((point) => [`${point.x}:${point.y}`, point]))
  return [...unique.values()]
}

function buildCushionOverlapPolygon(segment: LineSegment2D, normal: { x: number; y: number }, inset: number) {
  const offset = {
    x: normal.x * inset,
    y: normal.y * inset,
  }

  return [
    { x: segment.start.x, y: segment.start.y },
    { x: segment.end.x, y: segment.end.y },
    { x: segment.end.x + offset.x, y: segment.end.y + offset.y },
    { x: segment.start.x + offset.x, y: segment.start.y + offset.y },
  ]
}

export function buildTableRenderModel(spec: TableSpec): TableRenderModel {
  const cushions = groupCushionSegmentsBySide(spec.cushions).map(({ side, segments }) => ({
    id: `${side}_cushion`,
    side,
    visibleWidth: spec.visuals.cushionVisibleWidth,
    height: spec.visuals.cushionHeight,
    segments: segments.map((segment) => segment.line),
  }))

  return {
    specVersion: spec.version,
    playfield: {
      width: spec.playfield.width,
      length: spec.playfield.length,
    },
    cushions,
    pocketCutouts: spec.pockets.map((pocket) => ({
      pocketId: pocket.id,
      kind: pocket.kind,
      mouthCenter: pocket.mouthCenter,
      cutoutArc: pocket.cutoutArc,
      rimColor: spec.visuals.pocketRimColor,
      interiorColor: spec.visuals.pocketInteriorColor,
      dropDepth: spec.visuals.pocketDropDepth,
    })),
    frame: {
      woodColor: spec.visuals.woodColor,
      railWidth: spec.visuals.woodRailWidth,
      railDepth: spec.visuals.woodRailDepth,
    },
    markings: {
      spots: spec.spots,
      spotMarkerRadius: spec.visuals.spotMarkerRadius,
      baulkLine: {
        y: spec.spots.baulk.y,
        color: spec.visuals.baulkLineColor,
        opacity: spec.visuals.baulkLineOpacity,
      },
    },
  }
}

export function buildTableCollisionModel(spec: TableSpec): TableCollisionModel {
  const halfWidth = spec.playfield.width / 2
  const halfLength = spec.playfield.length / 2

  return {
    specVersion: spec.version,
    playfieldBounds: {
      halfWidth,
      halfLength,
    },
    railSegments: spec.cushions.map((cushion) => ({
      id: cushion.id,
      segment: cushion.line,
      normal: cushion.normal,
      collisionInset: cushion.collisionInset,
    })),
    pocketCaptureZones: spec.pockets.map((pocket) => ({
      pocketId: pocket.id,
      kind: pocket.kind,
      mouthCenter: pocket.mouthCenter,
      fallCenter: pocket.fallCenter,
      capture: pocket.capture,
    })),
    spawnExclusionZones: [
      ...spec.pockets.map((pocket) => ({
        id: `${pocket.id}_mouth`,
        kind: 'pocket_mouth' as const,
        points: buildPocketMouthPolygon(pocket),
      })),
      ...spec.cushions
        .filter((cushion) => cushion.collisionInset > 0)
        .map((cushion) => ({
          id: `${cushion.id}_overlap`,
          kind: 'cushion_overlap' as const,
          points: buildCushionOverlapPolygon(cushion.line, cushion.normal, cushion.collisionInset),
        })),
    ],
  }
}

export function buildTableCueModel(spec: TableSpec): TableCueModel {
  return {
    specVersion: spec.version,
    railSegments: spec.cushions.map((cushion) => ({
      id: cushion.id,
      side: cushion.side,
      segment: cushion.line,
      normal: cushion.normal,
    })),
    pocketJaws: spec.pockets.flatMap((pocket) =>
      pocket.jaws.map((jaw) => ({
        pocketId: pocket.id,
        jawId: jaw.id,
        side: jaw.side,
        line: jaw.line,
        normal: jaw.normal,
      })),
    ),
    constraints: spec.cueZones,
  }
}

