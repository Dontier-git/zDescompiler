// Quick test: extract TestPlugin.jar and decompile TestPlugin.class to .java
import { extractArchive } from "../src/lib/mc-extract";
import { decompileArchiveToZip } from "../src/lib/mc-extract";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const JAR = "/home/z/my-project/download/TestPlugin.jar";
const OUT_ZIP = "/home/z/my-project/download/TestPlugin.decompiled.zip";

async function main() {
  console.log("Reading jar from:", JAR);
  const file = await (await import("node:fs/promises")).readFile(JAR);
  const f = new File([file], "TestPlugin.jar");
  console.log("File size:", file.length, "bytes");
  console.log("");
  console.log("Extracting...");
  const archive = await extractArchive(f);
  console.log("Extracted:", archive.fileCount, "files");
  console.log("");
  console.log("Decompiling to .zip...");
  const { blob, stats } = await decompileArchiveToZip(archive);
  console.log("Stats:", JSON.stringify(stats, null, 2));
  console.log("Output zip size:", blob.size, "bytes");
  console.log("");
  // Save the decompiled zip
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(OUT_ZIP, buf);
  console.log("Saved to:", OUT_ZIP);
  console.log("");

  // Also dump the .java source to stdout
  console.log("=== Preview of TestPlugin.java ===");
  const { parseClassFile } = await import("../src/lib/java-class");
  const { decompileClass } = await import("../src/lib/java-decompiler");
  const classFile = archive.files.find((f) => f.path.endsWith(".class"));
  if (classFile) {
    const buf = new Uint8Array(await classFile.blob.arrayBuffer());
    const cls = parseClassFile(buf);
    const src = decompileClass(cls);
    console.log(src);
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
