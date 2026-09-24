import * as THREE from 'three';
import type { LoadedAssets } from '../assets/manifest';
import { Atmosphere } from './Atmosphere';
import { CONFIG } from './config';
import { CornField } from './CornField';
import { Course } from './Course';
import { Effects } from './Effects';
import { Hud, type RunStats } from './Hud';
import { Input } from './Input';
import type { HitPart } from './logic';
import { cornCover, maxAlive, mulberry32, packFor, planCourse, runnerChance, spawnInterval, zombieSpeed } from './logic';
import { Player } from './Player';
import { Sfx } from './Sfx';
import { PICKUP_WEAPONS, WEAPONS, type WeaponId } from './weapons';
import { WheatField } from './WheatField';
import { World } from './World';
import { Zombie } from './Zombie';

/** Planned course length; far beyond any realistic run. */
const COURSE_LENGTH = 30000;

interface Offer {
  weapon: WeaponId;
  /** Real seconds left to decide. */
  left: number;
}

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
  private readonly corn: CornField;
  private readonly course: Course;
  private offer: Offer | null = null;
  private cover = 0;
  private rustleTimer = 0;
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
    this.corn = new CornField(this.scene, density);
    this.course = new Course(this.scene, assets, () => this.pickupWeapon());
    this.wheat.isCorn = (d) => this.course.corn.some((c) => d > c.start - 1 && d < c.end + 1);
    this.player = new Player(window.innerWidth / window.innerHeight, assets.weapons);
    this.scene.add(this.player.camera);
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas);

    this.input.bindSteerButton(this.hud.steerLeft, -1);
    this.input.bindSteerButton(this.hud.steerRight, 1);
    this.hud.startButton.addEventListener('click', () => this.begin());
    this.hud.retryButton.addEventListener('click', () => this.begin());
    this.hud.offerTake.addEventListener('click', () => this.input.choose('take'));
    this.hud.offerKeep.addEventListener('click', () => this.input.choose('keep'));
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
    this.hud.setWeapon(this.player.weapon);
    this.offer = null;
    this.hud.hideOffer();
    // A fresh layout of fences, corn and pickups every run.
    const plan = planCourse(mulberry32((Math.random() * 2 ** 32) >>> 0), COURSE_LENGTH);
    this.course.reset(plan);
    this.corn.reset(plan.corn);
    this.cover = 0;
    this.atmosphere.setCover(this.scene, 0);
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
    if (this.offer) {
      if (paused) this.hud.hideOffer();
      else this.hud.showOffer(WEAPONS[this.offer.weapon], this.player.weapon);
    }
    this.input.clearQueued();
    this.lastTime = performance.now();
  }

  /** A pickup weapon other than the one in hand. */
  private pickupWeapon(): WeaponId {
    const options = PICKUP_WEAPONS.filter((id) => id !== this.player.weapon.id);
    return options[Math.floor(Math.random() * options.length)];
  }

  private openOffer(weapon: WeaponId): void {
    this.offer = { weapon, left: CONFIG.pickups.decisionTime };
    this.input.clearQueued();
    this.hud.showOffer(WEAPONS[weapon], this.player.weapon);
    this.sfx.offer();
  }

  private closeOffer(take: boolean): void {
    if (!this.offer) return;
    if (take) {
      this.player.equip(WEAPONS[this.offer.weapon]);
      this.hud.setWeapon(this.player.weapon);
      this.sfx.swap();
    }
    this.offer = null;
    this.hud.hideOffer();
    this.input.clearQueued();
  }

  private spawnZombie(ahead?: number): void {
    const cfg = CONFIG.zombies;
    const distance = this.player.distance;
    if (this.zombies.filter((z) => z.alive).length >= maxAlive(distance)) return;
    const dist = ahead ?? cfg.spawnAheadMin + Math.random() * (cfg.spawnAheadMax - cfg.spawnAheadMin);
    const x = this.player.position.x + (Math.random() * 2 - 1) * cfg.spawnHalfWidth;
    const models = this.assets.zombies;
    const model = models.length > 0 ? models[Math.floor(Math.random() * models.length)] : undefined;
    const runner = Math.random() < runnerChance(distance);
    const speed = zombieSpeed(distance, Math.random(), runner);
    const zombie = new Zombie(x, this.player.position.z - dist, speed, model);
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

  private update(realDt: number): void {
    const { player, input } = this;
    let dt = realDt;
    // Choosing a weapon: the world crawls in slow motion until the player decides.
    if (this.offer) {
      this.offer.left -= realDt;
      this.hud.updateOffer(Math.max(0, this.offer.left / CONFIG.pickups.decisionTime));
      const choice = input.consumeChoice();
      if (choice) this.closeOffer(choice === 'take');
      else if (this.offer.left <= 0) this.closeOffer(false);
      else dt *= CONFIG.pickups.decisionTimeScale;
    }

    player.update(dt, input.steer);
    this.stats.distance = player.distance;
    this.world.update(player.position);
    this.corn.update(player.position);

    const event = this.course.update(dt, player.distance, player.position.x);
    if (event === 'vault' && !player.vaulting) {
      player.vault();
      this.sfx.vault();
    } else if (event === 'pickup' && !this.offer && this.course.pickup) {
      this.openOffer(this.course.pickup.weapon);
      this.course.consumePickup();
    }

    this.cover = cornCover(this.course.corn, player.distance);
    this.atmosphere.setCover(this.scene, this.cover);

    this.aimNdc.set(input.aim.x, input.aim.y);
    player.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.aimNdc, player.camera);
    player.aimAt(this.raycaster.ray.at(30, this.tmpA));

    if (this.offer) {
      input.consumeFire();
      input.consumeReload();
    } else {
      if (input.consumeReload() && player.startReload()) this.sfx.reload();
      const clicked = input.consumeFire();
      if (player.weapon.automatic ? clicked || input.fireHeld : clicked) this.tryFire(!clicked);
    }

    this.updateAudio(dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = spawnInterval(player.distance) * (0.6 + Math.random() * 0.8);
      this.spawnZombie();
      // Packs get more frequent and bigger the further the run goes.
      const pack = packFor(player.distance);
      if (Math.random() < pack.chance) for (let i = 0; i < pack.size; i++) this.spawnZombie();
    }

    let grabbed = false;
    const feet = this.tmpB.set(player.position.x, 0, player.position.z);
    const fence = this.course.activeFence;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      // Zombies clamber over the fence slowly too.
      const slow = fence !== null && Math.abs(z.position.z + fence) < 0.9 ? 0.3 : 1;
      if (z.update(dt, feet, slow)) grabbed = true;
      const behind = z.position.z > player.position.z + CONFIG.zombies.despawnBehind;
      const leftBehind = Math.abs(z.position.x - player.position.x) > CONFIG.zombies.despawnSide;
      if (z.state === 'dead' || behind || leftBehind) {
        this.scene.remove(z.root);
        this.zombies.splice(i, 1);
      }
    }

    this.effects.update(dt);
    const reloading = player.reloadLeft > 0 ? 1 - player.reloadLeft / player.weapon.reloadTime : null;
    this.hud.update(this.stats, player.ammo, reloading);

    if (grabbed) this.gameOver();
  }

  /** Footsteps, corn brushing past and zombie groans. */
  private updateAudio(dt: number): void {
    const { player, sfx } = this;
    sfx.setListener(player.camera.position);
    const inCorn = this.cover > 0.3;
    if (player.stepped && !player.vaulting) sfx.footstep(inCorn ? 'corn' : 'wheat');
    if (inCorn) {
      this.rustleTimer -= dt;
      if (this.rustleTimer <= 0) {
        // Pushing sideways through the rows drags more leaves across you.
        const steer = Math.abs(this.input.steer);
        sfx.rustle(0.6 + steer * 0.7);
        this.rustleTimer = (0.35 + Math.random() * 0.5) * (steer > 0 ? 0.5 : 1);
      }
    }

    for (const z of this.zombies) {
      if (!z.alive) continue;
      if (z.startedLunge) {
        sfx.groan(z.position, 'snarl');
        z.groanIn = 2 + Math.random() * 3;
        continue;
      }
      z.groanIn -= dt;
      if (z.groanIn > 0) continue;
      z.groanIn = 3 + Math.random() * 6;
      const dist = Math.hypot(z.position.x - player.position.x, z.position.z - player.position.z);
      if (dist < 45) sfx.groan(z.position);
    }
  }

  /** `held` = automatic fire from a held trigger (no dry-fire clicks). */
  private tryFire(held = false): void {
    const { player } = this;
    const weapon = player.weapon;
    if (!player.canFire()) {
      if (player.ammo === 0 && player.startReload()) this.sfx.reload();
      else if (player.reloadLeft > 0 && !held) this.sfx.click();
      return;
    }
    player.fire();
    this.sfx.shot(weapon.id);

    const targets = this.zombies.filter((z) => z.alive).flatMap((z) => z.hitMeshes);
    const muzzle = player.muzzleWorldPosition(this.tmpA);
    const origin = this.raycaster.ray.origin.clone();
    const aim = this.raycaster.ray.direction.clone();
    this.raycaster.far = weapon.range;
    let anyHit = false;

    for (let p = 0; p < weapon.pellets; p++) {
      const dir = this.tmpB.copy(aim);
      if (weapon.spread > 0) {
        // Random point in a cone around the aim.
        const r = weapon.spread * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        dir.x += Math.cos(a) * r;
        dir.y += Math.sin(a) * r;
        dir.z += (Math.random() - 0.5) * r;
        dir.normalize();
      }
      this.raycaster.set(origin, dir);
      const hits = this.raycaster.intersectObjects(targets, false);
      const struck = new Set<Zombie>();
      let end: THREE.Vector3 | null = null;
      for (const hit of hits) {
        const zombie = hit.object.userData.zombie as Zombie;
        if (struck.has(zombie) || !zombie.alive) continue;
        struck.add(zombie);
        const part = hit.object.userData.part as HitPart;
        const result = zombie.hit(part, hit.point, weapon.damage);
        this.effects.blood(hit.point, dir, result.killed ? 26 : 10);
        end = hit.point;
        anyHit = true;
        if (result.killed) {
          this.stats.kills += 1;
          if (part === 'head') this.stats.headshots += 1;
          if (Math.random() < 0.6) this.sfx.groan(zombie.position, 'death');
        }
        if (struck.size >= weapon.pierce) break;
      }
      // One tracer per shot is enough, even for the shotgun.
      if (p === 0) this.effects.shot(muzzle, end ?? this.raycaster.ray.at(weapon.range, new THREE.Vector3()));
    }
    // Restore the aim ray for the rest of the frame.
    this.raycaster.set(origin, aim);
    if (anyHit) this.sfx.hit();
    this.hud.pulseCrosshair(anyHit);

    if (player.ammo === 0 && player.startReload()) this.sfx.reload();
  }

  private gameOver(): void {
    this.state = 'over';
    this.offer = null;
    this.player.gunVisible = false;
    this.hud.gameOver(this.stats);
  }
}
