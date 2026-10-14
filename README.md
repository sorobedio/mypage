# Personal academic website

Static multi-page site (HTML, CSS, JS). No build step.

## Files
```
index.html         About + News
research.html      Research projects
publications.html  Publications
learning.html      Continual learning & refreshing
training.html      Training, teaching, talks
others.html        Awards, reviewing, community
contact.html       Contact
style.css          shared styling and colors
script.js          mobile menu toggle
assets/
  profile.jpg      your photo (square, ~400x400)
  cv.pdf           your CV
```

## Deploy on GitHub Pages
1. Create a repo named `<your-username>.github.io`.
2. Upload all files above, plus the `assets/` folder.
3. Settings > Pages > Source: `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Site goes live at `https://<your-username>.github.io` within a minute or two.

## Editing
- Replace every `[ ... ]` placeholder and `#` link.
- The top menu bar is plain HTML at the top of each page. To add a page, copy any `.html` file, then add its link to the `<nav>` block in every page (mark the current one with `class="active"`).
- To preview locally, unzip and open `index.html` in a browser (all files must stay in the same folder).
- Colors: change `--bar` (menu bar) and `--accent` in `style.css`.
