import { useCallback, useEffect, useRef, useState } from 'react';
import { PHRASE_GROUPS, phraseById } from '../shared/chat.ts';
import { api } from './api.ts';
import { Face } from './art/sprites.tsx';
import { useGame } from './game.tsx';
import { frameClass, titleOf } from './Season.tsx';

type Msg = Awaited<ReturnType<typeof api.chat>>['messages'][number];

/** Чат барака: готовые фразы, общий канал и клановый. */
export function ChatPanel() {
  const { p, act, busy, visit } = useGame();
  const [channel, setChannel] = useState<'all' | 'clan'>('all');
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [group, setGroup] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    api.chat(channel).then((r) => setMsgs(r.messages)).catch(() => {});
  }, [channel]);
  useEffect(() => {
    setMsgs(null);
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs?.length]);
  const say = async (phrase: string) => {
    if ((await act('chatSay', { channel, phrase })) !== null) load();
  };
  const time = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="chat">
      <div className="chips">
        <button className={channel === 'all' ? 'active' : ''} onClick={() => setChannel('all')}>
          🏚️ Барак
        </button>
        <button className={channel === 'clan' ? 'active' : ''} disabled={!p.clan} onClick={() => setChannel('clan')}>
          🏴 {p.clan ? `Клан [${p.clan.tag}]` : 'Клан'}
        </button>
      </div>
      <div className="chat-box" ref={box}>
        {!msgs && <div className="muted center small">Загрузка…</div>}
        {msgs?.length === 0 && <div className="muted center small">Тишина. Скажи первым.</div>}
        {msgs?.map((m) => (
          <div key={m.id} className={`chat-msg ${m.pid === p.id ? 'me' : ''}`}>
            {m.pid !== p.id && (
              <button className={`chat-face ${frameClass(m.frame)}`} onClick={() => visit(m.pid)}>
                <Face face={m.face} size={32} />
              </button>
            )}
            <div className="chat-bubble">
              {m.pid !== p.id && (
                <b>
                  {m.name}
                  {titleOf(m.title) && <em className="chat-title"> · {titleOf(m.title)}</em>}
                </b>
              )}
              <span>{phraseById.get(m.phrase)?.text ?? '…'}</span>
              <small>{time(m.at)}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="chips">
        {PHRASE_GROUPS.map((g, i) => (
          <button key={g.name} className={group === i ? 'active' : ''} onClick={() => setGroup(i)}>
            {g.emoji} {g.name}
          </button>
        ))}
      </div>
      <div className="chat-phrases">
        {PHRASE_GROUPS[group].items.map((ph) => (
          <button key={ph.id} className="chat-phrase" disabled={busy} onClick={() => say(ph.id)}>
            {ph.text}
          </button>
        ))}
      </div>
    </div>
  );
}
