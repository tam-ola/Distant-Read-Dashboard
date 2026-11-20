/* About the data: sources, queries, anonymization, measures, validation, limits. */
(function () {
  const { fmt } = App, esc = fmt.esc;
  const V = (App.views.methods = {});
  V.build = function (root) {
    const { meta } = App.data;
    const byField = d3.groups(meta.queries, (q) => q.field);
    const val = meta.validation || {};
    root.innerHTML = `<div class="prose">
      <h3 style="margin-top:0">What is in this dataset</h3>
      <p>${fmt.n(meta.counts.items)} Hacker News items: ${fmt.n(meta.counts.stories)} posts and ${fmt.n(meta.counts.comments)} comments by ${fmt.n(meta.counts.users)} pseudonymous accounts, from ${esc(meta.window.start)} to ${esc(meta.window.end)}. Data generated ${esc(meta.generated)}.</p>
      <h3>How it was collected</h3>
      <ol>
        <li><b>Search.</b> The public Algolia Hacker News Search API was queried for ${meta.queries.length} search phrases (listed below), with typo-tolerance and prefix matching turned off so that, for example, “glazing” does not also match “blazing”. Large result sets were split into smaller time windows to get past the API's 1,000-result cap.</li>
        <li><b>Conversations.</b> For every matching post, the whole comment thread was collected. For threads reached only through matching comments (at least 2 in the same thread), we kept the matching comments, what they replied to, and the replies they received. Comments that matched on their own elsewhere were kept as standalone items.</li>
        <li><b>Relevance check.</b> Threads where fewer than 5% of items mention a key term, and whose title and search match are only loosely related, were dropped (3 threads; listed in <code>data/raw/dropped_threads.tsv</code> for review).</li>
        <li><b>Cleaning.</b> HTML was stripped and quoted text (lines starting with “>”) was separated, so tone and emotion reflect each writer's own words.</li>
      </ol>
      <h3>How people are protected</h3>
      <ul>
        <li>Every account is replaced by a stable ${App.gl("pseudonym", "pseudonym")} generated with a secret key (HMAC-SHA256). No real usernames appear in the dashboard or its data files, and there are no exceptions for well-known accounts.</li>
        <li>Usernames mentioned inside comments, @-mentions and links to Hacker News profiles or items are replaced. Hacker News item IDs are replaced with random-looking IDs, so items cannot be looked up from the data files.</li>
        <li>Comments are shown as excerpts of at most 220 characters. Exact quotes can still be searched on the web, so treat excerpts with care when you share findings, and paraphrase in publications.</li>
      </ul>
      <h3>How each measure works</h3>
      <dl>${App.GLOSSARY.map(([k, t, d]) => `<dt><b>${t}</b></dt><dd class="ink2" style="margin:2px 0 10px">${d}</dd>`).join("")}</dl>
      <p>The emotion model reads the first ~128 tokens (about 90 words) of each item; longer comments are judged by their opening. Topics were found with BERTopic on all-MiniLM-L6-v2 sentence embeddings (UMAP + HDBSCAN, random seed 42); outliers were reassigned to the nearest topic only where similarity was high enough, and very short replies were assigned to a topic only when clearly similar.</p>
      <h3>How far to trust the automatic labels</h3>
      ${val.n ? `<p>On a random sample of ${fmt.n(val.n)} comments, Claude independently rated tone and emotion. It agreed with the tone label ${fmt.pct(val.tone_agree)} of the time and with the emotion family ${fmt.pct(val.emo_agree)} of the time.</p>` :
        `<div class="notice">A validation step (Claude independently rating a random sample, compared against the automatic labels) is part of the pipeline but has not been run for this version. Until it has, treat tone and emotion as rough signals. They are most reliable when you compare large groups (topics, fields, months) and least reliable for any single comment, especially sarcastic ones.</div>`}
      <h3>Known limits</h3>
      <ul>
        <li><b>Who is on Hacker News.</b> Its users skew toward software engineers, founders and tech-industry workers, mostly in English-speaking countries. This is how that community talks, not the general public.</li>
        <li><b>Search finds what it looks for.</b> Discussions that never use any of the search phrases are missing. The query list is in <code>pipeline/config.yaml</code> and can be extended.</li>
        <li><b>Sarcasm and irony</b> are common on Hacker News and often misread by both tone and emotion models.</li>
        <li><b>Context markers</b> on the timeline are researcher-curated outside events with approximate dates (<code>pipeline/events.yaml</code>). They give context and do not prove cause.</li>
        <li>Deleted and flagged comments are not included.</li>
      </ul>
      <h3>Search phrases used</h3>
      <div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>Field</th><th>Search phrase</th><th>Matches</th></tr></thead><tbody>
        ${byField.flatMap(([f, qs]) => qs.map((q) => `<tr><td>${esc((meta.fields.find((x) => x.key === f) || {}).label || f)}</td><td><code>${esc(q.query)}</code></td><td class="num">${fmt.n(q.hits)}</td></tr>`)).join("")}
      </tbody></table></div>
      <p class="small muted">Matches are raw search results before threads were expanded and duplicates removed.</p>
    </div>`;
  };
  V.update = function () {};
})();
