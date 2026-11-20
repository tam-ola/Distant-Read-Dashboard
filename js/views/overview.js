/* Overview: headline tiles, timeline with brush + context markers, fields as small multiples. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.overview = {});
  let tilesEl, tl, sm, evList;

  V.build = function (root) {
    root.innerHTML = `<p class="view-intro">This dashboard collects Hacker News ${App.gl("item", "posts and comments")} about AI psychosis and problematic AI use, along with the conversations around them. Start here to see when people talked about it and which areas of life drove each wave.</p>`;
    tilesEl = document.createElement("div"); tilesEl.className = "tiles"; root.appendChild(tilesEl);
    tl = App.card(root, {
      title: "When did people talk about this?",
      sub: "Number of posts and comments per week. Drag across the chart to focus every view on a period.",
      howto: "Each point is one week. Taller means more activity. Numbered circles mark outside events for context (listed below the chart). Letters A–C mark the three busiest weeks, with the thread that drove each one listed below. Drag horizontally to select a date range; double-click to clear it. The gray area shows activity outside your selection so you keep the context.",
    });
    evList = document.createElement("div"); evList.className = "small ink2"; evList.style.marginTop = "8px"; tl.el.appendChild(evList);
    const g = document.createElement("div"); g.className = "grid g2"; g.style.marginTop = "16px"; root.appendChild(g);
    sm = App.card(g, {
      title: "Which areas of life drove each wave?",
      sub: "Weekly activity split by field. All panels share one scale, so heights compare directly.",
      howto: "Each small chart is one field (context). A post can count in more than one field. Compare where the peaks fall: a field with a spike in mid-2025 was part of that wave.",
    });
    const nav = App.card(g, { title: "Where to go next", sub: "Each tab answers one question about the debate." });
    nav.el.querySelector(".tbl-btn").remove();
    nav.chart.innerHTML = `<div class="grid" style="gap:8px">${App.TABS.slice(1).map((t) =>
      `<button class="side-item" data-k="${t.key}"><b>${t.label}</b>${t.q} ${({ topics: "See the themes people return to and how each one feels.", emotion: "Compare fear, anger, curiosity and care across topics and over time.", terms: "Find the words that show up in negative vs positive discussion.", network: "See conversation circles, who talks to whom, and how ideas connect.", explorer: "Read the actual (shortened) comments behind any selection.", methods: "Search terms used, how anonymization works, and known limits." })[t.key] || ""}</button>`).join("")}</div>`;
    nav.chart.onclick = (e) => { const b = e.target.closest("button"); if (b) App.showTab(b.dataset.k); };
  };

  function tiles() {
    const { cols, meta } = App.data, idx = App.idx;
    const users = new Set(), threads = new Set();
    let neg = 0, pos = 0;
    const emo = new Array(8).fill(0);
    for (const i of idx) { users.add(cols.user[i]); if (cols.story[i] >= 0) threads.add(cols.story[i]); if (cols.sent[i] < 0) neg++; if (cols.sent[i] > 0) pos++; emo[cols.emo[i]]++; }
    const topE = d3.maxIndex(emo.slice(0, 7));
    const n = idx.length || 1;
    tilesEl.innerHTML = [
      ["Posts & comments", fmt.n(idx.length), `${fmt.n(idx.filter((i) => cols.type[i] === 1).length)} posts`],
      ["Conversations", fmt.n(threads.size), "distinct threads"],
      ["People", fmt.n(users.size), "all pseudonymized"],
      [App.gl("tone", "Negative tone"), fmt.pct(neg / n), `vs ${fmt.pct(pos / n)} positive`],
      [App.gl("emotion", "Top emotion (excl. neutral)"), idx.length ? esc(meta.emotions[topE]) : "–", idx.length ? `${fmt.pct(emo[topE] / n)} of items` : ""],
    ].map(([l, v, note]) => `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="note">${note}</div></div>`).join("");
  }

  function weekly(mask, colTest) {
    const { cols, dayMin, dayMax } = App.data;
    const W = Math.floor((dayMax - dayMin) / 7) + 1, out = new Array(W).fill(0);
    for (let i = 0; i < mask.length; i++) if (mask[i] && (!colTest || colTest(i))) out[Math.floor((cols.t[i] - dayMin) / 7)]++;
    return out;
  }

  function timeline() {
    const el = tl.chart, C = App.colors, { dayMin, meta } = App.data;
    const ctxMask = App.passes("date");
    const all = weekly(ctxMask);
    const s = App.state;
    const W = App.width(el), H = 260, m = { t: 34, r: 16, b: 26, l: 44 };
    const wk = (w) => fmt.toDate(dayMin + w * 7);
    const x = d3.scaleUtc().domain([wk(0), wk(all.length - 1)]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(all) || 1]).nice().range([H - m.b, m.t]);
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img")
      .attr("aria-label", "Weekly volume of posts and comments over time");
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(W < 600 ? 4 : 8).tickSizeOuter(0));
    const area = d3.area().x((d, i) => x(wk(i))).y0(y(0)).y1((d) => y(d)).curve(d3.curveMonotoneX);
    const inSel = (i) => s.d0 == null || (dayMin + i * 7 + 6 >= s.d0 && dayMin + i * 7 <= s.d1);
    svg.append("path").datum(all).attr("d", area).attr("fill", C.dim);
    svg.append("path").datum(all.map((v, i) => (inSel(i) ? v : 0))).attr("d", area).attr("fill", C.accent).attr("fill-opacity", 0.85);
    svg.append("path").datum(all.map((v, i) => (inSel(i) ? v : 0))).attr("d", d3.line().x((d, i) => x(wk(i))).y((d) => y(d)).curve(d3.curveMonotoneX))
      .attr("fill", "none").attr("stroke", C.accent).attr("stroke-width", 2);

    // auto-labelled peaks: busiest weeks, labelled with that week's biggest thread
    const peaks = all.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const chosen = [];
    for (const [v, i] of peaks) { if (chosen.length >= 3) break; if (chosen.every((c) => Math.abs(c - i) > 10)) chosen.push(i); }
    const storyCount = new Map();
    for (let i = 0; i < ctxMask.length; i++) if (ctxMask[i]) { const st = App.data.cols.story[i], w = Math.floor((App.data.cols.t[i] - dayMin) / 7); if (st >= 0 && chosen.includes(w)) { const k = w + ":" + st; storyCount.set(k, (storyCount.get(k) || 0) + 1); } }
    const peakLabel = chosen.map((w) => {
      let best = null, bn = 0;
      for (const [k, n] of storyCount) { const [ww, st] = k.split(":").map(Number); if (ww === w && n > bn) { best = st; bn = n; } }
      return { w, title: best != null ? meta.stories[best].title : "", n: all[w] };
    });
    const pk = svg.append("g");
    peakLabel.sort((a, b) => a.w - b.w).forEach((p, j) => {
      p.letter = "ABC"[j];
      const px = x(wk(p.w)), py = y(p.n);
      pk.append("circle").attr("cx", px).attr("cy", py).attr("r", 4).attr("fill", C.surface).attr("stroke", C.ink).attr("stroke-width", 2);
      pk.append("text").attr("x", px + 7).attr("y", py - 6).attr("class", "lbl-strong").style("paint-order", "stroke").style("stroke", C.surface).style("stroke-width", 3).text(p.letter);
    });
    // context markers
    const evs = meta.events.filter((e) => e.day >= dayMin && e.day <= App.data.dayMax);
    const eg = svg.append("g");
    evs.forEach((e, j) => {
      const ex = x(fmt.toDate(e.day));
      eg.append("line").attr("x1", ex).attr("x2", ex).attr("y1", H - m.b).attr("y2", m.t - 14).attr("stroke", C.axis);
      const g = eg.append("g").attr("transform", `translate(${ex},${m.t - 22})`).style("cursor", "help");
      g.append("circle").attr("r", 9).attr("fill", C.surface).attr("stroke", C.ink2);
      g.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("class", "lbl").style("font-size", "11px").text(j + 1);
      g.on("mousemove", (ev) => App.tip.show(ev, `<div class="t-title">${j + 1}. ${esc(e.label)}</div><div class="muted">${fmt.date(e.day)} · context marker</div>`)).on("mouseleave", App.tip.hide);
    });
    evList.innerHTML = `<p style="margin:0 0 6px"><b>Busiest weeks</b> (from the data; the thread with the most items that week): ` +
      peakLabel.map((p) => `<span>${p.letter}. “${esc(p.title)}” (week of ${fmt.date(dayMin + p.w * 7)}, ${fmt.n(p.n)} items)</span>`).join(" · ") + `</p><b>Context markers</b> (outside events, approximate dates): ` + evs.map((e, j) => `<span style="white-space:nowrap">${j + 1}. ${esc(e.label)} (${fmt.month(e.day)})</span>`).join(" · ");

    // hover
    const hover = svg.append("g").style("display", "none");
    hover.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.ink2);
    // brush
    const brush = d3.brushX().extent([[m.l, m.t], [W - m.r, H - m.b]])
      .on("end", (ev) => {
        if (!ev.sourceEvent) return;
        if (!ev.selection) { if (s.d0 != null) App.setState({ d0: null, d1: null }); return; }
        const [a, b] = ev.selection.map((v) => fmt.toDay(x.invert(v)));
        App.setState({ d0: a, d1: b });
      });
    const bg = svg.append("g").attr("class", "brush").call(brush);
    bg.select(".selection").attr("fill", C.accent).attr("fill-opacity", 0.08).attr("stroke", C.accent);
    if (s.d0 != null) bg.call(brush.move, [x(fmt.toDate(s.d0)), x(fmt.toDate(s.d1))]);
    bg.on("dblclick", () => App.setState({ d0: null, d1: null }));
    bg.on("mousemove", (ev) => {
      const [mx] = d3.pointer(ev), w = Math.max(0, Math.min(all.length - 1, Math.round((fmt.toDay(x.invert(mx)) - dayMin) / 7)));
      hover.style("display", null).select("line").attr("x1", x(wk(w))).attr("x2", x(wk(w)));
      App.tip.show(ev, `<div class="t-title">Week of ${fmt.date(dayMin + w * 7)}</div><div class="t-row"><span>Posts & comments</span><b>${fmt.n(all[w])}</b></div><div class="muted small">Drag to select a period.</div>`);
    }).on("mouseleave", () => { hover.style("display", "none"); App.tip.hide(); });
    tl.setTable(() => ({ cols: ["Week starting", "Posts & comments"], rows: all.map((v, i) => [fmt.date(dayMin + i * 7), v]).filter((r) => r[1] > 0) }));
  }

  function smallMultiples() {
    const el = sm.chart, C = App.colors, { meta, cols, dayMin } = App.data;
    const mask = App.mask;
    const series = meta.fields.map((f, fi) => ({ label: f.label, v: weekly(mask, (i) => (cols.fmask[i] & (1 << fi)) || cols.field[i] === fi) }));
    series.sort((a, b) => d3.sum(b.v) - d3.sum(a.v));
    const ymax = d3.max(series, (s) => d3.max(s.v)) || 1;
    const W = App.width(el), cols3 = W < 500 ? 2 : 3, cw = W / cols3, ch = 82;
    el.innerHTML = "";
    if (!App.idx.length) { App.emptyNote(el); return; }
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", Math.ceil(series.length / cols3) * (ch + 22));
    const x = d3.scaleLinear().domain([0, series[0].v.length - 1]).range([4, cw - 12]);
    const y = d3.scaleLinear().domain([0, ymax]).range([ch, 22]);
    series.forEach((s, k) => {
      const g = svg.append("g").attr("transform", `translate(${(k % cols3) * cw},${Math.floor(k / cols3) * (ch + 22)})`);
      g.append("line").attr("x1", 4).attr("x2", cw - 12).attr("y1", ch).attr("y2", ch).attr("stroke", C.axis);
      g.append("path").datum(s.v).attr("fill", C.accent).attr("fill-opacity", 0.8)
        .attr("d", d3.area().x((d, i) => x(i)).y0(ch).y1((d) => y(d)).curve(d3.curveMonotoneX));
      const maxCh = Math.floor((cw - 14) / 7);
      g.append("text").attr("x", 4).attr("y", 12).attr("class", "lbl-strong").text(s.label.length > maxCh ? s.label.slice(0, maxCh - 1) + "…" : s.label).append("title").text(s.label);
      g.append("text").attr("x", 4).attr("y", ch + 14).attr("class", "lbl").text(`${fmt.n(d3.sum(s.v))} items`);
      g.append("rect").attr("x", 0).attr("y", 0).attr("width", cw).attr("height", ch + 18).attr("fill", "transparent")
        .on("mousemove", (ev) => {
          const [mx] = d3.pointer(ev), w = Math.max(0, Math.min(s.v.length - 1, Math.round(x.invert(mx))));
          App.tip.show(ev, `<div class="t-title">${esc(s.label)}</div><div class="t-row"><span>Week of ${fmt.date(dayMin + w * 7)}</span><b>${fmt.n(s.v[w])}</b></div><div class="muted small">Click to filter to this field.</div>`);
        }).on("mouseleave", App.tip.hide).style("cursor", "pointer")
        .on("click", () => { App.tip.hide(); App.setState({ fields: new Set([meta.fields.findIndex((f) => f.label === s.label)]) }); });
    });
    sm.setTable(() => ({ cols: ["Field", "Items", "Busiest week", "Items that week"], rows: series.map((s) => { const w = d3.maxIndex(s.v); return [s.label, d3.sum(s.v), fmt.date(dayMin + w * 7), s.v[w]]; }) }));
  }

  V.update = function () { tiles(); timeline(); smallMultiples(); };
})();
