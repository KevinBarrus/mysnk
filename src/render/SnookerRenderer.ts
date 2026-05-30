import * as THREE from 'three'
import {
  BALL_COLORS,
  BALL_RADIUS,
  CUSHION_WIDTH,
} from '@/constants/table'
import type { BallColor } from '@/constants/table'
import { pcolTableRenderModel, pcolTableSpec } from '@/table/pcolTable'
import type { Position2D } from '@/types/coords'
import { tableToWorld } from '@/physics/PlanePhysics'

const MM_TO_SCENE = 1 / 1000

const CUE_TIP_LENGTH_MM = 20
const CUE_FERRULE_LENGTH_MM = 26
const CUE_FRONT_SHAFT_LENGTH_MM = 420
const CUE_BUTT_LENGTH_MM = 900
const CUE_VISIBLE_LENGTH_MM =
  CUE_TIP_LENGTH_MM + CUE_FERRULE_LENGTH_MM + CUE_FRONT_SHAFT_LENGTH_MM + CUE_BUTT_LENGTH_MM
const CUE_TIP_TO_GROUP_ORIGIN_MM = CUE_VISIBLE_LENGTH_MM - CUE_TIP_LENGTH_MM / 2
const CUE_TIP_LOOKAHEAD_MM = 36
const AIM_CAMERA_BEHIND_DIST_MM = 940
const AIM_CAMERA_EYE_HEIGHT_MM = 185
const AIM_CAMERA_LOOKAHEAD_MM = 600
const CUE_BASE_TIP_LIFT_MM = 14
const CUE_ELEVATION_TIP_LIFT_MM = 34
const CUE_POST_SHOT_EXTRA_TIP_LIFT_MM = 26
const CUE_ELEVATION_BUTT_LIFT_MM = 360
const CUE_POST_SHOT_EXTRA_BUTT_LIFT_MM = 520
const CUE_POST_SHOT_LOOK_LIFT_MM = 40

function mm(v: number): number {
  return v * MM_TO_SCENE
}

/** Visual shrink factor for balls (keeps physics unchanged). */
const BALL_VISUAL_SCALE = 0.85

function tableVec(pos: Position2D): THREE.Vector3 {
  const w = tableToWorld(pos)
  return new THREE.Vector3(w.x * MM_TO_SCENE, w.y * MM_TO_SCENE, w.z * MM_TO_SCENE)
}

export class SnookerRenderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly canvas: HTMLCanvasElement

  private renderer: THREE.WebGLRenderer
  private ballMeshes = new Map<string, THREE.Mesh>()
  private cueMesh: THREE.Group
  private cueRearSegment!: THREE.Mesh
  private aimLine: THREE.Line
  private tableGroup = new THREE.Group()

  // Orbit camera (standing mode): camera moves on a circle around the table
  private orbitAngle = Math.PI      // PI = behind table, 0 = in front
  private relYaw = 0                // relative yaw offset from "look at center"
  private relPitch = 0.15           // relative pitch offset
  private readonly orbitRadius = mm(pcolTableRenderModel.playfield.length / 2 + 1200)
  private readonly orbitHeight = mm(550)

  // Saved standing state (restored when exiting aiming mode) — no longer used but kept for reference
  private cameraMode: 'standing' | 'aiming' | 'transition' = 'standing'
  private targetMode: 'standing' | 'aiming' = 'standing'

  // Camera transition (lerp position + slerp quaternion)
  private transActive = false
  private transProgress = 0
  private transDuration = 1.2
  private transStartPos = new THREE.Vector3()
  private transEndPos = new THREE.Vector3()
  private transStartQuat = new THREE.Quaternion()
  private transEndQuat = new THREE.Quaternion()

  /** Mouse-drag view offset while in aiming mode (yaw/pitch relative to aim direction). */
  private aimViewYaw = 0
  private aimViewPitch = 0
  private lastAimCuePos: Position2D | null = null
  private lastAimDir: Position2D | null = null
  private postShotActive = false
  private postShotStartPos = new THREE.Vector3()
  private postShotStartQuat = new THREE.Quaternion()
  private postShotEndPos = new THREE.Vector3()
  private postShotEndQuat = new THREE.Quaternion()

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x1a1510)
    this.scene.fog = new THREE.Fog(0x1a1510, 8, 22)

    this.canvas = document.createElement('canvas')
    container.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    this.camera.rotation.order = 'YXZ'
    this.updateCamera()

    this.buildLights()
    this.buildRoom()
    this.buildTable()
    this.buildPockets()

    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    )
    this.scene.add(this.aimLine)

    this.cueMesh = this.buildCue()
    this.scene.add(this.cueMesh)

    this.onResize()
    window.addEventListener('resize', () => this.onResize())
  }

  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.35)
    this.scene.add(ambient)

    const lamp = new THREE.SpotLight(0xfff8ee, 2.2, 30, Math.PI / 4, 0.4, 1)
    lamp.position.set(0, 6, 0)
    lamp.target.position.set(0, 0, 0)
    lamp.castShadow = true
    lamp.shadow.mapSize.set(2048, 2048)
    this.scene.add(lamp)
    this.scene.add(lamp.target)

    const fill = new THREE.DirectionalLight(0x8899cc, 0.25)
    fill.position.set(-4, 3, -2)
    this.scene.add(fill)
  }

  private buildRoom(): void {
    // Room dimensions derived from PCOL reference (all in mm, then converted)
    const HW = mm(2500)   // half-width  (x): 1611mm clearance on each side of table
    const HL = mm(3500)   // half-length (z): 1716mm clearance on each table end
    const floorY = mm(-850)              // 850mm below playing surface (table height)
    const ceilY  = mm(1850)             // 2700mm room height from floor
    const wallH  = ceilY - floorY
    const midY   = (floorY + ceilY) / 2

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xc07838,   // warm amber — PCOL reference
      roughness: 0.88,
      metalness: 0,
    })
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a1508,   // deep brown — user spec
      roughness: 0.95,
      metalness: 0,
    })
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0xf5f2ee,   // warm white — user spec
      roughness: 0.95,
      metalness: 0,
    })

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HL * 2), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = floorY
    floor.receiveShadow = true
    this.scene.add(floor)

    // Ceiling (faces down into room)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HL * 2), ceilMat)
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.y = ceilY
    this.scene.add(ceiling)

    // Four walls — each plane normal faces room interior
    // [plane width, plane height, world position, rotation.y]
    const wallDefs: Array<[number, number, [number, number, number], number]> = [
      [HW * 2, wallH, [0,    midY, -HL], 0],             // baulk-end wall (z-)
      [HW * 2, wallH, [0,    midY,  HL], Math.PI],       // black-end wall (z+)
      [HL * 2, wallH, [-HW,  midY,  0],  Math.PI / 2],   // left wall (x-)
      [HL * 2, wallH, [ HW,  midY,  0], -Math.PI / 2],   // right wall (x+)
    ]
    for (const [w, h, pos, ry] of wallDefs) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat)
      mesh.position.set(...pos)
      mesh.rotation.y = ry
      mesh.receiveShadow = true
      this.scene.add(mesh)
    }
  }

  private buildTable(): void {
    const cw = mm(CUSHION_WIDTH)
    const ch = mm(pcolTableRenderModel.cushions[0]?.height ?? pcolTableSpec.visuals.cushionHeight)
    const hw = mm(pcolTableRenderModel.playfield.width / 2)
    const hl = mm(pcolTableRenderModel.playfield.length / 2)
    const pr = mm(pcolTableSpec.pockets[0]?.cutoutArc?.radius ?? 0)
    const ww = mm(pcolTableRenderModel.frame.railWidth)

    const iw = hw + cw
    const il = hl + cw
    const ow = hw + cw + ww
    const ol = hl + cw + ww

    const feltMat = new THREE.MeshStandardMaterial({
      color: pcolTableSpec.visuals.clothColor,
      roughness: 1,
      metalness: 0,
    })
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, hl * 2),
      feltMat,
    )
    felt.rotation.x = -Math.PI / 2
    felt.receiveShadow = true
    this.tableGroup.add(felt)

    const cushionMat = new THREE.MeshStandardMaterial({
      color: pcolTableSpec.visuals.cushionColor,
      roughness: 1,
      metalness: 0,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: pcolTableSpec.visuals.cushionTrimColor,
      roughness: 0.1,
      metalness: 0.9,
    })
    const trimH = mm(pcolTableSpec.visuals.cushionTrimHeight)
    const trimW = mm(pcolTableSpec.visuals.cushionTrimWidth)
    for (const cushion of pcolTableRenderModel.cushions) {
      for (const segment of cushion.segments) {
        const dx = segment.end.x - segment.start.x
        const dy = segment.end.y - segment.start.y
        const len = Math.hypot(dx, dy)
        const center = {
          x: (segment.start.x + segment.end.x) / 2,
          y: (segment.start.y + segment.end.y) / 2,
        }
        const normal =
          cushion.side === 'left' ? { x: -1, y: 0 }
          : cushion.side === 'right' ? { x: 1, y: 0 }
          : cushion.side === 'top' ? { x: 0, y: 1 }
          : { x: 0, y: -1 }
        const isLong = cushion.side === 'left' || cushion.side === 'right'
        const width = isLong ? cushion.visibleWidth : len
        const depth = isLong ? len : cushion.visibleWidth
        const cx = mm(center.x + normal.x * (cushion.visibleWidth / 2))
        const cz = mm(center.y + normal.y * (cushion.visibleWidth / 2))

        const geo = new THREE.BoxGeometry(mm(width), ch, mm(depth))
        const mesh = new THREE.Mesh(geo, cushionMat)
        mesh.position.set(cx, ch / 2, cz)
        mesh.receiveShadow = true
        this.tableGroup.add(mesh)

        // Chrome trim strip on top of cushion rubber
        const trimGeo = new THREE.BoxGeometry(
          isLong ? trimW : mm(len),
          trimH,
          isLong ? mm(len) : trimW,
        )
        const trimMesh = new THREE.Mesh(trimGeo, trimMat)
        trimMesh.position.set(cx, ch + trimH / 2, cz)
        trimMesh.castShadow = true
        this.tableGroup.add(trimMesh)
      }
    }

    const woodMat = new THREE.MeshStandardMaterial({
      color: pcolTableRenderModel.frame.woodColor,
      roughness: 0.3,
      metalness: 0.08,
    })

    // Outer boundary (CCW for Three.js Shape)
    const shape = new THREE.Shape()
    shape.moveTo(-ow, -ol)
    shape.lineTo(ow, -ol)
    shape.lineTo(ow, ol)
    shape.lineTo(-ow, ol)
    shape.closePath()

    // Inner hole with pocket arc cutouts (CW)
    const hole = new THREE.Path()
    hole.moveTo(iw, -il + pr)                      // right edge, above bottom corner
    hole.lineTo(iw, -pr)                           // right edge DOWN to middle pocket
    hole.quadraticCurveTo(iw + pr, 0, iw, pr)     // right middle pocket
    hole.lineTo(iw, il - pr)                       // right edge UP to top corner
    hole.quadraticCurveTo(iw + pr, il + pr, iw - pr, il)  // top-right corner pocket
    hole.lineTo(-iw + pr, il)                      // top edge LEFT
    hole.quadraticCurveTo(-iw - pr, il + pr, -iw, il - pr)  // top-left corner pocket
    hole.lineTo(-iw, pr)                           // left edge DOWN to middle pocket
    hole.quadraticCurveTo(-iw - pr, 0, -iw, -pr)  // left middle pocket
    hole.lineTo(-iw, -il + pr)                     // left edge DOWN to bottom corner
    hole.quadraticCurveTo(-iw - pr, -il - pr, -iw + pr, -il)  // bottom-left corner pocket
    hole.lineTo(iw - pr, -il)                      // bottom edge RIGHT
    hole.quadraticCurveTo(iw + pr, -il - pr, iw, -il + pr)  // bottom-right corner pocket

    shape.holes.push(hole)

    const frameGeo = new THREE.ExtrudeGeometry(shape, {
      depth: mm(pcolTableRenderModel.frame.railDepth),
      bevelEnabled: true,
      bevelThickness: mm(2.5),
      bevelSize: mm(2),
      bevelSegments: 4,
    })
    frameGeo.rotateX(-Math.PI / 2)
    const frameMesh = new THREE.Mesh(frameGeo, woodMat)
    frameMesh.position.y = mm(pcolTableRenderModel.frame.railDepth / 2)
    frameMesh.receiveShadow = true
    frameMesh.castShadow = true
    this.tableGroup.add(frameMesh)

    const lineMat = new THREE.LineBasicMaterial({
      color: pcolTableRenderModel.markings.baulkLine.color,
      transparent: true,
      opacity: pcolTableRenderModel.markings.baulkLine.opacity,
    })
    const baulkZ = mm(pcolTableRenderModel.markings.baulkLine.y)
    const baulkLine = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, 0.002, baulkZ),
      new THREE.Vector3(hw, 0.002, baulkZ),
    ])
    this.tableGroup.add(new THREE.Line(baulkLine, lineMat))

    const dCurve = new THREE.EllipseCurve(
      0,
      baulkZ,
      mm(pcolTableRenderModel.markings.spots.dRadius),
      mm(pcolTableRenderModel.markings.spots.dRadius),
      0,
      Math.PI,
      true,
      0,
    )
    const dPts = dCurve.getPoints(32).map((p) => new THREE.Vector3(p.x, 0.002, p.y))
    this.tableGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dPts), lineMat))

    const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })
    const spotGeo = new THREE.CircleGeometry(mm(pcolTableRenderModel.markings.spotMarkerRadius), 16)
    spotGeo.rotateX(-Math.PI / 2)
    for (const key of ['blue', 'pink', 'black', 'green', 'brown', 'yellow'] as const) {
      const s = pcolTableRenderModel.markings.spots[key]
      const m = new THREE.Mesh(spotGeo, spotMat)
      m.position.set(mm(s.x), 0.003, mm(s.y))
      this.tableGroup.add(m)
    }

    this.scene.add(this.tableGroup)
  }

  private buildPockets(): void {
    const voidMat = new THREE.MeshStandardMaterial({ color: pcolTableSpec.visuals.pocketInteriorColor, roughness: 1, metalness: 0 })
    const rimMat = new THREE.MeshStandardMaterial({ color: pcolTableSpec.visuals.pocketRimColor, roughness: 0.85, metalness: 0 })
    const feltMat = new THREE.MeshStandardMaterial({ color: pcolTableSpec.visuals.clothColor, roughness: 1, metalness: 0 })

    // Above-table pocket blocks (matte black surround visible at rail level)
    const blockMat = new THREE.MeshStandardMaterial({ color: pcolTableSpec.visuals.pocketRimColor, roughness: 0.9, metalness: 0 })
    const blockH = mm(pcolTableSpec.visuals.pocketBlockHeight)
    for (const pocket of pcolTableSpec.pockets) {
      const mc = pocket.mouthCenter
      if (pocket.kind === 'middle') {
        const outSign = Math.sign(mc.x)
        const d = pcolTableSpec.visuals.middleBlockDepth
        const geo = new THREE.BoxGeometry(mm(d), blockH, mm(pocket.mouthWidth))
        const blockMesh = new THREE.Mesh(geo, blockMat)
        blockMesh.position.set(mm(mc.x + outSign * d / 2), blockH / 2, mm(mc.y))
        blockMesh.castShadow = true
        blockMesh.receiveShadow = true
        this.tableGroup.add(blockMesh)
      } else {
        const sz = pcolTableSpec.visuals.cornerBlockSize
        const sx = Math.sign(mc.x)
        const sy = Math.sign(mc.y)
        const geo = new THREE.BoxGeometry(mm(sz), blockH, mm(sz))
        const blockMesh = new THREE.Mesh(geo, blockMat)
        blockMesh.position.set(mm(mc.x + sx * sz / 2), blockH / 2, mm(mc.y + sy * sz / 2))
        blockMesh.castShadow = true
        blockMesh.receiveShadow = true
        this.tableGroup.add(blockMesh)
      }
    }

    const cw = mm(CUSHION_WIDTH)
    const hw = mm(pcolTableRenderModel.playfield.width / 2)
    const hl = mm(pcolTableRenderModel.playfield.length / 2)
    const iw = hw + cw
    const il = hl + cw

    for (const pocket of pcolTableSpec.pockets) {
      const pos = tableVec(pocket.mouthCenter)
      const isMiddle = pocket.kind === 'middle'
      const pr = mm(pocket.cutoutArc?.radius ?? 0)
      const arcPoints = this.getPocketArcPoints(pocket, iw, il, pr, 14)

      if (isMiddle) {
        const shape = new THREE.Shape()
        shape.moveTo(0, 0)
        if (pocket.mouthCenter.x < 0) {
          shape.absarc(0, 0, pr * 1.1, -Math.PI / 2, Math.PI / 2, true)
        } else {
          shape.absarc(0, 0, pr * 1.1, Math.PI / 2, -Math.PI / 2, true)
        }
        shape.lineTo(0, 0)
        const geo = new THREE.ExtrudeGeometry(shape, { depth: mm(35), bevelEnabled: false })
        geo.rotateX(-Math.PI / 2)
        const mesh = new THREE.Mesh(geo, voidMat)
        mesh.position.set(pos.x, -mm(5), pos.z)
        this.tableGroup.add(mesh)
      } else {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(pr * 0.9, pr * 1.15, mm(32), 22),
          voidMat,
        )
        mesh.position.set(pos.x, -mm(12), pos.z)
        this.tableGroup.add(mesh)
      }

      if (arcPoints.length < 2) continue

      const rimDepth = mm(14)
      const rimOffset = pr * 0.32
      const rimMesh = this.createPocketWrap(arcPoints, pocket.mouthCenter, rimDepth, rimOffset, rimMat)
      rimMesh.position.y = -mm(2)
      this.tableGroup.add(rimMesh)

      const feltDepth = mm(10)
      const feltOffset = pr * 0.20
      const feltMesh = this.createPocketWrap(arcPoints, pocket.mouthCenter, feltDepth, feltOffset, feltMat)
      this.tableGroup.add(feltMesh)
    }
  }

  private getPocketArcPoints(
    pocket: (typeof pcolTableSpec.pockets)[number], iw: number, il: number, pr: number, segs: number,
  ): THREE.Vector3[] {
    if (pocket.kind === 'middle') {
      const side = Math.sign(pocket.mouthCenter.x)
      const p0 = new THREE.Vector3(side * iw, 0, -pr)
      const p1 = new THREE.Vector3(side * (iw + pr), 0, 0)
      const p2 = new THREE.Vector3(side * iw, 0, pr)
      return new THREE.QuadraticBezierCurve3(p0, p1, p2).getPoints(segs)
    }

    const sx = Math.sign(pocket.mouthCenter.x)
    const sz = Math.sign(pocket.mouthCenter.y)
    let p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3
    if (sx < 0 && sz < 0) {
      p0 = new THREE.Vector3(-iw, 0, -il + pr)
      p1 = new THREE.Vector3(-iw - pr, 0, -il - pr)
      p2 = new THREE.Vector3(-iw + pr, 0, -il)
    } else if (sx > 0 && sz < 0) {
      p0 = new THREE.Vector3(iw - pr, 0, -il)
      p1 = new THREE.Vector3(iw + pr, 0, -il - pr)
      p2 = new THREE.Vector3(iw, 0, -il + pr)
    } else if (sx > 0 && sz > 0) {
      p0 = new THREE.Vector3(iw, 0, il - pr)
      p1 = new THREE.Vector3(iw + pr, 0, il + pr)
      p2 = new THREE.Vector3(iw - pr, 0, il)
    } else {
      p0 = new THREE.Vector3(-iw + pr, 0, il)
      p1 = new THREE.Vector3(-iw - pr, 0, il + pr)
      p2 = new THREE.Vector3(-iw, 0, il - pr)
    }
    return new THREE.QuadraticBezierCurve3(p0, p1, p2).getPoints(segs)
  }

  private createPocketWrap(
    arcPoints: THREE.Vector3[],
    pocket: Position2D,
    depth: number,
    outwardOffset: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const n = arcPoints.length
    const verts: number[] = []
    const idx: number[] = []

    for (let i = 0; i < n; i++) {
      const p = arcPoints[i]
      const dir = this.pocketOutwardDir(pocket)

      verts.push(p.x, 0, p.z)
      verts.push(p.x + dir.x * outwardOffset, -depth, p.z + dir.z * outwardOffset)
    }

    for (let i = 0; i < n - 1; i++) {
      const a = i * 2
      const b = i * 2 + 1
      const c = (i + 1) * 2
      const d = (i + 1) * 2 + 1
      idx.push(a, c, b, b, c, d)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return new THREE.Mesh(geo, material)
  }

  private pocketOutwardDir(pocket: Position2D): THREE.Vector3 {
    if (pocket.y === 0) {
      // Middle pocket: perpendicular to the long side
      return new THREE.Vector3(Math.sign(pocket.x), 0, 0)
    }
    // Corner pocket: diagonal away from table
    const sx = Math.sign(pocket.x)
    const sz = Math.sign(pocket.y)
    return new THREE.Vector3(sx, 0, sz).normalize()
  }

  private buildCue(): THREE.Group {
    const group = new THREE.Group()
    const buttWood = new THREE.MeshStandardMaterial({ color: 0x4b2518, roughness: 0.42 })
    const shaftWood = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.5 })
    const ferruleMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.35 })

    const frontShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(mm(4.2), mm(6.2), mm(CUE_FRONT_SHAFT_LENGTH_MM), 14),
      shaftWood,
    )
    frontShaft.rotation.x = Math.PI / 2
    frontShaft.position.z = mm(
      CUE_TIP_LENGTH_MM
      + CUE_FERRULE_LENGTH_MM
      + CUE_FRONT_SHAFT_LENGTH_MM / 2
      - CUE_TIP_TO_GROUP_ORIGIN_MM,
    )

    const butt = new THREE.Mesh(
      new THREE.CylinderGeometry(mm(10.8), mm(15.8), mm(CUE_BUTT_LENGTH_MM), 16),
      buttWood,
    )
    butt.rotation.x = Math.PI / 2
    butt.position.z = mm(
      CUE_TIP_LENGTH_MM
      + CUE_FERRULE_LENGTH_MM
      + CUE_FRONT_SHAFT_LENGTH_MM
      + CUE_BUTT_LENGTH_MM / 2
      - CUE_TIP_TO_GROUP_ORIGIN_MM,
    )
    this.cueRearSegment = butt

    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(mm(4.0), mm(4.2), mm(CUE_FERRULE_LENGTH_MM), 12),
      ferruleMat,
    )
    ferrule.rotation.x = Math.PI / 2
    ferrule.position.z = mm(CUE_TIP_LENGTH_MM + CUE_FERRULE_LENGTH_MM / 2 - CUE_TIP_TO_GROUP_ORIGIN_MM)

    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(mm(3.5), mm(3.7), mm(CUE_TIP_LENGTH_MM), 12),
      new THREE.MeshStandardMaterial({ color: 0x3d8ec9 }),
    )
    tip.rotation.x = Math.PI / 2
    tip.position.z = mm(CUE_TIP_LENGTH_MM / 2 - CUE_TIP_TO_GROUP_ORIGIN_MM)
    group.add(frontShaft, butt, ferrule, tip)
    return group
  }

  syncBall(id: string, color: BallColor, position: Position2D, potted: boolean): void {
    let mesh = this.ballMeshes.get(id)
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(mm(BALL_RADIUS), 32, 32),
        new THREE.MeshStandardMaterial({
          color: BALL_COLORS[color],
          roughness: 0.25,
          metalness: color === 'white' ? 0 : 0.05,
        }),
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.scale.setScalar(BALL_VISUAL_SCALE)
      this.scene.add(mesh)
      this.ballMeshes.set(id, mesh)
    }

    const pos = tableVec(position)
    const visualRadius = mm(BALL_RADIUS) * BALL_VISUAL_SCALE
    mesh.position.set(pos.x, pos.y + visualRadius, pos.z)
    mesh.visible = !potted
  }

  removeBallMesh(id: string): void {
    const mesh = this.ballMeshes.get(id)
    if (mesh) {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      this.ballMeshes.delete(id)
    }
  }

  clearAllBalls(): void {
    for (const id of [...this.ballMeshes.keys()]) {
      this.removeBallMesh(id)
    }
  }

  updateCue(
    cuePos: Position2D,
    aimDir: Position2D,
    cueOffsetMm: number,
    tipOffsetY = 0,
    elevation = 0,
    postShotProgress = 0,
  ): void {
    const origin = tableVec(cuePos)
    const len = Math.hypot(aimDir.x, aimDir.y) || 1
    const dir = new THREE.Vector3(aimDir.x / len, 0, aimDir.y / len)

    const tipHeight = mm(BALL_RADIUS + 2) + mm(BALL_RADIUS * tipOffsetY * 1.2)
    const exitStart = Math.max(0, Math.min(1, (postShotProgress - 0.16) / 0.84))
    const retreatProgress = exitStart * exitStart * (3 - 2 * exitStart)
    const liftProgress = Math.pow(exitStart, 2.2)
    const retreatMm = cueOffsetMm + 88 * retreatProgress
    const tipLiftMm =
      CUE_BASE_TIP_LIFT_MM
      + CUE_ELEVATION_TIP_LIFT_MM * elevation
      + CUE_POST_SHOT_EXTRA_TIP_LIFT_MM * retreatProgress
    const buttLift = mm(CUE_ELEVATION_BUTT_LIFT_MM * elevation + CUE_POST_SHOT_EXTRA_BUTT_LIFT_MM * liftProgress)

    this.cueMesh.position.set(origin.x, origin.y + tipHeight + mm(tipLiftMm), origin.z)
    this.cueMesh.position.add(dir.clone().multiplyScalar(-mm(CUE_TIP_TO_GROUP_ORIGIN_MM + retreatMm)))
    const lookAtTarget = new THREE.Vector3(
      origin.x + dir.x * mm(CUE_TIP_LOOKAHEAD_MM),
      origin.y + tipHeight - buttLift + mm(CUE_POST_SHOT_LOOK_LIFT_MM * liftProgress),
      origin.z + dir.z * mm(CUE_TIP_LOOKAHEAD_MM),
    )
    this.cueMesh.lookAt(lookAtTarget)
    this.cueRearSegment.visible = true

    // Aim line from cue ball forward
    const start = new THREE.Vector3(origin.x, mm(2), origin.z)
    const end = start.clone().add(dir.clone().multiplyScalar(mm(900)))
    this.aimLine.geometry.dispose()
    this.aimLine.geometry = new THREE.BufferGeometry().setFromPoints([start, end])
  }

  setCueVisible(visible: boolean): void {
    this.cueMesh.visible = visible
  }

  setAimLineVisible(visible: boolean): void {
    this.aimLine.visible = visible
  }

  // ───── Camera API ─────

  beginPostShotPresentation(cuePos: Position2D, _aimDir: Position2D, watchTarget?: Position2D): void {
    this.postShotActive = true
    this.postShotStartPos.copy(this.camera.position)
    this.postShotStartQuat.copy(this.camera.quaternion)

    const exitTarget = watchTarget ? tableVec(watchTarget) : tableVec(cuePos)
    const orbitPos = new THREE.Vector3(
      Math.sin(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight,
      Math.cos(this.orbitAngle) * this.orbitRadius,
    )
    this.postShotEndPos.copy(orbitPos)
    const m = new THREE.Matrix4()
    m.lookAt(orbitPos, exitTarget, new THREE.Vector3(0, 1, 0))
    this.postShotEndQuat.setFromRotationMatrix(m)
  }

  updatePostShotPresentation(
    progress: number,
    cuePos: Position2D,
    aimDir: Position2D,
    watchTarget?: Position2D,
  ): void {
    if (!this.postShotActive) {
      this.beginPostShotPresentation(cuePos, aimDir, watchTarget)
    }

    const startT = Math.max(0, Math.min(1, (progress - 0.1) / 0.9))
    const eased = startT * startT * (3 - 2 * startT)
    this.camera.position.lerpVectors(this.postShotStartPos, this.postShotEndPos, eased)
    this.camera.quaternion.slerpQuaternions(this.postShotStartQuat, this.postShotEndQuat, eased)
  }

  finishPostShotPresentation(): void {
    if (!this.postShotActive) return
    this.postShotActive = false
    this.cameraMode = 'standing'
    this.camera.position.copy(this.postShotEndPos)
    this.camera.quaternion.copy(this.postShotEndQuat)

    const orbitPos = new THREE.Vector3(
      Math.sin(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight,
      Math.cos(this.orbitAngle) * this.orbitRadius,
    )
    const centerDir = new THREE.Vector3(0, 0, 0).sub(orbitPos).normalize()
    const actualDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const centerXZ = new THREE.Vector3(centerDir.x, 0, centerDir.z).normalize()
    const actualXZ = new THREE.Vector3(actualDir.x, 0, actualDir.z).normalize()
    this.relYaw = Math.atan2(
      centerXZ.x * actualXZ.z - centerXZ.z * actualXZ.x,
      centerXZ.dot(actualXZ),
    )
    const horizMag = Math.hypot(actualDir.x, actualDir.z)
    this.relPitch = -Math.atan2(actualDir.y, horizMag)
  }

  /** Cast camera gaze ray onto table plane (y=0). Returns scene-space point or null. */
  getGazeTablePoint(): THREE.Vector3 | null {
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    if (dir.y >= 0) return null
    const t = -this.camera.position.y / dir.y
    return this.camera.position.clone().add(dir.clone().multiplyScalar(t))
  }

  /** Enter aiming mode: transition behind cue ball, smooth from standing view. */
  enterAimingMode(cuePos: Position2D, aimDir: Position2D): void {
    this.aimViewYaw = 0
    this.aimViewPitch = 0

    const origin = tableVec(cuePos)
    const len = Math.hypot(aimDir.x, aimDir.y) || 1
    const dir = new THREE.Vector3(aimDir.x / len, 0, aimDir.y / len)

    const behindDist = mm(AIM_CAMERA_BEHIND_DIST_MM)
    const eyeHeight = mm(AIM_CAMERA_EYE_HEIGHT_MM)
    const targetPos = new THREE.Vector3(
      origin.x - dir.x * behindDist,
      eyeHeight,
      origin.z - dir.z * behindDist,
    )

    // Transition: camera moves behind cue ball, looks along aim line
    const lookTarget = origin.clone().add(dir.clone().multiplyScalar(mm(AIM_CAMERA_LOOKAHEAD_MM)))
    const m = new THREE.Matrix4()
    m.lookAt(targetPos, lookTarget, new THREE.Vector3(0, 1, 0))
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m)

    this.transDuration = 0.3
    this.transStartPos.copy(this.camera.position)
    this.transStartQuat.copy(this.camera.quaternion)
    this.transEndPos.copy(targetPos)
    this.transEndQuat.copy(targetQuat)
    this.transProgress = 0
    this.transActive = true
    this.targetMode = 'aiming'
    this.cameraMode = 'transition'
  }

  /** Exit aiming mode: transition camera back to orbit (standing) position.
   *  If watchTarget is provided, the camera keeps looking at it during stand-up. */
  exitAimingMode(watchTarget?: Position2D): void {
    this.transDuration = 1.2
    this.transStartPos.copy(this.camera.position)
    this.transStartQuat.copy(this.camera.quaternion)

    // Look target: use watchTarget if given, otherwise gaze intersection with table
    let exitTarget: THREE.Vector3
    if (watchTarget) {
      exitTarget = tableVec(watchTarget)
    } else {
      const gazeDir = new THREE.Vector3()
      this.camera.getWorldDirection(gazeDir)
      exitTarget = new THREE.Vector3(0, 0, 0)
      if (gazeDir.y < 0) {
        const t = -this.camera.position.y / gazeDir.y
        exitTarget.copy(this.camera.position).add(gazeDir.clone().multiplyScalar(t))
      }
    }

    // End at current orbit position, looking at the target
    const orbitPos = new THREE.Vector3(
      Math.sin(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight,
      Math.cos(this.orbitAngle) * this.orbitRadius,
    )
    this.transEndPos.copy(orbitPos)
    const m = new THREE.Matrix4()
    m.lookAt(orbitPos, exitTarget, new THREE.Vector3(0, 1, 0))
    this.transEndQuat.setFromRotationMatrix(m)

    this.transProgress = 0
    this.transActive = true
    this.targetMode = 'standing'
    this.cameraMode = 'transition'
  }

  /** Update camera position and look direction when aim changes during aiming mode. */
  updateAimingCamera(cuePos: Position2D, aimDir: Position2D): void {
    if (this.cameraMode !== 'aiming') return

    this.lastAimCuePos = cuePos
    this.lastAimDir = aimDir

    const origin = tableVec(cuePos)
    const len = Math.hypot(aimDir.x, aimDir.y) || 1
    const dir = new THREE.Vector3(aimDir.x / len, 0, aimDir.y / len)

    const behindDist = mm(AIM_CAMERA_BEHIND_DIST_MM)
    const eyeHeight = mm(AIM_CAMERA_EYE_HEIGHT_MM)
    this.camera.position.set(
      origin.x - dir.x * behindDist,
      eyeHeight,
      origin.z - dir.z * behindDist,
    )

    // Base look direction: along aim line
    const baseTarget = origin.clone().add(dir.clone().multiplyScalar(mm(AIM_CAMERA_LOOKAHEAD_MM)))
    const baseDir = baseTarget.clone().sub(this.camera.position).normalize()

    // Apply mouse-drag view offset (yaw around world Y, pitch around local right)
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.aimViewYaw)
    const viewDir = baseDir.clone().applyQuaternion(yawQuat)
    const right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize()
    if (right.length() > 0.001) {
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, this.aimViewPitch)
      viewDir.applyQuaternion(pitchQuat)
    }

    const lookTarget = this.camera.position.clone().add(viewDir.multiplyScalar(mm(AIM_CAMERA_LOOKAHEAD_MM)))
    this.camera.lookAt(lookTarget)
  }

  /** Rotate view while in aiming mode (mouse drag). Does not change aim direction. */
  rotateAimView(dYaw: number, dPitch: number): void {
    if (this.cameraMode !== 'aiming') return
    this.aimViewYaw = Math.max(-0.3, Math.min(0.3, this.aimViewYaw + dYaw))
    this.aimViewPitch = Math.max(-0.3, Math.min(0.1, this.aimViewPitch + dPitch))
    if (this.lastAimCuePos && this.lastAimDir) {
      this.updateAimingCamera(this.lastAimCuePos, this.lastAimDir)
    }
  }

  /** Rotate relative yaw while in standing mode (mouse drag left/right). */
  rotateYaw(delta: number): void {
    if (this.cameraMode !== 'standing') return
    this.relYaw = Math.max(-0.5, Math.min(0.5, this.relYaw + delta))
    this.updateCamera()
  }

  /** Rotate relative pitch while in standing mode (mouse drag up/down). Clamped. */
  rotatePitch(delta: number): void {
    if (this.cameraMode !== 'standing') return
    this.relPitch = Math.max(-0.6, Math.min(0.2, this.relPitch + delta))
    this.updateCamera()
  }

  /** Orbit camera around the table (A/D keys). Marks next aim entry as "first". */
  rotateOrbit(delta: number): void {
    if (this.cameraMode !== 'standing') return
    this.orbitAngle += delta
    this.relYaw = 0
    this.relPitch = 0.15
    this.updateCamera()
  }

  isTransitionActive(): boolean {
    return this.transActive || this.postShotActive
  }

  /** Per-frame tick: advances camera transition with lerp + slerp. */
  tickTransition(dt: number): void {
    if (!this.transActive) return

    this.transProgress += dt / this.transDuration
    if (this.transProgress >= 1) {
      this.transProgress = 1
      this.transActive = false
      this.cameraMode = this.targetMode

      // Ensure exact final state (avoid floating-point drift)
      this.camera.position.copy(this.transEndPos)
      this.camera.quaternion.copy(this.transEndQuat)

      // Sync relYaw/relPitch so standing-mode controls don't snap on first input
      if (this.cameraMode === 'standing') {
        const orbitPos = new THREE.Vector3(
          Math.sin(this.orbitAngle) * this.orbitRadius,
          this.orbitHeight,
          Math.cos(this.orbitAngle) * this.orbitRadius,
        )
        const centerDir = new THREE.Vector3(0, 0, 0).sub(orbitPos).normalize()
        const actualDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)

        // Decompose relative yaw (horizontal angle from center direction)
        const centerXZ = new THREE.Vector3(centerDir.x, 0, centerDir.z).normalize()
        const actualXZ = new THREE.Vector3(actualDir.x, 0, actualDir.z).normalize()
        this.relYaw = Math.atan2(
          centerXZ.x * actualXZ.z - centerXZ.z * actualXZ.x,
          centerXZ.dot(actualXZ),
        )

        // Decompose relative pitch (vertical angle from XZ plane, negative = looking down)
        const horizMag = Math.hypot(actualDir.x, actualDir.z)
        this.relPitch = -Math.atan2(actualDir.y, horizMag)
      }
      return
    }

    const t = this.transProgress * this.transProgress * (3 - 2 * this.transProgress)
    this.camera.position.lerpVectors(this.transStartPos, this.transEndPos, t)
    this.camera.quaternion.slerpQuaternions(this.transStartQuat, this.transEndQuat, t)
  }

  /** Reset view to default standing position (behind table, looking at center). */
  resetView(): void {
    this.orbitAngle = Math.PI
    this.relYaw = 0
    this.relPitch = 0.15
    this.cameraMode = 'standing'
    this.transActive = false
    this.updateCamera()
  }

  /** Apply current orbit/relYaw/relPitch to camera (standing mode). */
  private updateCamera(): void {
    this.camera.position.set(
      Math.sin(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight,
      Math.cos(this.orbitAngle) * this.orbitRadius,
    )

    // Start from "look at table center"
    const centerDir = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize()
    // Apply relYaw around world Y
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.relYaw)
    const viewDir = centerDir.clone().applyQuaternion(yawQ)
    // Apply relPitch around local right axis
    const right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize()
    if (right.length() > 0.001) {
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(right, this.relPitch)
      viewDir.applyQuaternion(pitchQ)
    }
    this.camera.lookAt(this.camera.position.clone().add(viewDir))
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  onResize(): void {
    const parent = this.canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    window.removeEventListener('resize', () => this.onResize())
    this.renderer.dispose()
    for (const mesh of this.ballMeshes.values()) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.canvas.remove()
  }
}
