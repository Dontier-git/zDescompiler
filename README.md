# zDescompiler

> El descompilador / extractor online para archivos de Minecraft — 100% en el navegador, sin servidor, sin upload.

zDescompiler es una web inspirada en [decompiler.com](https://www.decompiler.com) y [javadecompilers.com](https://www.javadecompilers.com) pero **enfocada exclusivamente en archivos de Minecraft**: `.mcpack`, `.mcaddon`, `.mcworld`, `.mctemplate`, mods `.jar` (Forge/Fabric/NeoForge), `.nbt`, `.litematic`, `.schem`, `.mca`, `.mcmeta`, `.mcfunction`, `server.properties`, skins `.png` y muchos más.

Todo el procesamiento ocurre **dentro del navegador** con JavaScript, WebAssembly y un parser NBT propio — tu archivo nunca sale de tu equipo.

## 🚀 Desplegar en GitHub Pages

Este proyecto está configurado para **static export** (`output: "export"` en `next.config.ts`), lo que significa que se compila a HTML/CSS/JS puro que cualquier hosting estático puede servir (GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.).

### Pasos para GitHub Pages

1. **Crea un repo** llamado `zDescompiler` (o cualquier nombre, pero entonces actualiza `basePath` en `next.config.ts`)
2. Sube el código a la rama `main`:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/zDescompiler.git
   git push -u origin main
   ```
3. En GitHub → Settings → Pages:
   - **Source**: GitHub Actions
4. El workflow `.github/workflows/deploy.yml` se ejecutará automáticamente en cada push y publicará el sitio en:
   ```
   https://TU_USUARIO.github.io/zDescompiler/
   ```

### ¿Por qué no se veía antes?

Si subiste el código fuente tal cual a GitHub Pages y se veía en blanco/404, era porque GitHub Pages sirve archivos estáticos y Next.js (por defecto) requiere un servidor Node. Ahora con `output: "export"` el comando `bun run build` genera una carpeta `out/` con HTML estático listo para servir.

### Si tu repo tiene otro nombre

Edita `next.config.ts` y cambia:
```ts
basePath: isGithubActions ? `/TU_REPONAME` : "",
assetPrefix: isGithubActions ? `/TU_REPONAME/` : "/",
```

## Características

- **Extracción 100% client-side** con JSZip + file-saver — sin backend, sin logs, sin cookies de sesión
- **Parser NBT nativo** escrito desde cero (sin dependencias externas) — soporta gzip vía `DecompressionStream` nativo del navegador
- **Parser de .class files** propio (JVM bytecode) — lee constant pool real, firmas de métodos, campos, bytecode desensamblado y tabla de excepciones
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
  - **`.class` files** con 3 tabs: Estructura (clase, campos, métodos), Bytecode (instrucciones JVM con referencias al CP resueltas), Constant pool (todos los strings reales del plugin)
  - `.mcfunction` y `.properties` como texto formateado
- **Tema Minecraft naranja pastel** (pumpkin/melon/terracotta) — claro y oscuro conmutable
- **Footer completo** con todos los decompiladores catalogados por categoría (estilo SEO links de decompiler.com)

## Stack

- **Framework**: Next.js 16 (App Router, static export) + TypeScript 5
- **Estilos**: Tailwind CSS 4 + shadcn/ui (New York style)
- **Extracción**: JSZip 3 + file-saver 2
- **Parser NBT**: implementación propia (`src/lib/nbt.ts`)
- **Parser .class**: implementación propia (`src/lib/java-class.ts`)
- **Iconos**: lucide-react
- **Runtime**: Bun (recomendado) o npm / pnpm / yarn

## Cómo ejecutar localmente

```bash
# 1. Instalar dependencias
bun install

# 2. Levantar el dev server
bun run dev
# → abre http://localhost:3000

# 3. Lint
bun run lint

# 4. Build estático (genera carpeta out/)
bun run build
# → sirve out/ con cualquier servidor estático
bunx serve out -p 8765
```

> También funciona con `npm install && npm run dev` si no tienes Bun.

## Estructura del proyecto

```
zDescompiler/
├── .github/workflows/
│   └── deploy.yml               # GitHub Action: build + deploy a Pages
├── public/
│   ├── favicon.svg              # Logo pixel-block naranja (pumpkin/melon)
│   ├── logo.svg
│   └── robots.txt
├── prisma/
│   └── schema.prisma            # Schema (no usado activamente, listo para features futuras)
├── scripts/
│   ├── make_sample_mcpack.py    # Genera un .mcpack de prueba
│   ├── make_test_class.py       # Genera un .class + .jar de prueba
│   └── package_zip.py           # Empaqueta el proyecto en .zip
├── src/
│   ├── app/
│   │   ├── globals.css         # Paleta naranja pastel + utilidades pixel
│   │   ├── layout.tsx          # Metadata SEO + theme provider + fuentes
│   │   └── page.tsx            # Página principal (hero + formatos + tools + FAQ + footer)
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── site-header.tsx
│   │   ├── site-footer.tsx
│   │   ├── hero-upload.tsx     # Drop zone + extracción real
│   │   ├── file-explorer.tsx   # Explorador de directorio + Sheet preview
│   │   ├── json-tree.tsx       # Árbol colapsable para JSON
│   │   ├── nbt-inspector.tsx   # Inspector NBT con tabs Árbol/JSON
│   │   ├── java-class-inspector.tsx  # Inspector .class con Estructura/Bytecode/CP
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
│       ├── java-class.ts       # Parser de .class files (JVM bytecode)
│       └── utils.ts            # cn() helper
├── package.json
├── next.config.ts              # output: export + basePath /zDescompiler
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json             # shadcn/ui config
├── eslint.config.mjs
├── Caddyfile                   # Reverse proxy config del sandbox (no necesario para Pages)
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
- `.class` — Java bytecode parser (muestra constant pool, métodos, bytecode real)
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
