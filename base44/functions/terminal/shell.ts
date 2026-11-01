export type Line = { text: string; tone?: string };

export const line = (text = "", tone?: string): Line => (tone ? { text, tone } : { text });

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/** Splits `cmd > file` / `cmd >> file` so commands rarely need to care. */
export function splitRedirect(input: string): {
  command: string;
  redirect: { path: string; append: boolean } | null;
} {
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") {
      const append = input[i + 1] === ">";
      const rest = input.slice(i + (append ? 2 : 1)).trim();
      return {
        command: input.slice(0, i).trim(),
        redirect: rest ? { path: rest.split(/\s+/)[0], append } : null,
      };
    }
  }
  return { command: input, redirect: null };
}

const VALUE_FLAGS = new Set([
  "-n", "--namespace", "-o", "--tail", "--since", "-m", "-F", "--file",
  "--replicas", "--limits", "--requests", "--cpu-percent", "--min", "--max",
  "--name", "--region", "--profile", "--instance-ids", "--type", "--query",
  "--filter", "--tag", "--image", "--interval", "--context", "--output",
  "--format", "--from-literal", "--min-count", "--max-count", "--severity",
  "--exit-code", "--app", "--revision", "--to-revision", "--timeout", "--set",
]);

export function parseArgs(tokens: string[]) {
  const flags: Record<string, string | true> = {};
  const args: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-") && t !== "-") {
      const eq = t.indexOf("=");
      if (eq > -1) {
        flags[t.slice(0, eq)] = t.slice(eq + 1);
        continue;
      }
      if (VALUE_FLAGS.has(t) && tokens[i + 1] && !tokens[i + 1].startsWith("-")) {
        flags[t] = tokens[i + 1];
        i++;
        continue;
      }
      flags[t] = true;
      continue;
    }
    args.push(t);
  }
  return { flags, args };
}

export function columnTable(rows: string[][], gap = 3): string[] {
  const widths: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] || 0, String(cell).length);
    });
  });
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? String(cell) : String(cell).padEnd(widths[i])))
      .join(" ".repeat(gap))
      .trimEnd()
  );
}

export function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[output truncated]`;
}

export function agoLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? `${m % 60}m` : ""}`;
  return `${Math.floor(h / 24)}d${h % 24 ? `${h % 24}h` : ""}`;
}