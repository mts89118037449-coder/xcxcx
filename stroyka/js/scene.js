// 3D-сцена: две 16-этажные секции (по проектному виду: башни со светлым фасадом,
// вертикальными простенками, медным верхом и остеклённым первым этажом) в парке.
// Режим «Прогресс»: этажи заливаются зелёным фасадом как прогресс-бар.
// Режим «Проект»: здание целиком в проектной отделке.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SECTIONS, FLOORS, ROOF, TOP, T, floorName } from './data.js';

// Размеры в метрах (башня-секция с почти квадратным планом)
const L = 24;        // ширина фасада (вдоль X)
const D = 20;        // глубина
const H = 3.0;       // высота этажа
const SLAB = 0.22;   // толщина плиты
const COL = 0.5;     // сечение колонны
const MOD = 3.0;     // шаг оконного модуля по фасаду
const ROOF_H = 1.6;  // парапет кровли

// Положение секций — «шахматкой», как на проектных видах
// Раскладка секций по их числу в таблице: в ряд через 42 м, со сдвигом «ёлочкой» (для 2 секций — как на ГП)
const SECTION_POS = {};
let SPAN = 90;   // ширина двора
function layout() {
  const n = SECTIONS.length;
  SECTIONS.forEach((s, i) => { SECTION_POS[s] = [(i - (n - 1) / 2) * 42, 0, i % 2 ? -5 : 5]; });
  SPAN = n * 42 + 6;
}
const HK = () => ROOF / 17;   // масштаб по высоте относительно 16-этажного корпуса
const LAST = () => SECTIONS[SECTIONS.length - 1];

const C = {
  concrete: 0xbdb9b0,
  concreteDark: 0x8f8b83,
  shell: 0xdedbd3,
  hover: 0xf2b134,
  select: 0x1f6feb,
  red: 0xd64545,
  crane: 0xe8b100,
  copper: 0xa4643c,
};

// Палитры фасада: стена, простенок-пилон, стекло, рама
const PAL = {
  progress: { wall: '#2f9e5a', pier: '#3fb46c', glass: '#1d3a2e', glass2: '#2c5544', frame: '#d9efe1' },
  full:     { wall: '#1d7a43', pier: '#27904f', glass: '#13281f', glass2: '#1f4434', frame: '#cfe7d8' },
  project:  { wall: '#e7ddcd', pier: '#f3ede3', glass: '#2e3a46', glass2: '#4a5a69', frame: '#f7f3ec' },
  copper:   { wall: '#a4643c', pier: '#b97546', glass: '#2e3a46', glass2: '#4a5a69', frame: '#e6c7a8' },
  lobby:    { wall: '#3a3f44', pier: '#4b5157', glass: '#56677a', glass2: '#8fa2b5', frame: '#c9ced3' },
};

export class BuildingScene {
  constructor(container, store) {
    layout();
    this.container = container;
    this.store = store;
    this.metric = 'avg';
    this.view = 'fact'; // fact (готовое — как в проекте, остальное каркас) | progress (зелёная заливка) | project
    this.floors = new Map();
    this.hovered = null;
    this.selected = null;
    this.onSelect = () => {};

    const w = container.clientWidth, h = container.clientHeight;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(w, h);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    this.pmrem = new THREE.PMREMGenerator(r);
    this.mobile = matchMedia('(max-width: 900px)').matches;
    // физическое небо: фон + отражения в стёклах
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    scene.add(this.sky);

    this.camera = new THREE.PerspectiveCamera(35, w / h, 1, 6000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 450;
    this.resetView();

    // Тёплое «вечернее» солнце, как на рендерах, + небесная подсветка
    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x6f8a55, 0.9);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffe6c4, 2.0));
    sun.position.set(-110, 95, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -60, near: 10, far: 500 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    this.tex = {};
    for (const k of Object.keys(PAL)) this.tex[k] = makeFacadeTextures(PAL[k], k === 'lobby');

    // сезон по реальной дате: в Мурманске снег с октября по апрель
    const mon = new Date().getMonth();
    this.winter = mon >= 9 || mon <= 3;
    this.timeMode = 'now';
    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0);
    this.moon.position.set(60, 140, -120);
    scene.add(this.moon);

    this.buildLandscape();
    this.buildSections();
    this.buildCrane();
    this.buildNight();
    this.buildSiteDetails();
    this.setupComposer();
    let hq = !this.mobile; try { const v = localStorage.getItem('stroyka.hq'); if (v != null) hq = v === '1'; } catch { /* */ }
    this.hq = hq;
    this.setTheme();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    container.appendChild(this.tooltip);
    this.bindPointer();

    new ResizeObserver(() => this.resize()).observe(container);
    this.update();
    this.loop();
  }

  isDark() {
    const t = document.documentElement.dataset.theme;
    return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  }

  setTheme() { this.setTime(this.timeMode); }

  /** 'now' — реальное положение солнца в Мурманске; 'day' — светлый зимний день */
  setTime(mode) {
    this.timeMode = mode;
    let alt, az;
    if (mode === 'day') { alt = 14; az = 200; }
    else ({ alt, az } = sunPosition(new Date(), 68.97, 33.07));
    this.applySun(alt, az);
  }

  applySun(alt, az) {
    const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const day = sstep(-7, 5, alt);              // 0 — ночь, 1 — день
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.2; u.rayleigh.value = 1.4 + 1.6 * (1 - day);
    u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(alt, -14)), Math.PI - THREE.MathUtils.degToRad(az));
    u.sunPosition.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(160);
    this.sun.intensity = 2.4 * sstep(-1, 8, alt);
    this.sun.color.set(alt < 8 ? 0xffc08a : 0xfff1df);
    this.moon.intensity = 0.55 * (1 - day);
    this.hemi.color.set(day > 0.5 ? 0xdfeaff : 0x5d6f9a);
    this.hemi.groundColor.set(this.winter ? (day > 0.5 ? 0xd9e2ea : 0x3a4560) : 0x6f8a55);
    this.hemi.intensity = 0.25 + 0.6 * day;
    this.renderer.toneMappingExposure = 0.55 + 0.55 * (1 - day);
    const envScene = new THREE.Scene();
    const skyCopy = new Sky(); skyCopy.scale.setScalar(4000); skyCopy.material.uniforms = THREE.UniformsUtils.clone(u);
    envScene.add(skyCopy);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 5000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.35 + 0.55 * day;
    this.scene.background = null;
    const fog = new THREE.Color(0x0e1830).lerp(new THREE.Color(this.winter ? 0xd0dbe6 : 0xb9cde0), day);
    this.scene.fog = new THREE.Fog(fog, 380, 1600);
    // ночное освещение стройки
    const night = 1 - day;
    for (const l of this.floodLights || []) l.intensity = 260 * sstep(0.25, 0.8, night);
    for (const l of this.streetLights || []) l.intensity = 60 * sstep(0.25, 0.8, night);
    for (const m of this.lampHeads || []) m.material.emissiveIntensity = 3 * sstep(0.25, 0.8, night);
    if (this.stars) this.stars.material.opacity = sstep(0.4, 1, night);
    this.dayFactor = day;
    if (this.bloom) { this.bloom.strength = 0.18 + 0.7 * (1 - day); this.bloom.threshold = day > 0.5 ? 0.92 : 0.7; }
    if (this.floors && this.floors.size) this.updateWindows();
    const dt0 = new Date(), md = (dt0.getMonth() + 1) * 100 + dt0.getDate();
    const polar = md >= 1202 || md <= 111;                 // полярная ночь в Мурманске ≈ 2 декабря — 11 января
    const t = this.timeMode === 'day' ? 'Показан светлый день'
      : alt < -6 ? `Сейчас в Мурманске темно${polar ? ' — полярная ночь' : ''}, горят прожекторы`
      : alt < 0 ? 'Сейчас в Мурманске сумерки' : alt < 6 ? 'Сейчас в Мурманске солнце у горизонта' : 'Сейчас в Мурманске день';
    this.sunInfo = { alt, az, text: `${t}. Солнце ${alt >= 0 ? '+' : ''}${alt.toFixed(1)}° над горизонтом.` };
  }

  /** Постобработка: мягкие тени в углах (GTAO) и свечение огней (bloom) */
  setupComposer() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    const c = (this.composer = new EffectComposer(this.renderer));
    c.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, w, h);
    this.gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.6, thickness: 2.5, scale: 1.6, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.gtao.blendIntensity = 0.85;
    c.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 0.86);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
  }
  setQuality(hq) { this.hq = hq; try { localStorage.setItem('stroyka.hq', hq ? '1' : '0'); } catch { /* */ } }

  /** Подробности стройплощадки: строительная сетка на этажах в работе, мачтовый подъёмник */
  /** Перегородки внутри этажей: стенки из газоблока растут слева направо по проценту «Перегородок» */
  buildInterior() {
    const tex = makeBlockTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(1, H - SLAB - 0.05, 0.2);
    for (const s of SECTIONS) {
      const sec = this[`pil${s}`].parent;
      const items = [];
      for (let f = 0; f < ROOF; f++) {
        const segs = [];
        for (let k = 0; k < 4; k++) for (const zs of [1, -1]) segs.push({ x: -L / 2 + 0.6 + (k + 0.5) * ((L - 1.2) / 4), z: zs * 1.3, len: (L - 1.2) / 4 - 0.1, rot: 0 });  // стены коридора
        for (let k = 1; k < 8; k++) for (const zs of [1, -1]) segs.push({ x: -L / 2 + k * 3, z: zs * (1.3 + (D / 2 - 0.6 - 1.3) / 2), len: D / 2 - 0.6 - 1.3, rot: Math.PI / 2 });  // межквартирные
        segs.sort((a, b) => a.x - b.x);
        segs.forEach((g, i) => items.push({ f, i, n: segs.length, ...g }));
      }
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.items = items;
      sec.add(mesh);
      this[`int${s}`] = mesh;
    }
  }

  updateInterior() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const s of SECTIONS) {
      const mesh = this[`int${s}`]; if (!mesh) continue;
      mesh.userData.items.forEach((it, i) => {
        const o = this.floors.get(`${s}|${it.f}`);
        const on = this.view === 'fact' && (it.i + 0.5) / it.n <= (o.pPart || 0);
        q.setFromAxisAngle(up, it.rot);
        m4.compose(new THREE.Vector3(it.x, it.f * H + SLAB + (H - SLAB) / 2, it.z), q, on ? new THREE.Vector3(it.len, 1, 1) : new THREE.Vector3(0, 0, 0));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  buildSiteDetails() {
    this.buildInterior();
    const netTex = makeNetTexture();
    for (const o of this.floors.values()) {
      if (o.isRoof) continue;
      const nets = [];
      for (const zs of [1, -1]) {
        const t = netTex.clone(); t.needsUpdate = true;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, H - SLAB - 0.05), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false }));
        m.geometry.translate(0.5, 0, 0);
        m.position.set(0, SLAB + (H - SLAB) / 2, zs * (D / 2 + 0.45));
        m.visible = false;
        o.group.add(m); nets.push(m);
      }
      o.nets = nets;
    }
    // мачтовый подъёмник у секции 4
    const mast = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a939c, roughness: 0.5, metalness: 0.6 });
    const hgt = ROOF * H + 4;
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, hgt, 0.9), steel); m1.position.y = hgt / 2; m1.castShadow = true; mast.add(m1);
    const lat = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, hgt, 0.9, 1, Math.round(hgt / 1.5), 1)), new THREE.LineBasicMaterial({ color: 0x3f464d }));
    lat.position.y = hgt / 2; mast.add(lat);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 1.6), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.3 }));
    cage.position.set(0, 9 * H + 1.2, 1.3); cage.castShadow = true; mast.add(cage);
    this.hoistCage = cage;
    { const [mx, , mz] = SECTION_POS[SECTIONS[0]]; mast.position.set(mx + 6, 0, mz + D / 2 + 1.8); }
    this.scene.add(mast);
  }

  /** Прожекторы стройплощадки, фонари вдоль дороги, звёзды, падающий снег */
  buildNight() {
    const s = this.scene;
    this.floodLights = []; this.lampHeads = []; this.streetLights = [];
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6, metalness: 0.5 });
    const headMat = () => new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a8, emissiveIntensity: 0, roughness: 0.3 });
    for (const [x, z] of [[-44, 27], [44, 27], [-44, -27], [44, -27]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 16, 8), mastMat);
      mast.position.set(x, 8, z); mast.castShadow = true; s.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.5), headMat());
      head.position.set(x * 0.97, 16.2, z * 0.97); head.lookAt(0, 20, 0); s.add(head); this.lampHeads.push(head);
      const l = new THREE.SpotLight(0xffe7c2, 0, 160, Math.PI / 5, 0.55, 1.3);
      l.position.set(x, 16, z); l.target.position.set(x * 0.25, 14, z * 0.2);
      s.add(l, l.target); this.floodLights.push(l);
    }
    for (let i = -3; i <= 3; i++) {
      const x = i * 26;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 6), mastMat);
      pole.position.set(x, 3.5, 41.5); s.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), headMat());
      head.position.set(x, 7.1, 41); s.add(head); this.lampHeads.push(head);
      if (Math.abs(i) <= 2 && i % 2 === 0) { const pl = new THREE.PointLight(0xffd59a, 0, 40, 1.6); pl.position.set(x, 6.8, 40.5); s.add(pl); this.streetLights.push(pl); }
    }
    // огонь на кране
    if (this.crane) {
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 0 }));
      red.position.set(0, ROOF * H + 16 + 7.6, 0); this.crane.add(red); this.lampHeads.push(red);
    }
    // звёзды
    const N = 1600, pos = new Float32Array(N * 3), rnd = mulberry32(11);
    for (let i = 0; i < N; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.92 + 0.08);
      pos.set([Math.sin(ph) * Math.cos(th) * 2600, Math.cos(ph) * 2600, Math.sin(ph) * Math.sin(th) * 2600], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    s.add(this.stars);
    // падающий снег зимой
    if (this.winter) {
      const M = this.mobile ? 1500 : 3500, sp = new Float32Array(M * 3);
      for (let i = 0; i < M; i++) sp.set([(rnd() - 0.5) * 220, rnd() * 90, (rnd() - 0.5) * 180], i * 3);
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.snow = new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
      s.add(this.snow);
    }
  }

  /** На узких (портретных) экранах камера отходит дальше, чтобы обе секции влезли */
  fit() { const a = this.camera.aspect || 1.6; return Math.max(1, Math.min(2.6, 1.3 / a)) * Math.max(1, SPAN / 90, HK() * 0.9); }

  resetView(animate = false) {
    const k = this.fit();
    const hc = 24 * HK();
    const pos = new THREE.Vector3(-48 * k, hc + 22 * k, 158 * k), tg = new THREE.Vector3(0, hc, 0);
    if (this.selBox) this.selBox.visible = false;
    if (animate) return this.flyTo(pos, tg);
    this.camera.position.copy(pos);
    this.controls.target.copy(tg);
    this.controls.update();
  }

  /** Плавный перелёт камеры к точке (около 0,9 с) */
  flyTo(pos, target, ms = 900) {
    this.camAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
  }

  /** Взять этаж в фокус: камера подлетает к этажу спереди, этаж обводится рамкой */
  focusFloor(section, floor) {
    const sec = this.floors.get(`${section}|${floor}`).group.parent;
    const tg = new THREE.Vector3(sec.position.x, floor * H + H / 2, sec.position.z);
    // сохраняем текущее направление взгляда по горизонтали, но смотрим чуть сверху и ближе
    const dir = this.camera.position.clone().sub(this.controls.target); dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(-0.3, 0, 1);
    dir.normalize();
    const dist = 42 * this.fit();
    const pos = tg.clone().addScaledVector(dir, dist); pos.y = tg.y + dist * 0.28;
    this.flyTo(pos, tg);
    this.showSelBox(section, floor);
  }
  /** Взять в фокус секцию целиком */
  focusSection(section) {
    const sec = this.floors.get(`${section}|0`).group.parent;
    const tg = new THREE.Vector3(sec.position.x, 24 * HK(), sec.position.z);
    const dir = this.camera.position.clone().sub(this.controls.target); dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(-0.3, 0, 1);
    dir.normalize();
    const dist = 100 * this.fit();
    const pos = tg.clone().addScaledVector(dir, dist); pos.y = 24 * HK() + dist * 0.3;
    this.flyTo(pos, tg);
    if (this.selBox) this.selBox.visible = false;
  }
  showSelBox(section, floor) {
    if (!this.selBox) {
      this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L + 1.4, H + 0.2, D + 1.4)), new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.95, depthTest: false }));
      this.selBox.renderOrder = 10;
      this.scene.add(this.selBox);
    }
    const sec = this.floors.get(`${section}|${floor}`).group.parent;
    this.selBox.position.set(sec.position.x, floor * H + H / 2, sec.position.z);
    this.selBox.visible = true;
  }

  // ------------------------------------------------------------ окружение
  buildLandscape() {
    const s = this.scene;
    const grass = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.winter ? makeSnowTexture() : makeGrassTexture(), roughness: this.winter ? 0.75 : 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    s.add(grass);

    const flat = (w, d, color, x, z, y = 0.03, rot = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    // двор и мощение вокруг башен
    flat(SPAN, 58, this.winter ? 0xdfe4ea : 0xc9c3b6, 0, 0, 0.02);
    for (const sec of SECTIONS) { const [x, , z] = SECTION_POS[sec]; flat(L + 8, D + 8, 0xb5aea1, x, z, 0.04); }
    // забор стройплощадки (профлист) — виден, пока идёт стройка
    this.fence = new THREE.Group();
    const fenceTex = makeFenceTexture();
    const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.6, metalness: 0.3 });
    const seg = (w, x, z, rot) => {
      const t = fenceTex.clone(); t.needsUpdate = true; t.repeat.set(w / 4, 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, 0.08), fenceMat.clone());
      m.material.map = t; m.position.set(x, 1.1, z); m.rotation.y = rot || 0; m.castShadow = true; m.receiveShadow = true;
      this.fence.add(m);
    };
    const fw = SPAN + 2, half = fw / 2, side = (fw - 16) / 2;
    seg(fw, 0, -29); seg(58, -half, 0, Math.PI / 2); seg(58, half, 0, Math.PI / 2);
    seg(side, -(8 + side / 2), 29); seg(side, 8 + side / 2, 29);           // спереди — въезд посередине
    s.add(this.fence);
    // газоны во дворе
    flat(18, 14, this.winter ? 0xf1f4f8 : 0x86a862, -18, -16, 0.05);
    flat(18, 14, this.winter ? 0xf1f4f8 : 0x86a862, 18, 16, 0.05);
    // дорога и парковка вдоль фасада
    flat(260, 9, 0x4c4f52, 0, 36, 0.03);
    flat(90, 7, 0x6b6e71, 0, 28.5, 0.035);
    for (let i = -6; i <= 6; i++) flat(0.18, 5, 0xf0f0f0, i * 6.5, 28.5, 0.045);
    // разметка дороги
    for (let i = -20; i <= 20; i++) flat(3, 0.25, 0xe9e5d8, i * 6.5, 36, 0.04);

    // машины на парковке
    const carGeo = new THREE.BoxGeometry(4.2, 1.4, 1.9);
    carGeo.translate(0, 0.75, 0);
    const carColors = [0xf2f2f2, 0x24272b, 0x8a9096, 0x7a1f1f, 0x2c4a7a, 0xc9c2b0];
    const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 }), 22);
    const m4 = new THREE.Matrix4();
    let ci = 0;
    const rnd = mulberry32(7);
    for (let i = -6; i < 6 && ci < 22; i++) {
      if (rnd() < 0.25) continue;
      m4.makeRotationY(Math.PI / 2);
      m4.setPosition(i * 6.5 + 3.25, 0, 28.5);
      cars.setMatrixAt(ci, m4);
      cars.setColorAt(ci++, new THREE.Color(carColors[Math.floor(rnd() * carColors.length)]));
    }
    cars.count = ci;
    cars.castShadow = true;
    s.add(cars);

    // пруд в парке
    const pondShape = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr = 1 + 0.18 * Math.sin(a * 3) + 0.1 * Math.cos(a * 5);
      const x = Math.cos(a) * 34 * rr, y = Math.sin(a) * 14 * rr;
      i ? pondShape.lineTo(x, y) : pondShape.moveTo(x, y);
    }
    const pond = new THREE.Mesh(new THREE.ShapeGeometry(pondShape), new THREE.MeshStandardMaterial({ color: 0x5f8fa6, roughness: 0.08, metalness: 0.3 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-95, 0.06, 55);
    s.add(pond);
    const shore = new THREE.Mesh(new THREE.ShapeGeometry(pondShape), new THREE.MeshStandardMaterial({ color: 0xb9b08f, roughness: 1 }));
    shore.rotation.x = -Math.PI / 2;
    shore.scale.set(1.08, 1.12, 1);
    shore.position.set(-95, 0.05, 55);
    s.add(shore);

    // деревья (инстансы): стволы + кроны разного оттенка
    const N = 420;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3, 6);
    trunkGeo.translate(0, 1.5, 0);
    // зимой — ели в снегу, летом — лиственные кроны
    const crownGeo = this.winter ? new THREE.ConeGeometry(2.3, 8, 7) : new THREE.IcosahedronGeometry(2.6, 1);
    crownGeo.translate(0, this.winter ? 6 : 5, 0);
    const snowCapGeo = new THREE.ConeGeometry(1.35, 3.6, 7); snowCapGeo.translate(0, 8.9, 0);
    const caps = this.winter ? new THREE.InstancedMesh(snowCapGeo, new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.8, flatShading: true }), N) : null;
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), N);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), N);
    const greens = this.winter ? [0x23402c, 0x2b4a33, 0x1f3a28, 0x34553b, 0x3d5f44] : [0x4f7a35, 0x5f8c3e, 0x6c9a45, 0x3f6a2f, 0x7aa34c, 0x8aa84f];
    const q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    let n = 0, tries = 0;
    while (n < N && tries < 6000) {
      tries++;
      const x = (rnd() - 0.5) * 420, z = (rnd() - 0.5) * 360;
      if (Math.abs(x) < 50 && z > -34 && z < 42) continue;                // двор, дорога, парковка
      if (Math.abs(z - 36) < 7) continue;                                  // дорога
      if (((x + 95) / 40) ** 2 + ((z - 55) / 18) ** 2 < 1) continue;       // пруд
      if (Math.abs(x) < 16 && z < -26 && z > -50) continue;                // кран
      if (Math.abs(x) < 70 && z > 40 && z < 95) continue;                  // не загораживать вид
      const k = 0.7 + rnd() * 0.8;
      sc.set(k, k * (0.9 + rnd() * 0.5), k);
      pos.set(x, 0, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      m4.compose(pos, q, sc);
      trunks.setMatrixAt(n, m4);
      crowns.setMatrixAt(n, m4);
      crowns.setColorAt(n, new THREE.Color(greens[Math.floor(rnd() * greens.length)]));
      if (caps) caps.setMatrixAt(n, m4);
      n++;
    }
    trunks.count = crowns.count = n;
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    s.add(trunks, crowns);
    if (caps) { caps.count = n; caps.castShadow = true; s.add(caps); }

    // фоновая застройка — низкие светлые «дома» на горизонте
    const bg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd6d2ca, roughness: 1 }), 24);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + rnd() * 0.2;
      const R = 300 + rnd() * 80;
      const hh = 15 + rnd() * 30;
      m4.compose(new THREE.Vector3(Math.cos(a) * R, hh / 2, Math.sin(a) * R), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(14, hh, 60 + rnd() * 40));
      bg.setMatrixAt(i, m4);
    }
    s.add(bg);
  }

  // ------------------------------------------------------------ здания
  buildSections() {
    const slabGeo = new THREE.BoxGeometry(L, SLAB, D);
    const colGeo = new THREE.BoxGeometry(COL, H - SLAB, COL);
    const shellGeo = new THREE.BoxGeometry(L - 0.3, H - SLAB - 0.02, D - 0.3);
    const fillGeo = new THREE.BoxGeometry(1, 1, 1);
    fillGeo.translate(0.5, 0.5, 0); // якорь у левого торца, рост вправо
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, D));

    const mat = {
      slab: new THREE.MeshStandardMaterial({ color: C.concrete, roughness: 0.9 }),
      col: new THREE.MeshStandardMaterial({ color: C.concreteDark, roughness: 0.9 }),
      shell: new THREE.MeshStandardMaterial({ color: C.shell, roughness: 0.8, transparent: true, opacity: 0.22, depthWrite: false }),
      edge: new THREE.LineBasicMaterial({ color: 0x56534d, transparent: true, opacity: 0.3 }),
      top: new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.9 }),
      copper: new THREE.MeshStandardMaterial({ color: C.copper, roughness: 0.55, metalness: 0.35 }),
    };

    for (const s of SECTIONS) {
      const sec = new THREE.Group();
      sec.position.set(...SECTION_POS[s]);
      this.scene.add(sec);

      for (const f of FLOORS) {
        const g = new THREE.Group();
        g.position.y = f * H;
        sec.add(g);
        const isRoof = f === ROOF;
        const fh = isRoof ? ROOF_H : H;

        const slabSide = mat.slab.clone();
        const slabTop = this.winter ? new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.8 }) : slabSide;
        const slab = new THREE.Mesh(slabGeo, [slabSide, slabSide, slabTop, slabSide, slabSide, slabSide]);
        slab.position.y = SLAB / 2;
        slab.castShadow = slab.receiveShadow = true;
        g.add(slab);

        const cols = [];
        if (!isRoof) {
          for (let i = 0; i <= 4; i++) for (const zz of [-1, 1]) {
            const c = new THREE.Mesh(colGeo, mat.col);
            c.position.set(-L / 2 + COL / 2 + i * ((L - COL) / 4), SLAB + (H - SLAB) / 2, zz * (D / 2 - COL / 2));
            c.castShadow = true;
            g.add(c);
            cols.push(c);
          }
        }

        const shell = new THREE.Mesh(shellGeo, mat.shell);
        shell.position.y = SLAB + (H - SLAB) / 2;
        shell.visible = !isRoof;
        g.add(shell);

        // заполнение: фасадные материалы по граням (+x, -x, верх, низ, +z, -z)
        const mk = () => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02 });
        const front = mk(), side = mk(), cap = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.9 });
        const fill = new THREE.Mesh(fillGeo, [side, side, cap, cap, front, front]);
        const innerH = fh - SLAB - (isRoof ? 0 : 0.03);
        fill.scale.set(0.001, innerH, D - 0.06);
        fill.position.set(-L / 2 + 0.03, SLAB, 0);
        fill.castShadow = fill.receiveShadow = true;
        g.add(fill);

        const edges = new THREE.LineSegments(edgeGeo, mat.edge);
        edges.position.y = H / 2;
        edges.visible = !isRoof;
        g.add(edges);

        const hit = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, fh, D + 0.6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = fh / 2;
        hit.userData = { section: s, floor: f };
        g.add(hit);

        const marker = new THREE.Mesh(new THREE.BoxGeometry(1.1, fh - SLAB - 0.3, 1.1), new THREE.MeshStandardMaterial({ color: C.red, emissive: C.red, emissiveIntensity: 0.5 }));
        marker.position.set(-L / 2 - 0.5, SLAB + (fh - SLAB) / 2, D / 2 + 0.5);
        marker.visible = false;
        marker.userData = { section: s, floor: f, cat: 'remarks' };
        g.add(marker);

        // зелёная полоса на торце перекрытия — процент этажа в режиме «Факт»
        const bar = new THREE.Mesh(fillGeo, new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.9, roughness: 0.4 }));
        bar.scale.set(0.001, 0.2, 0.14);
        bar.position.set(-L / 2, 0.01, D / 2 + 0.07);
        bar.visible = false;
        g.add(bar);

        if (s === LAST() && (f % 2 === 0 || f === ROOF || f === 1)) {
          const el = document.createElement('div');
          el.className = 'floor-tag';
          el.textContent = f === 0 ? 'П' : f === ROOF ? 'К' : String(f);
          const label = new CSS2DObject(el);
          label.position.set(L / 2 + 2.5, fh / 2, D / 2 + 1.5);
          g.add(label);
        }

        this.floors.set(`${s}|${f}`, { section: s, floor: f, group: g, fill, front, side, slab, slabSide, slabTop, cols, hit, marker, shell, edges, innerH, isRoof, bar });
      }

      // объёмные пилоны фасада (как на проекте): по краям оконных модулей, на всех четырёх сторонах
      const pil = [];
      const NX = Math.round(L / MOD), NZ = 6;
      for (let f = 0; f < ROOF; f++) {
        for (let i = 0; i <= NX; i++) for (const zs of [1, -1]) pil.push({ f, side: 'x', x: -L / 2 + i * (L / NX), z: zs * (D / 2 + 0.13) });
        for (let j = 1; j < NZ; j++) for (const xs of [-1, 1]) pil.push({ f, side: xs < 0 ? 'left' : 'right', x: xs * (L / 2 + 0.13), z: -D / 2 + j * (D / NZ) });
      }
      const pilGeo = new THREE.BoxGeometry(0.55, H - SLAB, 0.3);
      const pilMesh = new THREE.InstancedMesh(pilGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), pil.length);
      pilMesh.castShadow = true; pilMesh.receiveShadow = true;
      pilMesh.userData.items = pil;
      sec.add(pilMesh);
      this[`pil${s}`] = pilMesh;

      // окна: объёмная рама + стекло, отражающее небо (на каждом оконном модуле всех фасадов)
      const win = [];
      for (let f = 0; f < ROOF; f++) {
        for (let i = 0; i < NX; i++) for (const zs of [1, -1]) win.push({ f, side: 'x', x: -L / 2 + (i + 0.5) * (L / NX), z: zs * D / 2, rot: zs > 0 ? 0 : Math.PI });
        for (let j = 0; j < NZ; j++) for (const xs of [-1, 1]) win.push({ f, side: xs < 0 ? 'left' : 'right', x: xs * L / 2, z: -D / 2 + (j + 0.5) * (D / NZ), rot: xs < 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
      const fw = 1.75, fh = 2.3, ft = 0.1;
      const outer = new THREE.Shape(); outer.moveTo(-fw / 2, -fh / 2); outer.lineTo(fw / 2, -fh / 2); outer.lineTo(fw / 2, fh / 2); outer.lineTo(-fw / 2, fh / 2); outer.closePath();
      const hole = new THREE.Path(); const iw = fw - 2 * ft, ih = fh - 2 * ft;
      hole.moveTo(-iw / 2, -ih / 2); hole.lineTo(-iw / 2, ih / 2); hole.lineTo(iw / 2, ih / 2); hole.lineTo(iw / 2, -ih / 2); hole.closePath();
      outer.holes.push(hole);
      const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false });
      const mull = new THREE.BoxGeometry(0.06, ih, 0.08); mull.translate(0, 0, 0.04);   // импост
      const frameMesh = new THREE.InstancedMesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.4 }), win.length);
      const mullMesh = new THREE.InstancedMesh(mull, frameMesh.material, win.length);
      const glassMat = this.mobile
        ? new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.05, metalness: 0.7, envMapIntensity: 1.4 })
        : new THREE.MeshPhysicalMaterial({ color: 0x1c2733, roughness: 0.04, metalness: 0.65, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.05 });
      const glass = new THREE.InstancedMesh(new THREE.PlaneGeometry(iw, ih), glassMat, win.length);
      frameMesh.castShadow = true;
      for (const m of [frameMesh, mullMesh, glass]) { m.userData.items = win; sec.add(m); }
      // в «Проекте» ночью часть окон светится
      const lit = new THREE.InstancedMesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), win.length);
      lit.userData.items = win; sec.add(lit);
      this[`win${s}`] = { frameMesh, mullMesh, glass, lit, items: win, litMask: win.map(() => rndWin() < 0.42) };

      // оборудование на кровле (выходы, вентшахты) — видно в режиме «Проект» и при готовой кровле
      const roofKit = new THREE.Group();
      roofKit.position.y = ROOF * H + ROOF_H;
      for (const [x, z, w, d, hh] of [[-4, -3, 6, 5, 3.2], [5, 4, 4, 4, 2.4], [7, -6, 2, 2, 1.6], [-8, 6, 2, 2, 1.6]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat.copper);
        b.position.set(x, hh / 2, z);
        b.castShadow = true;
        roofKit.add(b);
      }
      sec.add(roofKit);

      const tag = document.createElement('div');
      tag.className = 'section-tag';
      tag.innerHTML = `<b>${T.part} ${s}</b><span data-pct></span>`;
      tag.title = 'Показать секцию';
      tag.addEventListener('click', (e) => { e.stopPropagation(); this.focusSection(s); this.onSection && this.onSection(s); });
      const obj = new CSS2DObject(tag);
      obj.position.set(0, ROOF * H + ROOF_H + 7, 0);
      sec.add(obj);
      this[`tag${s}`] = tag;
      this[`roof${s}`] = roofKit;
    }
  }

  buildCrane() {
    const paint = new THREE.MeshStandardMaterial({ color: C.crane, roughness: 0.5, metalness: 0.3 });
    const g = new THREE.Group();
    g.position.set(0, 0, -36);
    const mastH = ROOF * H + 16;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.8, mastH, 1.8), paint);
    mast.position.y = mastH / 2;
    mast.castShadow = true;
    g.add(mast);
    const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, mastH, 1.8, 1, Math.round(mastH / 2), 1)), new THREE.LineBasicMaterial({ color: 0x7a5d00 }));
    lattice.position.y = mastH / 2;
    g.add(lattice);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(56, 1.4, 1.2), paint);
    jib.position.set(15, mastH + 0.7, 0);
    jib.castShadow = true;
    g.add(jib);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 2.2), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }));
    cw.position.set(-11, mastH - 0.5, 0);
    g.add(cw);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), paint);
    cab.position.set(1.8, mastH - 1.5, 0);
    g.add(cab);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 6, 4), paint);
    top.position.set(0, mastH + 4.4, 0);
    top.rotation.y = Math.PI / 4;
    g.add(top);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 18), new THREE.MeshBasicMaterial({ color: 0x333333 }));
    rope.position.set(30, mastH - 9, 0);
    g.add(rope);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), new THREE.MeshStandardMaterial({ color: 0x444444 }));
    hook.position.set(30, mastH - 18.4, 0);
    g.add(hook);
    this.crane = g;
    this.scene.add(g);
  }

  // ------------------------------------------------------------ 3D-тур и прокрутка
  setTour(on) {
    this.touring = on;
    this.controls.enabled = !on;
    this.growth = on ? 0 : null;
    if (!on) this.resetView();
    this.update();
  }

  /** p ∈ [0..1] — положение прокрутки тура: камера летит по ключевым точкам, здание растёт */
  tour(p) {
    const ease = (t) => t * t * (3 - 2 * t);
    const hk = HK(), p0 = SECTION_POS[SECTIONS[0]], p1 = SECTION_POS[LAST()];
    const K = [
      { t: 0.00, az: -70, el: 6, dist: 260, tg: [0, 18 * hk, 0] },
      { t: 0.22, az: -35, el: 16, dist: 175, tg: [0, 24 * hk, 0] },
      { t: 0.45, az: -38, el: 12, dist: 95, tg: [p0[0], 26 * hk, p0[2]] },
      { t: 0.68, az: 28, el: 14, dist: 95, tg: [p1[0], 26 * hk, p1[2]] },
      { t: 0.86, az: 70, el: 30, dist: 170, tg: [0, 22 * hk, 0] },
      { t: 1.00, az: 140, el: 58, dist: 210, tg: [0, 10 * hk, 0] },
    ];
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1].t) i++;
    const a = K[i], b = K[i + 1];
    const t = ease(Math.max(0, Math.min(1, (p - a.t) / (b.t - a.t))));
    const lerp = (x, y) => x + (y - x) * t;
    const az = THREE.MathUtils.degToRad(lerp(a.az, b.az)), el = THREE.MathUtils.degToRad(lerp(a.el, b.el)), dist = lerp(a.dist, b.dist) * this.fit();
    const tg = new THREE.Vector3(lerp(a.tg[0], b.tg[0]), lerp(a.tg[1], b.tg[1]), lerp(a.tg[2], b.tg[2]));
    this.tourCam = { pos: new THREE.Vector3(tg.x + dist * Math.cos(el) * Math.sin(az), tg.y + dist * Math.sin(el), tg.z + dist * Math.cos(el) * Math.cos(az)), tg };
    const g = Math.max(0, Math.min(1, p / 0.5));
    if (g !== this.growth) { this.growth = g; this.update(); }
  }

  /** Поворот камеры вокруг цели (прокрутка страницы на телефоне) */
  orbitBy(angle) {
    if (this.touring) return;
    const t = this.controls.target, c = this.camera.position;
    const x = c.x - t.x, z = c.z - t.z;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    c.x = t.x + x * cos - z * sin;
    c.z = t.z + x * sin + z * cos;
    this.camera.lookAt(t);
  }

  setMetric(m) { this.metric = m; this.update(); }
  setView(v) { this.view = v; this.update(); }

  /** Палитра фасада для этажа */
  palette(f, done) {
    if (this.view === 'progress') return done ? 'full' : 'progress';
    return f === 0 ? 'lobby' : f >= TOP ? 'copper' : 'project';
  }

  update() {
    const project = this.view === 'project';
    for (const o of this.floors.values()) {
      const { section: s, floor: f } = o;
      const v = this.store.floorValue(s, f, this.metric);
      const na = v === null;
      // в 3D-туре этажи «строятся» снизу вверх по мере прокрутки
      const grow = this.growth == null ? 1 : Math.max(0, Math.min(1, this.growth * 20 - f));
      const pMetric = (na ? 0 : v / 100) * grow;
      // фасад с окнами — только по наружным стенам (у перегородок и инженерки окон нет: они внутри)
      const ext = o.isRoof ? this.store.floorValue(s, f, 'Кровля') : this.store.floorValue(s, f, 'Наружные стены');
      const pFacade = ((ext == null ? 0 : ext) / 100) * grow;
      const p = project ? grow : this.view === 'progress' ? pMetric : pFacade;
      const part = this.store.floorValue(s, f, 'Перегородки');
      o.pPart = project ? 1 : ((part == null ? 0 : part) / 100) * grow;
      o.pMetric = pMetric;
      o.target = Math.max(0.001, (L - 0.06) * p);
      o.p = p;

      const key = this.palette(f, p >= 0.999);
      for (const [m, width] of [[o.front, L * p], [o.side, D]]) {
        if (o.isRoof) {
          m.map = null;
          m.color.set(project ? C.copper : p >= 0.999 ? PAL.full.wall : PAL.progress.wall);
        } else {
          if (!m.map || m.map.userData.key !== key) {
            const t = this.tex[key];
            m.map = t.map.clone(); m.roughnessMap = t.rough.clone(); m.metalnessMap = t.metal.clone(); m.normalMap = t.normal.clone();
            m.normalScale = new THREE.Vector2(0.7, 0.7);
            for (const x of [m.map, m.roughnessMap, m.metalnessMap, m.normalMap]) x.needsUpdate = true;
            m.map.userData.key = key; m.roughness = 1; m.metalness = 1;
          }
          const rep = Math.max(1, Math.round(width / MOD));
          for (const x of [m.map, m.roughnessMap, m.metalnessMap, m.normalMap]) x.repeat.set(rep, 1);
          m.color.set(0xffffff);
        }
        m.needsUpdate = true;
      }

      // в режиме «Проект» скрываем строительные леса: колонны, оболочку, рёбра
      o.shell.visible = !project && !o.isRoof && p < 0.999;
      o.edges.visible = !project && !o.isRoof && p < 0.999;
      for (const c of o.cols) c.visible = !project && p < 0.999;
      for (const m of new Set([o.slabSide, o.slabTop])) { m.transparent = na && !project; m.opacity = na && !project ? 0.35 : 1; m.needsUpdate = true; }
      const open = this.store.remarksFor(s, f).filter((r) => this.store.isOpenRemark(r));
      o.marker.visible = !project && open.length > 0;
      if (o.nets) for (const n of o.nets) {
        const on = this.view === 'fact' && p > 0.001 && p < 0.999;
        n.visible = on;
        if (on) { const start = -L / 2 + (L - 0.06) * p; n.position.x = start; n.scale.x = L / 2 - start; n.material.map.repeat.set(Math.max(1, n.scale.x / 1.5), 2); }
      }
      o.bar.scale.x = Math.max(0.001, (L - 0.06) * pMetric);
      o.bar.visible = this.view === 'fact' && !o.isRoof && pMetric > 0.001;
    }
    this.updatePilasters();
    this.updateWindows();
    this.updateInterior();
    for (const s of SECTIONS) {
      const roofDone = this.store.floorValue(s, ROOF, 'avg') >= 100;
      this[`roof${s}`].visible = (project || roofDone) && (this.growth == null || this.growth >= 0.95);
      const pct = Math.round(this.store.sectionValue(s, this.metric));
      this[`tag${s}`].querySelector('[data-pct]').textContent = project ? 'проект' : `${pct}%`;
    }
    this.fence.visible = !project;
    this.paintHighlight();
  }

  /** Пилоны видны там, где фасад готов (в «Факте» и «Проекте»), цвет — по этажу */
  updateWindows() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), zero = new THREE.Vector3(0, 0, 0), one = new THREE.Vector3(1, 1, 1);
    const frameCol = { project: new THREE.Color(0xe9e4da), copper: new THREE.Color(0x5b3a26), lobby: new THREE.Color(0x30353b) };
    const night = 1 - (this.dayFactor ?? 1);
    for (const s of SECTIONS) {
      const W = this[`win${s}`];
      W.items.forEach((it, i) => {
        const o = this.floors.get(`${s}|${it.f}`);
        const len = o.target || 0;
        const on = this.view !== 'progress' && (it.side === 'x' ? it.x <= -L / 2 + len + 0.05 && len > 0.05 : it.side === 'left' ? len > 0.05 : o.p >= 0.999);
        const y = it.f * H + SLAB + (H - SLAB) / 2 - 0.05;
        q.setFromAxisAngle(up, it.rot);
        const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const base = new THREE.Vector3(it.x, y, it.z);
        m4.compose(base.clone().addScaledVector(nrm, -0.03), q, on ? one : zero); W.frameMesh.setMatrixAt(i, m4); W.mullMesh.setMatrixAt(i, m4);
        m4.compose(base.clone().addScaledVector(nrm, -0.012), q, on ? one : zero); W.glass.setMatrixAt(i, m4);
        const litOn = on && this.view === 'project' && night > 0.5 && W.litMask[i];
        m4.compose(base.clone().addScaledVector(nrm, -0.008), q, litOn ? one : zero); W.lit.setMatrixAt(i, m4);
        const c = it.f === 0 ? frameCol.lobby : it.f >= 16 ? frameCol.copper : frameCol.project;
        W.frameMesh.setColorAt(i, c); W.mullMesh.setColorAt(i, c);
      });
      for (const m of [W.frameMesh, W.mullMesh, W.glass, W.lit]) m.instanceMatrix.needsUpdate = true;
      for (const m of [W.frameMesh, W.mullMesh]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  updatePilasters() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), side = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const col = { project: new THREE.Color(PAL.project.pier), copper: new THREE.Color(PAL.copper.pier), lobby: new THREE.Color(PAL.lobby.pier) };
    for (const s of SECTIONS) {
      const mesh = this[`pil${s}`];
      mesh.userData.items.forEach((it, i) => {
        const o = this.floors.get(`${s}|${it.f}`);
        const len = o.target || 0;
        const on = this.view !== 'progress' && (it.side === 'x' ? it.x <= -L / 2 + len + 0.05 && len > 0.05 : it.side === 'left' ? len > 0.05 : o.p >= 0.999);
        const y = it.f * H + SLAB + (H - SLAB) / 2;
        m4.compose(new THREE.Vector3(it.x, y, it.z), it.side === 'x' ? q : side, on ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(0, 0, 0));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, it.f === 0 ? col.lobby : it.f >= 16 ? col.copper : col.project);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  paintHighlight() {
    for (const [k, o] of this.floors) {
      const sel = this.selected && k === `${this.selected.section}|${this.selected.floor}`;
      const hov = this.hovered && k === `${this.hovered.section}|${this.hovered.floor}`;
      const finished = this.view === 'project' || (this.view === 'fact' && o.p >= 0.999);
      const base = finished ? (o.floor >= 16 ? C.copper : 0xf1ebe0) : C.concrete;
      o.slabSide.color.set(sel ? C.select : hov ? C.hover : base);
      for (const m of new Set([o.slabSide, o.slabTop])) { m.emissive.set(sel ? C.select : hov ? C.hover : 0x000000); m.emissiveIntensity = sel || hov ? 0.45 : 0; }
      for (const m of [o.front, o.side]) {
        m.emissive.set(sel ? C.select : hov ? C.hover : 0x000000);
        m.emissiveIntensity = sel ? 0.25 : hov ? 0.18 : 0;
      }
    }
  }

  select(section, floor) {
    this.selected = section ? { section, floor } : null;
    if (!section && this.selBox) this.selBox.visible = false;
    else if (section) this.showSelBox(section, floor);
    this.paintHighlight();
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointermove', (e) => {
      const hit = this.pick(e);
      this.hovered = hit;
      el.style.cursor = hit ? 'pointer' : 'grab';
      if (hit) {
        const v = this.store.floorValue(hit.section, hit.floor, this.metric);
        this.tooltip.textContent = `${T.part} ${hit.section} · ${floorName(hit.floor)} · ${v === null ? '—' : Math.round(v) + '%'}`;
        const r = this.container.getBoundingClientRect();
        this.tooltip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        this.tooltip.style.opacity = 1;
      } else this.tooltip.style.opacity = 0;
      this.paintHighlight();
    });
    el.addEventListener('pointerleave', () => { this.hovered = null; this.tooltip.style.opacity = 0; this.paintHighlight(); });
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; this.camAnim = null; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const hit = this.pick(e);
      if (hit) { this.tooltip.style.opacity = 0; this.hovered = null; this.select(hit.section, hit.floor); this.onSelect(hit.section, hit.floor, hit.cat); }
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const fl = [...this.floors.values()];
    const hits = this.raycaster.intersectObjects([...fl.map((o) => o.hit), ...fl.filter((o) => o.marker.visible).map((o) => o.marker)], false);
    if (!hits.length) return null;
    // красный маркер замечаний — открыть этаж сразу на «Замечаниях»
    const m = hits.find((h) => h.object.userData.cat && h.distance - hits[0].distance < 3);
    return (m || hits[0]).object.userData;
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const wasPortrait = this.camera.aspect < 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (wasPortrait !== this.camera.aspect < 1 && !this.touring) this.resetView();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.5, (now - (this.last || now)) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * (this.touring ? 14 : 7)); // скорость не зависит от FPS
    if (this.touring && this.tourCam) {
      this.camera.position.lerp(this.tourCam.pos, 1 - Math.exp(-dt * 8));
      this.controls.target.lerp(this.tourCam.tg, 1 - Math.exp(-dt * 8));
      this.camera.lookAt(this.controls.target);
    }
    for (const o of this.floors.values()) {
      if (o.target === undefined) continue;
      const cur = o.fill.scale.x;
      const next = cur + (o.target - cur) * k;
      o.fill.scale.x = Math.abs(o.target - next) < 0.002 ? o.target : next;
      o.fill.visible = o.fill.scale.x > 0.02;   // у пустого этажа не видно торцов заливки
      // окна на фронтальной грани растягиваются вместе с заливкой — держим шаг модуля
      if (o.front.map && !o.isRoof) o.front.map.repeat.x = Math.max(1, Math.round(o.fill.scale.x / MOD));
    }
    if (this.crane) this.crane.rotation.y = Math.sin(performance.now() / 9000) * 0.5;
    if (this.snow) {
      const a = this.snow.geometry.attributes.position, t = now / 1000;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * (2.2 + (i % 7) * 0.25);
        if (y < 0) y += 90;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.4);
      }
      a.needsUpdate = true;
    }
    if (this.camAnim && !this.touring) {
      const a = this.camAnim, t = Math.min(1, (performance.now() - a.start) / a.ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (t >= 1) this.camAnim = null;
    }
    if (this.selBox && this.selBox.visible) this.selBox.material.opacity = 0.65 + 0.3 * Math.sin(now / 300);
    if (!this.touring) this.controls.update();
    if (this.hoistCage) this.hoistCage.position.y = 1.2 + (Math.sin(now / 14000) * 0.5 + 0.5) * (12 * H);
    if (this.hq && this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

// Фасадный модуль 3 × 3 м: простенок-пилон, окно в пол с импостом, межэтажный пояс.
// Три текстуры одной раскладки: цвет, шероховатость и «металличность» — стёкла гладкие и отражают небо.
function makeFacadeTextures(p, lobby) {
  const draw = (wall, pier, glassTop, glassBottom, frame) => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, 128, 128);
    g.fillStyle = pier; g.fillRect(0, 0, 22, 128); g.fillRect(106, 0, 22, 128);
    g.fillStyle = wall; g.fillRect(22, 118, 84, 10);
    const [x, y, w, h] = lobby ? [24, 6, 80, 110] : [30, 6, 68, 108];
    if (glassTop === glassBottom) g.fillStyle = glassTop;
    else { const grd = g.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, glassTop); grd.addColorStop(1, glassBottom); g.fillStyle = grd; }
    g.fillRect(x, y, w, h);
    g.fillStyle = frame;
    g.fillRect(x - 3, y - 3, w + 6, 3); g.fillRect(x - 3, y + h, w + 6, 4);
    g.fillRect(x - 3, y, 3, h); g.fillRect(x + w, y, 3, h);
    g.fillRect(x + w / 2 - 1.5, y, 3, h);
    if (!lobby) g.fillRect(x, y + h * 0.62, w, 3);
    // лёгкая неоднородность штукатурки/облицовки
    const img = g.getImageData(0, 0, 128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 6; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const map = draw(p.wall, p.pier, p.glass2, p.glass, p.frame);
  const normal = makeNormalFromNoise(128, 1.8);
  map.colorSpace = THREE.SRGBColorSpace;
  const rough = draw('#e6e6e6', '#d0d0d0', '#121212', '#121212', '#7a7a7a');   // стена матовая, стекло гладкое
  const metal = draw('#000000', '#000000', '#9a9a9a', '#9a9a9a', '#404040');   // отражение неба в стёклах
  return { map, rough, metal, normal };
}

/** Карта нормалей из шума — рельеф штукатурки/облицовки, чтобы фасад не был плоским */
function makeNormalFromNoise(n, strength) {
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = Math.random();
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = y * n + x; h[k] = (h[k] * 2 + h[y * n + ((x + 1) % n)] + h[((y + 1) % n) * n + x]) / 4;
  }
  // швы панелей облицовки: по краям модуля и межэтажный пояс
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x === 21 || x === 106 || y === 117) h[y * n + x] -= 0.9;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)]) * strength;
    const dy = (h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x]) * strength;
    const len = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img.data[i] = (-dx / len * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

function makeBlockTexture() {
  // кладка газобетона: светлые блоки 625×250 с тонкими швами вперевязку
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e4e2dc'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#b9b5ac'; g.lineWidth = 1.5;
  for (let row = 0; row < 4; row++) {
    const y = row * 16; g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
    for (let x = (row % 2) * 20; x < 128; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function makeNetTexture() {
  // зелёная фасадная сетка: ромбическое плетение с полупрозрачностью
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(46,125,72,0.55)'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(30,90,50,0.9)'; g.lineWidth = 2;
  for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

const rndWin = mulberry32(5);

/** Положение солнца (упрощённый алгоритм NOAA): высота и азимут (от севера по часовой) в градусах */
function sunPosition(date, lat, lon) {
  const rad = Math.PI / 180;
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 864e5;
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const Lm = q + 1.915 * Math.sin(g * rad) + 0.02 * Math.sin(2 * g * rad);
  const e = 23.439 - 0.00000036 * d;
  const ra = Math.atan2(Math.cos(e * rad) * Math.sin(Lm * rad), Math.cos(Lm * rad)) / rad;
  const dec = Math.asin(Math.sin(e * rad) * Math.sin(Lm * rad)) / rad;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon - ra) % 360 + 540) % 360 - 180;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec * rad) + Math.cos(lat * rad) * Math.cos(dec * rad) * Math.cos(ha * rad)) / rad;
  const az = Math.atan2(-Math.sin(ha * rad), Math.tan(dec * rad) * Math.cos(lat * rad) - Math.sin(lat * rad) * Math.cos(ha * rad)) / rad;
  return { alt, az: (az + 360) % 360 };
}

function makeSnowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#eef2f7'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.6 ? 'rgba(200,212,228,0.35)' : 'rgba(255,255,255,0.7)';
    const r = 1 + Math.random() * 6;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, 6.28); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.anisotropy = 8;
  return t;
}

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7d9b58'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(96,128,64,0.35)' : v < 0.85 ? 'rgba(140,166,96,0.3)' : 'rgba(170,160,110,0.25)';
    const r = 1 + Math.random() * 5;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, 6.28); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  t.anisotropy = 8;
  return t;
}

function makeFenceTexture() {
  // профлист стройплощадки: сине-серые волны + полоса с подписью-«баннером»
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x += 8) { g.fillStyle = x % 16 ? '#5b7a99' : '#4b6886'; g.fillRect(x, 0, 8, 64); }
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 22, 128, 14);
  g.fillStyle = '#2f4a66'; g.font = 'bold 10px sans-serif'; g.fillText('СТРОИТЕЛЬНАЯ ПЛОЩАДКА', 4, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeSkyTexture(dark) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  if (dark) { grd.addColorStop(0, '#0f141b'); grd.addColorStop(0.7, '#1e2733'); grd.addColorStop(1, '#2a2f36'); }
  else { grd.addColorStop(0, '#8fb3d9'); grd.addColorStop(0.6, '#cfe0ec'); grd.addColorStop(1, '#f3e3cc'); }
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
