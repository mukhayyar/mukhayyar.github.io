// Packing for assets/js/fig-link.js: the page only needs a few of the kit's
// functions, and its markup is mostly path data. Two small, dependency-free steps:
//
//   shake(source, roots)  keeps the top-level declarations of a kit module that
//                         `roots` reach (by name), drops the rest and the comments.
//                         The kit modules are formatted one declaration per
//                         column-0 statement, which is all this relies on.
//   compactMarkup(html)   rewrites every path's d with relative commands, numbers
//                         at 0.1 px (as the kit already rounds them), no redundant
//                         separators; and circle centres at 0.1 px.
//                         The picture is unchanged: every point lands on the same
//                         0.1 px grid it was drawn on (arcs keep 0.01 px).

const WORD = /[A-Za-z_$][\w$]*/g;

// Split a module into its top-level statements: a statement starts on a line at
// column 0 that is not inside a template literal or a block comment.
function statementsOf(source) {
  const lines = source.split("\n");
  const out = [];
  let current = [];
  let inTemplate = false;
  let inComment = false;
  for (const line of lines) {
    const starts = !inTemplate && !inComment && /^[A-Za-z]/.test(line);
    if (starts && current.length) {
      out.push(current.join("\n"));
      current = [];
    }
    current.push(line);
    // track template literals (an odd number of unescaped backticks flips the state)
    const ticks = (line.replace(/\\`/g, "").match(/`/g) || []).length;
    if (!inComment && ticks % 2) inTemplate = !inTemplate;
    if (!inTemplate) {
      if (/^\s*\/\*/.test(line) && !/\*\//.test(line)) inComment = true;
      else if (inComment && /\*\//.test(line)) inComment = false;
    }
  }
  if (current.length) out.push(current.join("\n"));
  return out;
}

const declared = (statement) => {
  const m = statement.match(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/);
  return m ? m[1] : null;
};

// drop whole-line // comments and /* */ blocks that start a line (never inside a
// template literal: those lines belong to a statement's string and stay)
export function stripComments(statement) {
  const lines = statement.split("\n");
  const out = [];
  let inTemplate = false;
  let inComment = false;
  for (const line of lines) {
    if (!inTemplate) {
      if (inComment) {
        if (/\*\//.test(line)) inComment = false;
        continue;
      }
      if (/^\s*\/\*/.test(line)) {
        if (!/\*\//.test(line)) inComment = true;
        continue;
      }
      if (/^\s*\/\//.test(line)) continue;
    }
    out.push(line);
    const ticks = (line.replace(/\\`/g, "").match(/`/g) || []).length;
    if (ticks % 2) inTemplate = !inTemplate;
  }
  return out.join("\n");
}

// keep what `roots` reach; returns { source, names (kept, declared), free (names
// used but declared elsewhere: the caller resolves them in the enclosing scope) }
export function shake(source, roots) {
  const statements = statementsOf(source.replace(/^import .*$/gm, ""));
  const byName = new Map();
  const loose = [];
  for (const statement of statements) {
    const name = declared(statement);
    if (name) byName.set(name, statement);
    else if (statement.trim() && !/^\s*\/[/*]/.test(statement)) loose.push(statement);
  }
  const keep = new Set();
  const free = new Set();
  const visit = (name) => {
    if (keep.has(name)) return;
    if (!byName.has(name)) {
      free.add(name);
      return;
    }
    keep.add(name);
    for (const word of stripComments(byName.get(name)).match(WORD) ?? []) if (word !== name && byName.has(word)) visit(word);
    else if (word !== name) free.add(word);
  };
  for (const root of roots) visit(root);
  for (const statement of loose) for (const word of statement.match(WORD) ?? []) if (byName.has(word)) visit(word);
  const kept = statements.filter((statement) => {
    const name = declared(statement);
    return name ? keep.has(name) : statement.trim() && !/^\s*\/[/*]/.test(statement);
  });
  const text = kept.map((statement) => stripComments(statement).replace(/^export /gm, "")).join("\n");
  return { source: text, names: [...keep], free: [...free] };
}

// ------------------------------------------------------------------ markup
const short = (text) => (text === "-0" ? "0" : text.replace(/^(-?)0\./, "$1."));
const num = (value) => short(String(Math.round(value * 10) / 10));
const fine = (value) => short(String(Math.round(value * 100) / 100));
// a separator only where the next number would otherwise run into this one
const sep = (prev, text) => (!prev || text.startsWith("-") || (text.startsWith(".") && prev.includes(".")) ? "" : " ");
const joinNums = (list) => {
  let out = "";
  let prev = "";
  for (const text of list) {
    out += sep(prev, text) + text;
    prev = text;
  }
  return out;
};

export function compactD(d) {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  if (!tokens) return d;
  // the current point is tracked as the browser will see it (after rounding), so
  // the error of a point never carries over to the next
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let out = "";
  let last = "";
  let lastNum = "";
  let cmd = "";
  const take = (n) => tokens.slice(i, (i += n)).map(Number);
  const emit = (letter, texts) => {
    const body = joinNums(texts);
    // a repeated command (and an l after an m) needs no letter
    if (letter === last) out += sep(lastNum, texts[0]) + body;
    else out += letter + body;
    last = letter === "m" ? "l" : letter;
    lastNum = texts[texts.length - 1];
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "M" || cmd === "L") {
      const [x, y] = take(2);
      const dx = num(x - cx);
      const dy = num(y - cy);
      emit(cmd === "M" ? "m" : "l", [dx, dy]);
      cx += Number(dx);
      cy += Number(dy);
      if (cmd === "M") {
        sx = cx;
        sy = cy;
        cmd = "L";
      }
    } else if (cmd === "Z" || cmd === "z") {
      out += "z";
      last = "z";
      lastNum = "";
      cx = sx;
      cy = sy;
      cmd = "";
    } else if (cmd === "a") {
      // arcs draw small round things: keep their 0.01 px
      const v = take(7).map(fine);
      emit("a", v);
      cx += Number(v[5]);
      cy += Number(v[6]);
    } else if (cmd === "h") {
      const [v] = take(1);
      const dx = num(v);
      emit("h", [dx]);
      cx += Number(dx);
    } else return d; // a command it does not rewrite (a hand-written swatch): keep the path as it is
  }
  return out;
}

export function compactMarkup(html) {
  return html.replace(/ d="([^"]*)"/g, (_, d) => ` d="${compactD(d)}"`).replace(/ (cx|cy)="(-?[\d.]+)"/g, (_, name, value) => ` ${name}="${num(Number(value))}"`);
}
