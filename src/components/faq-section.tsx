"use client";

const FAQS: { q: string; a: string }[] = [
  {
    q: "¿zDescompiler sube mi .jar a un servidor?",
    a: "No. Absolutamente todo el procesamiento ocurre dentro de tu navegador con JavaScript, JSZip y nuestros parsers NBT y .class propios. Tu archivo nunca sale de tu equipo, ni siquiera pasa por un servidor intermedio. Si desconectas internet mientras usas la web, todo seguirá funcionando igual.",
  },
  {
    q: "¿Puedo decompilar .class a código fuente Java?",
    a: "zDescompiler te muestra el contenido REAL del .class: constant pool con todos los strings literales del plugin, firmas de métodos decodificadas (void onEnable() en vez de ()V), tipos de campos reales, y bytecode desensamblado con referencias al CP resueltas (#24 java.lang.Object.<init>:()V). Esto es 100% preciso y real — no es código inventado. Para reconstruir Java source completo desde bytecode (con cuerpos de métodos reconstruidos), necesitarías CFR, Procyon o Fernflower, que son decompiladores Java pesados.",
  },
  {
    q: "¿Qué tipos de plugin puedo abrir?",
    a: "Todos los plugins Java en formato .jar: Bukkit, Spigot, Paper, Purpur, Folia, Pufferfish, BungeeCord, Waterdog, Velocity (servidores Minecraft), Forge, Fabric, NeoForge, Quilt (mods cliente/servidor), y también WAR/EAR/AAR (enterprise Java). Para .class sueltos también funciona — arrástralos directamente.",
  },
  {
    q: "¿Hay límite de tamaño?",
    a: "El límite lo pone tu RAM del navegador, no zDescompiler. En la práctica, .jar de hasta ~500 MB deberían funcionar sin problema en un equipo moderno. .jar muy grandes (>1 GB) pueden hacer que el navegador congele la pestaña durante la extracción — te recomendamos extraer manualmente las partes que te interesan.",
  },
  {
    q: "¿zDescompiler guarda algún log de lo que abro?",
    a: "No. No hay analytics de archivos, no hay cookies de sesión, no hay IP logging. El navegador ejecuta el código, muestra el resultado y olvida. Si refrescas la página, todo lo que abriste se pierde — no hay ni caché local.",
  },
  {
    q: "¿Puedo descargar todos los archivos extraídos del .jar?",
    a: "Sí. Una vez abierto el .jar, el botón «Descargar ZIP» del explorador te genera un .zip limpio con toda la estructura interna, renombrado como tu_archivo.zdescompiler.zip para que sepas que fue procesado por nosotros. También puedes descargar archivos individuales con el botón «Bajar».",
  },
  {
    q: "¿zDescompiler funciona con plugins ofuscados o premium?",
    a: "Técnicamente puedes abrir cualquier .jar sin importar su origen. Para plugins ofuscados (clases a.class, b.class, métodos de 1-2 letras), zDescompiler te muestra el bytecode real igualmente, pero los nombres no te dirán nada útil. Para plugins premium de SpigotMC con protección de licencia, a veces el .class principal está encriptado — zDescompiler te avisará si detecta el patrón y no puede leer el manifest.",
  },
  {
    q: "¿Debo pagar algo?",
    a: "No. zDescompiler es 100% gratis y sin anuncios. No vendemos datos (no tenemos datos), no tenemos plan Pro, no hay captcha. El proyecto se mantiene como código abierto y se financia únicamente con donaciones voluntarias.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <p className="text-xs font-mono uppercase tracking-widest text-primary">
            Preguntas frecuentes
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">
            Lo que la comunidad nos pregunta
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            ¿No encuentras tu duda? Escríbenos a{" "}
            <a
              href="mailto:support@zdescompiler.com"
              className="text-primary hover:underline"
            >
              support@zdescompiler.com
            </a>{" "}
            y respondemos en menos de 48 h.
          </p>
        </div>

        <div className="lg:col-span-2">
          <AccordionWrap items={FAQS} />
        </div>
      </div>
    </section>
  );
}

// Local wrapper to avoid importing the shadcn accordion which depends on Radix's
// collapsible animations — keep things light & framework-agnostic.
function AccordionWrap({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {items.map((item, i) => (
        <details key={i} className="group bg-card">
          <summary className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors list-none">
            <span className="text-primary text-xs font-mono mt-1 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm font-medium flex-1">{item.q}</span>
            <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform shrink-0 mt-1">
              ▾
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed pl-10">
            {item.a}
          </div>
        </details>
      ))}
    </div>
  );
}
