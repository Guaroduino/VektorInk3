# VektorInk3 — PixiJS 8 + Vite + TypeScript

Este proyecto arranca una app web mínima basada en PixiJS v8 usando Vite y TypeScript.

## Requisitos
- Node.js 18 o superior

## Scripts
- `npm run dev` — Inicia el servidor de desarrollo
- `npm run build` — Genera build de producción
- `npm run preview` — Sirve el build para prueba local

## Estructura
- `index.html` — Entrada HTML
- `src/main.ts` — Código de arranque de Pixi
- `vite.config.ts` — Configuración Vite
- `tsconfig.json` — Configuración TypeScript
- `docs/` — Documentación y notas

## Notas
El canvas de Pixi se monta dentro de `#app` y adapta su tamaño a la ventana. Edita `src/main.ts` para empezar.
