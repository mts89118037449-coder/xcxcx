import type { Look } from '../../../shared/types.ts';
import { Rig, RigHead, ANIM_PROP, type RigAnim } from './Rig.tsx';
import { ToonBody, toonPose } from './Toon.tsx';

const L = (equipped: Look['equipped'], face = 0, extra: Partial<Look> = {}): Look => ({ equipped, tattoos: [], str: 10, face, build: 1, skin: 0, ...extra });

/** Отладка рига: /?rig=1 — все анимации и вещи на одном экране. */
export function RigGallery() {
  const anims: RigAnim[] = ['idle', 'walk', 'run', 'sit', 'guard', 'punch', 'kick', 'dodge', 'hit', 'taunt', 'cheer', 'work', 'crossed', 'floor', 'ko', 'smoke', 'drink', 'eat', 'think', 'stretch', 'wave', 'flex', 'cold', 'squat', 'pushup', 'sleep', 'dance', 'pullup', 'crouch', 'talk', 'scratch', 'yawn'];
  const looks: Look[] = [
    L({}, 0, { tattoos: ['t_church', 't_stars', 't_spider', 't_rose', 't_eagle', 't_rings', 't_dagger', 't_skull', 't_epaulets'] }),
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
    L({ body: 'body_hoodie', legs: 'legs_varenki', feet: 'feet_sneakers', head: 'cap_baseball', weapon: 'wpn_pipe' }, 30),
    L({ body: 'body_flannel', legs: 'legs_wadded', feet: 'feet_valenki', charm: 'charm_watch', weapon: 'wpn_toothbrush' }, 101, { skin: 1 }),
    L({ body: 'body_olympic', legs: 'legs_jeans', feet: 'feet_sneakers', head: 'cap_vdv', weapon: 'wpn_razor' }, 145),
    L({ body: 'body_crimson', legs: 'legs_black', feet: 'feet_lacquer', head: 'cap_mink', charm: 'charm_fiksa' }, 212, { skin: 2 }),
    L({ body: 'body_sheepskin', legs: 'legs_black', feet: 'feet_valenki', weapon: 'wpn_nunchaku' }, 180, { build: 2 }),
    L({ body: 'body_orange', legs: 'legs_pants', feet: 'feet_slippers' }, 48, { build: 0 }),
    L({}, 70, { tattoos: ['t_madonna', 't_wolf', 't_snake', 't_owl', 't_clock', 't_cards', 't_dots', 't_knee_stars', 't_lion', 't_crown', 't_epaulets'], str: 40, build: 2, skin: 3 }),
    L({ legs: 'legs_pants', charm: 'charm_dogtag' }, 250, { tattoos: ['t_epaulets', 't_eagle', 't_rose'] }),
  ];
  const q = new URLSearchParams(location.search);
  const only = q.get('anim') as RigAnim | null;
  // ?t=мс — застывший кадр анимации в этот момент (проверка поз)
  const at = q.get('t');
  // ?fx=1 — все следы на лице сразу (проверка эмоций)
  const fx = q.get('fx') ? { sweat: true, blood: true, bruise: true, smile: q.get('fx') === 'smile' } : undefined;
  return (
    <div style={{ background: '#6e6b5c', padding: 8 }}>
      <svg viewBox={`0 0 ${120 * 4} ${220 * Math.ceil(anims.length / 4)}`} width="100%" style={{ background: '#57544a' }}>
        {anims.map((a, i) => (
          <g key={a} transform={`translate(${(i % 4) * 120} ${Math.floor(i / 4) * 220})`}>
            {at ? <ToonBody look={looks[6]} pose={toonPose(only ?? a, +at)} uid={`g${i}`} prop={ANIM_PROP[only ?? a]} time={+at} fx={fx} ko={(only ?? a) === 'ko'} /> : <Rig look={looks[6]} anim={only ?? a} fidget={false} />}
            <text x={4} y={14} fontSize={10} fill="#fff">{a}</text>
          </g>
        ))}
      </svg>
      <svg viewBox={`0 0 ${120 * 4} ${220 * Math.ceil(looks.length / 4)}`} width="100%" style={{ background: '#4a4740', marginTop: 8 }}>
        {looks.map((l, i) => (
          <g key={i} transform={`translate(${(i % 4) * 120} ${Math.floor(i / 4) * 220})`}>
            <Rig look={l} anim={only ?? 'idle'} fidget={false} />
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
