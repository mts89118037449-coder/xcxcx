import { useEffect, useState } from 'react';
import type { VisitView } from '../shared/types.ts';
import { api, ApiError } from './api.ts';
import { Stage } from './art/Stage.tsx';
import { Face } from './art/sprites.tsx';
import { fmt, useGame } from './game.tsx';

/** Хата соседа: его отделка, мебель и он сам, плюс «уважить». */
export function VisitModal({ id, onClose }: { id: number; onClose(): void }) {
  const { p, act, toast, busy } = useGame();
  const [v, setV] = useState<VisitView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.visit(id).then((r) => setV(r.visit)).catch((e) => setErr(e instanceof ApiError ? e.message : 'Ошибка'));
  }, [id]);

  const respect = async () => {
    if ((await act('respect', { id })) === null) return;
    toast(`Уважил ${v?.name}. +5 опыта`);
    setV((x) => (x ? { ...x, respectedToday: true, authority: x.authority + 1 } : x));
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {err && <div className="center muted">{err}</div>}
        {!v && !err && <div className="center muted">Стучим в хату…</div>}
        {v && (
          <>
            <div className="arena">
              <Stage
                loc="cell"
                look={{ equipped: {}, tattoos: v.tattoos, str: 10, face: v.face, build: v.build, skin: v.skin }}
                mood="idle"
                furniture={v.furniture}
                interior={v.interior}
                anim=""
                animKey={0}
              />
            </div>
            <div className="row">
              <div className="row gap-s">
                <Face face={v.face} size={48} />
                <div>
                  <b>
                    {v.clan && <span className="tag">[{v.clan.tag}]</span>} {v.name}
                  </b>
                  <div className="muted small">
                    {v.online ? '🟢 на зоне' : '⚫ не в сети'} · {v.rank} · ур. {v.level}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid3" style={{ margin: '10px 0' }}>
              <div className="stat"><span>🎖️</span><b>{fmt(v.authority)}</b><small>авторитет</small></div>
              <div className="stat"><span>🥊</span><b>{v.wins}</b><small>побед</small></div>
              <div className="stat"><span>🛋️</span><b>{v.furniture.length}</b><small>мебели</small></div>
            </div>
            {v.id !== p.id && (
              <button className="btn btn-wide" disabled={busy || v.respectedToday} onClick={respect}>
                {v.respectedToday ? 'Уже уважил сегодня' : '🤝 Уважить (+1 авторитета хозяину)'}
              </button>
            )}
            <button className="btn btn-wide btn-dark" style={{ marginTop: 8 }} onClick={onClose}>
              Выйти из хаты
            </button>
          </>
        )}
      </div>
    </div>
  );
}
