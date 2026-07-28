# Syntax Error — aplicación web

Este directorio contiene la aplicación jugable de [Syntax Error](../README.md), un plataformas 2D construido con KAPLAY y Vite. Consulta el README de la raíz para conocer la propuesta, mecánicas, arquitectura, uso de Kiro y evidencia de validación.

## Requisitos

- Node.js 22
- npm

## Desarrollo

```bash
npm ci
npm run dev
```

El servidor local se inicia en `http://localhost:3001`.

## Comandos

```bash
npm test          # pruebas unitarias y basadas en propiedades
npm run build     # genera dist/
npm run smoke     # valida el bundle real en Chrome mediante CDP
npm run preview   # previsualiza el build
npm run package   # genera release/syntax-error.zip
```

## Código fuente

- `src/components`: jugador, habilidad Comment Code y HUD.
- `src/levels`: datos declarativos y loader de los cinco niveles.
- `src/mechanics`: Garbage Collector, Merge Conflict, Stack Overflow y Warnings.
- `src/scenes`: menú, selección, configuración, pausa y gameplay.
- `src/systems`: audio, temas, guardado, muerte y respawn.
- `scripts`: smoke test y empaquetado del artefacto.
