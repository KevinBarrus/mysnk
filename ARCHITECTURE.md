# System Architecture

## Tech Stack

| Layer | Choice |
|-------|--------|
| App | React, Vite, TailwindCSS |
| 3D | three.js |
| Physics | cannon-es (planar v1) |
| State | Zustand |
| AI (hackathon) | DeepSeek API (OpenAI-compatible) |
| TTS | Web Speech API + number-to-words (or similar) |

---

## High-Level Flow

```text
UI / HUD / TTS
      ↓
GameController (state machine: menu → place ball → aim → shot → resolve → end frame)
      ↓
┌─────────────┬──────────────┬─────────────────┐
│ RulesEngine │ PhysicsWorld │ TacticalPlanner │
└─────────────┴──────────────┴─────────────────┘
      ↓
SnapshotStore / ReplayStore (last shot)
      ↓
ShotExecutor ← ShotPlan
```

**MVP planner:** `HeuristicPlanner` (AI-1).  
**Hackathon planner:** `LlmPlanner` → DeepSeek → `ShotPlan` JSON.

---

## Extensibility (2D now, 2.5D later)

Design so v1 paths do not block Z / advanced shots.

| Concern | v1 | Extension |
|---------|----|-----------|
| Position | `{ x, y }` mm | `Position` type with optional `z?` |
| Physics | `PlanePhysics` wrapping cannon-es | `PhysicsWorld` interface; future `Physics25D` |
| Snapshot | `schemaVersion: 1` | Bump version when adding visibility / z |
| Shot | `ShotPlan` (angle, power, spin, elevation) | Same schema; executor may use z later |

Cue anti-clipping: before each shot, update cue tip/butt in snapshot plane; if segment intersects balls, raise **elevation** on cue mesh (visual); physics remains 2D unless masse is added later.

---

## Coordinate System

- **Origin:** blue ball **spot** `(0, 0)` mm — never moves
- **y:** parallel to long edge; black spot, pink spot on **y > 0**
- **x:** parallel to short edge
- Real table/ball sizes in mm (snooker ball diameter 52.5 mm; table per standard ratios in constants module)
- Ignore ball height in physics and JSON v1

---

## Core Modules

### `src/game/`

- Global match/frame state (Zustand)
- Turn, breaker alternation, ball-on, nominated colour
- `getRemainingPoints(state)` for unreachable-frame check  
  `(leader − trailer) − remaining > 19`
- Frame end: stats aggregation, concede flow
- Snapshot read/write; integrates `ReplayStore`

### `src/physics/`

- cannon-es world: balls, cushions, pockets
- Spin correction (visual-first)
- Sync mesh positions from bodies
- Implements `PhysicsWorld` interface

### `src/rules/`

- Pot validation, scores, breaks
- Colour re-spot vs clearance phase
- Fouls and ball-on penalties (miss = ball on value)
- Turn switch, foul recovery (D placement when applicable)
- P4: free ball, three-miss

### `src/ai/`

- **`ShotPlan`** (schema): `intent`, `targetBallId`, `aim`, `power`, `spin`, `elevation?`, `commentary?`
- **`ShotExecutor`:** plan → apply impulse / aim robotically for AI-1 and LLM
- **`HeuristicPlanner`:** MVP opponent
- **`LlmPlanner`:** hackathon — prompt + snapshot → `ShotPlan`; response cache by hash(snapshot + ballOn)
- **`StarProfiles`:** prompt templates per star (one first)

### `src/ui/`

- Menu: SINGLE PLAY, PRACTISE, ABOUT
- WC scoreboard component (Single Frame centre label)
- Aim HUD, control hints, foul toast, nominate-colour modal
- End-frame stats overlay
- Concede button (gated: AI break ended, unreachable true)

### `src/audio/`

- SFX manager
- **`RefereeTTS`:** all spoken events (pots cumulative, breaks, fouls, nomination, frame end, concede)
- Uses `number-to-words` for spoken scores

### `src/replay/`

- **`ReplayStore`:** last `{ snapshotBefore, shotPlan }`
- Replay mode: restore snapshot, re-run `ShotExecutor` or playback animation

---

## Snapshot Schema (v1)

```typescript
interface GameSnapshot {
  schemaVersion: 1;
  balls: Array<{
    id: string;
    x: number;
    y: number;
    potted: boolean;
    legal: boolean; // rule ball-on
  }>;
  scores: { player: number; ai: number };
  turn: 'player' | 'ai';
  ballOn: 'red' | 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black' | null;
  nominatedColour?: 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black';
  cue: { tip: { x: number; y: number }; butt: { x: number; y: number } };
}
```

Hackathon may add `visible: boolean` per ball (line-of-sight) without breaking v1 consumers if version bumped.

---

## AI Pipeline (hackathon)

```text
Shot ends → GameSnapshot
         → LlmPlanner (star prompt + snapshot JSON)
         → ShotPlan (+ optional commentary for UI)
         → ShotExecutor → physics
```

**Do not** parse natural language for execution. Commentary is display-only.

**Caching:** `hash(normalizedSnapshot + ballOn)` → stored `ShotPlan`; optional commentary refresh skipped.

---

## API Keys & Deployment

| Environment | LLM key |
|---------------|---------|
| Local / hackathon dev | `VITE_DEEPSEEK_API_KEY` in `.env.local` (gitignored) |
| Production | Server proxy; `DEEPSEEK_API_KEY` on server only — **never** ship VITE secret in public builds |

Provide `.env.example` with variable names only.

---

## Render / Game Loop

```text
Input (aim / power / spin / elevation)
  → update cue pose (clip test vs balls)
  → on SHOT: SnapshotStore.saveBeforeShot()
  → PhysicsWorld.step until rest
  → RulesEngine.evaluate()
  → RefereeTTS (pot cumulative, foul, etc.)
  → if AI turn: HeuristicPlanner.plan() → ShotExecutor
  → SnapshotStore.saveAfterShot()
  → render three.js frame
```

---

## Development Phases

| Phase | Scope |
|-------|--------|
| **P1** | Scene, table, balls, cannon, pots, aim lines, D placement, turns |
| **P2** | Rules (P2 list), AI-1, spin/elevation, unreachable/concede, end-frame stats |
| **P3** | WC scoreboard, RefereeTTS full coverage |
| **P4** | Snapshots mm, P4 rules, ReplayStore last shot, extensibility hooks |
| **P5** | LlmPlanner + one star profile |

---

## Reference Assets

UI/UX reference: `ExampleImage/` (pcol screenshots, `标准记分牌.png`).
