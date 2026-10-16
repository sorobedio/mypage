// Public site: loads data/*.json and renders pages client-side.
// Routes: #/<page-id>  and  #/post/<slug>
(function () {
  const app = document.getElementById("app");
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav-toggle");
  let data = null;

  if (nav && toggle) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open);
    });
  }

  const fetchJson = (url) => fetch(url + "?v=" + Date.now(), { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(url + ": " + r.status);
    return r.json();
  });

  function buildNav(active) {
    const { esc } = SiteRender;
    nav.innerHTML = data.pages.filter((p) => p.nav !== false).map((p) =>
      `<a href="#/${esc(p.id)}"${p.id === active ? ' class="active" aria-current="page"' : ""}>${esc(p.title)}</a>`
    ).join("");
  }

  function mountComments(post) {
    const box = document.getElementById("comments");
    const g = data.site.giscus || {};
    if (!box) return;
    if (!g.repoId || !g.categoryId) {
      box.innerHTML = `<p class="note">Comments are not configured yet.</p>`;
      return;
    }
    box.innerHTML = `<h2>Comments</h2><p class="note">Sign in with GitHub to comment.</p>`;
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const s = document.createElement("script");
    s.src = "https://giscus.app/client.js";
    Object.entries({
      "data-repo": g.repo, "data-repo-id": g.repoId,
      "data-category": g.category, "data-category-id": g.categoryId,
      "data-mapping": "specific", "data-term": "post:" + post.slug,
      "data-strict": "1", "data-reactions-enabled": "1", "data-emit-metadata": "0",
      "data-input-position": "top", "data-theme": dark ? "dark_dimmed" : "light",
      "data-lang": "en", "data-loading": "lazy", crossorigin: "anonymous",
    }).forEach(([k, v]) => s.setAttribute(k, v));
    s.async = true;
    box.appendChild(s);
  }

  function route() {
    if (!data) return;
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    nav.classList.remove("open");
    window.scrollTo(0, 0);

    if (parts[0] === "post" && parts[1]) {
      const post = data.posts.find((p) => p.slug === parts[1] && !p.draft);
      buildNav("stories");
      if (!post) return notFound();
      document.title = `${post.title} | ${data.site.name}`;
      app.innerHTML = SiteRender.renderPost(post);
      mountComments(post);
      return;
    }
    const page = data.pages.find((p) => p.id === (parts[0] || data.pages[0]?.id));
    buildNav(page?.id);
    if (!page) return notFound();
    document.title = page === data.pages[0] ? data.site.name : `${page.title} | ${data.site.name}`;
    app.innerHTML = SiteRender.renderPage(page, data);
  }

  function notFound() {
    app.innerHTML = `<div class="wrap content"><h1>Not found</h1><p><a href="#/">Back home</a></p></div>`;
  }

  Promise.all([fetchJson("data/site.json"), fetchJson("data/posts.json").catch(() => [])])
    .then(([site, posts]) => {
      data = { ...site, posts };
      document.querySelector(".brand").textContent = site.site.name;
      document.querySelector(".site-footer .wrap").textContent = site.site.footer;
      route();
    })
    .catch((e) => {
      app.innerHTML = `<div class="wrap content"><p class="note">Could not load site content (${SiteRender.esc(e.message)}).</p></div>`;
    });

  window.addEventListener("hashchange", route);
})();
