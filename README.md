# Vincare-Pharma Supply Chain Platform (Web)

Vincare-Pharma is a **pharmaceutical supply chain platform** that connects **manufacturers, distributors, pharmacies, and healthcare providers** in a single workspace.

The goal is to streamline:

- **Product sourcing & procurement coordination**
- **Inventory availability and allocation**
- **Distribution workflows**
- **Compliance-ready traceability and auditability**

This repo contains the **Vue 3 + TypeScript** web app built with **Vuetify** and integrated with **Supabase** for authentication and data services.

---

## What the system is about

At a high level, the system provides a shared environment where multiple partner types can coordinate supply chain operations with clear access boundaries.

### Key capabilities (from configuration)

The landing page and some UI elements are **configuration-driven** via `public/data/external-page.json`.

The current configuration highlights these system capabilities:

- **Multi-Partner Access**: role-based access and secure authentication across partner orgs
- **Compliance & Auditability**: traceable actions and controlled access for regulated workflows
- **Smart Sourcing & Coordination**: procurement coordination to reduce delays and avoid stockouts
- **Inventory & Distribution Management**: coordinate inventory and distribution for reliable delivery

### Branding and UI configuration

`public/data/external-page.json` is used as a *single source of truth* for:

- App title, subtitle, description
- Theme colors (primary/secondary)
- Landing page “features” content (cards, icons)
- Navbar/footer visibility and component selection
- Auth page copy and visuals

This makes it easy to iterate content and presentation without touching Vue components for basic landing/auth layout updates.

---

## Tech stack

### Frontend

- **Vue 3** (Composition API, Single File Components)
- **TypeScript**
- **Vuetify 3** (Material Design UI components)
- **Vite** (dev server and build tooling)
- **Vue Router** (routing)
- **Pinia** (state management)

### Backend/services

- **Supabase** (Auth + database/services integration)

### Developer experience / automation in this repo

This codebase is set up to reduce boilerplate via tooling (based on the repo structure):

- **File-based page routing** under `src/pages/`
- **Layout wrappers** under `src/layouts/`
- **Auto-imports** (generated typings: `src/auto-imports.d.ts`, `src/components.d.ts`)

---

## Project structure (high-level)

```
public/
  data/
    external-page.json     # Landing + auth configuration (copy, theme, navbar/footer)

src/
  pages/                   # Auto-routed views (e.g., Auth, Home, Admin, Executive)
  components/              # Shared + feature components
  layouts/                 # Outer/inner layout wrappers
  controller/              # Controllers (data fetching + state coordination)
  stores/                  # Pinia stores
  lib/                     # Supabase client and reusable utilities
  plugins/                 # Vuetify + app plugins
```

---

## Quick start

### Prerequisites

- Node.js 18+

### Install & run

```bash
npm install
npm run dev
```

---

## Configuration guide

### Update landing page content

Edit:

- `public/data/external-page.json`

Common edits:

- Update `title`, `subtitle`, `description`
- Add/remove items under `features`
- Adjust theme under `theme.primaryColor` / `theme.secondaryColor`
- Choose navbar/footer variants via `ui.navbarComponent` and `ui.footerComponent`

### Update auth page content

In `public/data/external-page.json`, update the `authPage` section to change:

- Title/subtitle
- Quote text + supporting “motivational” copy
- Background image + overlay styling

---

## License

MIT — see [LICENSE](LICENSE).