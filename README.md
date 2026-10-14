# Personal academic website

Static multi-page site (HTML, CSS, JS). No build step.

## Structure
```
index.html              About + News (must stay at the root)
pages/
  research.html         Research projects
  publications.html     Publications
  learning.html         Continual learning & refreshing
  training.html         Training, teaching, talks
  others.html           Awards, reviewing, community
  contact.html          Contact
css/
  style.css             shared styling and colors
js/
  script.js             mobile menu toggle
assets/
  images/profile.jpg    your photo (square, ~400x400)
  docs/cv.pdf           your CV
```

## Deploy on GitHub Pages
1. Create a public repo named `<your-username>.github.io`.
2. Upload the contents of this folder so `index.html` is at the repo root.
3. Settings > Pages > Source: `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Open `https://<your-username>.github.io`.

## Editing
- Replace every `[ ... ]` placeholder and `#` link.
- The top menu is plain HTML at the top of each page. Links from `index.html` point to `pages/...`; links inside `pages/` point to siblings directly and to `../index.html`.
- To add a page: copy a file in `pages/`, edit it, and add its link to the `<nav>` block in every page.
- Colors: `--bar` (menu bar) and `--accent` in `css/style.css`.
