import * as THREE from 'three';
import type { LoadedAssets } from '../assets/manifest';
import { Atmosphere } from './Atmosphere';
import { CONFIG } from './config';
import { Effects } from './Effects';
import { Hud, type RunStats } from './Hud';
import { Input } from './Input';
import type { HitPart } from './logic';
import { spawnInterval } from './logic';
import { Player } from './Player';
import { Sfx } from './Sfx';
import { WheatField } from './WheatField';
import { World } from './World';
import { Zombie } from './Zombie';

type GameState = 'menu' | 'playing' | 'paused' | 'over';

const MAX_DT = 1 / 20;

/** `?quality=low|high` scales wheat, mist and chaff counts. */
function qualityDensity(): number {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low') return 0.45;
  if (q === 'high') return 1.6;
  // Phones and tablets get a lighter field by default.
  return window.matchMedia('(pointer: coarse)').matches ? 0.5 : 1;
}

export class Game {
  state: GameState = 'menu';
  readonly stats: RunStats = { distance: 0, kills: 0, headshots: 0 };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly player: Player;
  private readonly world: World;
  private readonly wheat: WheatField;
  private readonly atmosphere: Atmosphere;
  private readonly assets: LoadedAssets;
  private elapsed = 0;
  private readonly effects: Effects;
  private readonly input: Input;
  private readonly hud = new Hud();
  private readonly sfx = new Sfx();
  private readonly raycaster = new THREE.Raycaster();
  readonly zombies: Zombie[] = [];
  private spawnTimer = 0;
  private lastTime = performance.now();

  // Scratch objects reused every frame.
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly aimNdc = new THREE.Vector2();

  constructor(canvas: HTMLCanvasElement, assets: LoadedAssets) {
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    const density = qualityDensity();
    this.atmosphere = new Atmosphere(this.scene, density);
    this.world = new World(this.scene, assets);
    this.wheat = new WheatField(this.scene, density);
    this.player = new Player(window.innerWidth / window.innerHeight, assets.weapon);
    this.scene.add(this.player.camera);
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas);
    this.raycaster.far = CONFIG.gun.range;

    this.input.bindSteerButton(this.hud.steerLeft, -1);
    this.input.bindSteerButton(this.hud.steerRight, 1);
    this.hud.startButton.addEventListener('click', () => this.begin());
    this.hud.retryButton.addEventListener('click', () => this.begin());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.setPaused(true);
    });

    this.reset();
    this.hud.show('menu');
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private reset(): void {
    for (const z of this.zombies) this.scene.remove(z.root);
    this.zombies.length = 0;
    this.player.reset();
    this.world.reset();
    this.wheat.reset();
    this.atmosphere.reset(this.player.position);
    this.effects.reset();
    this.stats.distance = this.stats.kills = this.stats.headshots = 0;
    this.spawnTimer = 0;
    // A few zombies already shambling in the fog so the first seconds aren't empty.
    for (let i = 0; i < 5; i++) this.spawnZombie(32 + i * 8);
    this.hud.clearDamage();
    this.hud.update(this.stats, this.player.ammo, null);
  }

  private begin(): void {
    this.sfx.unlock();
    this.reset();
    this.input.clearQueued();
    this.state = 'playing';
    this.hud.show(null);
    this.lastTime = performance.now();
  }

  private setPaused(paused: boolean): void {
    this.state = paused ? 'paused' : 'playing';
    this.hud.show(paused ? 'paused' : null);
    this.input.clearQueued();
    this.lastTime = performance.now();
  }

  private spawnZombie(ahead?: number): void {
    const cfg = CONFIG.zombies;
    if (this.zombies.filter((z) => z.alive).length >= cfg.maxAlive) return;
    const dist = ahead ?? cfg.spawnAheadMin + Math.random() * (cfg.spawnAheadMax - cfg.spawnAheadMin);
    const x = (Math.random() * 2 - 1) * cfg.spawnHalfWidth;
    const models = this.assets.zombies;
    const model = models.length > 0 ? models[Math.floor(Math.random() * models.length)] : undefined;
    const zombie = new Zombie(x, this.player.position.z - dist, model);
    this.zombies.push(zombie);
    this.scene.add(zombie.root);
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, MAX_DT);
    this.lastTime = now;

    if (this.state === 'playing') {
      if (this.input.consumePause()) this.setPaused(true);
      else this.update(dt);
    } else if (this.state === 'paused' && this.input.consumePause()) {
      this.setPaused(false);
    }

    // Wind, mist and sky keep moving on the menu and pause screens too.
    this.elapsed += dt;
    this.wheat.update(this.elapsed, this.player.position);
    this.atmosphere.update(dt, this.elapsed, this.player.position);
    this.hud.moveCrosshair(this.input.aim.x, this.input.aim.y);
    this.renderer.render(this.scene, this.player.camera);
  }

  private update(dt: number): void {
    const { player, input } = this;
    player.update(dt, input.steer);
    this.stats.distance = player.distance;
    this.world.update(player.position);

    this.aimNdc.set(input.aim.x, input.aim.y);
    player.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.aimNdc, player.camera);
    player.aimAt(this.raycaster.ray.at(30, this.tmpA));

    if (input.consumeReload() && player.startReload()) this.sfx.reload();
    if (input.consumeFire()) this.tryFire();

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = spawnInterval(player.distance) * (0.6 + Math.random() * 0.8);
      this.spawnZombie();
      // Occasional small pack.
      if (Math.random() < 0.15) for (let i = 0; i < 2; i++) this.spawnZombie();
    }

    let grabbed = false;
    const feet = this.tmpB.set(player.position.x, 0, player.position.z);
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.update(dt, feet)) grabbed = true;
      if (z.state === 'dead' || z.position.z > player.position.z + CONFIG.zombies.despawnBehind) {
        this.scene.remove(z.root);
        this.zombies.splice(i, 1);
      }
    }

    this.effects.update(dt);
    const reloading = player.reloadLeft > 0 ? 1 - player.reloadLeft / CONFIG.gun.reloadTime : null;
    this.hud.update(this.stats, player.ammo, reloading);

    if (grabbed) this.gameOver();
  }

  private tryFire(): void {
    const { player } = this;
    if (!player.canFire()) {
      if (player.ammo === 0 && player.startReload()) this.sfx.reload();
      else if (player.reloadLeft > 0) this.sfx.click();
      return;
    }
    player.fire();
    this.sfx.shot();

    const targets = this.zombies.filter((z) => z.alive).flatMap((z) => z.hitMeshes);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    const muzzle = player.muzzleWorldPosition(this.tmpA);

    if (hit) {
      const zombie = hit.object.userData.zombie as Zombie;
      const part = hit.object.userData.part as HitPart;
      const result = zombie.hit(part, hit.point);
      this.effects.blood(hit.point, this.raycaster.ray.direction, result.killed ? 26 : 10);
      this.effects.shot(muzzle, hit.point);
      this.sfx.hit();
      if (result.killed) {
        this.stats.kills += 1;
        if (part === 'head') this.stats.headshots += 1;
      }
    } else {
      this.effects.shot(muzzle, this.raycaster.ray.at(CONFIG.gun.range, this.tmpB));
    }
    this.hud.pulseCrosshair(Boolean(hit));

    if (player.ammo === 0 && player.startReload()) this.sfx.reload();
  }

  private gameOver(): void {
    this.state = 'over';
    this.player.gunVisible = false;
    this.hud.gameOver(this.stats);
  }
}
