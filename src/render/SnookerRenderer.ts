import * as THREE from 'three'
import {
  BALL_COLORS,
  BALL_RADIUS,
  CUSHION_HEIGHT,
  CUSHION_WIDTH,
  D_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  POCKET_RADIUS,
  POCKETS,
  SPOTS,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from '@/constants/table'
import type { BallColor } from '@/constants/table'
import type { Position2D } from '@/types/coords'
import { tableToWorld } from '@/physics/PlanePhysics'

const MM_TO_SCENE = 1 / 1000

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
  private aimLine: THREE.Line
  private tableGroup = new THREE.Group()

  // Orbit camera (standing mode): camera moves on a circle around the table
  private orbitAngle = Math.PI      // PI = behind table, 0 = in front
  private relYaw = 0                // relative yaw offset from "look at center"
  private relPitch = 0.15           // relative pitch offset
  private readonly orbitRadius = mm(HALF_LENGTH + 1200)
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

  private buildTable(): void {
    // === Scene-unit helpers ===
    const cw = mm(CUSHION_WIDTH)     // cushion width
    const ch = mm(CUSHION_HEIGHT)    // cushion height
    const hw = mm(HALF_WIDTH)        // playing surface half-width
    const hl = mm(HALF_LENGTH)       // playing surface half-length
    const pr = mm(POCKET_RADIUS)     // pocket radius
    const vcw = mm(14)               // visual cushion width (narrow)
    const ww = mm(165)               // wood frame width

    // Wood frame inner edge = cushion outer edge
    const iw = hw + cw               // inner half-width of wood frame
    const il = hl + cw               // inner half-length
    const ow = hw + cw + ww          // outer half-width
    const ol = hl + cw + ww          // outer half-length

    // ──────────────────────────────────────────
    // 1. Cloth (playing surface)
    // ──────────────────────────────────────────
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x2D8A2F, roughness: 1, metalness: 0 })
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, hl * 2),
      feltMat,
    )
    felt.rotation.x = -Math.PI / 2
    felt.receiveShadow = true
    this.tableGroup.add(felt)

    // ──────────────────────────────────────────
    // 2. Cushion (green rubber, narrow, matte)
    // ──────────────────────────────────────────
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x2D8A2F, roughness: 1, metalness: 0 })
    const halfGap = mm(POCKET_RADIUS * 1.1)
    const longSegLen = hl - halfGap
    const shortSideW = hw * 2 - mm(POCKET_RADIUS * 0.5) * 2

    interface CushionSpec { w: number; h: number; d: number; pos: [number, number, number] }
    const cushions: CushionSpec[] = [
      // Short sides (minus corner gap)
      { w: shortSideW, h: ch, d: vcw, pos: [0, ch / 2, -hl - vcw / 2] },
      { w: shortSideW, h: ch, d: vcw, pos: [0, ch / 2, hl + vcw / 2] },
      // Left long side — two segments, middle pocket gap
      { w: vcw, h: ch, d: longSegLen, pos: [-hw - vcw / 2, ch / 2, -(hl + halfGap) / 2] },
      { w: vcw, h: ch, d: longSegLen, pos: [-hw - vcw / 2, ch / 2, (hl + halfGap) / 2] },
      // Right long side — two segments, middle pocket gap
      { w: vcw, h: ch, d: longSegLen, pos: [hw + vcw / 2, ch / 2, -(hl + halfGap) / 2] },
      { w: vcw, h: ch, d: longSegLen, pos: [hw + vcw / 2, ch / 2, (hl + halfGap) / 2] },
    ]

    for (const c of cushions) {
      const geo = new THREE.BoxGeometry(c.w, c.h, c.d)
      const mesh = new THREE.Mesh(geo, cushionMat)
      mesh.position.set(...c.pos)
      mesh.receiveShadow = true
      this.tableGroup.add(mesh)
    }

    // ──────────────────────────────────────────
    // 3. Wood frame (thick, brown, arc pocket cutouts)
    // ──────────────────────────────────────────
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x3A2416,
      roughness: 0.5,
      metalness: 0.05,
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
      depth: mm(45),
      bevelEnabled: true,
      bevelThickness: mm(2.5),
      bevelSize: mm(2),
      bevelSegments: 4,
    })
    // Rotate to lay flat (extrusion goes up in scene)
    frameGeo.rotateX(-Math.PI / 2)
    const frameMesh = new THREE.Mesh(frameGeo, woodMat)
    // Shift up so bottom is at y=0 (half of depth)
    frameMesh.position.y = mm(22.5)
    frameMesh.receiveShadow = true
    frameMesh.castShadow = true
    this.tableGroup.add(frameMesh)

    // ──────────────────────────────────────────
    // 4. Baulk line + D
    // ──────────────────────────────────────────
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    const baulkZ = mm(-HALF_LENGTH + 879)
    const baulkLine = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-mm(HALF_WIDTH), 0.002, baulkZ),
      new THREE.Vector3(mm(HALF_WIDTH), 0.002, baulkZ),
    ])
    this.tableGroup.add(new THREE.Line(baulkLine, lineMat))

    const dCurve = new THREE.EllipseCurve(0, baulkZ, mm(D_RADIUS), mm(D_RADIUS), 0, Math.PI, true, 0)
    const dPts = dCurve.getPoints(32).map((p) => new THREE.Vector3(p.x, 0.002, p.y))
    this.tableGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dPts), lineMat))

    // ──────────────────────────────────────────
    // 5. Spot markers
    // ──────────────────────────────────────────
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })
    const spotGeo = new THREE.CircleGeometry(mm(4), 16)
    spotGeo.rotateX(-Math.PI / 2)
    for (const key of ['blue', 'pink', 'black', 'green', 'brown', 'yellow'] as const) {
      const s = SPOTS[key]
      const m = new THREE.Mesh(spotGeo, spotMat)
      m.position.set(mm(s.x), 0.003, mm(s.y))
      this.tableGroup.add(m)
    }

    this.scene.add(this.tableGroup)
  }

  private buildPockets(): void {
    const voidMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, metalness: 0 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.85, metalness: 0 })
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x2D8A2F, roughness: 1, metalness: 0 })
    const pr = mm(POCKET_RADIUS)

    // Wood frame inner edge dimensions (same as buildTable)
    const cw = mm(CUSHION_WIDTH)
    const hw = mm(HALF_WIDTH)
    const hl = mm(HALF_LENGTH)
    const iw = hw + cw
    const il = hl + cw

    // Cushion top face height — used as wrap upper bound
    const ch = mm(CUSHION_HEIGHT)

    for (const p of POCKETS) {
      const pos = tableVec(p)
      const isMiddle = p.y === 0
      const arcPoints = this.getPocketArcPoints(p, iw, il, pr, 14)

      // ————————————————————————————————————————————
      // Layer 1: Deep pocket interior (black void)
      // ————————————————————————————————————————————
      if (isMiddle) {
        // Half-disk extrusion, shifted outward and lowered
        const shape = new THREE.Shape()
        shape.moveTo(0, 0)
        if (p.x < 0) {
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
        // Corner pocket: tapered cylinder below surface
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(pr * 0.9, pr * 1.15, mm(32), 22),
          voidMat,
        )
        mesh.position.set(pos.x, -mm(12), pos.z)
        this.tableGroup.add(mesh)
      }

      // If the pocket arc has no points, skip wrap layers
      if (arcPoints.length < 2) continue

      // ————————————————————————————————————————————
      // Layer 2: Black cushion/rim wrap
      //   Sits between the felt wrap and the wood frame,
      //   wider and deeper than the felt layer so it's
      //   visible as a black band behind the felt edge.
      // ————————————————————————————————————————————
      const rimDepth = mm(14)
      const rimOffset = pr * 0.32
      const rimMesh = this.createPocketWrap(arcPoints, p, rimDepth, rimOffset, rimMat)
      rimMesh.position.y = -mm(2)
      this.tableGroup.add(rimMesh)

      // ————————————————————————————————————————————
      // Layer 3: Green felt wrap
      //   The cloth surface curving downward and inward
      //   along the pocket arc.
      // ————————————————————————————————————————————
      const feltDepth = mm(10)
      const feltOffset = pr * 0.20
      const feltMesh = this.createPocketWrap(arcPoints, p, feltDepth, feltOffset, feltMat)
      this.tableGroup.add(feltMesh)
    }
  }

  /** Generate points along a pocket arc (quadratic bezier matching the wood frame cutout). */
  private getPocketArcPoints(
    p: Position2D, iw: number, il: number, pr: number, segs: number,
  ): THREE.Vector3[] {
    if (p.y === 0) {
      // Middle pocket: half-circle bulging outward from the long side
      const side = Math.sign(p.x)
      const p0 = new THREE.Vector3(side * iw, 0, -pr)
      const p1 = new THREE.Vector3(side * (iw + pr), 0, 0)
      const p2 = new THREE.Vector3(side * iw, 0, pr)
      return new THREE.QuadraticBezierCurve3(p0, p1, p2).getPoints(segs)
    }

    // Corner pocket — map to the correct corner
    const sx = Math.sign(p.x)
    const sz = Math.sign(p.y)
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

  /** Create a ruled-surface ribbon along a pocket arc, sloping downward + outward. */
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

      // Top edge (at y=0, flush with playing surface)
      verts.push(p.x, 0, p.z)
      // Bottom edge (below surface, offset outward into the pocket)
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

  /** Direction from the table outward into the pocket opening. */
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
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.5 })
    // Cylinder is along Y; rotate to lie along Z. Tip at +Z (forward after lookAt).
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(mm(4.5), mm(6), mm(700), 12), wood)
    shaft.rotation.x = Math.PI / 2
    shaft.position.z = mm(350)
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(mm(3.5), mm(3.5), mm(20), 12),
      new THREE.MeshStandardMaterial({ color: 0x3d8ec9 }),
    )
    tip.rotation.x = Math.PI / 2
    tip.position.z = mm(710)
    group.add(shaft, tip)
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

  updateCue(cuePos: Position2D, aimDir: Position2D, power: number): void {
    const origin = tableVec(cuePos)
    const len = Math.hypot(aimDir.x, aimDir.y) || 1
    const dir = new THREE.Vector3(aimDir.x / len, 0, aimDir.y / len)

    const pullBack = mm(120 + power * 280)
    const cueLen = mm(720) + pullBack // total from tip to butt in scene units

    // Geometric check: if the butt end of the cue is past the playing surface → raise
    const buttX = origin.x - dir.x * cueLen
    const buttZ = origin.z - dir.z * cueLen
    const onRail = Math.abs(buttX) > mm(HALF_WIDTH) || Math.abs(buttZ) > mm(HALF_LENGTH)
    const height = onRail ? mm(CUSHION_HEIGHT) + mm(10) : mm(BALL_RADIUS) + mm(2)

    this.cueMesh.position.set(origin.x, origin.y + height, origin.z)
    this.cueMesh.position.add(dir.clone().multiplyScalar(-(mm(710) + pullBack)))
    // When on the rail, keep cue horizontal (same height) so the whole shaft clears the rail top
    const lookAtY = onRail ? origin.y + height : origin.y + mm(BALL_RADIUS)
    this.cueMesh.lookAt(new THREE.Vector3(origin.x, lookAtY, origin.z))

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

    const behindDist = mm(700)
    const eyeHeight = mm(250)
    const targetPos = new THREE.Vector3(
      origin.x - dir.x * behindDist,
      eyeHeight,
      origin.z - dir.z * behindDist,
    )

    // Transition: camera moves behind cue ball, looks along aim line
    const lookTarget = origin.clone().add(dir.clone().multiplyScalar(mm(600)))
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

    const behindDist = mm(700)
    const eyeHeight = mm(250)
    this.camera.position.set(
      origin.x - dir.x * behindDist,
      eyeHeight,
      origin.z - dir.z * behindDist,
    )

    // Base look direction: along aim line
    const baseTarget = origin.clone().add(dir.clone().multiplyScalar(mm(600)))
    const baseDir = baseTarget.clone().sub(this.camera.position).normalize()

    // Apply mouse-drag view offset (yaw around world Y, pitch around local right)
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.aimViewYaw)
    let viewDir = baseDir.clone().applyQuaternion(yawQuat)
    const right = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0)).normalize()
    if (right.length() > 0.001) {
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, this.aimViewPitch)
      viewDir.applyQuaternion(pitchQuat)
    }

    const lookTarget = this.camera.position.clone().add(viewDir.multiplyScalar(mm(600)))
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
    return this.transActive
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
    let viewDir = centerDir.clone().applyQuaternion(yawQ)
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
