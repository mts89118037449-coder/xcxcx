/** Значок ленты «Сейчас важно»: иконка, короткая подпись, красная точка — если есть что сделать. */
export function NowChip({ icon, label, sub, hot, onClick }: { icon: React.ReactNode; label: string; sub?: string; hot?: boolean; onClick(): void }) {
  return (
    <button className={`now-chip ${hot ? 'hot' : ''}`} onClick={onClick}>
      <span className="now-ico">{icon}</span>
      <b>{label}</b>
      {sub && <small>{sub}</small>}
    </button>
  );
}
