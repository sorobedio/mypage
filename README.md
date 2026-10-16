# Personal academic website

Static site for GitHub Pages. No build step. All content lives in two JSON files
and is edited from a private dashboard at `/admin/`.

## Structure
```
index.html            site shell; pages render from data/ (routes: #/<page>, #/post/<slug>)
data/site.json        profile, settings, pages and their sections
data/posts.json       stories
admin/                dashboard (index.html, admin.js, admin.css)
js/render.js          section/page renderers, shared by site and dashboard preview
js/script.js          router, menu, comments
css/style.css         site styling (light + dark)
assets/               images, CV, uploads (assets/uploads/)
pages/*.html          redirects from the old multi-page URLs
```

## Dashboard
Open `https://sorobedio.github.io/admin/` and sign in with a fine-grained GitHub token:
GitHub → Settings → Developer settings → Fine-grained tokens → New token,
repository access **only `sorobedio.github.io`**, permission **Contents: Read and write**.

The dashboard only opens for the `sorobedio` account with write access, and GitHub
rejects writes from anyone else. The `/admin/` URL itself is public (GitHub Pages can't
hide files), is not linked anywhere, and is excluded from search engines.

From the dashboard you can edit any section, add, reorder, duplicate or delete sections
and pages, write stories (markdown with live preview), edit profile links, and upload
images, a CV or other files. **Publish** commits the changes; the live site updates in about a minute.

Section types: text (markdown), dated list, cards, publications, tags, stories list, profile header.

## Comments (giscus)
Story comments use GitHub Discussions, so commenters must sign in with GitHub.
One-time setup:
1. Repo Settings → General → Features → enable **Discussions**.
2. Install the giscus app on this repo: https://github.com/apps/giscus
3. On https://giscus.app enter `sorobedio/sorobedio.github.io`, choose the **Announcements**
   category, and copy `data-category-id`.
4. Dashboard → Profile & settings → Comments → paste the Category ID → Publish.

## Local preview
`python3 -m http.server` in this folder, then open http://localhost:8000.
