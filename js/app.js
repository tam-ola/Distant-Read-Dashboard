/* app.js: boot sequence and global re-render wiring. */
(async function () {
  try {
    await App.load();
  } catch (e) {
    document.getElementById("loading").innerHTML = `Could not load the data files (${App.fmt.esc(e.message)}). If you opened index.html directly from disk, serve the folder instead: <code>python3 -m http.server</code> inside <code>dashboard/</code>.`;
    return;
  }
  App.readColors();
  const view = App.readHash();
  App.recompute();
  App.buildTheme();
  App.readColors();
  App.buildFilters();
  App.buildTabs();
  App.buildGlossary();
  App.buildTour();
  document.getElementById("loading").remove();

  App.rerenderAll = () => {
    for (const k of Object.keys(App.views)) if (App.views[k]._built) App.views[k]._dirty = true;
    const v = App.views[App.tab];
    if (v && v._built) { v.update({ theme: true }); v._dirty = false; }
  };
  App.onChange(() => {
    App.updateFilters();
    for (const k of Object.keys(App.views)) if (App.views[k]._built) App.views[k]._dirty = true;
    const v = App.views[App.tab];
    if (v && v._built) { v.update({}); v._dirty = false; }
  });
  const show = App.showTab;
  App.showTab = (key) => { show(key); };
  App.updateFilters();
  App.showTab(view || "overview");
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { const v = App.views[App.tab]; if (v && v._built) v.update({ relayout: true }); }, 200); });
  try { if (!localStorage.getItem("hnap-toured") && !location.hash) setTimeout(App.startTour, 600); } catch (e) { /* storage unavailable */ }
})();
