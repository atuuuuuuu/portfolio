# Portfolio: Usukhbayar Idertsog

A one-page portfolio in plain HTML, CSS and JavaScript. No build step, no trackers. The only third-party code
is [Lenis](https://github.com/darkroomengineering/lenis) 1.3.27 for smooth scrolling, saved in `vendor/` (MIT).

## 3D world (`world/`)

A second page at `world/` (https://atuuuuuuu.github.io/portfolio/world/), shown here as the project "Aero World" in Selected work.
It is a Frutiger Aero / Windows 7 style 3D world you walk around in as Aero, a little glossy robot, with four
glass plazas (About me, Projects, Experience, Contact) that open Windows 7 windows. It has its own
`index.html`, `styles.css`, `world.js` and `vendor/` (three.js r170, MIT), and shares `assets/` with this page.
First visit shows a short how-to-play; the ? button shows it again. `world/?text` is its text version.
Test: `node test/world.mjs` (with the server running).

## Run it

```bash
cd ~/Desktop/Portfolio
python3 -m http.server 4321
```

Then open http://localhost:4321. (Opening `index.html` directly mostly works too, but the scripts are modules and
some browsers block modules on `file://`.)

## Files

| File | What it is |
|---|---|
| `index.html` | All the words. Edit text here. |
| `styles.css` | Colours, type, layout, phone and print versions. The colours are the variables at the top. |
| `effects.js` | All the motion: the flow field behind your name (it swirls around the cursor), the custom cursor, letters rising in, scroll reveals, the ticker that speeds up when you scroll, buttons that lean towards the cursor, smooth scrolling, the scroll progress line and Copy email. |
| `vendor/` | Lenis (smooth scrolling) and its licence. If it's missing the page falls back to normal scrolling. |
| `assets/` | Project screenshots (WebP, full size plus `-800` versions for phones), favicon, `apple-touch-icon.png`, `og.jpg` (the picture shown when the link is shared). |
| `404.html` | Page-not-found page. Self-contained (inline styles, absolute links), because GitHub Pages serves it at any missing path. |
| `.originals/` | The images before compression. Not needed on the site. |
| `test/` | `node test/browser.mjs` (with the server running) drives headless Chrome: the flow field, smooth scrolling, contact links, no sideways scrolling, reduced motion, screenshots. |

## Before it goes live

- [x] Address set to `https://atuuuuuuu.github.io/portfolio/` (canonical, og:url, og:image, JSON-LD, and the links in `404.html`).
      Name the GitHub repo `portfolio` so it matches. If you move to your own domain, search and replace it.
- [ ] Your email `idertsogusukhbayar@gmail.com` is in the hero, Contact, the footer and the JSON-LD. If you make an
      address on your new domain, search and replace it.
- [x] College name: "New Mongol College of Technology" everywhere, matching your GitHub profile.
- [ ] Add anything an admissions reader should see that I didn't know: awards or results from NASA Space Apps,
      grades or exams, languages you speak, a CV as PDF.

## Put it on your domain

Any static host works. Two free options:

- **GitHub Pages**: make a repo (e.g. `portfolio`), push these files, Settings → Pages → deploy from `main`.
  Then Settings → Pages → Custom domain, and at your domain registrar add the DNS records GitHub shows you.
- **Cloudflare Pages** or **Netlify**: drag this folder into their dashboard, then add your domain there.

Keep the whole folder together: the page loads `styles.css`, `effects.js`, `vendor/` and `assets/` by
relative path.

## Design notes

- Two inks: ultramarine `#1638C9` for everything, pink `#E0115F` only for what you're touching (selected slice,
  focus ring, link hover). Dark mode swaps the paper to night blue.
- One typeface, Archivo, using its width axis: names and titles at 125% width, body text at normal width.
- Motion: everything eases out slowly (`--ease-out`). People whose system asks for reduced motion get a still
  page: a frozen picture of the flow field, no cursor effects, no smooth scrolling, everything visible at once.
- `Cmd+P` prints a clean one-colour CV version without the hero toy or screenshots.
