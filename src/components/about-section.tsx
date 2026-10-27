"use client";

import { Shield, Zap, Boxes, Github, Heart } from "lucide-react";

const PILLARS = [
  {
    icon: Shield,
    title: "Privado por diseño",
    body: "Tu archivo jamás sale de tu navegador. No hay servidor de upload, no hay proxy, no hay log. Si tienes internet caído, zDescompiler sigue funcionando exactamente igual.",
  },
  {
    icon: Zap,
    title: "Instantáneo",
    body: "Todo el parsing ocurre con WebAssembly y un parser NBT nativo. Un .mcpack de 50 MB se extrae en menos de 2 segundos en un portátil estándar.",
  },
  {
    icon: Boxes,
    title: "Cubrimos todo Minecraft",
    body: "23 formatos entre Bedrock, Java, Forge, Fabric, datapacks, schematics y assets. Si falta un formato, lo añadimos en una semana.",
  },
];

export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary">
            Acerca de zDescompiler
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">
            Un descompilador de Minecraft,{" "}
            <span className="text-primary">por y para la comunidad</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            zDescompiler nació de la frustración de tener que instalar Java,
            Python, Blockbench y 7zip solo para inspeccionar un .mcpack.
            ¿Por qué no podemos simplemente arrastrar y soltar? Esta web es la
            respuesta. Todo el código es open-source y vive en GitHub, las
            contribuciones son bienvenidas, y la hoja de ruta es pública.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/zdescompiler/zdescompiler"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm hover:border-primary/40 hover:bg-accent/5 transition-colors"
            >
              <Github className="h-4 w-4" /> Ver código en GitHub
            </a>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Heart className="h-3 w-3 text-rose-500" /> Mantenido por 4 personas
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors"
              >
                <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary/15 text-primary border border-primary/20 mb-3">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-sm">{p.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {p.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
