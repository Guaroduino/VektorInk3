# VektorInk3 — PixiJS 8 + Vite + TypeScript

Este proyecto arranca una app web mínima basada en PixiJS v8 usando Vite y TypeScript.

## Requisitos
- Node.js 18 o superior

## Scripts
- `npm run dev` — Inicia el servidor de desarrollo
- `npm run build` — Genera build de producción
- `npm run preview` — Sirve el build para prueba local

## Estructura
- `index.html` — Entrada HTML de desarrollo
- `src/main.tsx` — Arranque de la app (React + Pixi)
- `vite.config.ts` — Configuración Vite
- `tsconfig.json` — Configuración TypeScript
- `.github/workflows/pages.yml` — Despliegue automático a GitHub Pages

## Notas
El canvas de Pixi se monta dentro de `#app` y adapta su tamaño a la ventana. Edita `src/main.ts` para empezar.

## Despliegue en GitHub Pages (GitHub Actions)

- En GitHub: Settings → Pages → Build and deployment → Source = "GitHub Actions".
- Al hacer push a `main`, el workflow `.github/workflows/pages.yml` construye con Vite y despliega el artefacto de `dist/` a Pages.

Notas:
- El `base` de Vite está configurado a `/VektorInk3/`, correcto para `https://<usuario>.github.io/VektorInk3/`.
- `public/404.html` maneja recargas y rutas de SPA.
- La carpeta `docs/` ya no se usa para despliegue (legado). Si existe, puede eliminarse sin afectar el flujo con Actions.
