/* Words: term map (tone vs frequency), keyword-in-context, rising/falling terms between periods. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.terms = {});
  let sc, kwic, slope, focus = null, splitYear = 2025;

  V.build = function (root) {
    root.innerHTML = `<p class="view-intro">Which words do people reach for, and do those words come with negative or positive ${App.gl("tone", "tone")}? Counts here use the full text of every post and comment, recalculated for your current filters.</p>`;
    const g = document.createElement("div"); g.className = "grid g-side"; root.appendChild(g);
    sc = App.card(g, {
      title: "Which words come with negative or positive tone?",
      sub: "Each dot is a word or two-word phrase. Left: used in more negative discussion than usual. Right: more positive. Higher: more common.",
      howto: "Horizontal position compares the tone of posts and comments containing the word with other items of similar length in your selection (long comments score more extreme, so comparing like with like keeps length from driving the picture). Words left of the gray line show up in more negative discussion than usual; words right of it in more positive discussion. Vertical position is how many items use the word (log scale). The map shows the words that lean furthest from average and are reasonably common. Words the tone dictionary itself scores (like “bad” or “love”) are left out, because their position would only reflect the scoring. Click any word to see it in context.",
    });
    const side = document.createElement("div"); g.appendChild(side);
    kwic = App.card(side, { title: "Where does this word appear?", sub: "Click a word on the map, or type one in the search box." });
    kwic.el.querySelector(".tbl-btn").remove();
    slope = App.card(root, {
      title: "Which words rose or fell over time?",
      sub: "Share of items using each word, before vs after the split year.",
      howto: "Each line connects a word's share of items in the earlier period (left) to its share in the later period (right). Lines going up mark words that became more common; lines going down mark words that faded. Only words used at least 15 times are compared.",
      tools: `<label class="small ink2">Split at <select id="split-year">${[2024, 2025, 2026].map((y) => `<option ${y === splitYear ? "selected" : ""}>${y}</option>`).join("")}</select></label>`,
    });
    slope.el.style.marginTop = "16px";
    slope.head.querySelector("#split-year").onchange = (e) => { splitYear = +e.target.value; drawSlope(); };
  };

  // Tone relative to comments of similar length. VADER scores long texts as more
  // extreme (mostly more positive), and common words mostly appear in long comments,
  // so raw averages would mostly measure length.
  const lenBin = (w) => Math.min(11, Math.floor(Math.log2(Math.max(1, w))));
  function residuals(mask) {
    const { cols } = App.data, s = new Float64Array(12), c = new Float64Array(12);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const b = lenBin(cols.words[i]); s[b] += cols.tone[i]; c[b]++; }
    const base = Array.from(s, (v, b) => (c[b] ? v / c[b] : 0));
    return (i) => cols.tone[i] - base[lenBin(cols.words[i])];
  }
  function termStats(mask) {
    const { cols } = App.data, out = [], res = residuals(mask);
    for (const t of App.data.terms) {
      const p = App.postings(t.term); if (!p) continue;
      let n = 0, tone = 0, raw = 0;
      for (const i of p) if (mask[i]) { n++; tone += res(i); raw += cols.tone[i]; }
      if (n >= 5) out.push({ term: t.term, n, tone: tone / n, raw: raw / n });
    }
    return out;
  }

  function drawScatter() {
    const el = sc.chart, C = App.colors, { cols } = App.data;
    const mask = App.passes("q");
    let bn = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) bn++;
    const base = 0; // tones are already relative to similar-length items
    const minN = Math.max(5, Math.round(bn * 0.002));
    let data = termStats(mask).filter((d) => d.n >= minN)
      .sort((a, b) => Math.abs(b.tone - base) * Math.sqrt(b.n) - Math.abs(a.tone - base) * Math.sqrt(a.n)).slice(0, 220);
    el.innerHTML = "";
    if (data.length < 5) { App.emptyNote(el, " (too few words to map)"); return; }
    const W = App.width(el), H = Math.max(420, Math.min(600, W * 0.7)), m = { t: 16, r: 16, b: 40, l: 48 };
    const ext = Math.max(0.15, d3.max(data, (d) => Math.abs(d.tone - base)) * 1.05);
    const x = d3.scaleLinear().domain([base - ext, base + ext]).range([m.l, W - m.r]);
    const y = d3.scaleLog().domain([d3.min(data, (d) => d.n) * 0.85, d3.max(data, (d) => d.n) * 1.15]).range([H - m.b, m.t]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", "Word map: tone versus frequency");
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5, "~s").tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5, "~s"));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("+.2f")));
    svg.append("text").attr("x", m.l).attr("y", H - 6).attr("class", "lbl").text("◀ more negative than average");
    svg.append("text").attr("x", W - m.r).attr("y", H - 6).attr("text-anchor", "end").attr("class", "lbl").text("more positive than average ▶");
    svg.append("text").attr("transform", `translate(12,${(H - m.b) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("class", "lbl").text("Items using the word (log scale)");
    svg.append("line").attr("x1", x(base)).attr("x2", x(base)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.ink2).attr("stroke-dasharray", "0").attr("stroke-opacity", 0.6);
    svg.append("text").attr("x", x(base) + 4).attr("y", H - m.b - 6).attr("class", "lbl").style("paint-order", "stroke").style("stroke", C.surface).style("stroke-width", 3).text("typical for similar-length items");
    data.forEach((d) => { d.x = x(d.tone); d.y = y(d.n); });
    svg.append("g").selectAll("circle").data(data).join("circle").attr("cx", (d) => d.x).attr("cy", (d) => d.y)
      .attr("r", (d) => (d.term === focus ? 7 : 4.5)).attr("fill", (d) => C.tone(d.tone * 2)).attr("stroke", (d) => (d.term === focus ? C.ink : C.surface)).attr("stroke-width", (d) => (d.term === focus ? 2 : 1));
    // label selection: most frequent + most extreme, greedy collision avoidance
    const cand = [...data].sort((a, b) => b.n * (0.3 + Math.abs(b.tone - base)) - a.n * (0.3 + Math.abs(a.tone - base)));
    const boxes = [], labels = [];
    const maxLabels = Math.floor(W / 18);
    for (const d of cand) {
      if (labels.length >= maxLabels) break;
      const w = d.term.length * 6.4 + 4, h = 13, bx = { x0: d.x + 6, y0: d.y - h / 2, x1: d.x + 6 + w, y1: d.y + h / 2 };
      if (bx.x1 > W - 2) { bx.x0 = d.x - 6 - w; bx.x1 = d.x - 6; }
      if (boxes.some((b) => !(bx.x1 < b.x0 || bx.x0 > b.x1 || bx.y1 < b.y0 || bx.y0 > b.y1))) continue;
      boxes.push(bx); labels.push({ d, bx });
    }
    if (focus && !labels.some((l) => l.d.term === focus)) { const d = data.find((t) => t.term === focus); if (d) labels.push({ d, bx: { x0: d.x + 8, y0: d.y - 6 } }); }
    svg.append("g").selectAll("text").data(labels).join("text").attr("x", (l) => l.bx.x0).attr("y", (l) => l.bx.y0 + 10)
      .attr("class", (l) => (l.d.term === focus ? "lbl-strong" : "lbl")).style("paint-order", "stroke").style("stroke", C.surface).style("stroke-width", 3).text((l) => l.d.term);
    // big hit targets via Delaunay
    const del = d3.Delaunay.from(data, (d) => d.x, (d) => d.y);
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent").style("cursor", "pointer")
      .on("mousemove", (ev) => {
        const [px, py] = d3.pointer(ev), d = data[del.find(px, py)];
        if (Math.hypot(d.x - px, d.y - py) > 30) { App.tip.hide(); return; }
        App.tip.show(ev, `<div class="t-title">“${esc(d.term)}”</div><div class="t-row"><span>Items using it</span><b>${fmt.n(d.n)}</b></div><div class="t-row"><span>Tone vs similar-length items</span><b>${d3.format("+.2f")(d.tone)}</b></div><div class="t-row"><span>Raw average tone</span><b>${d.raw.toFixed(2)}</b></div><div class="muted small" style="margin-top:4px">Click to see it in context.</div>`);
      })
      .on("mouseleave", App.tip.hide)
      .on("click", (ev) => { const [px, py] = d3.pointer(ev), d = data[del.find(px, py)]; if (Math.hypot(d.x - px, d.y - py) <= 30) { focus = d.term; App.tip.hide(); drawScatter(); drawKwic(); } });
    el.insertAdjacentHTML("beforeend", App.toneLegend());
    sc.setTable(() => ({ cols: ["Word", "Items", "Tone vs similar-length items", "Raw average tone"], rows: data.map((d) => [d.term, d.n, +d.tone.toFixed(3), +d.raw.toFixed(3)]) }));
  }

  function drawKwic() {
    const el = kwic.chart, { cols, texts, lower, meta } = App.data, C = App.colors;
    const term = (App.state.q || "").trim().toLowerCase() || focus;
    if (!term) { el.innerHTML = `<div class="notice">No word selected yet. Click a dot on the map or type in the search box at the top.</div>`; return; }
    const p = App.postings(term);
    const mask = App.passes("q");
    const ids = [];
    if (p) for (const i of p) { if (mask[i]) ids.push(i); } else for (let i = 0; i < mask.length; i++) if (mask[i] && lower[i].includes(term)) ids.push(i);
    let tone = 0; ids.forEach((i) => (tone += cols.tone[i]));
    const show = ids.filter((i) => lower[i].includes(term)).slice(-40).reverse();
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    el.innerHTML = `<p class="small ink2"><b>“${esc(term)}”</b> appears in ${fmt.n(ids.length)} items in your selection; average tone ${ids.length ? (tone / ids.length).toFixed(2) : "–"}.
      ${App.state.q.trim().toLowerCase() === term ? "" : `<button class="linkbtn" id="kw-filter">Filter the whole dashboard to this word</button>`}</p>
      <div class="side-list" style="max-height:600px">${show.map((i) => `<div class="post" style="border-left-color:${C.tone(cols.tone[i])}"><div class="meta"><b>${esc(meta.users[cols.user[i]])}</b> · ${fmt.month(cols.t[i])} · ${esc(meta.emotions[cols.emo[i]])} · <button class="linkbtn" data-thread="${i}">conversation</button></div><div class="body">${esc(texts[i]).replace(re, "<mark>$1</mark>")}</div></div>`).join("") ||
        `<div class="muted small">The word appears beyond the 220-character excerpts shown here; open “Read the posts” to browse these items.</div>`}</div>
      ${show.length < ids.length ? `<p class="small muted">Showing the ${show.length} most recent items where the word falls inside the shortened excerpt.</p>` : ""}`;
    const b = el.querySelector("#kw-filter"); if (b) b.onclick = () => App.setState({ q: term });
    el.onclick = (e) => { if (e.target.dataset.thread) App.openThread(+e.target.dataset.thread); };
  }

  function drawSlope() {
    const el = slope.chart, C = App.colors, { cols } = App.data;
    const mask = App.passes(["date", "q"]);
    const cut = fmt.toDay(Date.UTC(splitYear, 0, 1));
    let nA = 0, nB = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) cols.t[i] < cut ? nA++ : nB++;
    el.innerHTML = "";
    if (nA < 100 || nB < 100) { el.innerHTML = `<div class="empty">Both periods need at least 100 items to compare (now ${fmt.n(nA)} before and ${fmt.n(nB)} after ${splitYear}). Try another split year or loosen the filters.</div>`; return; }
    const rows = [];
    for (const t of App.data.terms) {
      const p = App.postings(t.term); if (!p) continue;
      let a = 0, b = 0; for (const i of p) if (mask[i]) cols.t[i] < cut ? a++ : b++;
      if (a + b < 15) continue;
      const sa = (a + 0.5) / nA, sb = (b + 0.5) / nB;
      rows.push({ term: t.term, a, b, sa, sb, lr: Math.log(sb / sa) });
    }
    rows.sort((x, y) => y.lr - x.lr);
    const up = rows.slice(0, 10), down = rows.slice(-10).reverse();
    const W = App.width(el), H = 400, m = { t: 50, b: 16 };
    const half = W < 700 ? W : W / 2;
    const draw = (data, ox, title, rising) => {
      const svg = d3.select(el).append("svg").attr("width", half - 8).attr("height", H).style("display", "inline-block");
      const xl = 110, xr = half - 130;
      const y = d3.scaleLog().domain([d3.min(data, (d) => Math.min(d.sa, d.sb)) * 0.9, d3.max(data, (d) => Math.max(d.sa, d.sb)) * 1.1]).range([H - m.b, m.t]);
      svg.append("text").attr("x", 0).attr("y", 14).attr("class", "lbl-strong").text(title);
      svg.append("text").attr("x", xl).attr("y", m.t - 4).attr("text-anchor", "middle").attr("class", "lbl").text(`before ${splitYear}`);
      svg.append("text").attr("x", xr).attr("y", m.t - 4).attr("text-anchor", "middle").attr("class", "lbl").text(`${splitYear} onward`);
      const col = rising ? C.accent : C.ink2;
      const g = svg.selectAll("g.s").data(data).join("g");
      g.append("line").attr("x1", xl).attr("x2", xr).attr("y1", (d) => y(d.sa)).attr("y2", (d) => y(d.sb)).attr("stroke", col).attr("stroke-width", 2).attr("stroke-opacity", 0.8);
      g.append("circle").attr("cx", xl).attr("cy", (d) => y(d.sa)).attr("r", 4).attr("fill", col);
      g.append("circle").attr("cx", xr).attr("cy", (d) => y(d.sb)).attr("r", 4).attr("fill", col);
      // labels on the side where lines are spread out
      const side = rising ? "r" : "l";
      const pts = data.map((d) => ({ d, y: y(side === "r" ? d.sb : d.sa) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < pts.length; i++) if (pts[i].y - pts[i - 1].y < 13) pts[i].y = pts[i - 1].y + 13;
      svg.selectAll("text.t").data(pts).join("text").attr("x", side === "r" ? xr + 8 : xl - 8).attr("y", (p) => p.y).attr("dy", "0.35em")
        .attr("text-anchor", side === "r" ? "start" : "end").attr("class", "lbl").text((p) => `${p.d.term} (${fmt.pct1(side === "r" ? p.d.sb : p.d.sa)})`);
      g.style("cursor", "pointer").on("mousemove", (ev, d) => App.tip.show(ev, `<div class="t-title">“${esc(d.term)}”</div><div class="t-row"><span>Before ${splitYear}</span><b>${fmt.pct1(d.sa)} (${fmt.n(d.a)})</b></div><div class="t-row"><span>${splitYear} onward</span><b>${fmt.pct1(d.sb)} (${fmt.n(d.b)})</b></div>`))
        .on("mouseleave", App.tip.hide).on("click", (ev, d) => { focus = d.term; drawScatter(); drawKwic(); kwic.el.scrollIntoView({ block: "nearest" }); });
    };
    draw(up, 0, "Became more common ↑", true);
    draw(down, half, "Became less common ↓", false);
    slope.setTable(() => ({ cols: ["Word", `Items before ${splitYear}`, `Items ${splitYear}+`, "Share before", "Share after"], rows: up.concat(down).map((d) => [d.term, d.a, d.b, +d.sa.toFixed(4), +d.sb.toFixed(4)]) }));
  }

  V.update = function () { drawScatter(); drawKwic(); drawSlope(); };
})();
