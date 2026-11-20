/* ui.js: filter bar, filter sentence, tabs, glossary, tour, thread viewer, theme. */
(function () {
  const { fmt } = App;
  const esc = fmt.esc;

  App.TABS = [
    { key: "overview", label: "Overview", q: "What happened, and when?" },
    { key: "topics", label: "Topics", q: "What are people discussing?" },
    { key: "emotion", label: "Tone & emotion", q: "How do people feel about it?" },
    { key: "terms", label: "Words", q: "Which words carry the feeling?" },
    { key: "network", label: "Conversations", q: "Who replies to whom?" },
    { key: "explorer", label: "Read the posts", q: "What exactly was said?" },
    { key: "methods", label: "About the data", q: "How was this made?" },
  ];

  App.GLOSSARY = [
    ["item", "Post / comment", "A post is a story someone submitted to Hacker News (a link or a question). A comment is a reply to a post or to another comment. Together they are called items here."],
    ["tone", "Tone", "How positive or negative the wording of a post or comment is, scored from −1 (very negative) to +1 (very positive) by VADER, a standard sentiment dictionary. Anything between −0.2 and +0.2 counts as mixed / neutral. Tone measures the words used, not the opinion: “this is a great way to hurt people” can score positive. Sarcasm is often misread."],
    ["emotion", "Emotion", "The strongest emotion a language model (RoBERTa trained on the GoEmotions dataset) detects in the text, grouped into 7 plain families plus Neutral. A comment is labelled Neutral unless one emotion family reaches at least 25% confidence. Most Hacker News text is fairly neutral, so Neutral is usually the largest group."],
    ["topic", "Topic", "Groups of posts and comments that use similar language, found automatically with BERTopic (sentence embeddings clustered with HDBSCAN). Topic names were written afterwards by reading the top words and example comments. Short comments that do not clearly belong anywhere go into “Other / unclustered”."],
    ["field", "Field / context", "The area of life a discussion relates to (education, medicine, law, software work and so on), based on which search query found it and on keywords in the text. One item can belong to several fields; filtering on a field includes all of them."],
    ["direct", "Directly on-topic vs thread context", "Items that matched a search query or mention a key term (psychosis, delusion, addiction, therapist, companion…) are directly on-topic. Other replies in the same conversations are kept as context, because reactions matter, but you can hide them with the “Only directly on-topic” filter."],
    ["pseudonym", "Pseudonym", "Every account is replaced by a stable invented name like “Amber Heron 42”. The same person always gets the same pseudonym within this dataset, so you can follow them across conversations, but the name cannot be traced back to their Hacker News account. Usernames mentioned inside comments are replaced too."],
    ["network", "Reply network", "Each dot is a person (pseudonymous). A line joins two people when one replied to the other; thicker lines mean more replies. People who talk to each other a lot are pulled together."],
    ["community", "Community", "A cluster of people who reply to each other more than to others, found with the Louvain method. Communities are conversation circles, not formal groups, and their descriptions are summaries of their members’ posts."],
    ["stance", "Stance & framing", "Stance (for example Alarmed, Skeptical of the panic, Nuanced, Personal experience) and framing (clinical, ethical, technical, legal, cultural) are labels assigned by Claude, an AI model, to each comment. They are only shown when that labelling step has been run."],
  ];

  // ---------- filter bar ----------
  function menuControl(id, label, items, key, opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = "fctl";
    wrap.innerHTML = `<button class="fbtn" aria-haspopup="true" aria-expanded="false" id="fb-${id}">${label}</button><div class="fmenu" hidden role="menu"></div>`;
    const btn = wrap.querySelector("button"), menu = wrap.querySelector(".fmenu");
    const render = () => {
      const sel = App.state[key];
      menu.innerHTML = (opts.hint ? `<div class="hint">${opts.hint}</div>` : "") + items().map((it) =>
        `<label><input type="checkbox" value="${it.v}" ${sel.has(it.v) ? "checked" : ""}>${it.sw ? `<i class="swatch" style="background:${it.sw}"></i>` : ""}<span>${esc(it.label)}</span>${it.n != null ? `<span class="muted small" style="margin-left:auto">${fmt.n(it.n)}</span>` : ""}</label>`).join("") +
        `<div class="menu-actions"><button class="btn small" data-a="clear">Clear</button><button class="btn small" data-a="close">Done</button></div>`;
    };
    btn.onclick = (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      document.querySelectorAll(".fmenu").forEach((m) => (m.hidden = true));
      document.querySelectorAll(".fbtn").forEach((b) => b.setAttribute("aria-expanded", "false"));
      if (open) { render(); menu.hidden = false; btn.setAttribute("aria-expanded", "true"); }
    };
    menu.onclick = (e) => e.stopPropagation();
    menu.onchange = (e) => { if (e.target.type === "checkbox") App.toggleIn(key, +e.target.value); };
    menu.addEventListener("click", (e) => {
      const a = e.target.dataset.a;
      if (a === "clear") { App.setState({ [key]: new Set() }); render(); }
      if (a === "close") { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    });
    const update = () => {
      const n = App.state[key].size;
      btn.innerHTML = `${label}${n ? ` <span class="count">${n}</span>` : ""}`;
      if (!menu.hidden) render();
    };
    return { el: wrap, update };
  }

  App.buildFilters = function () {
    const { meta } = App.data;
    const row = document.getElementById("filter-row");
    const C = App.colors;
    const tally = (skip, colName) => {
      const m = App.passes(skip), col = App.data.cols[colName], c = new Map();
      for (let i = 0; i < m.length; i++) if (m[i]) c.set(col[i], (c.get(col[i]) || 0) + 1);
      return c;
    };
    const controls = [];
    // date presets
    const dateWrap = document.createElement("div");
    dateWrap.className = "fctl";
    dateWrap.innerHTML = `<button class="fbtn" id="fb-date" aria-haspopup="true">Dates</button><div class="fmenu" hidden></div>`;
    const dBtn = dateWrap.querySelector("button"), dMenu = dateWrap.querySelector(".fmenu");
    const y = (yr) => [fmt.toDay(Date.UTC(yr, 0, 1)), fmt.toDay(Date.UTC(yr, 11, 31))];
    const presets = [["All time", null], ["2023", y(2023)], ["2024", y(2024)], ["2025", y(2025)], ["2026", y(2026)],
      ["Last 12 months", [App.data.dayMax - 365, App.data.dayMax]]];
    dMenu.innerHTML = `<div class="hint">Or drag across the timeline on the Overview tab.</div>` +
      presets.map((p, i) => `<label><input type="radio" name="dp" value="${i}"><span>${p[0]}</span></label>`).join("");
    dBtn.onclick = (e) => { e.stopPropagation(); const o = dMenu.hidden; document.querySelectorAll(".fmenu").forEach((m) => (m.hidden = true)); dMenu.hidden = !o; };
    dMenu.onclick = (e) => e.stopPropagation();
    dMenu.onchange = (e) => { const p = presets[+e.target.value][1]; App.setState(p ? { d0: p[0], d1: p[1] } : { d0: null, d1: null }); dMenu.hidden = true; };
    row.appendChild(dateWrap);
    controls.push({ update: () => { const s = App.state; dBtn.innerHTML = s.d0 == null ? "Dates: all" : `Dates: ${fmt.month(s.d0)} – ${fmt.month(s.d1)}`; } });

    const add = (c) => { row.appendChild(c.el); controls.push(c); };
    add(menuControl("field", "Field", () => { const t = tally("fields", "field"); return meta.fields.map((f, i) => ({ v: i, label: f.label, n: t.get(i) || 0 })); }, "fields",
      { hint: "Area of life the discussion relates to. Counts use each item's main field." }));
    add(menuControl("topic", "Topic", () => { const t = tally("topics", "topic"); return meta.topics.map((tp) => ({ v: tp.id, label: tp.name, n: t.get(tp.id) || 0 })).concat([{ v: -1, label: "Other / unclustered", n: t.get(-1) || 0 }]); }, "topics"));
    add(menuControl("sent", "Tone", () => { const t = tally("sent", "sent"); return App.SENT.map((s) => ({ v: s.v, label: s.label, n: t.get(s.v) || 0, sw: C.tone(s.v * 0.4) })); }, "sent",
      { hint: "Positive or negative wording (VADER score)." }));
    add(menuControl("emo", "Emotion", () => { const t = tally("emos", "emo"); return meta.emotions.map((e, i) => ({ v: i, label: e, n: t.get(i) || 0, sw: C.emo[i] })); }, "emos",
      { hint: "Strongest emotion detected in the text." }));
    if (meta.has_claude_labels) {
      add(menuControl("stance", "Stance", () => { const t = tally("stances", "stance"); return meta.stances.map((e, i) => ({ v: i, label: e, n: t.get(i) || 0 })); }, "stances"));
      add(menuControl("frame", "Framing", () => { const t = tally("frames", "frame"); return meta.framings.map((e, i) => ({ v: i, label: e, n: t.get(i) || 0 })); }, "frames"));
    }
    // type segmented
    const seg = document.createElement("div");
    seg.className = "seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Posts or comments");
    seg.innerHTML = [["all", "All"], ["story", "Posts"], ["comment", "Comments"]].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join("");
    seg.onclick = (e) => { if (e.target.dataset.v) App.setState({ type: e.target.dataset.v }); };
    row.appendChild(seg);
    controls.push({ update: () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === App.state.type)) });
    // scope toggle
    const sc = document.createElement("label");
    sc.className = "small ink2"; sc.style.display = "inline-flex"; sc.style.gap = "6px"; sc.style.alignItems = "center";
    sc.innerHTML = `<input type="checkbox"> Only ${App.gl("direct", "directly on-topic")}`;
    sc.querySelector("input").onchange = (e) => App.setState({ scope: e.target.checked ? "direct" : "all" });
    row.appendChild(sc);
    controls.push({ update: () => (sc.querySelector("input").checked = App.state.scope === "direct") });
    // search
    const q = document.createElement("input");
    q.type = "search"; q.className = "search"; q.placeholder = "Search words, e.g. therapist"; q.setAttribute("aria-label", "Search text");
    let tmr;
    q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => App.setState({ q: q.value }), 250); };
    row.appendChild(q);
    controls.push({ update: () => { if (document.activeElement !== q) q.value = App.state.q; } });
    const reset = document.createElement("button");
    reset.className = "btn small"; reset.textContent = "Reset all";
    reset.onclick = () => App.reset();
    row.appendChild(reset);

    document.addEventListener("click", () => document.querySelectorAll(".fmenu").forEach((m) => (m.hidden = true)));
    App.updateFilters = () => { controls.forEach((c) => c.update()); App.renderSentence(); };
  };

  // ---------- the plain-language sentence ----------
  App.renderSentence = function () {
    const s = App.state, { meta, N } = App.data, el = document.getElementById("sentence");
    const n = App.idx.length;
    const what = s.type === "story" ? "posts" : s.type === "comment" ? "comments" : "posts and comments";
    const parts = [], chips = [];
    const chip = (label, clear) => chips.push({ label, clear });
    if (s.fields.size) { const l = [...s.fields].map((i) => meta.fields[i].label); parts.push(`about <b>${esc(l.join(" or "))}</b>`); chip(`Field: ${l.join(", ")}`, { fields: new Set() }); }
    if (s.topics.size) { const l = [...s.topics].map(App.topicName); parts.push(`in the topic${l.length > 1 ? "s" : ""} <b>${esc(l.join(" or "))}</b>`); chip(`Topic: ${l.join(", ")}`, { topics: new Set() }); }
    if (s.d0 != null) { parts.push(`from <b>${fmt.date(s.d0)}</b> to <b>${fmt.date(s.d1)}</b>`); chip(`${fmt.month(s.d0)} – ${fmt.month(s.d1)}`, { d0: null, d1: null }); }
    if (s.sent.size) { const l = [...s.sent].map(App.sentLabel); parts.push(`with a <b>${esc(l.join(" or ").toLowerCase())}</b>`); chip(l.join(", "), { sent: new Set() }); }
    if (s.emos.size) { const l = [...s.emos].map((i) => meta.emotions[i]); parts.push(`where the main emotion is <b>${esc(l.join(" or "))}</b>`); chip(`Emotion: ${l.join(", ")}`, { emos: new Set() }); }
    if (s.stances.size) { const l = [...s.stances].map((i) => meta.stances[i]); parts.push(`with the stance <b>${esc(l.join(" or "))}</b>`); chip(`Stance: ${l.join(", ")}`, { stances: new Set() }); }
    if (s.frames.size) { const l = [...s.frames].map((i) => meta.framings[i]); parts.push(`framed as <b>${esc(l.join(" or "))}</b>`); chip(`Framing: ${l.join(", ")}`, { frames: new Set() }); }
    if (s.q) { parts.push(`mentioning <b>“${esc(s.q)}”</b>${App.searchIsExact() ? "" : " (searching the first 220 characters of each item)"}`); chip(`Search: ${s.q}`, { q: "" }); }
    if (s.user >= 0) { parts.push(`written by <b>${esc(meta.users[s.user])}</b>`); chip(`Person: ${meta.users[s.user]}`, { user: -1 }); }
    if (s.comm >= 0) { parts.push(`by people in <b>conversation circle ${s.comm + 1}</b>`); chip(`Circle ${s.comm + 1}`, { comm: -1 }); }
    if (s.scope === "direct") { parts.push("that are <b>directly on-topic</b>"); chip("Directly on-topic only", { scope: "all" }); }
    const base = `Showing <b class="tnum">${fmt.n(n)}</b> ${what}${n === N ? "" : ` (of ${fmt.n(N)})`}`;
    el.innerHTML = `<span>${base}${parts.length ? " " + parts.join(", ") : ""}.</span>` +
      chips.map((c, i) => `<span class="chip">${esc(c.label)}<button aria-label="Remove filter ${esc(c.label)}" data-i="${i}">×</button></span>`).join("");
    el.querySelectorAll(".chip button").forEach((b) => (b.onclick = () => App.setState(chips[+b.dataset.i].clear)));
  };

  // ---------- tabs ----------
  App.buildTabs = function () {
    const nav = document.getElementById("tabs");
    nav.innerHTML = App.TABS.map((t) => `<button role="tab" data-k="${t.key}" id="tab-${t.key}" aria-selected="false">${t.label}<span class="q">${t.q}</span></button>`).join("");
    nav.onclick = (e) => { const b = e.target.closest("button"); if (b) App.showTab(b.dataset.k); };
  };
  App.showTab = function (key) {
    if (!App.TABS.some((t) => t.key === key)) key = "overview";
    App.tab = key;
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.k === key));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${key}`));
    App.writeHash();
    const v = App.views[key];
    if (v) { if (!v._built) { v.build(document.getElementById(`view-${key}`)); v._built = true; } v.update({ tabChange: true }); }
  };

  // ---------- glossary ----------
  App.buildGlossary = function () {
    const d = document.getElementById("glossary");
    d.innerHTML = `<div class="modal-head"><h3>Glossary</h3><button class="btn small" id="gloss-close">Close</button></div>
      <p class="small ink2">Plain-language definitions of every measure in this dashboard. Dotted-underlined words anywhere on the page open this panel.</p>
      <dl>${App.GLOSSARY.map(([k, t, dsc]) => `<dt id="g-${k}">${t}</dt><dd>${dsc}</dd>`).join("")}</dl>`;
    d.querySelector("#gloss-close").onclick = () => (d.hidden = true);
    document.getElementById("gloss-btn").onclick = () => (d.hidden = !d.hidden);
    const open = (k) => {
      d.hidden = false;
      const dt = d.querySelector(`#g-${k}`);
      if (dt) { dt.scrollIntoView({ block: "center" }); dt.classList.add("flash"); setTimeout(() => dt.classList.remove("flash"), 1200); }
    };
    document.addEventListener("click", (e) => { const g = e.target.closest(".gloss"); if (g) { e.stopPropagation(); open(g.dataset.g); } });
    document.addEventListener("keydown", (e) => {
      const g = e.target.closest && e.target.closest(".gloss");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(g.dataset.g); }
      if (e.key === "Escape") { d.hidden = true; document.getElementById("thread-overlay").hidden = true; App.endTour && App.endTour(); }
    });
    // hover definitions
    document.addEventListener("mouseover", (e) => {
      const g = e.target.closest && e.target.closest(".gloss");
      if (!g) return;
      const def = App.GLOSSARY.find((x) => x[0] === g.dataset.g);
      if (def) App.tip.show(e, `<div class="t-title">${def[1]}</div>${def[2]}<div class="muted small" style="margin-top:4px">Click for the glossary.</div>`);
    });
    document.addEventListener("mouseout", (e) => { if (e.target.closest && e.target.closest(".gloss")) App.tip.hide(); });
  };

  // ---------- theme ----------
  App.buildTheme = function () {
    const KEY = "hnap-theme";
    try { const t = localStorage.getItem(KEY); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* storage unavailable */ }
    document.getElementById("theme-btn").onclick = () => {
      const cur = document.documentElement.dataset.theme ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      App.readColors(); App.rerenderAll();
    };
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { App.readColors(); App.rerenderAll(); });
  };

  // ---------- conversation viewer ----------
  App.openThread = function (i) {
    const { cols, texts, meta, children, storyItem } = App.data;
    const ov = document.getElementById("thread-overlay"), m = document.getElementById("thread-modal");
    let root = storyItem.get(cols.story[i]);
    if (root == null) { root = i; while (cols.parent[root] >= 0) root = cols.parent[root]; }
    const story = cols.story[i] >= 0 ? meta.stories[cols.story[i]] : null;
    const LIMIT = 250;
    let count = 0;
    // for big threads, keep only the path to the chosen item and its replies
    const keep = new Set();
    let cur = i; while (cur >= 0) { keep.add(cur); cur = cols.parent[cur]; }
    const sub = [i]; while (sub.length) { const n = sub.pop(); keep.add(n); (children.get(n) || []).forEach((c) => sub.push(c)); }
    const total = (function cnt(n) { return 1 + (children.get(n) || []).reduce((a, c) => a + cnt(c), 0); })(root);
    const trimmed = total > LIMIT;
    const node = (n, depth) => {
      if (count > LIMIT || (trimmed && !keep.has(n))) return "";
      count++;
      const tone = cols.tone[n];
      const kids = (children.get(n) || []).slice().sort((a, b) => cols.t[a] - cols.t[b]);
      return `<div class="tree-node ${n === i ? "hit" : ""}" style="margin-left:${Math.min(depth, 10) * 14}px;border-left-color:${App.colors.tone(tone)}" ${n === i ? 'id="thread-hit"' : ""}>
        <div class="meta"><b>${esc(meta.users[cols.user[n]])}</b> · ${fmt.date(cols.t[n])} · ${esc(meta.emotions[cols.emo[n]])} · ${App.toneWord(tone)} (${tone.toFixed(2)})</div>
        <div>${esc(texts[n])}</div></div>` + kids.map((k) => node(k, depth + 1)).join("");
    };
    m.innerHTML = `<div class="modal-head"><div><h3 id="thread-title">${esc(story ? story.title : "Conversation")}</h3>
      <p class="sub">${story ? `${fmt.date(story.day)} · ` : ""}${fmt.n(total)} items in this collected thread${trimmed ? `; showing the reply chain around the selected comment` : ""}. The coloured bar on each comment shows its tone (red = negative, blue = positive). Comments are shortened to 220 characters.</p></div>
      <button class="btn small" id="thread-close">Close</button></div>${node(root, 0)}`;
    ov.hidden = false;
    m.querySelector("#thread-close").onclick = () => (ov.hidden = true);
    ov.onclick = (e) => { if (e.target === ov) ov.hidden = true; };
    const hit = m.querySelector("#thread-hit");
    if (hit) setTimeout(() => hit.scrollIntoView({ block: "center" }), 30);
  };

  // ---------- guided tour ----------
  App.buildTour = function () {
    const steps = [
      { sel: "header.top", title: "What this is", text: "A map of how Hacker News discusses AI psychosis and problematic AI use. Everything comes from public posts and comments; every person is shown under an invented name." },
      { sel: "#filter-row", title: "Filters narrow everything", text: "Pick a field, topic, tone, emotion or date range, or search a word. Every chart on every tab updates together." },
      { sel: "#sentence", title: "This sentence says what you are looking at", text: "It always describes the current selection in plain words. Click × on a chip to drop that filter." },
      { sel: "#tabs", title: "Each tab answers one question", text: "Start with Overview for the timeline, then Topics, Tone & emotion, Words, Conversations, and Read the posts to see the original comments." },
      { sel: "details.howto", title: "Unsure what a chart means?", text: "Every chart has a “How to read this” note, and dotted-underlined words open the glossary." },
      { sel: ".tbl-btn", title: "Prefer numbers?", text: "“Table” swaps any chart for the exact figures behind it." },
    ];
    const pop = document.getElementById("tour-pop"), ring = document.getElementById("tour-ring");
    let k = 0;
    const show = () => {
      const st = steps[k];
      const el = [...document.querySelectorAll(st.sel)].find((e) => e.offsetParent !== null) || document.querySelector(st.sel);
      if (!el) { next(); return; }
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      Object.assign(ring.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" });
      ring.hidden = false;
      pop.innerHTML = `<h4>${st.title}</h4><p>${st.text}</p><div class="row"><span class="muted small">${k + 1} of ${steps.length}</span><span>
        <button class="btn small" id="tour-skip">${k === steps.length - 1 ? "Close" : "Skip"}</button>
        ${k < steps.length - 1 ? `<button class="btn small primary" id="tour-next">Next</button>` : ""}</span></div>`;
      pop.hidden = false;
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let top = r.bottom + 14; if (top + ph > innerHeight - 10) top = Math.max(10, r.top - ph - 14);
      pop.style.top = top + "px"; pop.style.left = Math.min(Math.max(10, r.left), innerWidth - pw - 10) + "px";
      pop.querySelector("#tour-skip").onclick = App.endTour;
      const n = pop.querySelector("#tour-next"); if (n) { n.onclick = next; n.focus(); }
    };
    const next = () => { k++; if (k >= steps.length) App.endTour(); else show(); };
    App.endTour = () => { pop.hidden = true; ring.hidden = true; try { localStorage.setItem("hnap-toured", "1"); } catch (e) { /* ignore */ } };
    App.startTour = () => { App.showTab("overview"); k = 0; setTimeout(show, 50); };
    document.getElementById("tour-btn").onclick = App.startTour;
  };
})();
