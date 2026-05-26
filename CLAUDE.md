# AI Snooker Simulator

Inspired by [pcol](http://www.heyzxz.me/pcol/). Immersive web snooker — **not** pro physics.

## Timeline

- **5 days (solo):** Playable SINGLE PLAY + PRACTISE, heuristic **AI-1**, no LLM
- **Hackathon:** LLM star via `ShotPlan` + DeepSeek

## Stack

React, Vite, three.js, cannon-es, Tailwind, Zustand, DeepSeek (hackathon only)

## Principles

- Immersion > realism; modular; lightweight assets; no over-engineering
- Coords: **blue spot = origin**, mm, 2D now — **extensible** for 2.5D
- AI picks tactics → **`ShotPlan` → `ShotExecutor`**; physics stays dumb

## Phases

1. Table, physics, pots, aim  
2. Rules, AI-1, spin/elevation, frame end stats  
3. WC scoreboard + English TTS (cumulative pots, breaks)  
4. JSON snapshots, P4 rules, last-shot replay  
5. LLM + star prompt  

## Do NOT Add (v1)

Multiplayer, VR, heavy models, pro physics, multi-frame/save, full replay timeline

## Docs

Details: `PRD.md`, `ARCHITECTURE.md`. UI ref: `ExampleImage/`.
