export default function AdminSkeleton({ rows = 3, className }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="space-y-2">
        {Array.from({ length: rows }).map((unused, index) => (
          <div key={index} className="glass-thin h-[74px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}