# Notas rápidas de PixiJS 8

Estas notas sirven como referencia breve para trabajar con PixiJS v8 en este proyecto.

## Arranque básico (v8)
- `Application` ahora se inicializa de forma asíncrona con `await app.init(opts)`.
- Adjunta el canvas con `document.body.appendChild(app.canvas)` o en un nodo del DOM propio.
- Importación única: `import { Application, Graphics, Assets, Sprite } from 'pixi.js'`.

Ejemplo mínimo:

```ts
import { Application, Graphics } from 'pixi.js';

(async () => {
  const app = new Application();
  await app.init({ background: '#0e1116', resizeTo: window });
  document.getElementById('app')?.appendChild(app.canvas);

  const g = new Graphics().roundRect(64, 64, 200, 120, 16).fill(0xff3b30);
  app.stage.addChild(g);
})();
```

## Gotcha con Vite (await)
- Con Vite <= 6.0.6, evita `top-level await` en producción: envuelve el código en una función `async`.

## Carga de assets
- `Assets.load(url | { alias, src })` devuelve el recurso cargado y lo cachea.
- Para fuentes comprimidas (DDS/KTX/KTX2/Basis) importa los loaders: `pixi.js/dds`, `pixi.js/ktx2`, etc., antes de cargar.

## Ecosistema útil
- DevTools: https://pixijs.io/devtools/
- Filtros: https://pixijs.io/filters/docs/
- Sonido: https://github.com/pixijs/sound
- UI: https://github.com/pixijs/ui
- Layout (flex): https://layout.pixijs.io/
- AssetPack (manifiestos): https://pixijs.io/assetpack/

## Rendimiento
- Batching: agrupa sprites por textura cuando sea posible.
- Culling: `cullable = true` o usa `CullerPlugin`.
- Evita reconstruir `Graphics` cada frame; reutiliza `GraphicsContext`.
- Considera `cacheAsTexture()` para grupos estáticos.

## Migración a v8 (resumen)
- Paquete único `pixi.js` (adiós `@pixi/*`).
- Inicialización async (`await app.init(...)`).
- API de `Graphics` modernizada (p.ej., `.rect().fill()`).

## Accesibilidad (opt‑in)
- `import 'pixi.js/accessibility'` y marca objetos como `accessible = true`.

## Documentación completa
- Archivo local: `docs/pixi-llms-full.txt` (extracto en caché)
- Fuente oficial (siempre actualizada): https://pixijs.com/llms-full.txt
