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
| Take / keep a found weapon | `E` / `Q` | On-screen buttons |
| Pause  | `P` / `Esc`              |                       |

Headshots kill instantly; body shots take two hits. A zombie that reaches you ends the run.

As the run goes on the course throws in:

- **Weapons** lying off the running line under a faint beam: a pump shotgun, a lever rifle
  (one-shot body kills that pierce) and an SMG (hold to fire). Touch one and time slows while
  you choose to take it (dropping your gun) or keep what you have.
- **Broken fences** across the whole field. You vault them automatically, but it slows you
  down while the dead keep coming.
- **Corn**: tall, black, blighted stretches where the fog closes in and you mostly hear the
  zombies before you see them.

Sound is synthesized with Web Audio: positional zombie groans and snarls, footsteps in the
wheat, corn leaves dragging past, weapon swaps and shots, fence creaks.

## Layout

```
src/
  main.ts            bootstrap
  assets/manifest.ts optional texture slots for generated art, with placeholder fallback
  game/
    config.ts        all gameplay tunables (speeds, spawn rates, ammo, fog)
    logic.ts         pure, unit-tested rules (hits, difficulty curves, movement)
    Game.ts          state machine, main loop, spawning, shooting
    Player.ts        first-person runner camera, viewmodels, fence vault
    weapons.ts       weapon stats (pistol, shotgun, rifle, SMG)
    Course.ts        fences and weapon pickups placed from the course plan
    CornField.ts     instanced black corn over the planned corn stretches
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
- More obstacles (cars) and ammo pickups
- A companion dog
- Mobile-first controls and polish
