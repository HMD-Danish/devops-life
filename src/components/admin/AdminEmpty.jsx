export default function AdminEmpty({ icon: Icon, title, body }) {
  return (
    <div className="glass-thin flex flex-col items-center gap-2 px-5 py-10 text-center">
      {Icon ? (
        <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-fill/80 text-label-secondary">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <p className="type-headline text-[15px]">{title}</p>
      {body ? <p className="type-caption max-w-sm text-[12.5px] leading-relaxed">{body}</p> : null}
    </div>
  );
}