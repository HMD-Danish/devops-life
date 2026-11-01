import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { compareVersions, isVersion, suggestions, versionWindow } from "@/lib/releases";
import { cn } from "@/lib/utils";

function Row({ label, hint, disabled, onClick, active }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active || false}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px]",
        disabled ? "cursor-not-allowed text-label-secondary/60" : "hover:bg-fill/70",
        active && "bg-primary/10 text-primary"
      )}
    >
      <span className="terminal-font">{label}</span>
      {hint ? <span className="shrink-0 text-[10.5px] uppercase tracking-[0.06em]">{hint}</span> : null}
    </button>
  );
}

/**
 * The version dropdown. It offers the next three versions, then every version
 * after the live one in order, 25 at a time, and never needs a fixed list.
 */
export default function VersionPicker({ live, value, versions, onPick }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(25);
  const boxRef = useRef(null);
  const taken = useMemo(() => new Set(versions || []), [versions]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const top = useMemo(() => suggestions(live), [live]);
  const all = useMemo(() => versionWindow(live, Math.max(25, count)), [live, count]);

  const term = search.trim();
  const visible = term ? all.filter((version) => version.includes(term)) : all;
  const exact = isVersion(term) ? term : "";

  const usable = (version) => version === value || (!taken.has(version) && compareVersions(version, live) > 0);

  const pick = (version) => {
    onPick(version);
    setOpen(false);
    setSearch("");
  };

  const onScroll = (event) => {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) setCount((n) => n + 25);
  };

  const hintFor = (version) =>
    version === top[0] ? "Patch" : version === top[1] ? "Minor" : version === top[2] ? "Major" : "";

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="press glass-thin flex h-11 w-full items-center justify-between gap-2 rounded-inner px-3 text-[14px]"
      >
        <span className={cn("terminal-font", !value && "text-label-secondary")}>
          {value ? `v${value}` : "Choose a version"}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-label-secondary transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute inset-x-0 z-40 mt-1 overflow-hidden rounded-inner border border-separator bg-surface shadow-[0_18px_44px_-26px_rgba(15,23,42,0.5)]">
          <div className="flex items-center gap-2 border-b border-separator/60 px-3">
            <Search className="h-3.5 w-3.5 text-label-secondary" aria-hidden="true" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search, or type 2.10.0"
              className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-label-secondary"
            />
          </div>

          <div onScroll={onScroll} className="max-h-[252px] overflow-y-auto py-1" role="listbox">
            {exact && usable(exact) && !taken.has(exact) ? (
              <Row label={`Use v${exact}`} hint="Custom" onClick={() => pick(exact)} />
            ) : null}

            {!term ? (
              <>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-label-secondary">
                  Suggested
                </p>
                {top.map((version) => (
                  <Row
                    key={version}
                    label={`v${version}`}
                    hint={taken.has(version) ? "Exists" : hintFor(version)}
                    disabled={!usable(version)}
                    active={version === value}
                    onClick={() => pick(version)}
                  />
                ))}
              </>
            ) : null}

            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-label-secondary">
              All versions
            </p>
            {visible.length ? (
              visible.map((version) => (
                <Row
                  key={version}
                  label={`v${version}`}
                  hint={taken.has(version) ? "Exists" : ""}
                  disabled={!usable(version)}
                  active={version === value}
                  onClick={() => pick(version)}
                />
              ))
            ) : (
              <p className="px-3 py-2 text-[12.5px] text-label-secondary">Nothing matches yet.</p>
            )}

            <button
              type="button"
              onClick={() => setCount((n) => n + 25)}
              className="press mx-2 my-1 w-[calc(100%-1rem)] rounded-inner px-2 py-2 text-left text-[12.5px] font-medium text-primary hover:bg-fill/60"
            >
              Load more versions
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}