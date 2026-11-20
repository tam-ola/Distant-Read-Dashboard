/* Tone & emotion: heatmap (rows x emotions), tone over time, emotion mix over time, tone by depth, stance. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.emotion = {});
  let heat, toneT, mixT, depthC, stanceC, rowMode = "topic", hideNeutral = true;

  V.build = function (root) {
    root.innerHTML = `<p class="view-intro">${App.gl("tone", "Tone")} is how positive or negative the wording is; ${App.gl("emotion", "emotion")} is the strongest feeling a model detects. Both are automatic estimates: read them as patterns across many comments, not verdicts on any single one.</p>`;
    heat = App.card(root, {
      title: "Which topics carry which emotions?",
      sub: "Share of each row's posts and comments whose main emotion is in each column (Neutral excluded).",
      howto: "Read across a row: darker cells mark the emotions that dominate that topic or field. Percentages are shares of all items in the row, so a row's cells plus its neutral share add up to 100%. Rows with fewer than 30 items are hidden. The emotion model rarely detects fear in this kind of argumentative writing, so a small Fear & worry share does not mean people are unconcerned; read the Words and Read the posts tabs for that. Click a cell to filter the dashboard to that combination.",
      tools: `<div class="seg" id="heat-mode"><button data-v="topic" aria-pressed="true">By topic</button><button data-v="field">By field</button></div>`,
    });
    heat.head.querySelector("#heat-mode").onclick = (e) => { if (e.target.dataset.v) { rowMode = e.target.dataset.v; V.update(); } };
    const g = document.createElement("div"); g.className = "grid g2"; g.style.marginTop = "16px"; root.appendChild(g);
    toneT = App.card(g, {
      title: "Is the conversation getting more negative?",
      sub: "Each month: share with positive tone (up, blue) and negative tone (down, red).",
      howto: "Bars above the line are the share of that month's items with positive wording; bars below are the share with negative wording. Mixed or neutral items make up the rest and are not drawn. Months with fewer than 20 items are left faint because their shares are unreliable.",
    });
    depthC = App.card(g, {
      title: "Do replies get angrier deeper in a thread?",
      sub: "Share of negative and positive tone by how deep in the reply chain a comment sits.",
      howto: "Depth 0 is the original post, 1 is a direct reply to it, 2 is a reply to a reply, and so on. Comparing the bars shows whether discussions sour or soften as people argue back and forth.",
    });
    mixT = App.card(root, {
      title: "How does the emotional mix change over time?",
      sub: "Each month's posts and comments split by main emotion (each bar adds up to 100%).",
      howto: "Each bar is one month. Segments show what share of that month's items carried each emotion. Look for colours that grow or shrink over time. Neutral is hidden by default so the other emotions are easier to compare; switch it back on to see the full picture.",
      tools: `<label class="small ink2" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="mix-neutral"> Include Neutral</label>`,
    });
    mixT.el.style.marginTop = "16px";
    mixT.head.querySelector("#mix-neutral").onchange = (e) => { hideNeutral = !e.target.checked; drawMix(); };
    stanceC = App.card(root, { title: "Which stances appear in each field?", sub: "Share of each field's comments by stance (labelled by Claude).", howto: "Each row is a field. Segments show what share of its comments were labelled with each stance. Use it to compare, for example, whether law threads are more alarmed than software threads." });
    stanceC.el.style.marginTop = "16px";
  };

  function drawHeat() {
    const el = heat.chart, C = App.colors, { cols, meta } = App.data;
    heat.head.querySelectorAll("#heat-mode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === rowMode));
    const skip = rowMode === "topic" ? "topics" : "fields";
    const mask = App.passes(["emos", skip]);
    const rows = new Map();
    const key = (i) => (rowMode === "topic" ? cols.topic[i] : cols.field[i]);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const k = key(i);
      if (!rows.has(k)) rows.set(k, { k, n: 0, e: new Array(8).fill(0), ids: Array.from({ length: 8 }, () => []) });
      const r = rows.get(k); r.n++; r.e[cols.emo[i]]++; if (r.ids[cols.emo[i]].length < 60) r.ids[cols.emo[i]].push(i);
    }
    const data = [...rows.values()].filter((r) => r.n >= 30).sort((a, b) => b.n - a.n);
    el.innerHTML = "";
    if (!data.length) { App.emptyNote(el, " (rows need at least 30 items)"); return; }
    const label = (k) => (rowMode === "topic" ? App.topicName(k) : meta.fields[k].label);
    const E = meta.emotions.slice(0, 7);
    const W = App.width(el), lw = Math.min(250, W * 0.36), cellW = Math.max(38, (W - lw - 70) / E.length), cellH = 28;
    const H = 46 + data.length * cellH;
    const max = d3.max(data, (r) => d3.max(r.e.slice(0, 7).map((v) => v / r.n))) || 1;
    const col = C.seqScale(max);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", "Emotion heatmap");
    E.forEach((e, j) => {
      const t = svg.append("text").attr("x", lw + j * cellW + cellW / 2).attr("y", 30).attr("text-anchor", "middle").attr("class", "lbl");
      const words = e.split(" & ");
      t.append("tspan").attr("x", lw + j * cellW + cellW / 2).attr("dy", words.length > 1 ? -12 : 0).text(words[0] + (words.length > 1 ? " &" : ""));
      if (words[1]) t.append("tspan").attr("x", lw + j * cellW + cellW / 2).attr("dy", 13).text(words[1]);
      svg.append("rect").attr("x", lw + j * cellW + cellW / 2 - 12).attr("y", 36).attr("width", 24).attr("height", 3).attr("rx", 1.5).attr("fill", C.emo[j]);
    });
    svg.append("text").attr("x", lw + E.length * cellW + 8).attr("y", 30).attr("class", "lbl").text("Neutral");
    const sel = rowMode === "topic" ? App.state.topics : App.state.fields;
    data.forEach((r, i) => {
      const y0 = 44 + i * cellH;
      svg.append("text").attr("x", lw - 8).attr("y", y0 + cellH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
        .attr("class", sel.has(r.k) ? "lbl-strong" : "lbl").text((label(r.k).length > 36 ? label(r.k).slice(0, 34) + "…" : label(r.k)) + ` (${fmt.n(r.n)})`);
      E.forEach((e, j) => {
        const v = r.e[j] / r.n;
        const g = svg.append("g").style("cursor", "pointer");
        g.append("rect").attr("x", lw + j * cellW + 1).attr("y", y0 + 1).attr("width", cellW - 2).attr("height", cellH - 2).attr("rx", 4).attr("fill", col(v));
        const dark = d3.lab(col(v)).l < 55;
        if (v >= 0.02) g.append("text").attr("x", lw + j * cellW + cellW / 2).attr("y", y0 + cellH / 2).attr("dy", "0.35em").attr("text-anchor", "middle")
          .style("font-size", "11.5px").style("font-variant-numeric", "tabular-nums").attr("fill", dark ? "#fff" : C.ink).text(fmt.pct(v));
        g.on("mousemove", (ev) => {
          const q = App.sample(r.ids[j], 1)[0];
          App.tip.show(ev, `<div class="t-title">${esc(label(r.k))}</div><div class="t-row"><span>${esc(e)}</span><b>${fmt.pct1(v)}</b></div><div class="t-row"><span>Items</span><b>${fmt.n(r.e[j])} of ${fmt.n(r.n)}</b></div>${q != null ? App.quote(q) : ""}<div class="muted small" style="margin-top:4px">Click to filter.</div>`);
        }).on("mouseleave", App.tip.hide).on("click", () => {
          App.tip.hide();
          App.setState(rowMode === "topic" ? { topics: new Set([r.k]), emos: new Set([j]) } : { fields: new Set([r.k]), emos: new Set([j]) });
        });
      });
      svg.append("text").attr("x", lw + E.length * cellW + 8).attr("y", y0 + cellH / 2).attr("dy", "0.35em").attr("class", "lbl tnum").text(fmt.pct(r.e[7] / r.n));
    });
    el.insertAdjacentHTML("beforeend", `<div class="tone-legend"><span>0%</span><span class="bar" style="background:linear-gradient(90deg,${d3.range(6).map((k) => col((k / 5) * max)).join(",")})"></span><span>${fmt.pct(max)} of the row</span></div>`);
    heat.setTable(() => ({ cols: [rowMode === "topic" ? "Topic" : "Field", "Items", ...meta.emotions], rows: data.map((r) => [label(r.k), r.n, ...r.e.map((v) => +(v / r.n).toFixed(3))]) }));
  }

  function monthly(mask) {
    const { cols } = App.data, m = new Map();
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const d = fmt.toDate(cols.t[i]), k = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (!m.has(k)) m.set(k, { k, n: 0, neg: 0, pos: 0, e: new Array(8).fill(0) });
      const r = m.get(k); r.n++; if (cols.sent[i] < 0) r.neg++; if (cols.sent[i] > 0) r.pos++; r.e[cols.emo[i]]++;
    }
    const ks = [...m.keys()];
    if (!ks.length) return [];
    const out = [];
    for (let k = d3.min(ks); k <= d3.max(ks); k++) out.push(m.get(k) || { k, n: 0, neg: 0, pos: 0, e: new Array(8).fill(0) });
    out.forEach((r) => (r.date = new Date(Date.UTC(Math.floor(r.k / 12), r.k % 12, 1))));
    return out;
  }
  const mLabel = d3.utcFormat("%b %Y");

  function drawTone() {
    const el = toneT.chart, C = App.colors, data = monthly(App.mask);
    el.innerHTML = "";
    if (!data.length) { App.emptyNote(el); return; }
    const W = App.width(el), H = 260, m = { t: 14, r: 10, b: 26, l: 44 };
    const x = d3.scaleBand().domain(data.map((d) => d.k)).range([m.l, W - m.r]).padding(0.18);
    const lim = Math.max(0.3, d3.max(data, (d) => (d.n ? Math.max(d.pos, d.neg) / d.n : 0)));
    const y = d3.scaleLinear().domain([-lim, lim]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat((v) => fmt.pct(Math.abs(v))));
    const xt = data.filter((d) => d.date.getUTCMonth() === 0);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(xt.map((d) => d.k)).tickFormat((k) => Math.floor(k / 12)).tickSizeOuter(0));
    const bw = x.bandwidth(), rr = Math.min(4, bw / 2);
    const bar = (x0, yTop, h, up) => { // rounded data-end only
      if (h <= 0) return "";
      const r = Math.min(rr, h);
      return up ? `M${x0},${yTop + h}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + bw - r}Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r}V${yTop + h}Z`
        : `M${x0},${yTop}V${yTop + h - r}Q${x0},${yTop + h} ${x0 + r},${yTop + h}H${x0 + bw - r}Q${x0 + bw},${yTop + h} ${x0 + bw},${yTop + h - r}V${yTop}Z`;
    };
    const g = svg.append("g");
    data.forEach((d) => {
      if (!d.n) return;
      const op = d.n < 20 ? 0.3 : 1, p = d.pos / d.n, ng = d.neg / d.n;
      g.append("path").attr("d", bar(x(d.k), y(p), y(0) - y(p) - 1, true)).attr("fill", C.pos).attr("opacity", op);
      g.append("path").attr("d", bar(x(d.k), y(0) + 1, y(-ng) - y(0) - 1, false)).attr("fill", C.neg).attr("opacity", op);
    });
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", C.axis);
    svg.append("text").attr("x", m.l + 6).attr("y", m.t + 10).attr("class", "lbl").text("▲ positive tone");
    svg.append("text").attr("x", m.l + 6).attr("y", H - m.b - 6).attr("class", "lbl").text("▼ negative tone");
    svg.append("g").selectAll("rect").data(data).join("rect").attr("x", (d) => x(d.k) - (x.step() - bw) / 2).attr("width", x.step()).attr("y", m.t).attr("height", H - m.t - m.b).attr("fill", "transparent")
      .on("mousemove", (ev, d) => App.tip.show(ev, `<div class="t-title">${mLabel(d.date)}</div><div class="t-row"><span>Positive tone</span><b>${fmt.pct(d.pos / d.n)}</b></div><div class="t-row"><span>Negative tone</span><b>${fmt.pct(d.neg / d.n)}</b></div><div class="t-row"><span>Mixed / neutral</span><b>${fmt.pct((d.n - d.pos - d.neg) / d.n)}</b></div><div class="t-row"><span>Items</span><b>${fmt.n(d.n)}</b></div>`))
      .on("mouseleave", App.tip.hide);
    toneT.setTable(() => ({ cols: ["Month", "Items", "Positive share", "Negative share"], rows: data.filter((d) => d.n).map((d) => [mLabel(d.date), d.n, +(d.pos / d.n).toFixed(3), +(d.neg / d.n).toFixed(3)]) }));
  }

  function drawDepth() {
    const el = depthC.chart, C = App.colors, { cols } = App.data;
    const b = d3.range(7).map((k) => ({ k, n: 0, neg: 0, pos: 0 }));
    for (const i of App.idx) { const d = cols.depth[i]; if (d < 0) continue; const r = b[Math.min(6, d)]; r.n++; if (cols.sent[i] < 0) r.neg++; if (cols.sent[i] > 0) r.pos++; }
    const data = b.filter((r) => r.n >= 10);
    el.innerHTML = "";
    if (!data.length) { App.emptyNote(el); return; }
    const W = App.width(el), H = 260, m = { t: 14, r: 10, b: 40, l: 44 };
    const x0 = d3.scaleBand().domain(data.map((d) => d.k)).range([m.l, W - m.r]).padding(0.25);
    const x1 = d3.scaleBand().domain(["neg", "pos"]).range([0, x0.bandwidth()]).padding(0.08);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => Math.max(d.neg, d.pos) / d.n)]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmt.pct));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x0).tickFormat((k) => (k === 0 ? "Post" : k === 6 ? "6+" : k)).tickSizeOuter(0));
    svg.append("text").attr("x", (W + m.l) / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("class", "lbl").text("Reply depth (0 = original post)");
    const g = svg.selectAll("g.b").data(data).join("g").attr("transform", (d) => `translate(${x0(d.k)},0)`);
    [["neg", C.neg], ["pos", C.pos]].forEach(([k, c]) => {
      g.append("rect").attr("x", x1(k)).attr("width", x1.bandwidth()).attr("y", (d) => y(d[k] / d.n)).attr("height", (d) => y(0) - y(d[k] / d.n)).attr("rx", 3).attr("fill", c);
    });
    g.append("rect").attr("width", x0.bandwidth()).attr("y", m.t).attr("height", H - m.t - m.b).attr("fill", "transparent")
      .on("mousemove", (ev, d) => App.tip.show(ev, `<div class="t-title">${d.k === 0 ? "Original posts" : `Depth ${d.k}${d.k === 6 ? "+" : ""}`}</div><div class="t-row"><span>Negative tone</span><b>${fmt.pct(d.neg / d.n)}</b></div><div class="t-row"><span>Positive tone</span><b>${fmt.pct(d.pos / d.n)}</b></div><div class="t-row"><span>Items</span><b>${fmt.n(d.n)}</b></div>`))
      .on("mouseleave", App.tip.hide);
    el.insertAdjacentHTML("beforeend", `<div class="legend"><span><i class="swatch" style="background:${C.neg}"></i>Negative tone</span><span><i class="swatch" style="background:${C.pos}"></i>Positive tone</span></div>`);
    depthC.setTable(() => ({ cols: ["Depth", "Items", "Negative share", "Positive share"], rows: data.map((d) => [d.k, d.n, +(d.neg / d.n).toFixed(3), +(d.pos / d.n).toFixed(3)]) }));
  }

  function drawMix() {
    const el = mixT.chart, C = App.colors, { meta } = App.data;
    const data = monthly(App.passes("emos"));
    el.innerHTML = "";
    if (!data.length) { App.emptyNote(el); return; }
    const keys = hideNeutral ? d3.range(7) : d3.range(8);
    const W = App.width(el), H = 300, m = { t: 10, r: 150, b: 26, l: 44 };
    if (W < 600) m.r = 10;
    const x = d3.scaleBand().domain(data.map((d) => d.k)).range([m.l, W - m.r]).padding(0.15);
    const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmt.pct));
    const xt = data.filter((d) => d.date.getUTCMonth() === 0);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(xt.map((d) => d.k)).tickFormat((k) => Math.floor(k / 12)).tickSizeOuter(0));
    const bw = x.bandwidth();
    const sel = App.state.emos;
    data.forEach((d) => {
      const tot = d3.sum(keys, (k) => d.e[k]);
      if (!tot) return;
      let acc = 0;
      keys.forEach((k) => {
        const v = d.e[k] / tot, y1 = y(acc), y2 = y(acc + v);
        acc += v;
        const h = Math.max(0, y1 - y2 - 2); // 2px surface gap between segments
        if (h > 0) svg.append("rect").attr("x", x(d.k)).attr("width", bw).attr("y", y2 + 1).attr("height", h).attr("rx", Math.min(2, bw / 3))
          .attr("fill", C.emo[k]).attr("opacity", (tot < 20 ? 0.35 : 1) * (sel.size && !sel.has(k) ? 0.3 : 1));
      });
      svg.append("rect").attr("x", x(d.k)).attr("width", bw).attr("y", m.t).attr("height", H - m.t - m.b).attr("fill", "transparent")
        .on("mousemove", (ev) => App.tip.show(ev, `<div class="t-title">${mLabel(d.date)} · ${fmt.n(tot)} items</div>${keys.slice().reverse().map((k) => `<div class="t-row"><span><i class="swatch" style="background:${C.emo[k]}"></i> ${esc(meta.emotions[k])}</span><b>${fmt.pct(d.e[k] / tot)}</b></div>`).join("")}`))
        .on("mouseleave", App.tip.hide);
    });
    // direct labels on the right, at the last full month's segment midpoints (only if room)
    if (W >= 600) {
      const last = [...data].reverse().find((d) => d3.sum(keys, (k) => d.e[k]) >= 20);
      if (last) {
        const tot = d3.sum(keys, (k) => last.e[k]); let acc = 0; const pts = [];
        keys.forEach((k) => { const v = last.e[k] / tot; pts.push({ k, y: y(acc + v / 2) }); acc += v; });
        // de-overlap
        pts.sort((a, b) => b.y - a.y); for (let i = 1; i < pts.length; i++) if (pts[i - 1].y - pts[i].y < 16) pts[i].y = pts[i - 1].y - 16;
        pts.forEach((p) => {
          svg.append("rect").attr("x", W - m.r + 8).attr("y", p.y - 4).attr("width", 8).attr("height", 8).attr("rx", 2).attr("fill", C.emo[p.k]);
          svg.append("text").attr("x", W - m.r + 20).attr("y", p.y).attr("dy", "0.35em").attr("class", "lbl").text(meta.emotions[p.k]);
        });
      }
    }
    el.insertAdjacentHTML("beforeend", App.emoLegend(!hideNeutral));
    mixT.setTable(() => ({ cols: ["Month", "Items", ...keys.map((k) => meta.emotions[k])], rows: data.filter((d) => d.n).map((d) => { const tot = d3.sum(keys, (k) => d.e[k]) || 1; return [mLabel(d.date), d.n, ...keys.map((k) => +(d.e[k] / tot).toFixed(3))]; }) }));
  }

  function drawStance() {
    const el = stanceC.chart, { meta, cols } = App.data, C = App.colors;
    if (!meta.has_claude_labels) {
      stanceC.el.querySelector(".tbl-btn").hidden = true;
      el.innerHTML = `<div class="notice">Stance and framing labels come from an optional step in which Claude reads each comment and labels it Alarmed, Skeptical of the panic, Nuanced, Personal experience, Blames companies, Blames users or Joking. That step has not been run for this version of the data, so this chart is empty. Topic, tone and emotion above do not depend on it.</div>`;
      return;
    }
    const S = meta.stances, rows = new Map();
    for (const i of App.idx) { if (cols.stance[i] < 0) continue; const f = cols.field[i]; if (!rows.has(f)) rows.set(f, new Array(S.length).fill(0)); rows.get(f)[cols.stance[i]]++; }
    const data = [...rows].map(([f, v]) => ({ f, v, n: d3.sum(v) })).filter((d) => d.n >= 20).sort((a, b) => b.n - a.n);
    el.innerHTML = "";
    if (!data.length) { App.emptyNote(el); return; }
    const W = App.width(el), lw = 200, bh = 24, H = data.length * (bh + 8) + 10;
    const x = d3.scaleLinear().domain([0, 1]).range([lw, W - 10]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    data.forEach((d, r) => {
      const y0 = r * (bh + 8);
      svg.append("text").attr("x", lw - 8).attr("y", y0 + bh / 2).attr("dy", "0.35em").attr("text-anchor", "end").attr("class", "lbl").text(`${meta.fields[d.f].label} (${fmt.n(d.n)})`);
      let acc = 0;
      d.v.forEach((v, k) => {
        const w = v / d.n; if (!w) return;
        const g = svg.append("g");
        g.append("rect").attr("x", x(acc) + 1).attr("y", y0).attr("width", Math.max(0, x(acc + w) - x(acc) - 2)).attr("height", bh).attr("rx", 3).attr("fill", C.emo[k] || C.mid);
        if (x(acc + w) - x(acc) > 34) g.append("text").attr("x", x(acc + w / 2)).attr("y", y0 + bh / 2).attr("dy", "0.35em").attr("text-anchor", "middle").style("font-size", "11px").attr("fill", k === 3 ? "#0b0b0b" : "#fff").text(fmt.pct(w));
        g.on("mousemove", (ev) => App.tip.show(ev, `<div class="t-title">${esc(meta.fields[d.f].label)}</div><div class="t-row"><span>${esc(S[k])}</span><b>${fmt.pct1(w)}</b></div>`)).on("mouseleave", App.tip.hide)
          .on("click", () => App.setState({ fields: new Set([d.f]), stances: new Set([k]) })).style("cursor", "pointer");
        acc += w;
      });
    });
    el.insertAdjacentHTML("beforeend", `<div class="legend">${S.map((s, k) => `<span><i class="swatch" style="background:${C.emo[k]}"></i>${esc(s)}</span>`).join("")}</div><p class="small muted">Stance colours reuse the chart palette and are unrelated to the emotion colours elsewhere.</p>`);
    stanceC.setTable(() => ({ cols: ["Field", "Comments", ...S], rows: data.map((d) => [meta.fields[d.f].label, d.n, ...d.v.map((v) => +(v / d.n).toFixed(3))]) }));
  }

  V.update = function () { drawHeat(); drawTone(); drawDepth(); drawMix(); drawStance(); };
})();
