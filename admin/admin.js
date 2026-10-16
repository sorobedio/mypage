// Site dashboard. Edits data/site.json and data/posts.json and commits them
// to the repository through the GitHub Contents API. Only a token belonging to
// OWNER with push access gets past the login gate, and GitHub itself rejects
// writes from anyone else.
(function () {
  const OWNER = "sorobedio";
  const REPO = "sorobedio.github.io";
  const BRANCH = "main";
  const FILES = { site: "data/site.json", posts: "data/posts.json" };
  const TOKEN_KEY = "dash_token";

  const SECTION_TYPES = {
    text: { label: "Text (markdown)", make: () => ({ body: "" }) },
    list: { label: "Dated list", make: () => ({ items: [{ date: "", text: "" }] }) },
    cards: { label: "Cards", make: () => ({ items: [{ title: "", text: "", tags: "" }] }) },
    publications: { label: "Publications", make: () => ({ items: [{ venue: "", title: "", authors: "", links: "Paper | #" }] }) },
    tags: { label: "Tags", make: () => ({ tags: "" }) },
    posts: { label: "Stories list", make: () => ({ count: 3 }) },
    profile: { label: "Profile header", make: () => ({ body: "" }) },
  };
  const ITEM_FIELDS = {
    list: [["date", "Date / label", "text"], ["text", "Text (markdown allowed)", "text"]],
    cards: [["title", "Title", "text"], ["text", "Description", "textarea"], ["tags", "Tags (comma separated)", "text"]],
    publications: [["venue", "Venue", "text"], ["title", "Title", "text"], ["authors", "Authors (markdown, **bold** yourself)", "text"],
      ["links", "Links, one per line: Label | URL", "textarea"]],
  };

  const $ = (s) => document.querySelector(s);
  const { esc } = SiteRender;
  let token = null;
  let state = null; // { site, posts }
  const shas = {};
  const dirty = new Set();
  let view = { kind: "page", id: null };
  const open = new Set(); // expanded section ids
  let previewOn = false;

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    const r = await fetch("https://api.github.com" + path, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!r.ok) {
      let msg = r.status + " " + r.statusText;
      try { msg = (await r.json()).message || msg; } catch (_) {}
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  const contentsPath = (p) => `/repos/${OWNER}/${REPO}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;

  async function getFile(path) {
    const f = await gh(contentsPath(path) + "?ref=" + BRANCH);
    return { text: b64decode(f.content), sha: f.sha };
  }
  async function getSha(path) {
    try { return (await gh(contentsPath(path) + "?ref=" + BRANCH)).sha; }
    catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function putFile(path, base64, sha, message) {
    const body = { message, content: base64, branch: BRANCH };
    if (sha) body.sha = sha;
    const res = await gh(contentsPath(path), { method: "PUT", body: JSON.stringify(body) });
    return res.content.sha;
  }

  // ---------- Auth ----------
  async function verify(t) {
    token = t;
    const user = await gh("/user");
    if (user.login.toLowerCase() !== OWNER.toLowerCase()) throw new Error(`This dashboard belongs to ${OWNER}.`);
    const repo = await gh(`/repos/${OWNER}/${REPO}`);
    if (!repo.permissions?.push) throw new Error("Token can't write to the repository. Give it Contents: Read and write.");
    return user;
  }

  function showLogin(msg) {
    $("#dash").hidden = true;
    $("#login").hidden = false;
    $("#login-err").textContent = msg || "";
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = $("#token").value.trim();
    const btn = e.submitter; btn.disabled = true; btn.textContent = "Checking…";
    try {
      const user = await verify(t);
      ($("#remember").checked ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
      $("#token").value = "";
      await start(user);
    } catch (err) {
      token = null;
      showLogin(err.status === 401 ? "Invalid token." : err.message);
    } finally { btn.disabled = false; btn.textContent = "Sign in"; }
  });

  $("#logout").addEventListener("click", () => {
    if (dirty.size && !confirm("You have unpublished changes. Sign out anyway?")) return;
    localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
    dirty.clear(); token = null; state = null;
    showLogin();
  });

  async function start(user) {
    $("#login").hidden = true;
    $("#who").textContent = "@" + user.login;
    const [site, posts] = await Promise.all([getFile(FILES.site), getFile(FILES.posts).catch((e) => {
      if (e.status === 404) return { text: "[]", sha: null }; throw e;
    })]);
    shas.site = site.sha; shas.posts = posts.sha;
    state = { site: JSON.parse(site.text), posts: JSON.parse(posts.text) };
    view = { kind: "page", id: state.site.pages[0]?.id };
    $("#dash").hidden = false;
    render();
  }

  // ---------- Change tracking & publish ----------
  function touch(file) {
    dirty.add(file);
    updateStatus();
    schedulePreview();
  }
  function updateStatus() {
    const s = $("#status");
    s.textContent = dirty.size ? "Unpublished changes" : "All changes published";
    s.classList.toggle("dirty", dirty.size > 0);
    $("#publish").disabled = dirty.size === 0;
  }
  window.addEventListener("beforeunload", (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ""; } });

  $("#publish").addEventListener("click", async () => {
    const problem = validate();
    if (problem) return toast(problem, true);
    const btn = $("#publish"); btn.disabled = true; btn.textContent = "Publishing…";
    try {
      for (const key of [...dirty]) {
        // Keys starting with "_" are editor-only state.
        const json = JSON.stringify(key === "site" ? state.site : state.posts,
          (k, v) => (k.startsWith("_") ? undefined : v), 2) + "\n";
        try {
          shas[key] = await putFile(FILES[key], b64encode(json), shas[key], `Update ${FILES[key]} from dashboard`);
        } catch (e) {
          if (e.status !== 409 && e.status !== 422) throw e;
          // File changed on GitHub since we loaded it; overwrite with ours.
          if (!confirm(`${FILES[key]} was changed elsewhere since you opened the dashboard. Overwrite it with your version?`)) throw e;
          shas[key] = await putFile(FILES[key], b64encode(json), await getSha(FILES[key]), `Update ${FILES[key]} from dashboard`);
        }
        dirty.delete(key);
      }
      toast("Published. The live site updates in about a minute.");
    } catch (e) {
      toast("Publish failed: " + e.message, true);
    } finally {
      btn.textContent = "Publish"; updateStatus();
    }
  });

  function validate() {
    const ids = state.site.pages.map((p) => p.id);
    if (ids.some((id) => !id || id === "post")) return "Every page needs a URL id (and it can't be \"post\").";
    if (new Set(ids).size !== ids.length) return "Two pages share the same URL id.";
    const slugs = state.posts.map((p) => p.slug);
    if (state.posts.some((p) => !p.draft && (!p.slug || !p.title))) return "Published stories need a title and a URL slug.";
    if (new Set(slugs.filter(Boolean)).size !== slugs.filter(Boolean).length) return "Two stories share the same URL slug.";
    return null;
  }

  function toast(msg, error) {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast" + (error ? " error" : ""); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), error ? 7000 : 3500);
  }

  // ---------- DOM helpers ----------
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  // Two-way bound input. `file` is which JSON file the object belongs to.
  function field(label, obj, key, file, o = {}) {
    const type = o.type || "text";
    let input;
    if (type === "checkbox") {
      input = h("input", { type: "checkbox" });
      input.checked = !!obj[key];
      input.addEventListener("change", () => { obj[key] = input.checked; touch(file); o.onChange?.(); });
      return h("label", { class: "check" }, input, label);
    }
    if (type === "textarea") input = h("textarea", { rows: o.rows || 3, class: o.mono ? "mono" : null, placeholder: o.placeholder });
    else input = h("input", { type, placeholder: o.placeholder });
    input.value = obj[key] ?? "";
    input.addEventListener("input", () => {
      obj[key] = type === "number" ? Number(input.value) : input.value;
      touch(file); o.onChange?.(input.value);
    });
    return h("label", { class: "fld" }, h("span", {}, label, o.hint ? h("span", { class: "hint" }, " · " + o.hint) : null), input);
  }
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8);
  const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  // ---------- Rendering ----------
  function render() {
    renderSide();
    const ed = $("#editor");
    ed.innerHTML = "";
    const inner = h("div", { class: "editor-inner" });
    ed.append(inner);
    if (view.kind === "page") pageEditor(inner);
    else if (view.kind === "posts") postsList(inner);
    else if (view.kind === "post") postEditor(inner);
    else if (view.kind === "settings") settingsEditor(inner);
    else if (view.kind === "files") filesView(inner);
    updateStatus();
    schedulePreview();
    $(".side").classList.remove("open");
  }
  function go(v) { view = v; render(); $("#editor").scrollTop = 0; }

  function renderSide() {
    const nav = $("#side-nav");
    nav.innerHTML = "";
    const link = (text, v, active, extra) => h("a", { href: "#", class: active ? "active" : null,
      onclick: (e) => { e.preventDefault(); go(v); } }, text, extra || null);
    nav.append(h("h4", {}, "Pages"));
    state.site.pages.forEach((p) => nav.append(link(p.title || "(untitled)", { kind: "page", id: p.id },
      view.kind === "page" && view.id === p.id, p.nav === false ? h("span", { class: "badge" }, "hidden") : null)));
    nav.append(h("button", { class: "link add", onclick: addPage }, "+ New page"));
    nav.append(h("h4", {}, "Content"));
    nav.append(link("Stories", { kind: "posts" }, view.kind === "posts" || view.kind === "post",
      h("span", { class: "badge" }, String(state.posts.length))));
    nav.append(link("Files & images", { kind: "files" }, view.kind === "files"));
    nav.append(h("h4", {}, "Site"));
    nav.append(link("Profile & settings", { kind: "settings" }, view.kind === "settings"));
  }

  function addPage() {
    const title = prompt("Page title");
    if (!title) return;
    let id = slugify(title) || uid("page");
    while (id === "post" || state.site.pages.some((p) => p.id === id)) id += "-2";
    state.site.pages.push({ id, title, subtitle: "", nav: true, sections: [] });
    touch("site");
    go({ kind: "page", id });
  }

  // ----- Page editor -----
  function pageEditor(root) {
    const pages = state.site.pages;
    const idx = pages.findIndex((p) => p.id === view.id);
    const page = pages[idx];
    if (!page) { root.append(h("p", { class: "empty" }, "Select a page.")); return; }

    root.append(h("div", { class: "ed-head" },
      h("h2", {}, page.title || "(untitled)"),
      h("button", { class: "btn small", onclick: togglePreview }, previewOn ? "Hide preview" : "Preview"),
      h("a", { class: "btn small", href: "../#/" + page.id, target: "_blank", rel: "noopener" }, "Open ↗"),
      h("button", { class: "icon-btn", title: "Move page up in menu", onclick: () => { if (move(pages, idx, -1)) { touch("site"); render(); } } }, "↑"),
      h("button", { class: "icon-btn", title: "Move page down in menu", onclick: () => { if (move(pages, idx, 1)) { touch("site"); render(); } } }, "↓"),
      h("button", { class: "btn small danger", onclick: () => {
        if (pages.length <= 1) return toast("A site needs at least one page.", true);
        if (!confirm(`Delete page "${page.title}" and all its sections?`)) return;
        pages.splice(idx, 1); touch("site"); go({ kind: "page", id: pages[0].id });
      } }, "Delete page")));

    root.append(h("div", { class: "panel" },
      h("h3", {}, "Page"),
      h("div", { class: "row" },
        field("Title", page, "title", "site", { onChange: renderSide }),
        field("URL id", page, "id", "site", { hint: "#/" + page.id, onChange: (v) => {
          page.id = slugify(v); view.id = page.id; renderSide();
        } })),
      field("Subtitle", page, "subtitle", "site"),
      field("Show in top menu", page, "nav", "site", { type: "checkbox", onChange: renderSide }),
      idx === 0 ? h("p", { class: "muted small" }, "This is the home page (first in the menu).") : null));

    page.sections ||= [];
    page.sections.forEach((s, i) => root.append(sectionCard(page, s, i)));

    const sel = h("select", {}, Object.entries(SECTION_TYPES).map(([k, t]) => h("option", { value: k }, t.label)));
    root.append(h("div", { class: "add-sec" },
      h("strong", {}, "Add section"), sel,
      h("button", { class: "btn primary", onclick: () => {
        const s = { id: uid("s"), type: sel.value, title: sel.value === "profile" ? "" : "New section", ...SECTION_TYPES[sel.value].make() };
        page.sections.push(s); open.add(s.id); touch("site"); render();
        $("#editor").scrollTop = $("#editor").scrollHeight;
      } }, "Add")));
  }

  function sectionCard(page, s, i) {
    const list = page.sections;
    const isOpen = open.has(s.id);
    const ttl = h("span", { class: "ttl" }, s.title || (s.type === "profile" ? "Profile header" : "(no heading)"));
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const head = h("div", { class: "sec-head", onclick: () => { isOpen ? open.delete(s.id) : open.add(s.id); render(); } },
      h("span", { class: "caret" }, isOpen ? "▾" : "▸"), ttl,
      h("span", { class: "type" }, s.type),
      h("button", { class: "icon-btn", title: "Move up", onclick: stop(() => { if (move(list, i, -1)) { touch("site"); render(); } }) }, "↑"),
      h("button", { class: "icon-btn", title: "Move down", onclick: stop(() => { if (move(list, i, 1)) { touch("site"); render(); } }) }, "↓"),
      h("button", { class: "icon-btn", title: "Duplicate", onclick: stop(() => {
        const c = JSON.parse(JSON.stringify(s)); c.id = uid("s"); list.splice(i + 1, 0, c); touch("site"); render();
      }) }, "⧉"),
      h("button", { class: "icon-btn danger", title: "Delete section", onclick: stop(() => {
        if (!confirm(`Delete section "${s.title || s.type}"?`)) return;
        list.splice(i, 1); touch("site"); render();
      }) }, "✕"));
    const card = h("div", { class: "sec" }, head);
    if (!isOpen) return card;

    const body = h("div", { class: "sec-body" });
    if (s.type !== "profile") body.append(field("Heading", s, "title", "site", { onChange: (v) => (ttl.textContent = v || "(no heading)") }));
    if (s.type === "profile") body.append(h("p", { class: "muted small" }, "Shows your photo, name, role and links (edit them in Profile & settings) above this text."));
    if (s.type === "text" || s.type === "profile") body.append(field("Body", s, "body", "site", { type: "textarea", rows: 8, mono: true, hint: "Markdown" }));
    if (s.type === "tags") body.append(field("Tags", s, "tags", "site", { hint: "comma separated" }));
    if (s.type === "posts") body.append(field("How many stories to show", s, "count", "site", { type: "number", hint: "0 = all" }));
    if (ITEM_FIELDS[s.type]) body.append(itemsEditor(s));
    card.append(body);
    return card;
  }

  function itemsEditor(s) {
    s.items ||= [];
    const wrap = h("div");
    const draw = () => {
      wrap.innerHTML = "";
      const items = h("div", { class: "items" });
      s.items.forEach((it, i) => {
        const fields = ITEM_FIELDS[s.type].map(([k, label, type]) => field(label, it, k, "site", { type, rows: 2 }));
        items.append(h("div", { class: "item" },
          h("div", { class: "item-tools" },
            h("span", { class: "n" }, "#" + (i + 1)),
            h("button", { class: "icon-btn", title: "Move up", onclick: () => { if (move(s.items, i, -1)) { touch("site"); draw(); } } }, "↑"),
            h("button", { class: "icon-btn", title: "Move down", onclick: () => { if (move(s.items, i, 1)) { touch("site"); draw(); } } }, "↓"),
            h("button", { class: "icon-btn danger", title: "Remove", onclick: () => { s.items.splice(i, 1); touch("site"); draw(); } }, "✕")),
          s.type === "cards" || s.type === "publications" ? fields : h("div", { class: "row" }, fields)));
      });
      wrap.append(items,
        h("button", { class: "btn small", onclick: () => {
          s.items.unshift(Object.fromEntries(ITEM_FIELDS[s.type].map(([k]) => [k, ""]))); touch("site"); draw();
        } }, "+ Add to top"), " ",
        h("button", { class: "btn small", onclick: () => {
          s.items.push(Object.fromEntries(ITEM_FIELDS[s.type].map(([k]) => [k, ""]))); touch("site"); draw();
        } }, "+ Add to bottom"));
    };
    draw();
    return wrap;
  }

  // ----- Stories -----
  function postsList(root) {
    root.append(h("div", { class: "ed-head" }, h("h2", {}, "Stories"),
      h("button", { class: "btn primary", onclick: () => {
        const p = { slug: "", title: "", date: new Date().toISOString().slice(0, 10), summary: "", draft: true, body: "" };
        state.posts.unshift(p); touch("posts"); go({ kind: "post", post: p });
      } }, "+ New story")));
    const posts = [...state.posts].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!posts.length) { root.append(h("div", { class: "panel empty" }, "No stories yet.")); return; }
    root.append(h("div", { class: "panel" }, h("table", { class: "table" },
      h("tr", {}, h("th", {}, "Title"), h("th", {}, "Date"), h("th", {}, "Status")),
      posts.map((p) => h("tr", {},
        h("td", {}, h("a", { href: "#", onclick: (e) => { e.preventDefault(); go({ kind: "post", post: p }); } }, p.title || "(untitled)")),
        h("td", { class: "muted" }, p.date),
        h("td", {}, h("span", { class: "pill" + (p.draft ? " draft" : "") }, p.draft ? "Draft" : "Published")))))));
    root.append(h("p", { class: "muted small" }, "Drafts are hidden on the site, but the repository is public, so draft text can still be read in data/posts.json."));
  }

  function postEditor(root) {
    const p = view.post;
    if (!state.posts.includes(p)) return go({ kind: "posts" });
    const prev = h("div", { class: "md-preview prose" });
    const refresh = () => (prev.innerHTML = SiteRender.md(p.body || "*Nothing yet.*"));
    root.append(h("div", { class: "ed-head" },
      h("button", { class: "btn small ghost", onclick: () => go({ kind: "posts" }) }, "← Stories"),
      h("h2", {}, p.title || "New story"),
      p.slug && !p.draft ? h("a", { class: "btn small", href: "../#/post/" + p.slug, target: "_blank", rel: "noopener" }, "Open ↗") : null,
      h("button", { class: "btn small danger", onclick: () => {
        if (!confirm("Delete this story? Its comments stay in GitHub Discussions.")) return;
        state.posts.splice(state.posts.indexOf(p), 1); touch("posts"); go({ kind: "posts" });
      } }, "Delete")));
    const slugField = field("URL slug", p, "slug", "posts", { hint: "used for the link and comment thread; avoid changing after publishing",
      onChange: (v) => { p.slug = slugify(v); } });
    root.append(h("div", { class: "panel" },
      field("Title", p, "title", "posts", { onChange: (v) => {
        if (!p._slugTouched && p.draft) { p.slug = slugify(v); slugField.querySelector("input").value = p.slug; }
        root.querySelector("h2").textContent = v || "New story";
      } }),
      h("div", { class: "row" }, slugField, field("Date", p, "date", "posts", { type: "date" })),
      field("Summary", p, "summary", "posts", { hint: "shown in the stories list" }),
      field("Draft (hidden from the site)", p, "draft", "posts", { type: "checkbox" })));
    slugField.querySelector("input").addEventListener("input", () => (p._slugTouched = true));
    root.append(h("div", { class: "panel" }, h("h3", {}, "Story"),
      h("div", { class: "split" },
        field("Body", p, "body", "posts", { type: "textarea", rows: 22, mono: true, hint: "Markdown. Upload images under Files & images.", onChange: refresh }),
        h("div", { class: "fld" }, h("span", {}, "Preview"), prev))));
    refresh();
  }

  // ----- Settings -----
  function settingsEditor(root) {
    const site = state.site.site, prof = state.site.profile;
    prof.links ||= []; site.giscus ||= {};
    root.append(h("div", { class: "ed-head" }, h("h2", {}, "Profile & settings")));
    root.append(h("div", { class: "panel" }, h("h3", {}, "Profile"),
      field("Name", prof, "name", "site"),
      field("Role", prof, "role", "site", { type: "textarea", rows: 2, hint: "new line = line break" }),
      field("Photo path", prof, "photo", "site", { hint: "e.g. assets/images/profile.jpg" }),
      h("span", { class: "fld" }, h("span", {}, "Links")),
      linksEditor(prof.links)));
    root.append(h("div", { class: "panel" }, h("h3", {}, "Site"),
      field("Site name (top-left)", site, "name", "site"),
      field("Description", site, "description", "site", { type: "textarea", rows: 2 }),
      field("Footer", site, "footer", "site")));
    root.append(h("div", { class: "panel" }, h("h3", {}, "Comments (giscus · GitHub Discussions)"),
      h("p", { class: "muted small", html:
        "Visitors sign in with GitHub to comment. Setup: 1) enable <b>Discussions</b> in the repo settings, " +
        "2) install the <a href='https://github.com/apps/giscus' target='_blank' rel='noopener'>giscus app</a> on this repo, " +
        "3) open <a href='https://giscus.app' target='_blank' rel='noopener'>giscus.app</a>, enter the repo, pick a category, and copy " +
        "<code>data-repo-id</code> and <code>data-category-id</code> here." }),
      h("div", { class: "row" }, field("Repository", site.giscus, "repo", "site"), field("Repo ID", site.giscus, "repoId", "site")),
      h("div", { class: "row" }, field("Category", site.giscus, "category", "site"), field("Category ID", site.giscus, "categoryId", "site"))));
  }

  function linksEditor(links) {
    const wrap = h("div");
    const draw = () => {
      wrap.innerHTML = "";
      links.forEach((l, i) => wrap.append(h("div", { class: "item" },
        h("div", { class: "item-tools" }, h("span", { class: "n" }, "#" + (i + 1)),
          h("button", { class: "icon-btn", onclick: () => { if (move(links, i, -1)) { touch("site"); draw(); } } }, "↑"),
          h("button", { class: "icon-btn", onclick: () => { if (move(links, i, 1)) { touch("site"); draw(); } } }, "↓"),
          h("button", { class: "icon-btn danger", onclick: () => { links.splice(i, 1); touch("site"); draw(); } }, "✕")),
        h("div", { class: "row" }, field("Label", l, "label", "site"), field("URL", l, "url", "site")))));
      wrap.append(h("button", { class: "btn small", style: "margin-top:8px", onclick: () => { links.push({ label: "", url: "" }); touch("site"); draw(); } }, "+ Add link"));
    };
    draw();
    return wrap;
  }

  // ----- Files -----
  function filesView(root) {
    root.append(h("div", { class: "ed-head" }, h("h2", {}, "Files & images")));
    const input = h("input", { type: "file" });
    const target = h("select", {},
      h("option", { value: "uploads" }, "General upload (assets/uploads/…)"),
      h("option", { value: "photo" }, "Profile photo (assets/images/profile.jpg)"),
      h("option", { value: "cv" }, "CV (assets/docs/cv.pdf)"));
    const out = h("div");
    const btn = h("button", { class: "btn primary", onclick: async () => {
      const file = input.files[0];
      if (!file) return toast("Choose a file first.", true);
      if (file.size > 20 * 1024 * 1024) return toast("Keep files under 20 MB.", true);
      const path = target.value === "photo" ? "assets/images/profile.jpg"
        : target.value === "cv" ? "assets/docs/cv.pdf"
        : "assets/uploads/" + Date.now().toString(36) + "-" + file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      btn.disabled = true; btn.textContent = "Uploading…";
      try {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file);
        });
        await putFile(path, b64, await getSha(path), `Upload ${path} from dashboard`);
        const isImg = file.type.startsWith("image/");
        out.prepend(h("div", { class: "item", style: "padding-bottom:10px;margin-bottom:8px" },
          h("div", {}, h("strong", {}, "Uploaded: "), h("code", {}, path)),
          h("div", { class: "muted small" }, "Use in markdown: ", h("code", {}, isImg ? `![${file.name}](${path})` : `[${file.name}](${path})`))));
        toast("Uploaded. It will be live in about a minute.");
        loadList();
      } catch (e) { toast("Upload failed: " + e.message, true); }
      finally { btn.disabled = false; btn.textContent = "Upload"; }
    } }, "Upload");
    root.append(h("div", { class: "panel" }, h("h3", {}, "Upload"),
      h("div", { class: "fld" }, h("span", {}, "File"), input),
      h("div", { class: "fld" }, h("span", {}, "Save as"), target),
      btn, h("p", { class: "muted small" }, "Uploads are committed directly. Everything in the repository is public."), out));

    const listBox = h("div", { class: "panel" }, h("h3", {}, "Uploaded files"), h("p", { class: "muted" }, "Loading…"));
    root.append(listBox);
    async function loadList() {
      let files = [];
      try { files = await gh(contentsPath("assets/uploads") + "?ref=" + BRANCH); }
      catch (e) { if (e.status !== 404) { listBox.lastChild.textContent = e.message; return; } }
      listBox.lastChild.replaceWith(files.length
        ? h("table", { class: "table" }, files.map((f) => h("tr", {},
            h("td", {}, h("a", { href: "../" + f.path, target: "_blank", rel: "noopener" }, f.name)),
            h("td", {}, h("button", { class: "btn small", onclick: () => {
              navigator.clipboard?.writeText(f.path); toast("Copied " + f.path);
            } }, "Copy path")))))
        : h("p", { class: "muted" }, "No uploads yet."));
    }
    loadList();
  }

  // ---------- Preview ----------
  function togglePreview() { previewOn = !previewOn; render(); }
  $("#close-preview").addEventListener("click", () => { previewOn = false; render(); });
  let pvTimer, siteCss = null;
  function schedulePreview() {
    const show = previewOn && view.kind === "page";
    $("#preview-pane").hidden = !show;
    if (!show) return;
    clearTimeout(pvTimer);
    if (siteCss === null) {
      siteCss = "";
      fetch("../css/style.css").then((r) => r.text()).then((t) => { siteCss = t; schedulePreview(); });
      return;
    }
    pvTimer = setTimeout(() => {
      const page = state.site.pages.find((p) => p.id === view.id);
      if (!page) return;
      const html = SiteRender.renderPage(page, { ...state.site, posts: state.posts });
      const iframe = $("#preview");
      const y = iframe.contentWindow?.scrollY || 0;
      iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${new URL("../", location.href)}">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" rel="stylesheet">
        <style>${siteCss}</style></head><body><main>${html}</main></body></html>`;
      iframe.onload = () => iframe.contentWindow.scrollTo(0, y);
    }, 250);
  }

  $("#menu-btn").addEventListener("click", () => $(".side").classList.toggle("open"));

  // ---------- Boot ----------
  const saved = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  if (saved) {
    verify(saved).then(start).catch((e) => {
      localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
      showLogin(e.status === 401 ? "Your saved token expired. Sign in again." : e.message);
    });
  } else showLogin();
})();
