"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS: { q: string; a: string }[] = [
  {
    q: "¿zDescompiler sube mi archivo a un servidor?",
    a: "No. Absolutamente todo el procesamiento ocurre dentro de tu navegador con JavaScript, WebAssembly y el parser NBT nativo que zDescompiler incluye. Tu archivo nunca sale de tu equipo, ni siquiera pasa por un servidor intermedio. Si desconectas internet mientras usas la web, todo seguirá funcionando igual.",
  },
  {
    q: "¿Puedo descompilar mods de Minecraft (.jar) a código fuente?",
    a: "zDescompiler te permite explorar la estructura interna de un .jar — ver fabric.mod.json, mods.toml, mixins JSON y los recursos embebidos. La decompilación real de bytecode Java a .java requiere un decompilador como CFR o Procyon, que zDescompiler invoca opcionalmente en el navegador a través de WebAssembly. Esta característica está en beta para archivos .jar de menos de 20 MB.",
  },
  {
    q: "¿Qué archivos de Minecraft puedo abrir?",
    a: "Todos los formatos ZIP-based (.mcpack, .mcaddon, .mcworld, .mctemplate, .jar, .zip de resource/datapack) y todos los formatos NBT-based (.nbt, .dat, level.dat, player .dat, structure .nbt). Para schematics: .litematic, .schem (Sponge) y .schematic (MCEdit). Para datos JSON: manifest, pack.mcmeta, *.geo.json, *.render.json, *.animation.json. En total, 23 formatos cubiertos.",
  },
  {
    q: "¿Hay límite de tamaño?",
    a: "El límite lo pone tu RAM del navegador, no zDescompiler. En la práctica, archivos de hasta ~500 MB deberían funcionar sin problema en un equipo moderno. Archivos muy grandes (>1 GB) pueden hacer que el navegador congele la pestaña durante la extracción — te recomendamos dividir el world / pack previamente.",
  },
  {
    q: "¿zDescompiler guarda algún log de lo que abro?",
    a: "No. No hay analytics de archivos, no hay cookies de sesión, no hay IP logging. El navegador ejecuta el código, muestra el resultado y olvida. Si refrescas la página, todo lo que abriste se pierde — no hay ni caché local.",
  },
  {
    q: "¿Puedo descargar todo el contenido extraído de una vez?",
    a: "Sí. Una vez abierto el archivo, el botón «Descargar todo» del explorador te genera un .zip limpio con toda la estructura interna, renombrado como tu_archivo.zdescompiler.zip para que sepas que fue procesado por nosotros.",
  },
  {
    q: "¿zDescompiler es compatible con mods de Bedrock (premium de Marketplace)?",
    a: "Técnicamente puedes abrir cualquier .mcaddon/.mcworld sin importar su origen. Sin embargo, los archivos de Minecraft Marketplace vienen encriptados con claves por-tienda y NO se pueden abrir sin esas claves. zDescompiler te avisará si detecta el patrón de un pack encriptado y no puede leer su manifest.",
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
          <Accordion type="single" collapsible defaultValue="item-0">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left hover:no-underline">
                  <span className="flex items-start gap-2">
                    <span className="text-primary text-xs font-mono mt-1">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-medium">{f.q}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
