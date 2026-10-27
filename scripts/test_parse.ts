// Quick test: load the .class parser and parse TestPlugin.class
import { parseClassFile, formatCpEntry, accessFlagsToString } from "../src/lib/java-class";

const fs = require("fs");

const buf = fs.readFileSync("/home/z/my-project/scripts/test_plugin/com/zdescompiler/test/TestPlugin.class");
const bytes = new Uint8Array(buf);
console.log("File size:", bytes.length, "bytes");
console.log("First 4 bytes (magic):", bytes.slice(0, 4).join(" "));

try {
  const cls = parseClassFile(bytes);
  console.log("\n=== PARSED CLASS ===");
  console.log("Magic: 0x" + cls.magic.toString(16));
  console.log("Version:", cls.javaVersion);
  console.log("This class:", cls.thisClass);
  console.log("Super:", cls.superClass);
  console.log("CP size:", cls.constantPoolSize);
  console.log("Fields:", cls.fields.length);
  console.log("Methods:", cls.methods.length);

  console.log("\n=== CONSTANT POOL ===");
  for (let i = 1; i < cls.constantPool.length; i++) {
    const e = cls.constantPool[i];
    if (!e) continue;
    console.log(`  #${i} = ${formatCpEntry(cls.constantPool, i)}`);
  }

  console.log("\n=== METHODS ===");
  for (const m of cls.methods) {
    const flags = accessFlagsToString(m.accessFlags, "method");
    console.log(`  ${flags} ${m.decodedSignature.returnType} ${m.name}(${m.decodedSignature.parameterTypes.join(", ")})`);
    console.log(`    Descriptor: ${m.descriptor}`);
    if (m.code) {
      console.log(`    Code: max_stack=${m.code.maxStack}, max_locals=${m.code.maxLocals}, length=${m.code.codeLength}, ${m.code.instructions.length} instructions`);
      for (const ins of m.code.instructions) {
        console.log(`      ${ins.offset.toString().padStart(4)}: ${ins.mnemonic} ${ins.operands.map((o: number) => o.toString(16).padStart(2, "0")).join(" ")}${ins.operandComment ? "  // " + ins.operandComment : ""}`);
      }
    }
  }
} catch (e) {
  console.error("PARSE ERROR:", e.message);
  process.exit(1);
}
