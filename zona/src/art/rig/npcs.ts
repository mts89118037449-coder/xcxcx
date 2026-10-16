// Внешность НПС для рига: у каждого свой набор одежды, лицо, сложение и манера стоять.
import { faceOf } from '../../../shared/content.ts';
import type { Look } from '../../../shared/types.ts';
import type { RigAnim } from './Rig.tsx';

const f = (hair: number, beard: number, jaw = 0, brow = 0) => faceOf({ hair, beard, jaw, brow });
const L = (equipped: Look['equipped'], face: number, extra: Partial<Look> = {}): Look => ({ equipped, tattoos: [], str: 15, face, build: 1, skin: 0, ...extra });

export interface NpcRig {
  look: Look;
  anim: RigAnim;
}

export const NPC_RIGS: Record<string, NpcRig> = {
  // сокамерники и соперники
  'sheet/rival/0': { look: L({ body: 'body_robe', legs: 'legs_pants', feet: 'feet_slippers' }, f(1, 1, 1)), anim: 'idle' },
  'sheet/rival/1': { look: L({ body: 'body_tank', legs: 'legs_pants', feet: 'feet_kirza' }, f(0, 1, 2, 1), { build: 2, str: 45, tattoos: ['t_church', 't_stars', 't_tiger', 't_rose'] }), anim: 'crossed' },
  'sheet/rival/2': { look: L({ body: 'body_smock', legs: 'legs_pants', feet: 'feet_slippers' }, f(2, 0, 1)), anim: 'idle' },
  'sheet/rival/3': { look: L({ body: 'body_tracksuit', feet: 'feet_sneakers', head: 'cap_bandana' }, f(2, 1, 1), { build: 0 }), anim: 'idle' },
  'sheet/rival/4': { look: L({ body: 'body_overalls', legs: 'legs_pants', feet: 'feet_kirza' }, f(4, 0, 1), { build: 0 }), anim: 'idle' },
  'sheet/rival/5': { look: L({ body: 'body_telnyashka', legs: 'legs_pants', feet: 'feet_slippers', head: 'cap_knit' }, f(1, 2, 0), { skin: 2 }), anim: 'crossed' },
  // персонажи зоны
  'sheet/cast/ushanka': { look: L({ body: 'body_quilted', legs: 'legs_pants', feet: 'feet_kirza', head: 'cap_ushanka' }, f(7, 5, 0), { skin: 1 }), anim: 'idle' },
  'sheet/cast/worker': { look: L({ body: 'body_overalls', legs: 'legs_pants', feet: 'feet_kirza', head: 'cap_knit' }, f(2, 3, 2), { build: 2 }), anim: 'crossed' },
  'sheet/cast/coverall': { look: L({ body: 'body_overalls', legs: 'legs_pants', feet: 'feet_kirza' }, f(4, 0, 1), { build: 0 }), anim: 'idle' },
  'sheet/cast/sport': { look: L({ body: 'body_tracksuit', feet: 'feet_sneakers', charm: 'charm_cross' }, f(1, 1, 0), { build: 1 }), anim: 'crouch' },
  'sheet/cast/doctor': { look: L({ body: 'npc_whitecoat', feet: 'feet_sneakers' }, f(3, 3, 1), { skin: 1 }), anim: 'crossed' },
  'sheet/cast/priest': { look: L({ body: 'npc_cassock', feet: 'feet_kirza', charm: 'charm_cross' }, f(6, 5, 0), { skin: 1 }), anim: 'idle' },
  'sheet/cast/officer': { look: L({ body: 'npc_guard', feet: 'feet_kirza', head: 'hat_police' }, f(2, 3, 0, 1)), anim: 'crossed' },
  'sheet/cast/omon': { look: L({ body: 'npc_black', feet: 'feet_kirza', head: 'hat_helmet', weapon: 'drop_baton' }, f(1, 1, 2, 1), { build: 2 }), anim: 'guard' },
  'sheet/cast/spetsnaz': { look: L({ body: 'npc_black', feet: 'feet_kirza', head: 'hat_beret' }, f(1, 1, 0, 1), { build: 2 }), anim: 'crossed' },
  'sheet/cast/guardwoman': { look: L({ body: 'npc_guard', feet: 'feet_kirza', head: 'hat_police' }, f(6, 0, 1), { build: 0 }), anim: 'idle' },
  'sheet/cast/blatnoy': { look: L({ body: 'body_leather', legs: 'legs_jeans', feet: 'feet_sneakers', head: 'cap_bandana', charm: 'charm_ring' }, f(3, 1, 0, 1), { tattoos: ['t_stars', 't_church'] }), anim: 'smoke' },
  'sheet/cast/avtoritet': { look: L({ body: 'body_parka', legs: 'legs_jeans', feet: 'feet_sneakers', head: 'cap_gold', charm: 'charm_cross' }, f(7, 2, 2, 1), { build: 2 }), anim: 'crossed' },
  'sheet/cast/brute': { look: L({ body: 'body_tank', legs: 'legs_cargo', feet: 'feet_kirza' }, f(0, 2, 2, 1), { build: 2, str: 50, tattoos: ['t_tiger', 't_eagle', 't_spider'] }), anim: 'crossed' },
  'sheet/cast/cook': { look: L({ body: 'npc_chef', feet: 'feet_slippers', head: 'hat_chef' }, f(0, 3, 2), { build: 2 }), anim: 'drink' },
  'sheet/cast/hermit': { look: L({ body: 'body_smock', legs: 'legs_pants', feet: 'feet_slippers' }, f(6, 5, 1), { build: 0, skin: 1 }), anim: 'cold' },
  'sheet/cast/kolshik': { look: L({ body: 'body_tank', legs: 'legs_pants', feet: 'feet_slippers' }, f(5, 3, 1), { tattoos: ['t_church', 't_stars', 't_spider', 't_cat', 't_rose', 't_eagle'] }), anim: 'idle' },
  'sheet/cast/lawyer': { look: L({ body: 'npc_suit', feet: 'feet_sneakers' }, f(3, 0, 1)), anim: 'idle' },
  'sheet/cast/oldman': { look: L({ body: 'body_quilted', legs: 'legs_pants', feet: 'feet_slippers', head: 'cap_knit' }, f(7, 2, 1), { build: 0, skin: 1 }), anim: 'smoke' },
  'sheet/cast/writer': { look: L({ body: 'body_vest', legs: 'legs_pants', feet: 'feet_slippers' }, f(4, 4, 1)), anim: 'think' },
  'sheet/cast/thin': { look: L({ body: 'body_robe', legs: 'legs_pants', feet: 'feet_slippers' }, f(1, 1, 1), { build: 0 }), anim: 'idle' },
  'sheet/cast/youngster': { look: L({ body: 'body_robe', legs: 'legs_pants', feet: 'feet_sneakers' }, f(4, 0, 1), { build: 0 }), anim: 'idle' },
  'sheet/cast/seller': { look: L({ body: 'body_apron', feet: 'feet_slippers' }, f(6, 0, 1), { build: 0 }), anim: 'idle' },
  'sheet/cast/bandaged': { look: L({ body: 'body_gown', feet: 'feet_slippers' }, f(1, 1, 0), { skin: 1 }), anim: 'idle' },
  'sheet/cast/barber': { look: L({ body: 'npc_whitecoat', legs: 'legs_black', feet: 'feet_lacquer' }, f(3, 3, 1), { build: 0 }), anim: 'idle' },
  'sheet/cast/librarian': { look: L({ body: 'body_flannel', legs: 'legs_pants', feet: 'feet_slippers', charm: 'charm_watch' }, f(7, 4, 1), { build: 0, skin: 1 }), anim: 'think' },
  'sheet/cast/gypsy': { look: L({ body: 'body_crimson', legs: 'legs_black', feet: 'feet_lacquer', charm: 'charm_fiksa', head: 'cap_mink' }, f(6, 2, 0), { skin: 2 }), anim: 'smoke' },
  // боссы
  // боссы колоний
  'sheet/boss/b_lumber': { look: L({ body: 'body_quilted', legs: 'legs_wadded', feet: 'feet_valenki', head: 'cap_ushanka', weapon: 'wpn_axe' }, f(0, 2, 2), { build: 2, str: 45 }), anim: 'guard' },
  'sheet/boss/b_frost': { look: L({ body: 'drop_greatcoat', feet: 'feet_valenki', head: 'cap_ushanka', weapon: 'drop_baton' }, f(7, 3, 2, 1), { build: 2, str: 55 }), anim: 'guard' },
  'sheet/boss/b_pakhan': { look: L({ body: 'body_tank', legs: 'legs_black', feet: 'feet_slippers', charm: 'charm_cross' }, f(6, 2, 2, 1), { build: 2, str: 45, tattoos: ['t_church', 't_stars', 't_epaulets'] }), anim: 'guard' },
  'sheet/boss/b_korpus': { look: L({ body: 'npc_guard', feet: 'feet_kirza', head: 'hat_police', weapon: 'drop_baton', charm: 'charm_watch' }, f(1, 3, 2, 1), { build: 2, str: 55 }), anim: 'guard' },
  'sheet/boss/b_sdp': { look: L({ body: 'body_robe', legs: 'legs_pants', feet: 'feet_kirza', head: 'cap_knit' }, f(3, 4, 1, 1), { build: 1, str: 35 }), anim: 'guard' },
  'sheet/boss/b_podpolkovnik': { look: L({ body: 'npc_general', feet: 'feet_kirza', head: 'drop_major_cap', weapon: 'drop_baton' }, f(2, 3, 2, 1), { build: 2, str: 58 }), anim: 'guard' },
  'sheet/boss/b_rat': { look: L({ body: 'body_smock', legs: 'legs_pants', feet: 'feet_slippers', weapon: 'wpn_spoon' }, f(4, 1, 1, 1), { build: 0 }), anim: 'guard' },
  'sheet/boss/b_guard': { look: L({ body: 'npc_guard', feet: 'feet_kirza', head: 'hat_police', weapon: 'drop_baton' }, f(2, 3, 0, 1), { build: 1 }), anim: 'guard' },
  'sheet/boss/b_chief': { look: L({ body: 'npc_black', feet: 'feet_kirza', head: 'hat_police', weapon: 'drop_baton' }, f(0, 2, 2, 1), { build: 2, str: 50 }), anim: 'guard' },
  'sheet/boss/b_pickpocket': { look: L({ body: 'body_hoodie', legs: 'legs_pants', feet: 'feet_sneakers', charm: 'drop_gloves' }, f(4, 1, 1)), anim: 'guard' },
  'sheet/boss/b_zavhoz': { look: L({ body: 'body_apron', legs: 'legs_pants', feet: 'feet_kirza', head: 'cap_knit', weapon: 'wpn_pipe' }, f(0, 3, 2), { build: 2, str: 30 }), anim: 'guard' },
  'sheet/boss/b_dog': { look: L({ body: 'body_camo', feet: 'feet_kirza', head: 'hat_beret', weapon: 'wpn_chain' }, f(1, 1, 0, 1), { build: 1, str: 35 }), anim: 'guard' },
  'sheet/boss/b_snitch': { look: L({ body: 'body_quilted', legs: 'legs_pants', feet: 'feet_slippers', weapon: 'wpn_toothbrush' }, f(4, 4, 1, 1), { build: 0 }), anim: 'guard' },
  'sheet/boss/b_medic': { look: L({ body: 'npc_whitecoat', feet: 'feet_lacquer', weapon: 'drop_scalpel' }, f(0, 4, 1, 1), { skin: 1, str: 35 }), anim: 'guard' },
  'sheet/boss/b_smotr': { look: L({ body: 'drop_smotr_coat', legs: 'legs_black', feet: 'feet_lacquer', head: 'cap_bandana', charm: 'charm_cross', weapon: 'wpn_golden' }, f(7, 5, 2, 1), { build: 2, str: 50, tattoos: ['t_stars', 't_church', 't_rings'] }), anim: 'guard' },
  'sheet/boss/b_major': { look: L({ body: 'npc_guard', feet: 'feet_kirza', head: 'drop_major_cap', weapon: 'drop_baton' }, f(2, 3, 2, 1), { build: 2, str: 55 }), anim: 'guard' },
  'sheet/boss/b_gluhar': { look: L({ body: 'body_leather', legs: 'legs_jeans', feet: 'feet_lacquer', charm: 'charm_watch' }, f(2, 1, 0, 1), { build: 1, str: 45 }), anim: 'guard' },
  'sheet/boss/b_streamer': { look: L({ body: 'body_hoodie', legs: 'legs_varenki', feet: 'feet_sneakers', head: 'cap_baseball', charm: 'charm_fiksa' }, f(4, 1, 1, 1), { build: 0, str: 40 }), anim: 'guard' },
  'sheet/boss/b_prosecutor': { look: L({ body: 'drop_prosecutor_suit', feet: 'feet_lacquer', charm: 'charm_watch' }, f(3, 0, 1, 1), { build: 1, str: 55, skin: 1 }), anim: 'guard' },
  'sheet/boss/b_kum': { look: L({ body: 'npc_suit', feet: 'feet_lacquer', charm: 'charm_watch', weapon: 'wpn_razor' }, f(3, 3, 1, 1), { build: 1, str: 40 }), anim: 'guard' },
  'sheet/boss/b_general': { look: L({ body: 'drop_greatcoat', feet: 'feet_kirza', head: 'drop_cap_general', weapon: 'drop_baton' }, f(7, 3, 2, 1), { build: 2, str: 50 }), anim: 'guard' },
  'sheet/boss/b_thief': { look: L({ body: 'body_crimson', legs: 'legs_black', feet: 'feet_lacquer', head: 'cap_mink', charm: 'drop_ring_thief', weapon: 'wpn_golden' }, f(6, 2, 2, 1), { build: 1, str: 45, tattoos: ['t_stars', 't_church', 't_rings', 't_epaulets'], skin: 1 }), anim: 'guard' },
  'sheet/boss/b_typhoon': { look: L({ body: 'npc_black', feet: 'feet_kirza', head: 'drop_helmet', weapon: 'drop_baton' }, f(1, 1, 2, 1), { build: 2, str: 60 }), anim: 'guard' },
  'sheet/boss/b_warden': { look: L({ body: 'npc_general', feet: 'feet_kirza', head: 'hat_police', charm: 'charm_ring' }, f(3, 3, 2, 1), { build: 2, str: 40 }), anim: 'guard' },
};
