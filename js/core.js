/* core.js: data, shared filter state, colours, small helpers. Exposes window.App. */
(function () {
  const App = (window.App = { views: {}, data: null });

  // ---------- formatting ----------
  const DAY = 864e5;
  App.fmt = {
    n: d3.format(","),
    pct: (v) => (isFinite(v) ? d3.format(".0%")(v) : "–"),
    pct1: (v) => (isFinite(v) ? d3.format(".1%")(v) : "–"),
    date: (day) => d3.utcFormat("%b %-d, %Y")(new Date(day * DAY)),
    month: (day) => d3.utcFormat("%b %Y")(new Date(day * DAY)),
    toDate: (day) => new Date(day * DAY),
    toDay: (date) => Math.floor(+date / DAY),
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  };
  const esc = App.fmt.esc;

  // ---------- colours (read from CSS tokens so the theme switch re-paints) ----------
  App.colors = {};
  App.readColors = function () {
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue(k).trim();
    const C = App.colors;
    C.ink = v("--ink"); C.ink2 = v("--ink-2"); C.muted = v("--muted"); C.grid = v("--grid");
    C.axis = v("--axis"); C.surface = v("--surface"); C.surface2 = v("--surface-2");
    C.accent = v("--accent"); C.highlight = v("--highlight"); C.dim = v("--dim"); C.mid = v("--mid");
    C.emo = d3.range(8).map((i) => v(`--emo-${i}`));
    C.seq = d3.range(6).map((i) => v(`--seq-${i}`));
    const toneScale = d3.scaleLinear()
      .domain([-0.5, -0.25, 0, 0.25, 0.5])
      .range([v("--neg-3"), v("--neg-2"), v("--mid"), v("--pos-2"), v("--pos-3")])
      .interpolate(d3.interpolateLab).clamp(true);
    C.tone = (x) => toneScale(x);
    C.neg = v("--neg-2"); C.pos = v("--pos-2");
    C.seqScale = (max) => d3.scaleSequential().domain([0, max || 1])
      .interpolator(d3.piecewise(d3.interpolateLab, C.seq.slice(0, 6)));
  };

  // ---------- plain-language labels ----------
  App.toneWord = (t) => (t <= -0.15 ? "leans negative" : t >= 0.15 ? "leans positive" : "mixed / neutral");
  App.SENT = [
    { v: -1, label: "Negative tone" },
    { v: 0, label: "Mixed / neutral tone" },
    { v: 1, label: "Positive tone" },
  ];
  App.sentLabel = (v) => App.SENT.find((s) => s.v === v).label;

  // ---------- data ----------
  App.load = async function () {
    const get = (f) => fetch(`data/${f}`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    const [meta, cols, texts, terms, termIndex, reply, termNet] = await Promise.all([
      get("meta.json"), get("items.json"), get("texts.json"), get("terms.json"),
      get("terms_index.json"), get("reply_network.json"), get("term_network.json"),
    ]);
    const N = cols.t.length;
    // decode delta-encoded postings lazily
    const postings = {};
    App.postings = (term) => {
      if (postings[term]) return postings[term];
      const enc = termIndex[term];
      if (!enc) return null;
      const out = new Int32Array(enc.length);
      let acc = 0;
      for (let i = 0; i < enc.length; i++) { acc += enc[i]; out[i] = acc; }
      return (postings[term] = out);
    };
    const lower = texts.map((t) => t.toLowerCase());
    // children index for threads
    const children = new Map();
    for (let i = 0; i < N; i++) {
      const p = cols.parent[i];
      if (p >= 0) { if (!children.has(p)) children.set(p, []); children.get(p).push(i); }
    }
    const byStory = new Map();
    for (let i = 0; i < N; i++) {
      const s = cols.story[i];
      if (s >= 0) { if (!byStory.has(s)) byStory.set(s, []); byStory.get(s).push(i); }
    }
    const storyItem = new Map();
    for (let i = 0; i < N; i++) if (cols.type[i] === 1) storyItem.set(cols.story[i], i);
    App.data = { meta, cols, texts, lower, N, terms, reply, termNet, children, byStory, storyItem,
      dayMin: d3.min(cols.t), dayMax: d3.max(cols.t) };
    App.topicById = new Map(meta.topics.map((t) => [t.id, t]));
    App.topicName = (id) => (id < 0 ? "Other / unclustered" : (App.topicById.get(id) || {}).name || `Topic ${id}`);
    App.fieldLabel = (i) => meta.fields[i].label;
    App.userIndex = new Map(meta.users.map((u, i) => [u, i]));
  };

  // ---------- filter state ----------
  const blank = () => ({ d0: null, d1: null, fields: new Set(), topics: new Set(), sent: new Set(),
    emos: new Set(), stances: new Set(), frames: new Set(), type: "all", scope: "all", q: "",
    user: -1, comm: -1 });
  App.state = blank();
  const listeners = [];
  App.onChange = (fn) => listeners.push(fn);
  let pending = null;
  App.setState = function (patch, opts = {}) {
    Object.assign(App.state, patch);
    App.writeHash();
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { pending = null; App.recompute(); listeners.forEach((f) => f(opts)); });
  };
  App.toggleIn = function (key, value) {
    const s = new Set(App.state[key]);
    s.has(value) ? s.delete(value) : s.add(value);
    App.setState({ [key]: s });
  };
  App.reset = () => App.setState(blank());

  // community membership (user index set) for the "community" filter
  App.commUsers = function (c) {
    const set = new Set();
    for (const n of App.data.reply.nodes) if (n.comm === c) set.add(App.userIndex.get(n.id));
    return set;
  };

  // Which items pass the filters. `skip` names a dimension to ignore (so, e.g.,
  // the timeline can show context outside its own brushed range).
  App.passes = function (skip) {
    const skips = Array.isArray(skip) ? skip : [skip];
    const sk = (k) => skips.includes(k);
    const { cols, N, lower } = App.data;
    const s = App.state;
    const mask = new Uint8Array(N);
    let qSet = null, qStr = null;
    const q = s.q.trim().toLowerCase();
    if (q && !sk("q")) {
      const post = App.postings(q);
      if (post) { qSet = new Uint8Array(N); for (const i of post) qSet[i] = 1; }
      else qStr = q;
    }
    const commSet = s.comm >= 0 && !sk("comm") ? App._commCache?.c === s.comm ? App._commCache.set
      : (App._commCache = { c: s.comm, set: App.commUsers(s.comm) }).set : null;
    let fieldMask = 0;
    for (const f of s.fields) fieldMask |= 1 << f;
    for (let i = 0; i < N; i++) {
      if (!sk("date") && s.d0 != null && (cols.t[i] < s.d0 || cols.t[i] > s.d1)) continue;
      if (fieldMask && !sk("fields") && !(cols.fmask[i] & fieldMask) && !s.fields.has(cols.field[i])) continue;
      if (s.topics.size && !sk("topics") && !s.topics.has(cols.topic[i])) continue;
      if (s.sent.size && !sk("sent") && !s.sent.has(cols.sent[i])) continue;
      if (s.emos.size && !sk("emos") && !s.emos.has(cols.emo[i])) continue;
      if (s.stances.size && !sk("stances") && !s.stances.has(cols.stance[i])) continue;
      if (s.frames.size && !sk("frames") && !s.frames.has(cols.frame[i])) continue;
      if (s.type !== "all" && !sk("type") && cols.type[i] !== (s.type === "story" ? 1 : 0)) continue;
      if (s.scope === "direct" && !sk("scope") && !cols.direct[i]) continue;
      if (s.user >= 0 && !sk("user") && cols.user[i] !== s.user) continue;
      if (commSet && !commSet.has(cols.user[i])) continue;
      if (qSet && !qSet[i]) continue;
      if (qStr && lower[i].indexOf(qStr) < 0) continue;
      mask[i] = 1;
    }
    return mask;
  };
  App.indices = (mask) => { const out = []; for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i); return out; };
  App.recompute = function () {
    App.mask = App.passes();
    App.idx = App.indices(App.mask);
  };
  App.searchIsExact = () => { const q = App.state.q.trim().toLowerCase(); return !q || !!App.postings(q); };

  // ---------- URL hash (shareable views) ----------
  App.writeHash = function () {
    const s = App.state, p = new URLSearchParams();
    if (App.tab && App.tab !== "overview") p.set("view", App.tab);
    if (s.d0 != null) p.set("d", `${s.d0}-${s.d1}`);
    for (const k of ["fields", "topics", "sent", "emos", "stances", "frames"]) if (s[k].size) p.set(k, [...s[k]].join("."));
    if (s.type !== "all") p.set("type", s.type);
    if (s.scope !== "all") p.set("scope", s.scope);
    if (s.q) p.set("q", s.q);
    if (s.user >= 0) p.set("user", App.data.meta.users[s.user]);
    if (s.comm >= 0) p.set("comm", s.comm);
    const h = p.toString();
    history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
  };
  App.readHash = function () {
    const p = new URLSearchParams(location.hash.slice(1));
    const s = blank();
    if (p.get("d")) { const [a, b] = p.get("d").split("-").map(Number); if (isFinite(a) && isFinite(b)) { s.d0 = a; s.d1 = b; } }
    for (const k of ["fields", "topics", "sent", "emos", "stances", "frames"]) if (p.get(k)) s[k] = new Set(p.get(k).split(".").map(Number).filter(isFinite));
    if (["story", "comment"].includes(p.get("type"))) s.type = p.get("type");
    if (p.get("scope") === "direct") s.scope = "direct";
    if (p.get("q")) s.q = p.get("q");
    if (p.get("user") && App.userIndex.has(p.get("user"))) s.user = App.userIndex.get(p.get("user"));
    if (p.get("comm")) s.comm = +p.get("comm");
    App.state = s;
    return p.get("view");
  };

  // ---------- tooltip ----------
  const tipEl = () => document.getElementById("tip");
  App.tip = {
    show(evt, html) {
      const el = tipEl(); el.innerHTML = html; el.hidden = false;
      const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
      let x = evt.clientX + pad, y = evt.clientY + pad;
      if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
      if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
      el.style.left = Math.max(8, x) + "px"; el.style.top = Math.max(8, y) + "px";
    },
    hide() { tipEl().hidden = true; },
  };
  App.quote = (i) => `<div class="t-quote">“${esc(App.data.texts[i])}”</div>`;
  // pick a representative excerpt from a set of indices: longest-ish, direct match preferred
  App.sample = function (ids, k = 1) {
    const { cols, texts } = App.data;
    const good = ids.filter((i) => cols.words[i] >= 15 && cols.words[i] <= 120 && cols.type[i] === 0);
    const pool = good.length ? good : ids;
    const out = [];
    const step = Math.max(1, Math.floor(pool.length / (k + 1)));
    for (let j = 0; j < k && j * step < pool.length; j++) out.push(pool[(j * step + Math.floor(step / 2)) % pool.length]);
    return out.filter((i) => texts[i]);
  };

  // ---------- card scaffold with "How to read" and table view ----------
  App.card = function (parent, { title, sub, howto, tools = "", cls = "" }) {
    const el = document.createElement("div");
    el.className = "card " + cls;
    el.innerHTML = `
      <div class="card-head"><div><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ""}</div>
        <div class="card-tools">${tools}<button class="btn small tbl-btn" aria-pressed="false" title="Show the numbers behind this chart">Table</button></div></div>
      ${howto ? `<details class="howto"><summary>How to read this</summary><p>${howto}</p></details>` : ""}
      <div class="chart"></div><div class="table-wrap" hidden></div>`;
    parent.appendChild(el);
    const chart = el.querySelector(".chart"), tw = el.querySelector(".table-wrap"), btn = el.querySelector(".tbl-btn");
    let tableFn = null;
    const renderTable = () => {
      if (!tableFn) return;
      const { cols, rows } = tableFn();
      tw.innerHTML = `<table class="data"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((v) => `<td class="${typeof v === "number" ? "num" : ""}">${esc(typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    };
    btn.onclick = () => {
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", on); tw.hidden = !on; chart.hidden = on;
      if (on) renderTable();
    };
    return { el, chart, setTable(fn) { tableFn = fn; if (!tw.hidden) renderTable(); }, head: el.querySelector(".card-tools") };
  };

  App.emptyNote = (el, extra = "") => {
    el.innerHTML = `<div class="empty">Nothing matches the current filters.${extra} <button class="linkbtn" onclick="App.reset()">Clear all filters</button></div>`;
  };
  App.width = (el, min = 280) => Math.max(min, el.clientWidth || el.parentNode.clientWidth || 600);

  App.toneLegend = () => {
    const C = App.colors;
    return `<div class="tone-legend"><span>Negative</span><span class="bar" style="background:linear-gradient(90deg,${C.tone(-0.5)},${C.tone(-0.25)},${C.tone(0)},${C.tone(0.25)},${C.tone(0.5)})"></span><span>Positive</span><span class="muted">(average tone)</span></div>`;
  };
  App.emoLegend = (includeNeutral = true) => {
    const E = App.data.meta.emotions;
    return `<div class="legend">${E.map((e, i) => (i === 7 && !includeNeutral ? "" : `<span><i class="swatch" style="background:${App.colors.emo[i]}"></i>${esc(e)}</span>`)).join("")}</div>`;
  };
  App.gl = (key, text) => `<span class="gloss" data-g="${key}" tabindex="0">${text}</span>`;
})();
