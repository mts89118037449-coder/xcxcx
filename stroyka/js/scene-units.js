// 3D для объектов, где уровни — не этажи друг над другом:
//   'plan' — квартира / офис / помещение: комнаты рядом на плане, каждая заполняется по проценту своих работ;
//   'hall' — цех / склад / ангар: пролёты (зоны) вдоль длинного здания с рамами каркаса.
// Структура (части, уровни, их названия) — из таблиц, см. data.js. Интерфейс тот же, что у BuildingScene.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BuildingScene } from './scene.js';
import { SECTIONS, LAYOUT, T, levelsOf, floorName, floorShort } from './data.js';

const COLORS = {
  floor: 0xc9c2b6, wall: 0xdedbd3, edge: 0x56534d, green: 0x2f9e5a, full: 0x1d7a43,
  finished: 0xece6da, hover: 0xf2b134, select: 0x1f6feb, red: 0xd64545, steel: 0x7c8794,
};
// размеры в метрах
const DIM = {
  plan: { w: 4.6, d: 4.0, h: 2.7, gap: 0.12, partGap: 3.5, slab: 0.12 },
  hall: { w: 12, d: 24, h: 9, gap: 0, partGap: 10, slab: 0.25 },
};

export class UnitsScene extends BuildingScene {
  // --- окружение: без деревьев и дороги; для цеха — площадка, для квартиры — нейтральный «пол здания»
  buildLandscape() {
    const hall = LAYOUT === 'hall';
    const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshStandardMaterial({ color: hall ? (this.winter ? 0xe9eef3 : 0x9aa58a) : 0xb9b3a8, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(400, hall ? 66 : 400, 0x8a857b, 0x8a857b);
    grid.material.transparent = true; grid.material.opacity = 0.12; grid.position.y = 0.01;
    this.scene.add(grid);
    this.fence = new THREE.Group();   // для совместимости с базовой сценой
    this.scene.add(this.fence);
  }
  buildCrane() { this.crane = null; }
  buildSiteDetails() { /* сетки и подъёмник — только у многоэтажных корпусов */ }
  buildNight() {
    super.buildNight();
    if (LAYOUT === 'plan' && this.snow) { this.scene.remove(this.snow); this.snow = null; }   // внутри помещения снега нет
  }
  updateWindows() {}
  updatePilasters() {}
  updateInterior() {}

  buildSections() {
    const k = DIM[LAYOUT] || DIM.plan;
    this.dim = k;
    this.controls.minDistance = LAYOUT === 'plan' ? 5 : 15;
    const slabGeo = new THREE.BoxGeometry(1, 1, 1);
    const fillGeo = new THREE.BoxGeometry(1, 1, 1); fillGeo.translate(0.5, 0.5, 0);   // растёт слева направо
    const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: 0.5, metalness: 0.6 });
    this.partBox = {};
    let cursor = 0;
    for (const s of SECTIONS) {
      const lv = levelsOf(s);
      const part = new THREE.Group();
      this.scene.add(part);
      // раскладка уровней внутри части
      const cols = LAYOUT === 'hall' ? lv.length : Math.max(1, Math.ceil(Math.sqrt(lv.length)));
      const rows = Math.max(1, Math.ceil(lv.length / cols));
      const W = cols * (k.w + k.gap), Dp = rows * (k.d + k.gap);
      lv.forEach((f, i) => {
        const cx = (i % cols) * (k.w + k.gap) - W / 2 + k.w / 2;
        const cz = Math.floor(i / cols) * (k.d + k.gap) - Dp / 2 + k.d / 2;
        const g = new THREE.Group();
        g.position.set(cx, 0, cz);
        part.add(g);
        const slabSide = new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.9 });
        const slab = new THREE.Mesh(slabGeo, slabSide);
        slab.scale.set(k.w, k.slab, k.d); slab.position.y = k.slab / 2; slab.receiveShadow = true;
        g.add(slab);
        const shell = new THREE.Mesh(new THREE.BoxGeometry(k.w, k.h, k.d), new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.8, transparent: true, opacity: 0.16, depthWrite: false }));
        shell.position.y = k.slab + k.h / 2;
        g.add(shell);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(k.w, k.h, k.d)), edgeMat);
        edges.position.y = k.slab + k.h / 2;
        g.add(edges);
        const front = new THREE.MeshStandardMaterial({ color: COLORS.green, roughness: 0.7 });
        const side = front;
        const fill = new THREE.Mesh(fillGeo, front);
        fill.scale.set(0.001, k.h - 0.02, k.d - 0.08);
        fill.position.set(-k.w / 2 + 0.04, k.slab, 0);
        fill.castShadow = fill.receiveShadow = true;
        g.add(fill);
        const colsMesh = [];
        if (LAYOUT === 'hall') {   // рамы каркаса по границам пролёта
          for (const x of [-k.w / 2, k.w / 2]) for (const z of [-k.d / 2, k.d / 2]) {
            const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, k.h, 0.5), steel);
            c.position.set(x, k.slab + k.h / 2, z); c.castShadow = true; g.add(c); colsMesh.push(c);
          }
          const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, k.d), steel);
          beam.position.set(k.w / 2, k.slab + k.h + 0.3, 0); g.add(beam); colsMesh.push(beam);
        }
        const hit = new THREE.Mesh(new THREE.BoxGeometry(k.w, k.h + k.slab, k.d), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = (k.h + k.slab) / 2;
        hit.userData = { section: s, floor: f };
        g.add(hit);
        const ms = LAYOUT === 'hall' ? 1.6 : 0.6;
        const marker = new THREE.Mesh(new THREE.BoxGeometry(ms, k.h * 0.8, ms), new THREE.MeshStandardMaterial({ color: COLORS.red, emissive: COLORS.red, emissiveIntensity: 0.5 }));
        marker.position.set(-k.w / 2 + ms, k.slab + k.h * 0.4, k.d / 2 - ms);
        marker.visible = false;
        marker.userData = { section: s, floor: f, cat: 'remarks' };
        g.add(marker);
        const bar = new THREE.Mesh(fillGeo, new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.9 }));
        bar.scale.set(0.001, 0.12, 0.12);
        bar.position.set(-k.w / 2, k.slab + 0.01, k.d / 2 + 0.07);
        bar.visible = false;
        g.add(bar);
        const el = document.createElement('div');
        el.className = 'floor-tag unit-tag';
        el.textContent = floorShort(f);
        el.title = floorName(f);
        const lab = new CSS2DObject(el);
        lab.position.set(0, k.slab + k.h + (LAYOUT === 'hall' ? 1.5 : 0.4), 0);
        g.add(lab);
        this.floors.set(`${s}|${f}`, { section: s, floor: f, group: g, fill, front, side, slab, slabSide, slabTop: slabSide, cols: colsMesh, hit, marker, shell, edges, innerH: k.h, isRoof: false, bar, w: k.w, d: k.d });
      });
      // кровля цеха — лёгкая, видна в «Проекте»
      if (LAYOUT === 'hall') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, Dp + 1), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.4 }));
        roof.position.y = k.slab + k.h + 0.75; roof.castShadow = true; part.add(roof);
        this[`roof${s}`] = roof;
      } else this[`roof${s}`] = new THREE.Group();
      // части — в ряд (квартиры) или друг за другом (цеха)
      if (LAYOUT === 'hall') { part.position.set(0, 0, cursor + Dp / 2); cursor += Dp + k.partGap; }
      else { part.position.set(cursor + W / 2, 0, 0); cursor += W + k.partGap; }
      this.partBox[s] = { w: W, d: Dp };
      const tag = document.createElement('div');
      tag.className = 'section-tag';
      tag.innerHTML = `<b>${T.part} ${s}</b><span data-pct></span>`;
      tag.title = `Показать: ${T.partL} ${s}`;
      tag.addEventListener('click', (e) => { e.stopPropagation(); this.focusSection(s); this.onSection && this.onSection(s); });
      const obj = new CSS2DObject(tag);
      obj.position.set(0, k.slab + k.h + (LAYOUT === 'hall' ? 5 : 1.6), -Dp / 2);
      part.add(obj);
      this[`tag${s}`] = tag;
      this[`part${s}`] = part;
    }
    // центрировать всё вокруг начала координат
    const total = cursor - k.partGap;
    for (const s of SECTIONS) {
      const p = this[`part${s}`];
      if (LAYOUT === 'hall') p.position.z -= total / 2; else p.position.x -= total / 2;
    }
    const box = new THREE.Box3();
    for (const s of SECTIONS) box.expandByObject(this[`part${s}`]);
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    this.bounds = { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    this.resetView();
  }

  fit() { const a = this.camera.aspect || 1.6; return Math.max(1, Math.min(2.4, 1.3 / a)); }
  radius() { const s = this.bounds.size; return Math.max(s.x, s.z, s.y * 2, 6); }

  resetView(animate = false) {
    if (!this.bounds) return;
    const c = this.bounds.center, R = this.radius() * this.fit();
    const tg = new THREE.Vector3(c.x, this.dim.h * 0.3, c.z);
    const pos = new THREE.Vector3(c.x - R * 0.4, R * 1.05, c.z + R * 1.45);
    if (this.selBox) this.selBox.visible = false;
    if (animate) return this.flyTo(pos, tg);
    this.camera.position.copy(pos);
    this.controls.target.copy(tg);
    this.controls.update();
  }

  centerOf(o) { return o.group.getWorldPosition(new THREE.Vector3()); }
  focusFloor(section, floor) {
    const o = this.floors.get(`${section}|${floor}`); if (!o) return;
    const tg = this.centerOf(o); tg.y = this.dim.h * 0.4;
    const dist = Math.max(o.w, o.d) * 2.4 * this.fit();
    const dir = this.camera.position.clone().sub(this.controls.target); dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(-0.3, 0, 1);
    dir.normalize();
    const pos = tg.clone().addScaledVector(dir, dist); pos.y = tg.y + dist * 0.75;
    this.flyTo(pos, tg);
    this.showSelBox(section, floor);
  }
  focusSection(section) {
    const p = this[`part${section}`]; if (!p) return;
    const b = this.partBox[section];
    const tg = p.position.clone(); tg.y = this.dim.h * 0.3;
    const dist = Math.max(b.w, b.d) * 1.5 * this.fit();
    const pos = tg.clone().add(new THREE.Vector3(-dist * 0.3, dist * 0.8, dist));
    this.flyTo(pos, tg);
    if (this.selBox) this.selBox.visible = false;
  }
  showSelBox(section, floor) {
    const o = this.floors.get(`${section}|${floor}`); if (!o) return;
    if (this.selBox) { this.scene.remove(this.selBox); this.selBox.geometry.dispose(); }
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w + 0.3, this.dim.h + 0.3, o.d + 0.3)), new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.95, depthTest: false }));
    this.selBox.renderOrder = 10;
    this.scene.add(this.selBox);
    const c = this.centerOf(o);
    this.selBox.position.set(c.x, this.dim.slab + this.dim.h / 2, c.z);
    this.selBox.visible = true;
  }

  update() {
    const project = this.view === 'project';
    let i = 0;
    for (const o of this.floors.values()) {
      const { section: s, floor: f } = o;
      const v = this.store.floorValue(s, f, this.metric);
      const na = v === null;
      const grow = this.growth == null ? 1 : Math.max(0, Math.min(1, this.growth * 1.6 * this.floors.size - i));
      i++;
      const pm = (na ? 0 : v / 100) * grow;
      const p = project ? grow : pm;
      o.p = p; o.pMetric = pm;
      o.target = Math.max(0.001, (o.w - 0.08) * p);
      o.front.color.set(project || (this.view === 'fact' && p >= 0.999) ? COLORS.finished : p >= 0.999 ? COLORS.full : COLORS.green);
      o.shell.visible = !project && p < 0.999;
      o.edges.visible = !project;
      o.slabSide.transparent = na && !project; o.slabSide.opacity = na && !project ? 0.45 : 1; o.slabSide.needsUpdate = true;
      const open = this.store.remarksFor(s, f).filter((r) => this.store.isOpenRemark(r));
      o.marker.visible = !project && open.length > 0;
      o.bar.scale.x = Math.max(0.001, (o.w - 0.08) * pm);
      o.bar.visible = this.view === 'fact' && pm > 0.001;
    }
    for (const s of SECTIONS) {
      if (this[`roof${s}`]) this[`roof${s}`].visible = project;
      const pct = Math.round(this.store.sectionValue(s, this.metric) || 0);
      if (this[`tag${s}`]) this[`tag${s}`].querySelector('[data-pct]').textContent = project ? 'проект' : `${pct}%`;
    }
    this.paintHighlight();
  }

  paintHighlight() {
    for (const [key, o] of this.floors) {
      const sel = this.selected && key === `${this.selected.section}|${this.selected.floor}`;
      const hov = this.hovered && key === `${this.hovered.section}|${this.hovered.floor}`;
      o.slabSide.color.set(sel ? COLORS.select : hov ? COLORS.hover : COLORS.floor);
      o.slabSide.emissive.set(sel ? COLORS.select : hov ? COLORS.hover : 0x000000);
      o.slabSide.emissiveIntensity = sel || hov ? 0.45 : 0;
      o.front.emissive.set(sel ? COLORS.select : hov ? COLORS.hover : 0x000000);
      o.front.emissiveIntensity = sel ? 0.25 : hov ? 0.18 : 0;
    }
  }

  /** Тур: облёт по кругу, уровни заполняются по очереди */
  tour(p) {
    if (!this.bounds) return;
    const c = this.bounds.center, R = this.radius() * this.fit();
    const az = THREE.MathUtils.degToRad(-60 + p * 220), el = THREE.MathUtils.degToRad(25 + p * 30), dist = R * (1.6 - p * 0.4);
    const tg = new THREE.Vector3(c.x, this.dim.h * 0.3, c.z);
    this.tourCam = { pos: new THREE.Vector3(tg.x + dist * Math.cos(el) * Math.sin(az), tg.y + dist * Math.sin(el), tg.z + dist * Math.cos(el) * Math.cos(az)), tg };
    const g = Math.max(0, Math.min(1, p / 0.6));
    if (g !== this.growth) { this.growth = g; this.update(); }
  }
}
