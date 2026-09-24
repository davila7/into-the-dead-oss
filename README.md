# Into the Dead OSS

An open-source, browser-based take on the *Into the Dead* formula, built with
[three.js](https://threejs.org/), Vite and TypeScript. You run through a dark Midwest
wheat field at night, zombies close in through the mist, and you steer and shoot to
stay alive.

The wheat, wind, mist, sky and farm silhouettes are procedural. Zombies, trees and the
scarecrow are generated with Higgsfield (image → rigged 3D GLB) and plug in through
[`src/assets/manifest.ts`](src/assets/manifest.ts); anything missing falls back to
placeholder geometry.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # typecheck + production build into dist/
npm run assets:fetch   # download + optimise the generated models (see art/)
```

Add `?quality=low` or `?quality=high` to the URL to change wheat, mist and chaff
density. Touch devices default to low.

## Controls

| Action | Keyboard / mouse         | Touch                 |
| ------ | ------------------------ | --------------------- |
| Steer  | `A` `D` or `←` `→`       | On-screen ◀ ▶ buttons |
| Shoot  | Click, or `Space` at the crosshair | Tap the zombie |
| Reload | `R` (auto when empty)    | Automatic             |
| Pause  | `P` / `Esc`              |                       |

Headshots kill instantly; body shots take two hits. A zombie that reaches you ends the run.

## Layout

```
src/
  main.ts            bootstrap
  assets/manifest.ts optional texture slots for generated art, with placeholder fallback
  game/
    config.ts        all gameplay tunables (speeds, spawn rates, ammo, fog)
    logic.ts         pure, unit-tested rules (hits, difficulty curves, movement)
    Game.ts          state machine, main loop, spawning, shooting
    Player.ts        first-person runner camera and pistol
    Zombie.ts        zombie movement, lunge, health and death fall
    World.ts         ground, dead trees and scarecrows recycled ahead of the player
    WheatField.ts    instanced wheat tiles with a wind + parting vertex shader
    Atmosphere.ts    sky, moon, stars, farm silhouettes, ground mist, blowing chaff
    ZombieBody.ts    zombie visuals: generated rigged GLB or primitive placeholder
    Effects.ts       pooled blood particles and bullet tracer
    Hud.ts / Input.ts / Sfx.ts
public/assets/       generated models, textures, sprites, audio and video
art/                 record of generated assets (prompts, Higgsfield job ids)
scripts/             asset download/optimisation
```

## Adding generated assets

1. Save the file under `public/assets/<kind>/`, e.g. `public/assets/textures/ground.jpg`.
2. Point the slot at it in `src/assets/manifest.ts`:
   ```ts
   ground: { url: '/assets/textures/ground.jpg', repeat: 8 },
   ```
3. Missing or broken files fall back to the procedural placeholder, so the game always runs.

## Roadmap

- Replace primitive zombies with generated models/textures
- Obstacles (fences, cars) and pickups (ammo, weapons)
- More weapons and a companion dog
- Mobile-first controls and polish
