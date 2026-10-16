// Shared rendering for the public site and the dashboard preview.
// Content lives in data/site.json and data/posts.json.
(function (global) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
  const clean = (html) => (global.DOMPurify ? DOMPurify.sanitize(html) : esc(html));
  const md = (s) => clean(global.marked ? marked.parse(String(s ?? "")) : esc(s));
  const mdInline = (s) => clean(global.marked ? marked.parseInline(String(s ?? "")) : esc(s));
  const splitTags = (s) => String(s ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  // "Label | url" per line
  const parseLinks = (s) => String(s ?? "").split("\n").map((l) => {
    const i = l.lastIndexOf("|");
    return i < 0 ? null : { label: l.slice(0, i).trim(), url: l.slice(i + 1).trim() };
  }).filter((l) => l && l.label);
  const safeUrl = (u) => (/^\s*javascript:/i.test(u || "") ? "#" : u);

  const fmtDate = (d) => {
    const t = new Date(d + "T00:00:00");
    return isNaN(t) ? esc(d) : t.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  function heading(s) {
    return s.title ? `<h2>${esc(s.title)}</h2>` : "";
  }

  function postList(posts, count) {
    const visible = posts.filter((p) => !p.draft).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const shown = count > 0 ? visible.slice(0, count) : visible;
    if (!shown.length) return `<p class="note">No stories yet.</p>`;
    return `<div class="post-list">${shown.map((p) => `
      <a class="post-item" href="#/post/${encodeURIComponent(p.slug)}">
        <span class="post-date">${fmtDate(p.date)}</span>
        <span class="post-title">${esc(p.title)}</span>
        ${p.summary ? `<span class="post-summary">${esc(p.summary)}</span>` : ""}
      </a>`).join("")}</div>`;
  }

  const sectionRenderers = {
    profile(s, data) {
      const p = data.profile || {};
      const initials = (p.name || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
      return `<div class="hero">
        <img class="avatar" src="${esc(p.photo)}" alt="Photo of ${esc(p.name)}"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar avatar-fallback',textContent:'${esc(initials)}'}))">
        <div>
          <h1>${esc(p.name)}</h1>
          <p class="role">${esc(p.role).replace(/\n/g, "<br>")}</p>
          <div class="prose">${md(s.body)}</div>
          <div class="links">${(p.links || []).map((l) =>
            `<a href="${esc(safeUrl(l.url))}">${esc(l.label)}</a>`).join("")}</div>
        </div>
      </div>`;
    },
    text(s) {
      return `${heading(s)}<div class="prose">${md(s.body)}</div>`;
    },
    list(s) {
      return `${heading(s)}<ul class="list">${(s.items || []).map((i) =>
        `<li><span class="date">${esc(i.date)}</span><span>${mdInline(i.text)}</span></li>`).join("")}</ul>`;
    },
    cards(s) {
      return `${heading(s)}<div class="cards">${(s.items || []).map((i) => `
        <article class="card">
          <h3>${esc(i.title)}</h3>
          <p>${mdInline(i.text)}</p>
          ${splitTags(i.tags).length ? `<p class="tags">${splitTags(i.tags).map((t) => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
        </article>`).join("")}</div>`;
    },
    publications(s) {
      return `${heading(s)}<ol class="pubs">${(s.items || []).map((i) => `
        <li>
          <span class="venue">${esc(i.venue)}</span>
          <div>
            <p class="title">${mdInline(i.title)}</p>
            <p class="authors">${mdInline(i.authors)}</p>
            ${parseLinks(i.links).length ? `<p class="pub-links">${parseLinks(i.links).map((l) =>
              `<a href="${esc(safeUrl(l.url))}">${esc(l.label)}</a>`).join("")}</p>` : ""}
          </div>
        </li>`).join("")}</ol>`;
    },
    tags(s) {
      return `${heading(s)}<p class="tags">${splitTags(s.tags).map((t) => `<span>${esc(t)}</span>`).join("")}</p>`;
    },
    posts(s, data) {
      return `${heading(s)}${postList(data.posts || [], Number(s.count) || 0)}`;
    },
  };

  function renderPage(page, data) {
    const head = page.sections?.[0]?.type === "profile" ? "" : `
      <section class="page-head"><div class="wrap">
        <h1>${esc(page.title)}</h1>
        ${page.subtitle ? `<p>${esc(page.subtitle)}</p>` : ""}
      </div></section>`;
    const body = (page.sections || []).map((s) => {
      const r = sectionRenderers[s.type];
      return r ? `<section class="block block-${esc(s.type)}" id="${esc(s.id)}">${r(s, data)}</section>` : "";
    }).join("");
    return `${head}<div class="wrap content">${body || `<p class="note">This page is empty.</p>`}</div>`;
  }

  function renderPost(post) {
    return `<section class="page-head"><div class="wrap narrow">
        <p class="crumb"><a href="#/stories">&larr; All stories</a></p>
        <h1>${esc(post.title)}</h1>
        <p>${fmtDate(post.date)}</p>
      </div></section>
      <div class="wrap narrow content">
        <article class="prose post-body">${md(post.body)}</article>
        <div id="comments" class="comments"></div>
      </div>`;
  }

  global.SiteRender = { esc, md, renderPage, renderPost, sectionRenderers, fmtDate };
})(window);
