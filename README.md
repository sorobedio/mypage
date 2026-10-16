# Personal academic website

Static site for GitHub Pages. No build step. All content lives in two JSON files.

## Structure
```
index.html            site shell; pages render from data/ (URLs: /<page>/, /post/<slug>/)
<page>/index.html     copies of index.html so each page has its own URL
404.html              copy of index.html, fallback for any other URL
data/site.json        profile, settings, pages and their sections
data/posts.json       stories
js/render.js          section/page renderers
js/script.js          router, menu, comments
css/style.css         site styling (light + dark)
assets/               images, CV, uploads (assets/uploads/)
pages/*.html          redirects from the old multi-page URLs
```

## Editing content
Edit `data/site.json` (pages and sections) and `data/posts.json` (stories), then commit and push.
Section types: `profile`, `text` (markdown `body`), `list` (`items` of `date`/`text`), `cards`
(`title`/`text`/`tags`), `publications` (`venue`/`title`/`authors`/`tldr`/`links`/`image`),
`tags`, `posts` (`count`, 0 = all). Publication `links` are one `Label | URL` per line;
concept figures live in `assets/images/pubs/`.

To add a page: add an entry to `pages` in `data/site.json` and copy `index.html` to `<id>/index.html`.
To add a story: add an entry to `data/posts.json` and copy `index.html` to `post/<slug>/index.html`.

## Comments (giscus)
Story comments use GitHub Discussions, so commenters must sign in with GitHub.
One-time setup:
1. Repo Settings → General → Features → enable **Discussions**.
2. Install the giscus app on this repo: https://github.com/apps/giscus
3. On https://giscus.app enter `sorobedio/sorobedio.github.io`, choose the **Announcements**
   category, and copy `data-category-id`.
4. Paste it into `site.giscus.categoryId` in `data/site.json`.

## Page URLs
Each menu item has its own link, e.g. https://sorobedio.github.io/research/ and stories at
https://sorobedio.github.io/post/<slug>/. If you change `index.html`, copy it over the
`<page>/index.html`, `post/*/index.html` and `404.html` copies too.

## Local preview
`python3 -m http.server` in this folder, then open http://localhost:8000.
