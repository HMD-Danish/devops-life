export default function StatCard({ label, value, hint }) {
  return (
    <div className="glass-thin p-4">
      <p className="type-overline text-[10px]">{label}</p>
      <p className="type-title mt-1.5 text-[24px] leading-none tabular-nums">{value}</p>
      {hint ? <p className="type-caption mt-1.5 text-[11px] leading-snug">{hint}</p> : null}
    </div>
  );
}