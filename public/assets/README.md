# Generated assets

Put generated art here (for example, Higgsfield image/video output) and reference it
from `src/assets/manifest.ts`. Anything left unset uses the procedural placeholders.

| Folder      | Used for                                           |
| ----------- | -------------------------------------------------- |
| `models/`   | Zombies (rigged, in-place walk clip), trees, scarecrow (`.glb`) |
| `textures/` | Ground, sky panorama (`.jpg`, `.png`)              |
| `sprites/`  | HUD icons, blood decals, muzzle flash              |
| `audio/`    | Gunshots, groans, ambience                         |
| `video/`    | Intro / game-over cinematics                       |

Models generated with Higgsfield are recorded in `art/higgsfield-assets.json` (job ids,
prompts, source URLs). `npm run assets:fetch` downloads them here and shrinks their
textures to 1024px WebP.
