import type { Look } from '../../../shared/types.ts';
import { Rig, RigHead, type RigAnim } from './Rig.tsx';

const L = (equipped: Look['equipped'], face = 0, extra: Partial<Look> = {}): Look => ({ equipped, tattoos: [], str: 10, face, build: 1, skin: 0, ...extra });

/** Отладка рига: /?rig=1 — все анимации и вещи на одном экране. */
export function RigGallery() {
  const anims: RigAnim[] = ['idle', 'walk', 'run', 'sit', 'guard', 'punch', 'hit', 'cheer', 'work', 'crossed', 'floor', 'ko'];
  const looks: Look[] = [
    L({}, 0, { tattoos: ['t_church', 't_stars', 't_spider', 't_rose', 't_eagle'] }),
    L({ body: 'body_tank', legs: 'legs_pants', feet: 'feet_slippers' }, 17),
    L({ body: 'body_telnyashka', legs: 'legs_jeans', feet: 'feet_sneakers', head: 'cap_knit' }, 42),
    L({ body: 'body_robe', legs: 'legs_pants', feet: 'feet_kirza' }, 90),
    L({ body: 'body_quilted', legs: 'legs_pants', feet: 'feet_kirza', head: 'cap_ushanka' }, 130, { build: 2 }),
    L({ body: 'body_camo', feet: 'feet_kirza', weapon: 'wpn_rebar' }, 201),
    L({ body: 'body_leather', legs: 'legs_jeans', feet: 'feet_sneakers', head: 'cap_bandana', charm: 'charm_cross' }, 250),
    L({ body: 'body_alaska', legs: 'legs_cargo', feet: 'feet_kirza', head: 'cap_gold' }, 66, { skin: 2 }),
    L({ body: 'body_tracksuit', feet: 'feet_sneakers', weapon: 'wpn_knuckles' }, 3, { build: 0 }),
    L({ body: 'drop_uniform', feet: 'feet_kirza', weapon: 'drop_baton' }, 110),
    L({ body: 'drop_coat', legs: 'legs_pants', feet: 'feet_kirza', head: 'drop_crown' }, 280, { skin: 3, build: 2 }),
    L({ body: 'body_bib', feet: 'feet_sneakers' }, 55),
    L({ body: 'body_apron', legs: 'legs_pants', feet: 'feet_slippers' }, 77),
    L({ body: 'body_vest', legs: 'legs_cargo', feet: 'feet_kirza', weapon: 'wpn_golden' }, 160, { tattoos: ['t_tiger', 't_cat'] }),
    L({ body: 'body_parka', legs: 'legs_jeans', feet: 'feet_kirza' }, 222),
    L({ body: 'body_gown', feet: 'feet_slippers' }, 8, { skin: 1 }),
  ];
  const q = new URLSearchParams(location.search);
  const only = q.get('anim') as RigAnim | null;
  return (
    <div style={{ background: '#6e6b5c', padding: 8 }}>
      <svg viewBox={`0 0 ${120 * 4} ${220 * 3}`} width="100%" style={{ background: '#57544a' }}>
        {anims.map((a, i) => (
          <g key={a} transform={`translate(${(i % 4) * 120} ${Math.floor(i / 4) * 220})`}>
            <Rig look={looks[6]} anim={only ?? a} />
            <text x={4} y={14} fontSize={10} fill="#fff">{a}</text>
          </g>
        ))}
      </svg>
      <svg viewBox={`0 0 ${120 * 4} ${220 * 4}`} width="100%" style={{ background: '#4a4740', marginTop: 8 }}>
        {looks.map((l, i) => (
          <g key={i} transform={`translate(${(i % 4) * 120} ${Math.floor(i / 4) * 220})`}>
            <Rig look={l} anim={only ?? 'idle'} />
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        {Array.from({ length: 24 }, (_, i) => (
          <RigHead key={i} look={L({}, i * 12 + (i % 8), { skin: i % 4 })} size={56} />
        ))}
      </div>
    </div>
  );
}
