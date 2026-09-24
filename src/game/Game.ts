import * as THREE from 'three';
import type { LoadedAssets } from '../assets/manifest';
import { Atmosphere } from './Atmosphere';
import { CONFIG } from './config';
import { CornField } from './CornField';
import { Course } from './Course';
import { Effects } from './Effects';
import { Horrors } from './Horrors';
import { Hud, type RunStats } from './Hud';
import { Input } from './Input';
import { KillCam } from './KillCam';
import type { HitPart } from './logic';
import {
  cornCover,
  cricketLevel,
  levelAt,
  maxAlive,
  mulberry32,
  packFor,
  perkMilestone,
  planCourse,
  planHorrors,
  rollPerks,
  runnerChance,
  spawnInterval,
  zombieSpeed,
} from './logic';
import type { PerkId, PerkStacks } from './perks';
import { Player } from './Player';
import { Sfx } from './Sfx';
import { PICKUP_WEAPONS, WEAPONS, type WeaponId } from './weapons';
import { WeaponPreview } from './WeaponPreview';
import { WheatField } from './WheatField';
import { World } from './World';
import { type EnemyKind, type Shootable, Zombie } from './Zombie';
import { ModelBody, PrimitiveBody, QuadBody, type ZombieBody } from './ZombieBody';

/** Planned course length; far beyond any realistic run. */
const COURSE_LENGTH = 30000;

interface Offer {
  weapon: WeaponId;
  /** Real seconds left to decide. */
  left: number;
}

interface PerkOffer {
  choices: PerkId[];
  /** Real seconds left to pick. */
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
  private readonly horrors: Horrors;
  private level = -1;
  private offer: Offer | null = null;
  private readonly preview: WeaponPreview;
  /** Perks taken this run; Second Wind counts charges left. */
  private perks: PerkStacks = {};
  private perkOffer: PerkOffer | null = null;
  /** Index of the next perk milestone. */
  private perkIndex = 0;
  /** Seconds a Second Wind leaves the runner ungrabbable. */
  private grace = 0;
  private cover = 0;
  private rustleTimer = 0;
  private readonly atmosphere: Atmosphere;
  private readonly assets: LoadedAssets;
  private elapsed = 0;
  private readonly effects: Effects;
  private readonly input: Input;
  private readonly hud = new Hud();
  private readonly sfx = new Sfx();
  private readonly killCam = new KillCam();
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
    this.horrors = new Horrors(this.scene, assets);
    this.preview = new WeaponPreview(this.hud.offerPreview, assets);
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
    this.hud.onPerkPicked = (i) => this.input.pick(i);
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
    this.perks = {};
    this.perkOffer = null;
    this.perkIndex = 0;
    this.grace = 0;
    this.hud.hidePerks();
    this.hud.setPerkList(this.perks);
    // A fresh layout of fences, corn and pickups every run.
    const rand = mulberry32((Math.random() * 2 ** 32) >>> 0);
    const plan = planCourse(rand, COURSE_LENGTH);
    this.course.reset(plan);
    this.horrors.reset(planHorrors(rand, COURSE_LENGTH, [...plan.fences, ...plan.pickups.map((p) => p.at)]));
    this.level = -1;
    this.corn.reset(plan.corn);
    this.cover = 0;
    this.atmosphere.setCover(this.scene, 0);
    this.world.reset();
    this.wheat.reset();
    this.atmosphere.reset(this.player.position);
    this.effects.reset();
    this.stats.distance = this.stats.kills = this.stats.headshots = 0;
    this.killCam.reset();
    this.player.setZoom(0);
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
    if (this.perkOffer) {
      if (paused) this.hud.hidePerks();
      else this.hud.showPerks(this.perkOffer.choices, this.perks);
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
    this.preview.show(weapon);
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

  /** Reached a perk milestone: offer 1 of 3, or skip it quietly once everything is maxed out. */
  private openPerks(): void {
    this.perkIndex += 1;
    const choices = rollPerks(Math.random, this.perks);
    if (choices.length === 0) return;
    this.perkOffer = { choices, left: CONFIG.perks.decisionTime };
    this.input.clearQueued();
    this.hud.showPerks(choices, this.perks);
    this.sfx.offer();
  }

  private closePerks(pick: PerkId | null): void {
    if (pick) {
      this.perks[pick] = (this.perks[pick] ?? 0) + 1;
      this.player.setPerks(this.perks);
      this.hud.setWeapon(this.player.weapon);
      this.hud.setPerkList(this.perks);
      this.sfx.swap();
    }
    this.perkOffer = null;
    this.hud.hidePerks();
    this.input.clearQueued();
  }

  /** Spends a Second Wind charge: everything within reach drops and the runner gets a moment of grace. */
  private secondWind(): void {
    const { shoveRadius, graceTime } = CONFIG.perks;
    this.perks.secondWind = (this.perks.secondWind ?? 1) - 1;
    this.hud.setPerkList(this.perks);
    this.grace = graceTime;
    const p = this.player.position;
    const targets: Shootable[] = [...this.zombies.filter((z) => z.alive), ...this.horrors.targets];
    for (const t of targets) {
      const away = this.tmpA.set(t.position.x - p.x, 0, t.position.z - p.z);
      if (away.length() > shoveRadius) continue;
      const point = t.position.clone().setY(1.2);
      if (!t.hit('body', point, Infinity).killed) continue;
      this.stats.kills += 1;
      this.effects.blood(point, away.normalize(), 26);
      if (t instanceof Zombie) t.shove(away, 2);
    }
    this.sfx.swap();
    this.sfx.hit();
    this.hud.flashDamage();
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
    const body = (owner: Zombie) => (model ? new ModelBody(owner, model) : new PrimitiveBody(owner));
    this.addZombie(new Zombie(x, this.player.position.z - dist, speed, body));
  }

  /** A brute, the mutant or a pack of dogs, straight ahead and not capped by `maxAlive`. */
  private spawnSpecial(kind: EnemyKind, count: number): void {
    const h = CONFIG.horrors;
    const { position } = this.player;
    const x0 = position.x + (Math.random() * 2 - 1) * 6;
    const m = this.assets.horrors;
    for (let i = 0; i < count; i++) {
      let speed: number;
      let body: (owner: Zombie) => ZombieBody;
      if (kind === 'brute') {
        speed = h.brute.speed;
        body = (o) => (m.brute ? new ModelBody(o, m.brute) : new PrimitiveBody(o, { size: 1.35, girth: 1.6 }));
      } else if (kind === 'mutant') {
        speed = h.mutant.speed * (0.9 + Math.random() * 0.2);
        body = (o) => new QuadBody(o, 2.4, m.mutant, true);
      } else {
        speed = h.dogs.speed * (0.85 + Math.random() * 0.3);
        body = (o) => new QuadBody(o, 1.15, m.dog, false);
      }
      // Packs come in loosely strung out.
      const x = x0 + (count > 1 ? (Math.random() * 2 - 1) * 4 : 0);
      const z = position.z - h.spawnAhead - i * (2 + Math.random() * 3);
      this.addZombie(new Zombie(x, z, speed, body, kind));
    }
  }

  private addZombie(zombie: Zombie): void {
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
    this.sfx.crickets(this.state === 'playing' || this.state === 'paused' ? cricketLevel(this.nearestZombie()) : 1);
    this.hud.moveCrosshair(this.input.aim.x, this.input.aim.y);
    this.renderer.render(this.scene, this.player.camera);
    if (this.offer && this.state === 'playing') this.preview.render(dt);
  }

  private update(realDt: number): void {
    const { player, input } = this;
    let dt = realDt;
    this.killCam.update(realDt);
    // Choosing a perk or a weapon: the world crawls in slow motion until the player decides.
    // That slow motion takes over from any kill cam.
    if (this.perkOffer) {
      this.killCam.cancel();
      this.perkOffer.left -= realDt;
      this.hud.updatePerks(Math.max(0, this.perkOffer.left / CONFIG.perks.decisionTime));
      const pick = input.consumePick();
      const chosen = pick !== null ? this.perkOffer.choices[pick] : undefined;
      if (chosen) this.closePerks(chosen);
      else if (this.perkOffer.left <= 0) this.closePerks(null);
      else dt *= CONFIG.perks.decisionTimeScale;
    } else if (this.offer) {
      this.killCam.cancel();
      this.offer.left -= realDt;
      this.hud.updateOffer(Math.max(0, this.offer.left / CONFIG.pickups.decisionTime));
      const choice = input.consumeChoice();
      if (choice) this.closeOffer(choice === 'take');
      else if (this.offer.left <= 0) this.closeOffer(false);
      else dt *= CONFIG.pickups.decisionTimeScale;
    }
    if (!this.offer && !this.perkOffer) dt *= this.killCam.timeScale;
    player.setZoom(this.killCam.zoom);

    player.update(dt, input.steer);
    this.stats.distance = player.distance;
    this.world.update(player.position);
    this.corn.update(player.position);

    const event = this.course.update(dt, player.distance, player.position.x);
    if (event === 'vault' && !player.vaulting) {
      player.vault();
      this.sfx.vault();
    } else if (event === 'pickup' && !this.offer && !this.perkOffer && this.course.pickup) {
      this.openOffer(this.course.pickup.weapon);
      this.course.consumePickup();
    } else if (!this.offer && !this.perkOffer && player.distance >= perkMilestone(this.perkIndex)) {
      // A perk that comes due during a weapon offer waits for it to close.
      this.openPerks();
    }

    const level = levelAt(player.distance);
    if (level !== this.level) {
      this.level = level;
      this.hud.showLevel(level + 1, CONFIG.levels[level].name);
    }
    const horror = this.horrors.update(dt, player.distance, player.position);
    for (const s of horror.spawns) this.spawnSpecial(s.kind, s.count);
    for (const at of horror.screams) this.sfx.groan(at, 'snarl');

    this.cover = cornCover(this.course.corn, player.distance);
    this.atmosphere.setCover(this.scene, this.cover);

    this.aimNdc.set(input.aim.x, input.aim.y);
    player.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.aimNdc, player.camera);
    player.aimAt(this.raycaster.ray.at(30, this.tmpA));

    if (this.offer || this.perkOffer) {
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

    this.grace = Math.max(0, this.grace - dt);
    if ((grabbed || horror.grabbed) && this.grace <= 0) {
      if ((this.perks.secondWind ?? 0) > 0) this.secondWind();
      else this.gameOver();
    }
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
        this.voice(z, 'snarl');
        z.groanIn = 2 + Math.random() * 3;
        continue;
      }
      z.groanIn -= dt;
      if (z.groanIn > 0) continue;
      z.groanIn = 3 + Math.random() * 6;
      const dist = Math.hypot(z.position.x - player.position.x, z.position.z - player.position.z);
      if (dist < 45) this.voice(z, 'idle');
    }
  }

  private voice(z: Zombie, kind: 'idle' | 'snarl' | 'death'): void {
    if (z.kind === 'dog') this.sfx.bark(z.position, kind);
    else if (z.kind === 'brute') this.sfx.bellow(z.position, kind);
    else this.sfx.groan(z.position, kind);
  }

  /** Distance to the closest living zombie (for the crickets going quiet). */
  private nearestZombie(): number {
    const p = this.player.position;
    let nearest = Infinity;
    for (const z of this.zombies) {
      if (z.alive) nearest = Math.min(nearest, Math.hypot(z.position.x - p.x, z.position.z - p.z));
    }
    return nearest;
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

    const shootables: Shootable[] = [...this.zombies.filter((z) => z.alive), ...this.horrors.targets];
    const targets = shootables.flatMap((z) => z.hitMeshes);
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
      const struck = new Set<Shootable>();
      let end: THREE.Vector3 | null = null;
      for (const hit of hits) {
        const zombie = hit.object.userData.zombie as Shootable;
        if (struck.has(zombie) || !zombie.alive) continue;
        struck.add(zombie);
        const part = hit.object.userData.part as HitPart;
        const result = zombie.hit(part, hit.point, weapon.damage);
        this.effects.blood(hit.point, dir, result.killed ? 26 : result.crippled ? 20 : 10);
        if (zombie instanceof Zombie) zombie.shove(dir, weapon.recoil);
        end = hit.point;
        anyHit = true;
        if (result.killed) {
          this.stats.kills += 1;
          if (part === 'head') this.stats.headshots += 1;
          this.killCam.kill(part === 'head');
          if (Math.random() < 0.6) {
            if (zombie instanceof Zombie) this.voice(zombie, 'death');
            else this.sfx.groan(zombie.position, 'death');
          }
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
    this.killCam.cancel();
    this.player.setZoom(0);
    this.offer = null;
    this.perkOffer = null;
    this.player.gunVisible = false;
    this.hud.gameOver(this.stats);
  }
}
