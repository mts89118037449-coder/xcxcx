// 3D-сцена: две 16-этажные секции (по проектному виду: башни со светлым фасадом,
// вертикальными простенками, медным верхом и остеклённым первым этажом) в парке.
// Режим «Прогресс»: этажи заливаются зелёным фасадом как прогресс-бар.
// Режим «Проект»: здание целиком в проектной отделке.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { SECTIONS, FLOORS, ROOF, floorName } from './data.js';

// Размеры в метрах (башня-секция с почти квадратным планом)
const L = 24;        // ширина фасада (вдоль X)
const D = 20;        // глубина
const H = 3.0;       // высота этажа
const SLAB = 0.22;   // толщина плиты
const COL = 0.5;     // сечение колонны
const MOD = 3.0;     // шаг оконного модуля по фасаду
const ROOF_H = 1.6;  // парапет кровли

// Положение секций — «шахматкой», как на проектных видах
const SECTION_POS = { '4': [-21, 0, 5], '5': [21, 0, -5] };

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

    this.buildLandscape();
    this.buildSections();
    this.buildCrane();
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

  setTheme() {
    const dark = this.isDark();
    // день: солнце повыше, тёплый свет; тёмная тема — вечерние сумерки
    const elev = dark ? 2.5 : 18, azim = 215;
    const u = this.sky.material.uniforms;
    u.turbidity.value = dark ? 6 : 1.6; u.rayleigh.value = dark ? 2.8 : 2.2;
    u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
    u.sunPosition.value.copy(sunDir);
    this.sun.position.copy(sunDir).multiplyScalar(160);
    this.sun.color.set(dark ? 0xffb27a : 0xfff0dc);
    this.sun.intensity = dark ? 1.0 : 2.3;
    this.hemi.intensity = dark ? 0.35 : 0.8;
    this.renderer.toneMappingExposure = dark ? 0.55 : 0.6;
    // окружение для отражений — из того же неба
    const envScene = new THREE.Scene();
    const skyCopy = new Sky(); skyCopy.scale.setScalar(4000); skyCopy.material.uniforms = THREE.UniformsUtils.clone(u);
    envScene.add(skyCopy);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 5000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = dark ? 0.5 : 0.8;
    this.scene.background = null;
    this.scene.fog = new THREE.Fog(dark ? 0x3a3340 : 0xb9cde0, 380, 1600);
  }

  /** На узких (портретных) экранах камера отходит дальше, чтобы обе секции влезли */
  fit() { const a = this.camera.aspect || 1.6; return Math.max(1, Math.min(2.6, 1.3 / a)); }

  resetView() {
    const k = this.fit();
    this.camera.position.set(-48 * k, 24 + 22 * k, 158 * k);
    this.controls.target.set(0, 24, 0);
    this.controls.update();
  }

  // ------------------------------------------------------------ окружение
  buildLandscape() {
    const s = this.scene;
    const grass = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeGrassTexture(), roughness: 1 }));
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
    flat(90, 58, 0xc9c3b6, 0, 0, 0.02);
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
    seg(92, 0, -29); seg(58, -46, 0, Math.PI / 2); seg(58, 46, 0, Math.PI / 2);
    seg(38, -27, 29); seg(38, 27, 29);           // спереди — въезд посередине
    s.add(this.fence);
    // газоны во дворе
    flat(18, 14, 0x86a862, -18, -16, 0.05);
    flat(18, 14, 0x86a862, 18, 16, 0.05);
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
    const crownGeo = new THREE.IcosahedronGeometry(2.6, 1);
    crownGeo.translate(0, 5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), N);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), N);
    const greens = [0x4f7a35, 0x5f8c3e, 0x6c9a45, 0x3f6a2f, 0x7aa34c, 0x8aa84f];
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
      n++;
    }
    trunks.count = crowns.count = n;
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    s.add(trunks, crowns);

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

        const slab = new THREE.Mesh(slabGeo, mat.slab.clone());
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

        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.6, fh - SLAB - 0.3, 0.6), new THREE.MeshStandardMaterial({ color: C.red, emissive: C.red, emissiveIntensity: 0.5 }));
        marker.position.set(-L / 2 - 0.5, SLAB + (fh - SLAB) / 2, D / 2 + 0.5);
        marker.visible = false;
        g.add(marker);

        // зелёная полоса на торце перекрытия — процент этажа в режиме «Факт»
        const bar = new THREE.Mesh(fillGeo, new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.9, roughness: 0.4 }));
        bar.scale.set(0.001, 0.2, 0.14);
        bar.position.set(-L / 2, 0.01, D / 2 + 0.07);
        bar.visible = false;
        g.add(bar);

        if (s === '5' && (f % 2 === 0 || f === ROOF || f === 1)) {
          const el = document.createElement('div');
          el.className = 'floor-tag';
          el.textContent = f === 0 ? 'П' : f === ROOF ? 'К' : String(f);
          const label = new CSS2DObject(el);
          label.position.set(L / 2 + 2.5, fh / 2, D / 2 + 1.5);
          g.add(label);
        }

        this.floors.set(`${s}|${f}`, { section: s, floor: f, group: g, fill, front, side, slab, cols, hit, marker, shell, edges, innerH, isRoof, bar });
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
      tag.innerHTML = `<b>Секция ${s}</b><span data-pct></span>`;
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
    const K = [
      { t: 0.00, az: -70, el: 6, dist: 260, tg: [0, 18, 0] },
      { t: 0.22, az: -35, el: 16, dist: 175, tg: [0, 24, 0] },
      { t: 0.45, az: -38, el: 12, dist: 95, tg: [-21, 26, 5] },
      { t: 0.68, az: 28, el: 14, dist: 95, tg: [21, 26, -5] },
      { t: 0.86, az: 70, el: 30, dist: 170, tg: [0, 22, 0] },
      { t: 1.00, az: 140, el: 58, dist: 210, tg: [0, 10, 0] },
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
    return f === 0 ? 'lobby' : f >= 16 ? 'copper' : 'project';
  }

  update() {
    const project = this.view === 'project';
    for (const o of this.floors.values()) {
      const { section: s, floor: f } = o;
      const v = this.store.floorValue(s, f, this.metric);
      const na = v === null;
      // в 3D-туре этажи «строятся» снизу вверх по мере прокрутки
      const grow = this.growth == null ? 1 : Math.max(0, Math.min(1, this.growth * 20 - f));
      const p = (project ? 1 : na ? 0 : v / 100) * grow;
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
            m.map = t.map.clone(); m.roughnessMap = t.rough.clone(); m.metalnessMap = t.metal.clone();
            for (const x of [m.map, m.roughnessMap, m.metalnessMap]) x.needsUpdate = true;
            m.map.userData.key = key; m.roughness = 1; m.metalness = 1;
          }
          const rep = Math.max(1, Math.round(width / MOD));
          for (const x of [m.map, m.roughnessMap, m.metalnessMap]) x.repeat.set(rep, 1);
          m.color.set(0xffffff);
        }
        m.needsUpdate = true;
      }

      // в режиме «Проект» скрываем строительные леса: колонны, оболочку, рёбра
      o.shell.visible = !project && !o.isRoof && p < 0.999;
      o.edges.visible = !project && !o.isRoof && p < 0.999;
      for (const c of o.cols) c.visible = !project && p < 0.999;
      o.slab.material.transparent = na && !project;
      o.slab.material.opacity = na && !project ? 0.35 : 1;
      o.slab.material.needsUpdate = true;
      const open = this.store.remarksFor(s, f).filter((r) => this.store.isOpenRemark(r));
      o.marker.visible = !project && open.length > 0;
      o.bar.visible = this.view === 'fact' && !o.isRoof && p > 0.001;
      o.bar.scale.x = Math.max(0.001, (L - 0.06) * p);
    }
    this.updatePilasters();
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
      o.slab.material.color.set(sel ? C.select : hov ? C.hover : base);
      o.slab.material.emissive.set(sel ? C.select : hov ? C.hover : 0x000000);
      o.slab.material.emissiveIntensity = sel || hov ? 0.45 : 0;
      for (const m of [o.front, o.side]) {
        m.emissive.set(sel ? C.select : hov ? C.hover : 0x000000);
        m.emissiveIntensity = sel ? 0.25 : hov ? 0.18 : 0;
      }
    }
  }

  select(section, floor) {
    this.selected = section ? { section, floor } : null;
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
        this.tooltip.textContent = `Секция ${hit.section} · ${floorName(hit.floor)} · ${v === null ? '—' : Math.round(v) + '%'}`;
        const r = this.container.getBoundingClientRect();
        this.tooltip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        this.tooltip.style.opacity = 1;
      } else this.tooltip.style.opacity = 0;
      this.paintHighlight();
    });
    el.addEventListener('pointerleave', () => { this.hovered = null; this.tooltip.style.opacity = 0; this.paintHighlight(); });
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const hit = this.pick(e);
      if (hit) { this.select(hit.section, hit.floor); this.onSelect(hit.section, hit.floor); }
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.floors.values()].map((o) => o.hit), false);
    return hits.length ? hits[0].object.userData : null;
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
    if (!this.touring) this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
  map.colorSpace = THREE.SRGBColorSpace;
  const rough = draw('#e6e6e6', '#d0d0d0', '#121212', '#121212', '#7a7a7a');   // стена матовая, стекло гладкое
  const metal = draw('#000000', '#000000', '#9a9a9a', '#9a9a9a', '#404040');   // отражение неба в стёклах
  return { map, rough, metal };
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
