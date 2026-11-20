/* Conversations: reply network (canvas, pseudonymous people) and word co-occurrence network. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.network = {});
  let card, side, mode = "people", colorMode = "tone", minN = 5, onlyCircles = true, sel = null, hiComm = -1;
  let sim = null, layoutKey = null, nodes = [], links = [], transform = d3.zoomIdentity, canvas, ctx, W = 0, H = 0;
  let filtCount = new Map();

  V.build = function (root) {
    root.innerHTML = `<p class="view-intro">Who talks to whom? In the ${App.gl("network", "reply network")} each dot is a person under a ${App.gl("pseudonym", "pseudonym")}, and lines join people who replied to each other. ${App.gl("community", "Conversation circles")} are groups who mostly reply among themselves. Switch to “Ideas” to see which words travel together.</p>`;
    const g = document.createElement("div"); g.className = "grid g-side"; root.appendChild(g);
    card = App.card(g, {
      title: "Who replies to whom?",
      sub: "People (dots) linked by replies. Bigger dots wrote more; colour shows the average tone of what they wrote.",
      howto: "Each dot is one pseudonymous person; its size is how many posts and comments they wrote. A faint line means one replied to the other. People are grouped by conversation circle (labelled Circle 1, Circle 2 …): groups who mostly reply among themselves. Distances between circles mean nothing; only membership does. People with no items in your current filters fade to gray. Scroll or pinch to zoom, drag to pan, click a dot to see that person. Positions carry no meaning beyond who is connected to whom.",
      tools: `<div class="seg" id="net-mode"><button data-v="people" aria-pressed="true">People</button><button data-v="ideas">Ideas</button></div>`,
    });
    card.head.querySelector("#net-mode").onclick = (e) => { if (e.target.dataset.v) { mode = e.target.dataset.v; V.update({ relayout: true }); } };
    side = document.createElement("div"); g.appendChild(side);
  };

  // ---------------- people ----------------
  function peopleControls(el) {
    const maxN = 20;
    el.innerHTML = `<div class="ctl-row">
      <span>Colour by</span><div class="seg" id="cmode"><button data-v="tone">Tone</button><button data-v="comm">Conversation circle</button></div>
      <label>Show people with at least <b id="minv">${minN}</b> items <input type="range" id="minn" min="1" max="${maxN}" value="${minN}"></label>
      <label><input type="checkbox" id="onlyc" ${onlyCircles ? "checked" : ""}> Only people in the 12 largest circles</label>
      <span class="muted small" id="netcount"></span></div>`;
    el.querySelectorAll("#cmode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === colorMode));
    el.querySelector("#cmode").onclick = (e) => { if (e.target.dataset.v) { colorMode = e.target.dataset.v; if (colorMode === "comm" && hiComm < 0) hiComm = 0; V.update(); } };
    const r = el.querySelector("#minn");
    r.oninput = () => (el.querySelector("#minv").textContent = r.value);
    r.onchange = () => { minN = +r.value; V.update({ relayout: true }); };
    el.querySelector("#onlyc").onchange = (e) => { onlyCircles = e.target.checked; V.update({ relayout: true }); };
  }

  let centers = new Map();
  function buildLayout() {
    const { reply } = App.data;
    const key = `${minN}|${onlyCircles}`;
    if (key === layoutKey && nodes.length) return;
    layoutKey = key;
    if (sim) sim.stop();
    const keep = new Set(reply.nodes.filter((n) => n.n >= minN && (n.deg_in + n.deg_out) > 0 && (!onlyCircles || n.comm >= 0)).map((n) => n.id));
    nodes = reply.nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    links = reply.links.filter((l) => byId.has(l.s) && byId.has(l.t)).map((l) => ({ source: byId.get(l.s), target: byId.get(l.t), w: l.w }));
    const deg = new Map(); links.forEach((l) => { deg.set(l.source.id, (deg.get(l.source.id) || 0) + 1); deg.set(l.target.id, (deg.get(l.target.id) || 0) + 1); });
    nodes = nodes.filter((n) => deg.get(n.id));
    const r = d3.scaleSqrt().domain([1, d3.max(nodes, (n) => n.n) || 1]).range([2.5, 12]);
    nodes.forEach((n) => (n.r = r(n.n)));
    // give each circle its own area: centres on a grid, the rest in the middle
    const comms = [...new Set(nodes.map((n) => n.comm))].sort((a, b) => a - b);
    const real = comms.filter((c) => c >= 0), cols = Math.ceil(Math.sqrt(real.length * 1.4)) || 1;
    const sp = 230;
    centers = new Map();
    real.forEach((c, i) => centers.set(c, { x: ((i % cols) - (cols - 1) / 2) * sp, y: (Math.floor(i / cols) - (Math.ceil(real.length / cols) - 1) / 2) * sp }));
    centers.set(-1, { x: 0, y: (Math.ceil(real.length / cols) / 2 + 0.6) * sp });
    nodes.forEach((n) => { const c = centers.get(n.comm); n.x = c.x + (Math.random() - 0.5) * 60; n.y = c.y + (Math.random() - 0.5) * 60; });
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance(18).strength((l) => (l.source.comm === l.target.comm ? 0.25 : 0.01)))
      .force("charge", d3.forceManyBody().strength(-9).distanceMax(120))
      .force("x", d3.forceX((n) => centers.get(n.comm).x).strength(0.22))
      .force("y", d3.forceY((n) => centers.get(n.comm).y).strength(0.22))
      .force("c", d3.forceCollide((n) => n.r + 0.8)).stop();
    for (let k = 0; k < 220; k++) sim.tick();
    // fit to view
    const ex = d3.extent(nodes, (n) => n.x), ey = d3.extent(nodes, (n) => n.y);
    const k = Math.min(W / (ex[1] - ex[0] + 80), H / (ey[1] - ey[0] + 80), 2);
    transform = d3.zoomIdentity.translate(-((ex[0] + ex[1]) / 2) * k, -((ey[0] + ey[1]) / 2) * k).scale(k);
    // label positions = member centroids
    centers.forEach((c, id) => { const m = nodes.filter((n) => n.comm === id); if (m.length) { c.lx = d3.mean(m, (n) => n.x); c.ly = d3.min(m, (n) => n.y) - 10; c.n = m.length; } });
  }

  function nodeColor(n) {
    const C = App.colors;
    if (!filtCount.get(n.id)) return C.dim;
    if (colorMode === "comm") return n.comm === hiComm ? C.highlight : C.dim;
    return C.tone(n.tone);
  }

  function draw() {
    if (!ctx) return;
    const C = App.colors, dpr = devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.surface; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2 + transform.x, H / 2 + transform.y); ctx.scale(transform.k, transform.k);
    const selNb = sel ? new Set(links.filter((l) => l.source.id === sel || l.target.id === sel).flatMap((l) => [l.source.id, l.target.id])) : null;
    ctx.strokeStyle = C.ink2; ctx.globalAlpha = selNb ? 0.6 : 0.07;
    for (const l of links) {
      const on = filtCount.get(l.source.id) && filtCount.get(l.target.id);
      if (!on && !selNb) continue;
      if (selNb && !(l.source.id === sel || l.target.id === sel)) continue;
      ctx.lineWidth = Math.min(4, 0.6 + l.w * 0.4) / transform.k * (selNb ? 2 : 1);
      ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const n of nodes) {
      const dim = selNb && !selNb.has(n.id);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(n); ctx.fill();
      ctx.lineWidth = 1 / transform.k; ctx.strokeStyle = C.surface; ctx.stroke(); // surface ring on overlaps
    }
    ctx.globalAlpha = 1;
    ctx.font = `600 ${13 / transform.k}px system-ui, sans-serif`; ctx.textAlign = "center";
    centers.forEach((c, id) => {
      if (!c.n) return;
      const t = id < 0 ? "Small groups" : `Circle ${id + 1}`;
      ctx.lineWidth = 4 / transform.k; ctx.strokeStyle = C.surface; ctx.fillStyle = C.ink;
      ctx.strokeText(t, c.lx, c.ly); ctx.fillText(t, c.lx, c.ly);
    });
    ctx.textAlign = "start";
    if (sel) {
      const n = nodes.find((d) => d.id === sel);
      if (n) {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4 / transform.k, 0, Math.PI * 2); ctx.lineWidth = 2.5 / transform.k; ctx.strokeStyle = C.ink; ctx.stroke();
        ctx.font = `${13 / transform.k}px system-ui, sans-serif`; ctx.fillStyle = C.ink; ctx.lineWidth = 4 / transform.k; ctx.strokeStyle = C.surface;
        ctx.strokeText(n.id, n.x + n.r + 6 / transform.k, n.y + 4 / transform.k); ctx.fillText(n.id, n.x + n.r + 6 / transform.k, n.y + 4 / transform.k);
      }
    }
    ctx.restore();
  }

  function findNode(ev) {
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left - W / 2 - transform.x) / transform.k, py = (ev.clientY - rect.top - H / 2 - transform.y) / transform.k;
    let best = null, bd = 14 / transform.k;
    for (const n of nodes) { const d = Math.hypot(n.x - px, n.y - py) - n.r; if (d < bd) { bd = d; best = n; } }
    return best;
  }

  function personCard(id) {
    const n = App.data.reply.nodes.find((d) => d.id === id); if (!n) return "";
    const { meta } = App.data;
    return `<div class="person"><b>${esc(n.id)}</b> <span class="muted small">(pseudonym)</span><br>
      ${fmt.n(n.n)} posts & comments · replied to others ${fmt.n(n.deg_out)} times · received ${fmt.n(n.deg_in)} replies (including comments on their posts)<br>
      Average tone ${n.tone.toFixed(2)} (${App.toneWord(n.tone)}) · most common emotion ${esc(n.emo)}<br>
      Mostly in ${esc(meta.fields.find((f) => f.key === n.field)?.label || n.field)}${n.topic >= 0 ? `; topic “${esc(App.topicName(n.topic))}”` : ""}${n.comm >= 0 ? `; conversation circle ${n.comm + 1}` : ""}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn small" data-a="filter-user">Filter dashboard to this person</button><button class="btn small" data-a="read-user">Read their posts</button><button class="btn small" data-a="clear-sel">Deselect</button></div></div>`;
  }

  function drawSide() {
    const { reply } = App.data, C = App.colors;
    const cards = App.card(side, { title: "Conversation circles", sub: "Groups of people who mostly reply to each other. Click one to highlight it." });
    cards.el.querySelector(".tbl-btn").remove();
    const ranked = [...reply.nodes].sort((a, b) => b.deg_in - a.deg_in).slice(0, 12);
    cards.chart.innerHTML = (sel ? personCard(sel) : "") +
      `<div class="side-list">${reply.communities.map((c) => `<button class="side-item ${colorMode === "comm" && hiComm === c.id ? "sel" : ""}" data-c="${c.id}"><b><i class="swatch" style="background:${colorMode === "comm" && hiComm === c.id ? C.highlight : C.tone(c.tone)}"></i> Circle ${c.id + 1}</b>${esc(c.desc)}</button>`).join("")}</div>
      ${App.state.comm >= 0 ? `<button class="btn small" style="margin-top:8px" data-a="clear-comm">Stop filtering to circle ${App.state.comm + 1}</button>` : ""}
      <h4 style="margin:14px 0 6px;font-size:14px">Most replied-to people</h4>
      <div class="side-list" style="max-height:300px">${ranked.map((n) => `<button class="side-item" data-u="${esc(n.id)}"><b>${esc(n.id)}</b>${fmt.n(n.deg_in)} replies received (incl. comments on their posts) · ${fmt.n(n.n)} items · tone ${App.toneWord(n.tone)}</button>`).join("")}</div>`;
    cards.chart.onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.c != null) {
        const c = +b.dataset.c;
        if (colorMode === "comm" && hiComm === c) { App.setState({ comm: App.state.comm === c ? -1 : c }); return; }
        colorMode = "comm"; hiComm = c; V.update(); return;
      }
      if (b.dataset.u) { sel = b.dataset.u; V.update(); return; }
      if (b.dataset.a === "filter-user") App.setState({ user: App.userIndex.get(sel) });
      if (b.dataset.a === "read-user") { App.setState({ user: App.userIndex.get(sel) }); App.showTab("explorer"); }
      if (b.dataset.a === "clear-sel") { sel = null; V.update(); }
      if (b.dataset.a === "clear-comm") App.setState({ comm: -1 });
    };
    if (colorMode === "comm") cards.chart.insertAdjacentHTML("afterbegin", `<p class="small ink2">Highlighted: circle ${hiComm + 1}. Click it again to filter the whole dashboard to its members.</p>`);
  }

  function drawPeople(opts) {
    const el = card.chart;
    filtCount = new Map();
    const { cols, meta } = App.data;
    const m = App.passes("user");
    for (let i = 0; i < m.length; i++) if (m[i]) { const u = meta.users[cols.user[i]]; filtCount.set(u, (filtCount.get(u) || 0) + 1); }
    const narrow = innerWidth < 640;
    if (opts.relayout || !el.querySelector("canvas") || opts.tabChange || opts.theme) {
      el.innerHTML = "";
      const ctl = document.createElement("div"); el.appendChild(ctl); peopleControls(ctl);
      if (narrow) {
        el.insertAdjacentHTML("beforeend", `<div class="notice">The network map needs a wider screen. On a phone, use the lists of conversation circles and most-replied-to people below.</div>`);
        ctx = null;
      } else {
        const wrap = document.createElement("div"); wrap.className = "net-wrap"; el.appendChild(wrap);
        W = App.width(el); H = Math.max(480, Math.min(720, W * 0.75));
        canvas = document.createElement("canvas");
        const dpr = devicePixelRatio || 1;
        canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + "px";
        canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "Reply network of pseudonymous users. Use the lists beside it for an accessible view.");
        wrap.appendChild(canvas);
        wrap.insertAdjacentHTML("beforeend", `<div class="net-help">Scroll to zoom · drag to pan · click a dot</div>`);
        ctx = canvas.getContext("2d");
        const zoom = d3.zoom().scaleExtent([0.1, 8]).on("zoom", (ev) => { transform = ev.transform; draw(); });
        d3.select(canvas).call(zoom);
        V._applyZoom = () => d3.select(canvas).call(zoom.transform, transform);
        d3.select(canvas).on("mousemove", (ev) => {
          const n = findNode(ev);
          canvas.style.cursor = n ? "pointer" : "grab";
          if (!n) { App.tip.hide(); return; }
          App.tip.show(ev, `<div class="t-title">${esc(n.id)}</div><div class="t-row"><span>Items</span><b>${fmt.n(n.n)}</b></div><div class="t-row"><span>In your filters</span><b>${fmt.n(filtCount.get(n.id) || 0)}</b></div><div class="t-row"><span>Average tone</span><b>${n.tone.toFixed(2)}</b></div><div class="t-row"><span>Emotion</span><b>${esc(n.emo)}</b></div><div class="t-row"><span>Circle</span><b>${n.comm >= 0 ? n.comm + 1 : "small group"}</b></div>`);
        }).on("mouseleave", App.tip.hide).on("click", (ev) => { const n = findNode(ev); sel = n ? n.id : null; App.tip.hide(); V.update(); });
        if (opts.relayout) layoutKey = null;
        buildLayout();
        V._applyZoom();
      }
      const legend = document.createElement("div");
      legend.innerHTML = colorMode === "tone" ? App.toneLegend() + `<div class="legend"><span><i class="swatch" style="background:${App.colors.dim}"></i>No items in current filters</span></div>`
        : `<div class="legend"><span><i class="swatch" style="background:${App.colors.highlight}"></i>Circle ${hiComm + 1}</span><span><i class="swatch" style="background:${App.colors.dim}"></i>Everyone else / filtered out</span></div>`;
      el.appendChild(legend);
    } else {
      el.querySelectorAll("#cmode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === colorMode));
    }
    const shown = nodes.length, active = nodes.filter((n) => filtCount.get(n.id)).length;
    const nc = el.querySelector("#netcount"); if (nc) nc.textContent = `${fmt.n(shown)} people shown, ${fmt.n(active)} with items in your filters`;
    draw();
    side.innerHTML = ""; drawSide();
    card.setTable(() => ({ cols: ["Pseudonym", "Items", "Replies received", "Replies given", "Average tone", "Emotion", "Circle"],
      rows: [...App.data.reply.nodes].sort((a, b) => b.deg_in - a.deg_in).slice(0, 300).map((n) => [n.id, n.n, n.deg_in, n.deg_out, n.tone, n.emo, n.comm >= 0 ? n.comm + 1 : "–"]) }));
  }

  // ---------------- ideas ----------------
  function drawIdeas() {
    if (sim) sim.stop();
    ctx = null; layoutKey = null;
    const el = card.chart, C = App.colors, { termNet, cols } = App.data;
    el.innerHTML = `<p class="small ink2">Words are linked when they often appear in the same comment (more than chance would predict). Colour shows the average tone of comments using the word under your filters. Hover a word to see its connections; click to filter the dashboard to it.</p>`;
    const mask = App.passes("q");
    const tn = termNet.nodes.map((n) => {
      const p = App.postings(n.id); let c = 0, t = 0;
      if (p) for (const i of p) if (mask[i]) { c++; t += cols.tone[i]; }
      return { ...n, fn: c, ft: c ? t / c : 0 };
    });
    const byId = new Map(tn.map((n) => [n.id, n]));
    const tl = termNet.links.map((l) => ({ source: byId.get(l.s), target: byId.get(l.t), w: l.w, pmi: l.pmi })).filter((l) => l.source && l.target);
    W = App.width(el); H = Math.max(500, Math.min(760, W * 0.8));
    const r = d3.scaleSqrt().domain([0, d3.max(tn, (n) => n.fn) || 1]).range([3, 16]);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("role", "img").attr("aria-label", "Word co-occurrence network");
    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.4, 5]).on("zoom", (ev) => g.attr("transform", ev.transform)));
    const link = g.append("g").selectAll("line").data(tl).join("line").attr("stroke", C.axis).attr("stroke-opacity", 0.5).attr("stroke-width", (l) => Math.min(3, 0.5 + Math.log(l.w) / 2));
    const node = g.append("g").selectAll("g").data(tn).join("g").style("cursor", "pointer");
    node.append("circle").attr("r", (n) => r(n.fn)).attr("fill", (n) => (n.fn ? C.tone(n.ft) : C.dim)).attr("stroke", C.surface).attr("stroke-width", 1.5);
    node.append("text").attr("x", (n) => r(n.fn) + 3).attr("dy", "0.35em").attr("class", "lbl").style("paint-order", "stroke").style("stroke", C.surface).style("stroke-width", 3).text((n) => n.id);
    const nb = new Map(tn.map((n) => [n.id, new Set([n.id])]));
    tl.forEach((l) => { nb.get(l.source.id).add(l.target.id); nb.get(l.target.id).add(l.source.id); });
    node.on("mouseenter", (ev, n) => {
      node.attr("opacity", (d) => (nb.get(n.id).has(d.id) ? 1 : 0.15));
      link.attr("stroke-opacity", (l) => (l.source.id === n.id || l.target.id === n.id ? 0.9 : 0.05)).attr("stroke", (l) => (l.source.id === n.id || l.target.id === n.id ? C.ink2 : C.axis));
      App.tip.show(ev, `<div class="t-title">“${esc(n.id)}”</div><div class="t-row"><span>Items in your filters</span><b>${fmt.n(n.fn)}</b></div><div class="t-row"><span>Average tone</span><b>${n.ft.toFixed(2)}</b></div><div class="small ink2" style="margin-top:4px">Often appears with: ${[...nb.get(n.id)].filter((x) => x !== n.id).slice(0, 8).map(esc).join(", ")}</div>`);
    }).on("mouseleave", () => { node.attr("opacity", 1); link.attr("stroke-opacity", 0.5).attr("stroke", C.axis); App.tip.hide(); })
      .on("click", (ev, n) => { App.tip.hide(); App.setState({ q: n.id }); });
    const s2 = d3.forceSimulation(tn).force("link", d3.forceLink(tl).distance(50).strength((l) => Math.min(1, l.pmi / 4)))
      .force("charge", d3.forceManyBody().strength(-90)).force("x", d3.forceX(W / 2).strength(0.06)).force("y", d3.forceY(H / 2).strength(0.08))
      .force("c", d3.forceCollide((n) => r(n.fn) + 10)).stop();
    for (let k = 0; k < 260; k++) s2.tick();
    link.attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y).attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
    node.attr("transform", (n) => `translate(${n.x},${n.y})`);
    el.insertAdjacentHTML("beforeend", App.toneLegend());
    side.innerHTML = "";
    const lst = App.card(side, { title: "Most connected words", sub: "Words that link the most other words." });
    lst.el.querySelector(".tbl-btn").remove();
    lst.chart.innerHTML = `<div class="side-list">${[...tn].sort((a, b) => nb.get(b.id).size - nb.get(a.id).size).slice(0, 20).map((n) => `<button class="side-item" data-q="${esc(n.id)}"><b>${esc(n.id)}</b>linked to ${nb.get(n.id).size - 1} words · ${fmt.n(n.fn)} items</button>`).join("")}</div>`;
    lst.chart.onclick = (e) => { const b = e.target.closest("button"); if (b) App.setState({ q: b.dataset.q }); };
    card.setTable(() => ({ cols: ["Word", "Linked word", "Comments with both"], rows: tl.map((l) => [l.source.id, l.target.id, l.w]) }));
  }

  V.update = function (opts = {}) {
    card.head.querySelectorAll("#net-mode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === mode));
    card.el.querySelector("h3").textContent = mode === "people" ? "Who replies to whom?" : "Which ideas travel together?";
    card.el.querySelector(".sub").textContent = mode === "people" ? "People (dots) linked by replies. Bigger dots wrote more; colour shows the average tone of what they wrote." : "Words (dots) linked when they appear in the same comments. Bigger dots are more common.";
    if (mode === "people") drawPeople(opts); else drawIdeas();
  };
})();
