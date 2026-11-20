/* Read the posts: filterable, sortable list of the actual (shortened) comments, CSV export. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.explorer = {});
  let el, sort = "new", shown = 50;

  V.build = function (root) {
    root.innerHTML = `<p class="view-intro">The original posts and comments behind every chart, shortened to 220 characters and shown under pseudonyms. Everything here follows the filters at the top. Open “conversation” to see the reply chain a comment sits in.</p>`;
    const card = document.createElement("div"); card.className = "card"; root.appendChild(card);
    card.innerHTML = `<div class="ex-controls">
      <label class="small ink2">Sort by <select id="ex-sort">
        <option value="new">Newest first</option><option value="old">Oldest first</option>
        <option value="replies">Most replies</option><option value="neg">Most negative tone</option><option value="pos">Most positive tone</option><option value="long">Longest</option>
      </select></label>
      <button class="btn small" id="ex-csv">Download these as CSV</button>
      <span class="small muted" id="ex-count"></span></div>
      <div class="ex-list" id="ex-list"></div>
      <div style="text-align:center;margin-top:12px"><button class="btn" id="ex-more">Show 50 more</button></div>`;
    el = card;
    card.querySelector("#ex-sort").onchange = (e) => { sort = e.target.value; shown = 50; V.update(); };
    card.querySelector("#ex-more").onclick = () => { shown += 50; V.update(); };
    card.querySelector("#ex-csv").onclick = csv;
    card.querySelector("#ex-list").onclick = (e) => {
      if (e.target.dataset.thread) App.openThread(+e.target.dataset.thread);
      if (e.target.dataset.user) App.setState({ user: +e.target.dataset.user });
    };
  };

  function sorted() {
    const { cols, children } = App.data, ids = App.idx.slice();
    const rep = (i) => (children.get(i) || []).length;
    const f = { new: (a, b) => cols.t[b] - cols.t[a], old: (a, b) => cols.t[a] - cols.t[b], replies: (a, b) => rep(b) - rep(a),
      neg: (a, b) => cols.tone[a] - cols.tone[b], pos: (a, b) => cols.tone[b] - cols.tone[a], long: (a, b) => cols.words[b] - cols.words[a] }[sort];
    return ids.sort(f);
  }

  V.update = function () {
    const { cols, texts, meta, children } = App.data, C = App.colors;
    const ids = sorted();
    el.querySelector("#ex-count").textContent = `${fmt.n(ids.length)} items`;
    const list = el.querySelector("#ex-list");
    if (!ids.length) { App.emptyNote(list); el.querySelector("#ex-more").hidden = true; return; }
    const q = App.state.q.trim();
    const re = q ? new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi") : null;
    list.innerHTML = ids.slice(0, shown).map((i) => {
      const st = cols.story[i] >= 0 ? meta.stories[cols.story[i]] : null;
      const body = esc(texts[i]);
      return `<article class="post" style="border-left-color:${C.tone(cols.tone[i])}">
        <div class="meta"><button class="linkbtn" data-user="${cols.user[i]}" title="Filter to this person"><b>${esc(meta.users[cols.user[i]])}</b></button>
          <span>${fmt.date(cols.t[i])}</span><span>· ${cols.type[i] ? "Post" : "Comment"}</span>
          <span class="chip">${esc(meta.fields[cols.field[i]].label)}</span>
          <span class="chip">${esc(App.topicName(cols.topic[i]))}</span>
          <span class="chip"><i class="swatch" style="background:${C.emo[cols.emo[i]]}"></i>${esc(meta.emotions[cols.emo[i]])}</span>
          <span>${App.toneWord(cols.tone[i])} (${cols.tone[i].toFixed(2)})</span>
          ${cols.stance[i] >= 0 ? `<span class="chip">${esc(meta.stances[cols.stance[i]])}</span>` : ""}</div>
        <div class="body">${re ? body.replace(re, "<mark>$1</mark>") : body}</div>
        <div class="thread">${st ? `In: “${esc(st.title)}” · ` : ""}${(children.get(i) || []).length} direct replies · <button class="linkbtn" data-thread="${i}">conversation</button></div>
      </article>`;
    }).join("");
    el.querySelector("#ex-more").hidden = shown >= ids.length;
  };

  function csv() {
    const { cols, texts, meta } = App.data;
    const rows = [["date", "type", "pseudonym", "field", "topic", "tone", "tone_label", "emotion", "stance", "thread_title", "excerpt"]];
    for (const i of sorted()) {
      const st = cols.story[i] >= 0 ? meta.stories[cols.story[i]].title : "";
      rows.push([fmt.date(cols.t[i]), cols.type[i] ? "post" : "comment", meta.users[cols.user[i]], meta.fields[cols.field[i]].label, App.topicName(cols.topic[i]),
        cols.tone[i], App.toneWord(cols.tone[i]), meta.emotions[cols.emo[i]], cols.stance[i] >= 0 ? meta.stances[cols.stance[i]] : "", st, texts[i]]);
    }
    const s = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([s], { type: "text/csv" }));
    a.download = "hn-ai-psychosis-selection.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
})();
