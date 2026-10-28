"use client";

import { useState } from "react";
import { AlertTriangle, FileCode2, Loader2, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DecompilerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  onAccept: () => Promise<void>;
};

const TERMS = [
  {
    title: "Uso legítimo",
    body: "Solo descompilarás plugins que poseas, que sean de código abierto (MIT, GPL, Apache, etc.) o sobre los que tengas permiso explícito del autor para inspeccionarlos.",
  },
  {
    title: "Sin redistribución",
    body: "El .zip descompilado es para tu uso personal — estudio, debugging, auditoría de seguridad. No lo redistribuyas como source jar si el plugin original no era open-source.",
  },
  {
    title: "Plugins premium / de pago",
    body: "Si el .jar es un plugin de pago (SpigotMC Premium, Polymart, etc.), debes haberlo comprado legalmente. Eludir verificaciones de licencia viola el DMCA (US) y la Directiva UE 2001/29/EC.",
  },
  {
    title: "Sin responsabilidades",
    body: "zDescompiler es una herramienta de ingeniería inversa legítima (como JD-GUI o CFR). Tú eres responsable de cómo usas la salida. El equipo de zDescompiler no se hace responsable de mal uso, demandas, o daños derivados del uso indebido de la herramienta.",
  },
  {
    title: "Best-effort",
    body: "La decompilación es 'best-effort': para métodos simples (getters, setters, llamadas a métodos) produce Java source legible; para métodos complejos (loops, try/catch, lambdas) preserva el bytecode como comentario. Para output perfecto usa CFR o Procyon.",
  },
];

export function DecompilerTosModal({
  open,
  onOpenChange,
  fileName,
  onAccept,
}: DecompilerModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    if (!accepted) return;
    setBusy(true);
    try {
      await onAccept();
      onOpenChange(false);
      setAccepted(false);
    } catch (e) {
      toast.error(`Error al decompilar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Descargar .ZIP descompilado
          </DialogTitle>
          <DialogDescription className="text-left">
            Vas a descargar <code className="font-mono text-foreground/90">{fileName}</code>
            {" "}con todos los <code className="font-mono">.class</code> convertidos a
            archivos <code className="font-mono">.java</code> legibles. Antes debes aceptar
            los términos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2">
          {TERMS.map((t, i) => (
            <div key={i} className="p-3 rounded-lg border border-border bg-muted/20">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1">
                <span className="text-primary font-mono">{String(i + 1).padStart(2, "0")}</span>
                {t.title}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                {t.body}
              </p>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            El uso indebido de esta herramienta puede violar leyes de copyright y
            los términos de servicio de plataformas como SpigotMC y Polymart.
            Lee los términos antes de continuar.
          </p>
        </div>

        <label className="flex items-start gap-2 cursor-pointer my-1">
          <Checkbox
            checked={accepted}
            onCheckedChange={(v) => setAccepted(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs text-foreground/80 leading-relaxed">
            He leído y acepto los términos y condiciones. Entiendo que soy
            responsable del uso que haga del .zip descompilado.
          </span>
        </label>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!accepted || busy}
            onClick={handleAccept}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            {busy ? "Decompilando…" : "Aceptar y descargar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
