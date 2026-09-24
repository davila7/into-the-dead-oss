# Into the Dead OSS

An open-source, browser-based take on the *Into the Dead* formula, built with
[three.js](https://threejs.org/), Vite and TypeScript. You run forward through a foggy
field at night, zombies close in, and you steer and shoot to stay alive.

This is the first playable slice: all art is procedural placeholder geometry. Generated
assets (Higgsfield) plug in through [`src/assets/manifest.ts`](src/assets/manifest.ts).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # typecheck + production build into dist/
```

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
    Zombie.ts        primitive zombie: walk/lunge/death animation, hit boxes
    World.ts         endless recycled ground tiles and trees, fog, lights
    Effects.ts       pooled blood particles and bullet tracer
    Hud.ts / Input.ts / Sfx.ts
public/assets/       drop generated textures, sprites, audio and video here
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
