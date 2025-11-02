# VektorInk3 — PixiJS 8 + Vite + TypeScript

Este proyecto arranca una app web mínima basada en PixiJS v8 usando Vite y TypeScript.

## Requisitos
- Node.js 18 o superior

## Scripts
- `npm run dev` — Inicia el servidor de desarrollo
- `npm run build` — Genera build de producción
- `npm run preview` — Sirve el build para prueba local
- `npm run build:pages` — Genera el build dentro de `docs/` sin borrar el contenido existente (útil para GitHub Pages con "Deploy from a branch")

## Estructura
- `index.html` — Entrada HTML
- `src/main.ts` — Código de arranque de Pixi
- `vite.config.ts` — Configuración Vite
- `tsconfig.json` — Configuración TypeScript
- `docs/` — Documentación y notas

## Notas
El canvas de Pixi se monta dentro de `#app` y adapta su tamaño a la ventana. Edita `src/main.ts` para empezar.

## Despliegue en GitHub Pages

Tienes dos opciones. Recomendado: GitHub Actions (ya incluido). Alternativa: desplegar desde la rama `main` usando la carpeta `docs/`.

1) Vía GitHub Actions (recomendado)
- En GitHub: Settings > Pages > Build and deployment > Source = GitHub Actions.
- Haz push a `main`. El workflow `.github/workflows/deploy.yml` construye y publica automáticamente.

2) Vía "Deploy from a branch" (main -> /docs)
- En GitHub: Settings > Pages > Build and deployment > Source = Deploy from a branch.
- Branch = `main`; Folder = `/docs`.
- Localmente, genera el build en `docs/`:
	- `npm run build:pages`
- Haz commit y push de los cambios en `docs/`.

Notas:
- El `base` de Vite está configurado a `/VektorInk3/`, correcto para un proyecto servido en `https://<usuario>.github.io/VektorInk3/`.
- Incluimos `public/404.html` para redirigir rutas desconocidas a la raíz y evitar 404 en recargas.
