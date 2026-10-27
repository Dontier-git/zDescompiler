# zDescompiler

> El descompilador / extractor online para archivos de Minecraft — 100% en el navegador, sin servidor, sin upload.

zDescompiler es una web inspirada en [decompiler.com](https://www.decompiler.com) y [javadecompilers.com](https://www.javadecompilers.com) pero **enfocada exclusivamente en archivos de Minecraft**: `.mcpack`, `.mcaddon`, `.mcworld`, `.mctemplate`, mods `.jar` (Forge/Fabric/NeoForge), `.nbt`, `.litematic`, `.schem`, `.mca`, `.mcmeta`, `.mcfunction`, `server.properties`, skins `.png` y muchos más.

Todo el procesamiento ocurre **dentro del navegador** con JavaScript, WebAssembly y un parser NBT propio — tu archivo nunca sale de tu equipo.

## Características

- **Extracción 100% client-side** con JSZip + file-saver — sin backend, sin logs, sin cookies de sesión
- **Parser NBT nativo** escrito desde cero (sin dependencias externas) — soporta gzip vía `DecompressionStream` nativo del navegador
- **23 formatos** de Minecraft cubiertos entre Bedrock, Java, Forge, Fabric, datapacks y schematics
- **Explorador de directorio navegable** estilo decompiler.com pero mejorado:
  - Breadcrumb clicable (`🏠 raíz › textures › blocks`)
  - Filtro de búsqueda y ordenamiento por Nombre / Tamaño / Tipo
  - Click en carpeta → entra en ella; click en `..` → sube al parent
  - Click en archivo → panel deslizable lateral con vista previa inteligente
- **Preview inteligente** según tipo de archivo:
  - Imágenes PNG con `image-rendering: pixelated` y fondo a cuadros
  - JSON / `.mcmeta` como árbol colapsable
  - NBT / `.dat` / `level.dat` con tabs Árbol + JSON + botón Copiar
  - `.mcfunction` y `.properties` como texto formateado
- **Tema Minecraft naranja pastel** (pumpkin/melon/terracotta) — claro y oscuro conmutable
- **Footer completo** con todos los decompiladores catalogados por categoría (estilo SEO links de decompiler.com)

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Estilos**: Tailwind CSS 4 + shadcn/ui (New York style)
- **Extracción**: JSZip 3 + file-saver 2
- **Parser NBT**: implementación propia (`src/lib/nbt.ts`)
- **Iconos**: lucide-react
- **Runtime**: Bun (recomendado) o npm / pnpm / yarn

## Cómo ejecutar

```bash
# 1. Instalar dependencias
bun install

# 2. Levantar el dev server
bun run dev
# → abre http://localhost:3000

# 3. Lint
bun run lint

# 4. Build producción
bun run build && bun run start
```

> También funciona con `npm install && npm run dev` si no tienes Bun.

## Estructura del proyecto

```
zDescompiler/
├── public/
│   ├── favicon.svg              # Logo pixel-block naranja (pumpkin/melon)
│   ├── logo.svg
│   └── robots.txt
├── prisma/
│   └── schema.prisma            # Schema (no usado activamente, listo para features futuras)
├── scripts/
│   ├── make_sample_mcpack.py    # Genera un .mcpack de prueba
│   └── package_zip.py           # Empaqueta el proyecto en .zip
├── src/
│   ├── app/
│   │   ├── globals.css         # Paleta naranja pastel + utilidades pixel
│   │   ├── layout.tsx          # Metadata SEO + theme provider + fuentes
│   │   ├── page.tsx            # Página principal (hero + formatos + tools + FAQ + footer)
│   │   └── api/route.ts
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── site-header.tsx
│   │   ├── site-footer.tsx
│   │   ├── hero-upload.tsx     # Drop zone + extracción real
│   │   ├── file-explorer.tsx   # Explorador de directorio + Sheet preview
│   │   ├── json-tree.tsx       # Árbol colapsable para JSON
│   │   ├── nbt-inspector.tsx   # Inspector NBT con tabs Árbol/JSON
│   │   ├── feature-grid.tsx    # Catálogo de 23 formatos con filtro
│   │   ├── tools-section.tsx
│   │   ├── about-section.tsx
│   │   ├── faq-section.tsx
│   │   ├── format-ticker.tsx
│   │   ├── theme-provider.tsx
│   │   └── theme-toggle.tsx
│   └── lib/
│       ├── mc-formats.ts       # Catálogo de formatos soportados
│       ├── mc-extract.ts       # Lógica de extracción (JSZip + gunzip)
│       ├── nbt.ts              # Parser NBT propio
│       ├── db.ts               # Prisma client (no usado)
│       └── utils.ts            # cn() helper
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json             # shadcn/ui config
├── eslint.config.mjs
├── Caddyfile                   # Reverse proxy config del sandbox
└── .gitignore
```

## Formatos soportados (23)

### Bedrock · Packs & Addons
- `.mcpack` — Minecraft Pack Extractor
- `.mcaddon` — Minecraft Addon Extractor (resource + behaviour)
- `.zip` — Resource Pack Explorer

### Mundos & Saves
- `.mcworld` — Bedrock world archives
- `.mctemplate` — World templates
- `level.dat` — Inspector de world metadata
- `.mca` — Anvil region files
- `.nbt` — Structure files

### Java · Mods & Plugins
- `.jar` — Forge / Fabric / NeoForge / Quilt mod jars
- `.zip` — Datapacks

### Schematics
- `.litematic` — Litematica
- `.schem` — Sponge / WorldEdit
- `.schematic` — MCEdit legacy

### Data & NBT
- `.nbt` / `.dat` — Named Binary Tag (parser propio)
- `.mcmeta` — Animation frames, pack metadata
- `server.properties` — Server config viewer
- `.mcfunction` — Function command lists
- `.lang` — Translation tables
- `.json` — Block/item registries, recipes, loot tables

### Assets
- `.png` — Skin viewer
- `.geo.json` — Bedrock entity geometry
- `.render.json` / `.animation.json` / `.particle.json` — Render controllers
- `sounds.json` — Sound definitions

## Privacidad

Tu archivo **nunca sale de tu navegador**. No hay servidor de upload, no hay proxy, no hay log. Si desconectas internet mientras usas la web, todo sigue funcionando exactamente igual. No usamos cookies de sesión ni analytics de archivos.

## Aviso de marca

zDescompiler no está afiliado con Mojang Studios ni Microsoft. "Minecraft" es una marca registrada de Mojang Studios. Este proyecto es una herramienta comunitaria de código abierto para inspeccionar archivos relacionados con Minecraft.

## Licencia

MIT — libre para usar, modificar y distribuir. Pull requests bienvenidas.
