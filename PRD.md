# Product Requirements Document

## Product Name

AI Snooker Simulator

Reference: [pcol](http://www.heyzxz.me/pcol/) — replicate core feel first; LLM star players come at hackathon.

---

## Product Vision

Immersive web-based 3D snooker: play **SINGLE PLAY** vs a heuristic AI (pcol-style), or **PRACTISE** solo. Before hackathon: a complete offline single-player game. During hackathon: add LLM tactical “star” players via structured shot plans and personality prompts.

**Not** a professional physics simulator — believable feel and broadcast atmosphere matter more.

---

## Game Modes (v1)

| Mode | Description |
|------|-------------|
| **SINGLE PLAY** | 1v1 vs **AI-1** (no LLM). Single frame, winner by score. Standard 15 reds + colours on spots. |
| **PRACTISE** | Player only, same table/rules, no AI turn. |

**Break order:** Player breaks first; alternate breaker each new frame (future multi-frame).

**Deferred:** Easy/Medium/Hard, multi-frame match (e.g. 35 frames / 18 wins), save games, practice ball layouts (snake, T, X, cross, long pot, five-ball drill).

---

## Core Features

### 1. Basic Gameplay (P1)

- Standard snooker layout and ball spots
- Cue ball placement in the **D** (click + `PLACE CUE BALL` flow)
- Aim: ghost ball, object-ball path, cue-ball path (when in range, per pcol)
- Shot: power, **spin** (top/back/side), **elevation** (avoid cue clipping through balls)
- Ball collision, cushion reflection, pocket detection
- Turn switching

Controls aligned with pcol where possible: `W` aim, `SPACE` shot, wheel power, `Alt` spin, `C` clear spin, elevation for blocked cue lines.

### 2. Spin & Cue (P2 — full pcol tier)

- Top / back / side spin — visually believable; simplified physics correction
- Cue elevation when balls block the cue line between rest and cue ball
- Masse / dig visual acceptable with 2D physics (see Architecture extensibility)

### 3. Rule System

#### P2 (must ship in 5-day MVP)

- Potting and scoring; colour **re-spot after pot** during reds phase; **no re-spot** in colours-only clearance (match snooker)
- Fouls:
  - Cue ball potted
  - Wrong ball hit first
  - No ball hit (**miss** — penalty = **ball on** value: yellow/green/brown → 4; blue 5; pink 6; black 7; reds phase per snooker logic)
  - Hit wrong colour first (e.g. should hit red, hit blue → 5)
- **Nominate colour** when reds remain: modal with six colours → user picks → referee TTS e.g. *"Blue Ball"* → then shot allowed
- **Unreachable frame** (not raw 19-point lead):  
  `(leaderScore − trailerScore) − remainingPointsOnTable > 19`  
  where `remainingPointsOnTable` uses standard snooker counting (reds as 8 potential each + values of colours on table; colours-only phase = sum of on-table colour values)
  - Player leading → AI stops; TTS **frame conceded**; end-of-frame stats panel
  - AI leading → **Concede** button only after **AI break has ended**; on concede → end-of-frame stats immediately
- End-of-frame panel (pcol-style): POINTS, MAX BREAK, FOULS, ACCURACY, TIME — RETRY / BACK

#### P4 (post-MVP / hackathon buffer)

- Free ball
- Re-spotting edge cases tied to free ball
- Three misses → loss of frame

### 4. JSON Snapshot System (P4)

- Planar table coords in **mm**; origin = **blue ball spot** (static), not the blue ball object
- Axes: **y** parallel to long side (black/pink spots on **y+**); **x** parallel to short side
- v1: **x, y only** (ignore ball height); schema versioned for future 2.5D / z
- Per shot (and before each shot for cue clipping):
  - Each ball: id, position, on-table / potted, **legally hittable** (rule-based ball-on)
  - Cue tip and butt positions
- Post-hackathon snapshot may add **geometric visibility** (line-of-sight) for LLM
- Used for: reposition/recovery, last-shot replay, LLM decisions

Example shape:

```json
{
  "schemaVersion": 1,
  "balls": [{ "id": "red_1", "x": 120, "y": -340, "potted": false, "legal": true }],
  "scores": { "player": 45, "ai": 12 },
  "turn": "player",
  "ballOn": "red",
  "cue": { "tip": { "x": 0, "y": 0 }, "butt": { "x": -80, "y": 120 } }
}
```

### 5. AI Opponents

#### MVP (5 days): AI-1

- Heuristic / decision-tree opponent (pcol-like), tunable parameters (e.g. pot success rate)
- Outputs structured **ShotPlan** consumed by shared **ShotExecutor**
- **No LLM**

#### Hackathon (P5): Star player

- One star first (e.g. Ronnie-style prompt); more later
- LLM reads JSON snapshot → returns **ShotPlan** (schema) + optional commentary text
- Cache plans by situation hash when possible; skip LLM on repeats
- Star personality = prompt describing style; same pipeline as generic LLM AI

### 6. Replay (MVP)

- **Last shot only:** store pre-shot `GameSnapshot` + `ShotPlan`; replay restores and re-executes or re-animates
- Interface预留 for multi-shot history later

### 7. Audio & Referee (P3)

- SFX: cue hit, pocket, collision
- **All referee speech via browser TTS (English)** — Triple Crown style
  - **Every pot:** announce **cumulative** frame score (e.g. *"Thirty-four"*)
  - Break end: *"{Name}, seventy"* (use number-to-words library)
  - Frame end when unreachable: *"{Name}, one hundred and eleven, end the frame"*
  - Player concede: *"{LeaderName}, {score}, frame conceded"*
  - Fouls, colour nomination, frame conceded — all TTS

### 8. UI / HUD

- Dark club atmosphere (pcol-inspired room + table lighting)
- Main menu: **SINGLE PLAY**, **PRACTISE**, **ABOUT**
- Scoreboard: **World Championship bar** first — yellow name strips, frame scores, centre **Single Frame** for 1-frame games; fallback to pcol bar if needed
- Ball-on indicator (red / colour icon)
- BRK + frame score blocks
- Foul overlay (e.g. `FOUL — -5: ILLEGAL FIRST HIT`)
- Legal target ring under balls (colour hint when wrong ball targeted)
- Future: AI thinking / commentary panel for LLM stars

---

## Development Phases (5-day solo → hackathon)

| Phase | Deliverable |
|-------|-------------|
| **P1** | Table, physics, pots, aim lines, D placement, turns |
| **P2** | P2 rules, nominate colour, unreachable/concede, end-frame stats, **AI-1**, spin + elevation |
| **P3** | WC scoreboard, full English TTS |
| **P4** | JSON snapshots, P4 rules, extensible coords/physics, last-shot replay |
| **P5** (hackathon) | DeepSeek LLM + one star prompt |

---

## Non-Goals

- Professional physics / VR / multiplayer / AAA characters
- Full match replay timeline
- Backend beyond optional LLM proxy for production
- Multi-frame championship match + save (v1)
