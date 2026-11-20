/* Topics: bubble map (similar topics sit close) + topic cards with emotion mix and examples. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.topics = {});
  let map, list, open = new Set();

  V.build = function (root) {
    root.innerHTML = `<p class="view-intro">${App.gl("topic", "Topics")} are groups of posts and comments that use similar language, found automatically. Use this tab to see which themes dominate, how they relate, and how each one feels.</p>`;
    const g = document.createElement("div"); g.className = "grid g-side"; root.appendChild(g);
    map = App.card(g, {
      title: "What are people discussing?",
      sub: "Each bubble is a topic. Bigger means more items; colour shows the average tone.",
      howto: "Bubble size is the number of posts and comments in that topic under your current filters. Colour is average tone, from red (negative) through gray (mixed) to blue (positive). Topics placed near each other use similar language. Placement is approximate and the axes have no units. Bubbles too crowded for a label are named when you hover over them and in the list beside the map. Click a bubble to filter the whole dashboard to that topic; click again to remove it.",
    });
    const side = document.createElement("div"); g.appendChild(side);
    list = App.card(side, { title: "Topics, largest first", sub: "Top words, emotion mix and real examples for each topic." });
    list.el.querySelector(".tbl-btn").remove();
  };

  function stats() {
    const { cols, meta } = App.data;
    const mask = App.passes("topics");
    const by = new Map(meta.topics.map((t) => [t.id, { t, n: 0, tone: 0, emo: new Array(8).fill(0), ids: [] }]));
    by.set(-1, { t: { id: -1, name: "Other / unclustered", desc: "Short or off-topic replies that do not clearly fit any topic.", terms: [], x: null }, n: 0, tone: 0, emo: new Array(8).fill(0), ids: [] });
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const s = by.get(cols.topic[i]); if (!s) continue;
      s.n++; s.tone += cols.tone[i]; s.emo[cols.emo[i]]++; if (s.ids.length < 400) s.ids.push(i);
    }
    for (const s of by.values()) s.tone = s.n ? s.tone / s.n : 0;
    return by;
  }

  function drawMap(by) {
    const el = map.chart, C = App.colors, sel = App.state.topics;
    const data = [...by.values()].filter((s) => s.t.x != null);
    el.innerHTML = "";
    if (!d3.sum(data, (d) => d.n)) { App.emptyNote(el); return; }
    const W = App.width(el), H = Math.max(420, Math.min(620, W * 0.72)), pad = 70;
    const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.t.x)).range([pad, W - pad]);
    const y = d3.scaleLinear().domain(d3.extent(data, (d) => d.t.y)).range([H - pad, pad]);
    const r = d3.scaleSqrt().domain([0, d3.max(data, (d) => d.n) || 1]).range([4, Math.min(64, W / 11)]);
    const nodes = data.map((d) => ({ ...d, x: x(d.t.x), y: y(d.t.y), tx: x(d.t.x), ty: y(d.t.y), r: r(d.n) }));
    const sim = d3.forceSimulation(nodes).force("x", d3.forceX((d) => d.tx).strength(0.2)).force("y", d3.forceY((d) => d.ty).strength(0.2))
      .force("c", d3.forceCollide((d) => d.r + 3)).stop();
    for (let k = 0; k < 160; k++) sim.tick();
    nodes.forEach((d) => { d.x = Math.max(d.r + 2, Math.min(W - d.r - 2, d.x)); d.y = Math.max(d.r + 2, Math.min(H - d.r - 2, d.y)); });
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", "Topic bubble map");
    const g = svg.selectAll("g").data(nodes).join("g").attr("transform", (d) => `translate(${d.x},${d.y})`).style("cursor", "pointer");
    g.append("circle").attr("r", (d) => d.r).attr("fill", (d) => C.tone(d.tone))
      .attr("stroke", (d) => (sel.has(d.t.id) ? C.ink : C.surface)).attr("stroke-width", (d) => (sel.has(d.t.id) ? 3 : 2))
      .attr("opacity", (d) => (sel.size && !sel.has(d.t.id) ? 0.35 : 1));
    // labels below bubbles (text wears ink, not series colour)
    // labels on a top layer; skip any that would collide (hover still names every bubble)
    const placed = [], lab = [];
    [...nodes].sort((a, b) => sel.has(b.t.id) - sel.has(a.t.id) || b.r - a.r).forEach((d) => {
      const t = d.t.name.length > 30 ? d.t.name.slice(0, 28) + "…" : d.t.name, w = t.length * 6.6;
      const bx = { x0: d.x - w / 2, x1: d.x + w / 2, y0: d.y + d.r + 2, y1: d.y + d.r + 16 };
      const hitsLabel = placed.some((b) => !(bx.x1 < b.x0 || bx.x0 > b.x1 || bx.y1 < b.y0 || bx.y0 > b.y1));
      const hitsBubble = nodes.some((o) => o !== d && o.x + o.r > bx.x0 && o.x - o.r < bx.x1 && o.y + o.r > bx.y0 && o.y - o.r < bx.y1);
      if (!hitsLabel && (!hitsBubble || d.r >= 18 || sel.has(d.t.id))) { placed.push(bx); lab.push({ d, t }); }
    });
    svg.append("g").style("pointer-events", "none").selectAll("text").data(lab).join("text").attr("x", (l) => l.d.x).attr("y", (l) => l.d.y + l.d.r + 13)
      .attr("text-anchor", "middle").attr("class", "lbl-strong").style("paint-order", "stroke").style("stroke", C.surface).style("stroke-width", 4).text((l) => l.t);
    g.on("mousemove", (ev, d) => {
      const topE = d3.maxIndex(d.emo.slice(0, 7));
      const q = App.sample(d.ids, 1)[0];
      App.tip.show(ev, `<div class="t-title">${esc(d.t.name)}</div><div class="small ink2">${esc(d.t.desc)}</div>
        <div class="t-row"><span>Items</span><b>${fmt.n(d.n)}</b></div><div class="t-row"><span>Average tone</span><b>${d.tone.toFixed(2)} (${App.toneWord(d.tone)})</b></div>
        <div class="t-row"><span>Top emotion besides neutral</span><b>${esc(App.data.meta.emotions[topE])}</b></div>${q != null ? App.quote(q) : ""}
        <div class="muted small" style="margin-top:4px">Click to filter to this topic.</div>`);
    }).on("mouseleave", App.tip.hide).on("click", (ev, d) => { App.tip.hide(); App.toggleIn("topics", d.t.id); });
    el.insertAdjacentHTML("beforeend", App.toneLegend());
    map.setTable(() => ({ cols: ["Topic", "Items", "Average tone", "Top words"], rows: [...by.values()].sort((a, b) => b.n - a.n).map((s) => [s.t.name, s.n, +s.tone.toFixed(3), s.t.terms.slice(0, 6).join(", ")]) }));
  }

  function drawList(by) {
    const el = list.chart, C = App.colors, { meta, cols, texts } = App.data, sel = App.state.topics;
    const arr = [...by.values()].filter((s) => s.n > 0).sort((a, b) => (a.t.id === -1) - (b.t.id === -1) || b.n - a.n);
    if (!arr.length) { App.emptyNote(el); return; }
    const total = d3.sum(arr, (s) => s.n);
    el.innerHTML = `<div class="topic-list">${arr.map((s) => {
      const mix = s.emo.map((v, i) => [v, i]).filter(([v]) => v > 0);
      const ex = open.has(s.t.id) ? (s.t.examples || []).filter((i) => App.mask[i]).slice(0, 3) : [];
      const exs = ex.length ? ex : open.has(s.t.id) ? App.sample(s.ids, 3) : [];
      return `<div class="topic-card ${sel.has(s.t.id) ? "sel" : ""}" data-id="${s.t.id}">
        <h4><span>${esc(s.t.name)}</span><span class="muted small tnum">${fmt.n(s.n)} · ${fmt.pct(s.n / total)}</span></h4>
        <p>${esc(s.t.desc)}</p>
        ${s.t.terms.length ? `<div class="terms">${s.t.terms.slice(0, 8).map((w) => `<span>${esc(w)}</span>`).join("")}</div>` : ""}
        <div class="mixbar" title="Emotion mix">${mix.map(([v, i]) => `<i style="width:${(v / s.n) * 100}%;background:${C.emo[i]}" title="${esc(meta.emotions[i])}: ${fmt.pct(v / s.n)}"></i>`).join("")}</div>
        <div class="small ink2">Tone ${App.toneWord(s.tone)} (${s.tone.toFixed(2)}) · most common emotion besides neutral: <b>${esc(meta.emotions[d3.maxIndex(s.emo.slice(0, 7))])}</b></div>
        <div style="display:flex;gap:8px;margin-top:6px"><button class="btn small" data-a="filter">${sel.has(s.t.id) ? "Remove filter" : "Filter to this topic"}</button>
        <button class="btn small" data-a="ex">${open.has(s.t.id) ? "Hide examples" : "Show examples"}</button></div>
        ${exs.map((i) => `<div class="quote">“${esc(texts[i])}” <span class="muted">· ${esc(meta.users[cols.user[i]])}, ${fmt.month(cols.t[i])} · <button class="linkbtn" data-thread="${i}">conversation</button></span></div>`).join("")}
      </div>`;
    }).join("")}</div>${App.emoLegend()}`;
    el.onclick = (e) => {
      const card = e.target.closest(".topic-card"); if (!card) return;
      const id = +card.dataset.id;
      if (e.target.dataset.thread) { App.openThread(+e.target.dataset.thread); return; }
      if (e.target.dataset.a === "filter") App.toggleIn("topics", id);
      if (e.target.dataset.a === "ex") { open.has(id) ? open.delete(id) : open.add(id); drawList(stats()); }
    };
  }

  V.update = function () { const by = stats(); drawMap(by); drawList(by); };
})();
