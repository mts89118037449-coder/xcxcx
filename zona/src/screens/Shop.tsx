import { useState } from 'react';
import { GOLD_PRICES, STAR_PACKS, type StarPack } from '../../shared/content.ts';
import { api, ApiError, tg } from '../api.ts';
import { NpcBanner } from '../art/sprites.tsx';
import { Card, Price, timeLeft, useGame } from '../game.tsx';

export function Shop() {
  const { p, now, refresh, toast } = useGame();
  const [pending, setPending] = useState<string | null>(null);

  const buy = async (pack: StarPack) => {
    if (!tg?.initData) return toast('Покупка работает только внутри Telegram', 'err');
    setPending(pack.id);
    try {
      const { link } = await api.invoice(pack.id);
      tg.openInvoice(link, async (status) => {
        setPending(null);
        if (status !== 'paid') return;
        toast('Оплата прошла, зачисляем…');
        // Зачисление приходит на сервер через webhook, обычно за секунду.
        const gold = p.gold;
        const vip = p.vipUntil;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const me = await api.me().catch(() => null);
          if (me && (me.player.gold !== gold || me.player.vipUntil !== vip)) break;
        }
        await refresh();
        toast(`✅ ${pack.title} — зачислено!`);
      });
    } catch (e) {
      setPending(null);
      toast(e instanceof ApiError ? e.message : 'Не удалось открыть оплату', 'err');
    }
  };

  const packs = STAR_PACKS.filter((x) => !(x.id === 'starter' && p.starterBought));

  return (
    <>
      <NpcBanner who="seller" name="Люба из ларька" text="Золотишко, статус, грев — всё есть, было бы чем платить" />
      <Card className="center">
        <div className="big">🪙 {p.gold}</div>
        <div className="muted small">
          Золото: чифир (⚡ полная энергия) — {GOLD_PRICES.energyRefill}, санчасть — {GOLD_PRICES.heal}, откат босса —{' '}
          {GOLD_PRICES.bossReset}, золотые шмотки и наколки
        </div>
        {p.vipUntil && <div className="vip-on">👑 Блатной ещё {timeLeft(p.vipUntil - now)}</div>}
      </Card>

      {packs.map((pack) => (
        <Card key={pack.id} className={pack.vipDays ? 'premium' : ''}>
          <div className="row">
            <div className="grow">
              <b>
                {pack.vipDays && !pack.gold ? '👑' : '🪙'} {pack.title}
              </b>
              {pack.badge && <span className="badge">{pack.badge}</span>}
              <div className="muted small">{pack.description}</div>
            </div>
            <button className="btn btn-gold" disabled={pending !== null} onClick={() => buy(pack)}>
              {pending === pack.id ? '…' : <Price amount={pack.stars} currency="stars" />}
            </button>
          </div>
        </Card>
      ))}

      <div className="muted small center">
        Оплата — Telegram Stars. Проблемы с покупкой: команда /paysupport в боте.
      </div>
    </>
  );
}
