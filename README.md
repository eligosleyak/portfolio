# acharyashashank.com.np

Personal site of Shashank Acharya. Plain static HTML, CSS and JS, with no framework and no build step. Served by GitHub Pages (see `CNAME`).

## Structure

```
index.html            the whole site (Work, About, Playground, Email)
404.html              not-found page
about.html, resume.html, portfolio.html, services.html, contact.html
                      redirects from the old site's URLs to the matching section
assets/css/site.css   design tokens (light + dark) and all styles
assets/js/site.js     theme toggle, Kathmandu clock, scroll reveals, playground
assets/img/           portrait.jpg, og.jpg (social preview), favicon.svg, project shots
assets/files/         CV PDF
```

## Editing

- Copy lives in `index.html`. Each section is marked with a comment.
- Colours and fonts are CSS variables at the top of `site.css`.
- To add a project, copy one `<li>` inside `<ol class="projects">` and renumber.
- To replace the CV, overwrite `assets/files/CV-Shashank Acharya.pdf` (keep the name, or update both links in `index.html`).

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```
