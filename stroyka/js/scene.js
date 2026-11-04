// 3D-сцена: две секции МКД (16 этажей + подвал + кровля), этажи заполняются зелёным как прогресс-бар.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SECTIONS, FLOORS, ROOF, floorName } from './data.js';

// Размеры в метрах (типовая секция монолитно-каркасного МКД)
const L = 30;        // длина секции вдоль фасада
const D = 14;        // глубина
const H = 3.0;       // высота этажа
const SLAB = 0.22;   // толщина плиты
const COL = 0.45;    // сечение колонны
const GAP = 12;      // расстояние между зданиями секций 4 и 5
const ROOF_H = 1.2;  // парапет кровли

const SECTION_X = { '4': -(L / 2 + GAP / 2), '5': L / 2 + GAP / 2 };

const C = {
  concrete: 0xbdb9b0,
  concreteDark: 0x8f8b83,
  shell: 0xdedbd3,
  green: 0x1f9a4c,
  greenFull: 0x13703a,
  edge: 0x56534d,
  hover: 0xf2b134,
  select: 0x1f6feb,
  red: 0xd64545,
  crane: 0xe8b100,
};

export class BuildingScene {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.metric = 'avg';
    this.floors = new Map(); // `${s}|${f}` → { group, fill, shell, slab, hit, marker, label }
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
    r.toneMappingExposure = 0.85;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(w, h);
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    this.setTheme();

    this.camera = new THREE.PerspectiveCamera(35, w / h, 1, 2000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 400;
    this.resetView();

    // Свет: мягкий «студийный» + солнце с тенями
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 0.9));
    const sun = new THREE.DirectionalLight(0xfff6ea, 1.7);
    sun.position.set(-90, 120, 55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -40, near: 10, far: 400 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    this.buildGround();
    this.buildSections();
    this.buildCrane();

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

  setTheme() {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const bg = dark ? 0x1b1d1f : 0xece9e3;
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 260, 700);
    if (this.groundMat) this.groundMat.color.set(dark ? 0x2a2c2e : 0xe3dfd7);
  }

  resetView() {
    this.camera.position.set(-70, 62, 150);
    this.controls.target.set(-6, 26, 0);
    this.controls.update();
  }

  buildGround() {
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xe3dfd7, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // стройплощадка — песчаная подсыпка вокруг корпуса
    const site = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 2 + 40, D + 40),
      new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 1 }),
    );
    site.rotation.x = -Math.PI / 2;
    site.position.y = 0.02;
    site.receiveShadow = true;
    this.scene.add(site);
  }

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
      shell: new THREE.MeshStandardMaterial({ color: C.shell, roughness: 0.8, transparent: true, opacity: 0.28, depthWrite: false }),
      edge: new THREE.LineBasicMaterial({ color: C.edge, transparent: true, opacity: 0.35 }),
    };
    this.windowTex = makeWindowTexture();

    for (const s of SECTIONS) {
      const sec = new THREE.Group();
      sec.position.x = SECTION_X[s];
      this.scene.add(sec);

      for (const f of FLOORS) {
        const g = new THREE.Group();
        const y0 = f * H;
        g.position.y = y0;
        sec.add(g);
        const isRoof = f === ROOF;
        const fh = isRoof ? ROOF_H : H;

        const slab = new THREE.Mesh(slabGeo, mat.slab.clone());
        slab.position.y = SLAB / 2;
        slab.castShadow = slab.receiveShadow = true;
        g.add(slab);

        if (!isRoof) {
          for (let i = 0; i <= 5; i++) for (const zz of [-1, 1]) {
            const c = new THREE.Mesh(colGeo, mat.col);
            c.position.set(-L / 2 + COL / 2 + i * ((L - COL) / 5), SLAB + (H - SLAB) / 2, zz * (D / 2 - COL / 2));
            c.castShadow = true;
            g.add(c);
          }
        }

        const shell = new THREE.Mesh(shellGeo, mat.shell);
        shell.position.y = SLAB + (H - SLAB) / 2;
        shell.visible = !isRoof;
        g.add(shell);

        const fillMat = new THREE.MeshStandardMaterial({
          color: C.green, roughness: 0.85, metalness: 0,
          map: isRoof ? null : this.windowTex.clone(), emissive: C.green, emissiveIntensity: 0.05,
        });
        if (fillMat.map) { fillMat.map.needsUpdate = true; }
        const fill = new THREE.Mesh(fillGeo, fillMat);
        const innerH = fh - SLAB - (isRoof ? 0 : 0.04);
        fill.scale.set(0.001, innerH, D - 0.1);
        fill.position.set(-L / 2 + 0.05, SLAB, 0);
        fill.castShadow = fill.receiveShadow = true;
        g.add(fill);

        const edges = new THREE.LineSegments(edgeGeo, mat.edge);
        edges.position.y = H / 2;
        edges.visible = !isRoof;
        g.add(edges);

        // невидимый объём для наведения/клика
        const hit = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, fh, D + 0.6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = fh / 2;
        hit.userData = { section: s, floor: f };
        g.add(hit);

        // красная метка — есть открытые замечания по этажу
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.5, fh - SLAB - 0.3, 0.5), new THREE.MeshStandardMaterial({ color: C.red, emissive: C.red, emissiveIntensity: 0.4 }));
        marker.position.set((s === '4' ? -1 : 1) * (L / 2 + 0.45), SLAB + (fh - SLAB) / 2, D / 2 + 0.45);
        marker.visible = false;
        g.add(marker);

        // номер этажа на торце
        let label = null;
        if (s === '5' && (f % 2 === 0 || f === ROOF || f === 1)) {
          const el = document.createElement('div');
          el.className = 'floor-tag';
          el.textContent = f === 0 ? 'П' : f === ROOF ? 'К' : String(f);
          label = new CSS2DObject(el);
          label.position.set(L / 2 + 2.5, fh / 2, D / 2 + 1.5);
          g.add(label);
        }

        this.floors.set(`${s}|${f}`, { group: g, fill, fillMat, slab, hit, marker, shell, innerH, isRoof });
      }

      const tag = document.createElement('div');
      tag.className = 'section-tag';
      tag.innerHTML = `<b>Секция ${s}</b><span data-pct></span>`;
      const obj = new CSS2DObject(tag);
      obj.position.set(0, ROOF * H + ROOF_H + 4, 0);
      sec.add(obj);
      this[`tag${s}`] = tag;
    }
  }

  buildCrane() {
    // башенный кран за корпусом
    const paint = new THREE.MeshStandardMaterial({ color: C.crane, roughness: 0.5, metalness: 0.3 });
    const g = new THREE.Group();
    g.position.set(0, 0, -D / 2 - 9);
    const mastH = ROOF * H + 14;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.8, mastH, 1.8), paint);
    mast.position.y = mastH / 2;
    mast.castShadow = true;
    g.add(mast);
    const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, mastH, 1.8, 1, Math.round(mastH / 2), 1)), new THREE.LineBasicMaterial({ color: 0x7a5d00 }));
    lattice.position.y = mastH / 2;
    g.add(lattice);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(50, 1.4, 1.2), paint);
    jib.position.set(12, mastH + 0.7, 0);
    jib.userData.len = 50;
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
    rope.position.set(24, mastH - 9, 0);
    g.add(rope);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), new THREE.MeshStandardMaterial({ color: 0x444444 }));
    hook.position.set(24, mastH - 18.4, 0);
    g.add(hook);
    this.crane = g;
    this.scene.add(g);
  }

  setMetric(m) { this.metric = m; this.update(); }

  /** Перерисовать заполнение из store */
  update() {
    for (const s of SECTIONS) {
      for (const f of FLOORS) {
        const o = this.floors.get(`${s}|${f}`);
        const v = this.store.floorValue(s, f, this.metric);
        const na = v === null;
        const p = na ? 0 : v / 100;
        o.target = Math.max(0.001, (L - 0.1) * p);
        o.fillMat.color.set(p >= 0.999 ? C.greenFull : C.green);
        o.fillMat.emissive.set(p >= 0.999 ? C.greenFull : C.green);
        if (o.fillMat.map) o.fillMat.map.repeat.set(Math.max(1, Math.round(10 * p)), 1);
        o.slab.material.opacity = na ? 0.35 : 1;
        o.slab.material.transparent = na;
        const open = this.store.remarksFor(s, f).filter((r) => this.store.isOpenRemark(r));
        o.marker.visible = open.length > 0;
      }
      const pct = Math.round(this.store.sectionValue(s, this.metric));
      this[`tag${s}`].querySelector('[data-pct]').textContent = `${pct}%`;
    }
    this.paintHighlight();
  }

  paintHighlight() {
    for (const [k, o] of this.floors) {
      const sel = this.selected && k === `${this.selected.section}|${this.selected.floor}`;
      const hov = this.hovered && k === `${this.hovered.section}|${this.hovered.floor}`;
      o.slab.material.color.set(sel ? C.select : hov ? C.hover : C.concrete);
      o.slab.material.emissive = new THREE.Color(sel ? C.select : hov ? C.hover : 0x000000);
      o.slab.material.emissiveIntensity = sel || hov ? 0.35 : 0;
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    // плавный рост заполнения
    for (const o of this.floors.values()) {
      if (o.target === undefined) continue;
      const cur = o.fill.scale.x;
      const next = cur + (o.target - cur) * 0.12;
      o.fill.scale.x = Math.abs(o.target - next) < 0.002 ? o.target : next;
    }
    if (this.crane) this.crane.rotation.y = Math.sin(performance.now() / 9000) * 0.5;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

// Текстура «окна» для заполненной части фасада: светлые проёмы на зелёном.
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#4d5e57';
  g.fillRect(30, 14, 26, 34);
  g.fillRect(74, 14, 26, 34);
  g.fillStyle = '#e8efe9';
  g.fillRect(42, 14, 2, 34);
  g.fillRect(86, 14, 2, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
