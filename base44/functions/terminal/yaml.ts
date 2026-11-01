// A small, strict-enough YAML reader for the manifests and compose files a
// player writes in the terminal. It understands block maps, block lists,
// quoted and plain scalars, inline arrays/maps, comments and block scalars.
// Anything it cannot read comes back as a Kubernetes-style parse error.

export type YamlResult = { ok: boolean; data?: any; error?: string };

function stripComment(line: string): string {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function scalar(raw: string): any {
  const v = raw.trim();
  if (!v) return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith("[") || v.startsWith("{")) {
    const body = v.slice(1, -1).trim();
    if (!body) return v.startsWith("[") ? [] : {};
    if (v.startsWith("[")) {
      return body.split(",").map((part) => scalar(part));
    }
    const out: Record<string, any> = {};
    body.split(",").forEach((pair) => {
      const idx = pair.indexOf(":");
      if (idx > -1) out[pair.slice(0, idx).trim()] = scalar(pair.slice(idx + 1));
    });
    return out;
  }
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^(null|~)$/i.test(v)) return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function parseYaml(text: string): YamlResult {
  const source = String(text || "");
  if (!source.trim()) return { ok: false, error: "error: no objects passed to apply" };
  if (/\t/.test(source)) {
    const line = source.split("\n").findIndex((l) => /\t/.test(l)) + 1;
    return { ok: false, error: `error: error converting YAML to JSON: yaml: line ${line}: found character that cannot start any token` };
  }

  const rows: { indent: number; text: string; line: number }[] = [];
  const rawLines = source.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const clean = stripComment(rawLines[i]).replace(/\s+$/, "");
    if (!clean.trim()) continue;
    if (/^---\s*$/.test(clean.trim()) || /^\.\.\.\s*$/.test(clean.trim())) continue;
    const indent = clean.length - clean.trimStart().length;
    if (indent % 2 !== 0) {
      return { ok: false, error: `error: error converting YAML to JSON: yaml: line ${i + 1}: did not find expected key` };
    }
    rows.push({ indent, text: clean.trim(), line: i + 1 });
  }
  if (!rows.length) return { ok: false, error: "error: no objects passed to apply" };

  let cursor = 0;

  function parseBlock(indent: number): any {
    const isList = rows[cursor]?.text.startsWith("-") && rows[cursor]?.indent === indent;
    if (isList) {
      const list: any[] = [];
      while (cursor < rows.length && rows[cursor].indent === indent && rows[cursor].text.startsWith("-")) {
        const row = rows[cursor];
        const rest = row.text.replace(/^-\s*/, "");
        if (!rest) {
          cursor += 1;
          const child = rows[cursor] && rows[cursor].indent > indent ? parseBlock(rows[cursor].indent) : null;
          list.push(child);
          continue;
        }
        const pair = rest.match(/^([\w.\-/]+):\s*(.*)$/);
        if (pair) {
          const item: Record<string, any> = {};
          if (pair[2]) {
            item[pair[1]] = scalar(pair[2]);
            cursor += 1;
          } else {
            cursor += 1;
            item[pair[1]] = rows[cursor] && rows[cursor].indent > indent ? parseBlock(rows[cursor].indent) : null;
          }
          // further keys of the same list item
          while (cursor < rows.length && rows[cursor].indent > indent && !rows[cursor].text.startsWith("-")) {
            const keyRow = rows[cursor];
            const kv = keyRow.text.match(/^([\w.\-/]+):\s*(.*)$/);
            if (!kv) break;
            cursor += 1;
            if (kv[2]) item[kv[1]] = scalar(kv[2]);
            else item[kv[1]] = rows[cursor] && rows[cursor].indent > keyRow.indent ? parseBlock(rows[cursor].indent) : null;
          }
          list.push(item);
        } else {
          list.push(scalar(rest));
          cursor += 1;
        }
      }
      return list;
    }

    const map: Record<string, any> = {};
    while (cursor < rows.length && rows[cursor].indent === indent) {
      const row = rows[cursor];
      const kv = row.text.match(/^([\w.\-/]+):\s*(.*)$/);
      if (!kv) {
        return undefined as any;
      }
      cursor += 1;
      if (kv[2] === "|" || kv[2] === ">") {
        const chunk: string[] = [];
        while (cursor < rows.length && rows[cursor].indent > indent) {
          chunk.push(rows[cursor].text);
          cursor += 1;
        }
        map[kv[1]] = kv[2] === "|" ? `${chunk.join("\n")}\n` : chunk.join(" ");
      } else if (kv[2]) {
        map[kv[1]] = scalar(kv[2]);
      } else if (rows[cursor] && rows[cursor].indent > indent) {
        map[kv[1]] = parseBlock(rows[cursor].indent);
      } else if (rows[cursor] && rows[cursor].indent === indent && rows[cursor].text.startsWith("- ")) {
        map[kv[1]] = parseBlock(indent);
      } else {
        map[kv[1]] = null;
      }
    }
    return map;
  }

  const data = parseBlock(rows[0].indent);
  if (data === undefined) return { ok: false, error: "error: error converting YAML to JSON: yaml: mapping values are not allowed in this context" };
  return { ok: true, data };
}

export function asList(data: any): any[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}