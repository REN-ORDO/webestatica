# CLAUDE.md

responder siempre en español

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KagsBeer** is a static website for a Colombian beer distribution business. It's built with vanilla HTML and CSS, deployed to Azure Static Web Apps via GitHub Actions.

- **Type**: Static website (no build step required)
- **Deployment**: Azure Static Web Apps (auto-deploys on main branch push)
- **Hosting**: `app-kind-hill-08210b910.azurestaticapps.net`

## Running Locally

Open `index.html` in a browser. No dev server or build tools needed.

To preview changes with a simple HTTP server:
```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server
```

Browse to `http://localhost:8000` (or the port shown).

## Project Structure

```
.
├── index.html              # Main HTML file (single page)
├── estilos.css            # Stylesheet
├── imagenes/              # Product and banner images
│   ├── logokags.png
│   ├── kagsbeer.png (favicon)
│   ├── fondo-inicio.jpg (hero banner background)
│   ├── k.png (about section image)
│   └── [product images for beer packs]
├── agent/src/             # (Empty placeholder, not in use)
└── .github/workflows/     # Azure Static Web Apps CI/CD config
```

## Architecture Notes

- **Single HTML file**: All sections (header, about, services, footer) in one `index.html`. Inline navigation anchors (`#inicio`, `#nosotros`, `#servicios`, `#contacto`).
- **No JavaScript**: Purely HTML and CSS. The `agent/` directory is unused.
- **Spanish content**: Copy, social links, and contact info are in Spanish.
- **Responsive design**: Uses flexbox layouts; viewport meta tag set for mobile compatibility.
- **External dependency**: Font Awesome icons loaded from CDN (`kit.fontawesome.com`).

## Common Tasks

### Update Product Listings (Services Section)
Edit `index.html` lines 62–90. Each product is a `.card` div with:
- `<img>` — product image path
- `<h3>` — product name
- `<p>` — description
- `<p class="precio">` — price in COP

### Update Social Links
Links appear in two places:
1. Header nav (lines 21–30)
2. Footer (lines 113–122)

Update the `href` URLs and associated icons.

### Edit Styling
All CSS is in `estilos.css`. Key color scheme:
- Background: `#302e2e` (dark gray)
- Accent: `#e5cc2b` (golden yellow) — hover states
- Text: `#fff` (white)

### Update Contact Info
Footer has address, phone, and email (lines 97–100). Keep in sync with social media links and WhatsApp invite link (line 120).

## Deployment

Changes pushed to `main` branch auto-deploy via `.github/workflows/azure-static-web-apps-kind-hill-08210b910.yml`.

- **Trigger**: Push to `main` or PR opened/updated
- **Build**: None (output location is `.` — serves repo root directly)
- **API location**: None configured
- **Secrets**: Requires `AZURE_STATIC_WEB_APPS_API_TOKEN_KIND_HILL_08210B910` (already set)

## Image Optimization

Images are committed directly. For faster loads:
- Compress `.jpg` and `.png` files before committing (use tools like TinyPNG or ImageOptim)
- Consider WebP format for hero banner if targeting modern browsers
- Keep product pack images consistent aspect ratios for card layout

## Performance Considerations

- Font Awesome is loaded from CDN; ensure icon names (`fa-brands fa-instagram`, etc.) match the kit configuration
- Hero banner background image (`fondo-inicio.jpg`) should be compressed — it's the largest asset
- No minification or bundling; CSS is lightweight enough for direct serving
