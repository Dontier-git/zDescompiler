"use client";

/**
 * Minimal, dependency-free NBT (Named Binary Tag) parser.
 * Supports gzip / uncompressed NBT as used by Minecraft.
 * Reference: https://wiki.vg/NBT
 *
 * Returns a JS-friendly tree of typed tag objects:
 *   { type: 'compound', name: string, value: NbtNode[] }
 *   { type: 'list',   name: string, value: NbtNode[], elementType: TagId }
 *   { type: 'string',  name: string, value: string }
 *   { type: 'int',     name: string, value: number }
 *   ... etc
 */

export type TagId =
  | 0 // TAG_End
  | 1 // TAG_Byte
  | 2 // TAG_Short
  | 3 // TAG_Int
  | 4 // TAG_Long
  | 5 // TAG_Float
  | 6 // TAG_Double
  | 7 // TAG_Byte_Array
  | 8 // TAG_String
  | 9 // TAG_List
  | 10 // TAG_Compound
  | 11 // TAG_Int_Array
  | 12 // TAG_Long_Array;

export type NbtNode =
  | { type: "end"; name: string }
  | { type: "byte"; name: string; value: number }
  | { type: "short"; name: string; value: number }
  | { type: "int"; name: string; value: number }
  | { type: "long"; name: string; value: string } // BigInt-serialized as string for JSON safety
  | { type: "float"; name: string; value: number }
  | { type: "double"; name: string; value: number }
  | { type: "byte_array"; name: string; value: number[] }
  | { type: "string"; name: string; value: string }
  | { type: "list"; name: string; elementType: TagId; value: NbtNode[] }
  | { type: "compound"; name: string; value: NbtNode[] }
  | { type: "int_array"; name: string; value: number[] }
  | { type: "long_array"; name: string; value: string[] };

const TYPE_NAMES: Record<number, string> = {
  0: "end",
  1: "byte",
  2: "short",
  3: "int",
  4: "long",
  5: "float",
  6: "double",
  7: "byte_array",
  8: "string",
  9: "list",
  10: "compound",
  11: "int_array",
  12: "long_array",
};

class NbtReader {
  private view: DataView;
  private offset = 0;
  private readonly utf8 = new TextDecoder("utf-8");

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private ensure(n: number) {
    if (this.offset + n > this.view.byteLength) {
      throw new Error(`NBT unexpected end of input at offset ${this.offset}`);
    }
  }

  readByte(): number {
    this.ensure(1);
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }
  readUByte(): number {
    this.ensure(1);
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }
  readShort(): number {
    this.ensure(2);
    const v = this.view.getInt16(this.offset, false);
    this.offset += 2;
    return v;
  }
  readUShort(): number {
    this.ensure(2);
    const v = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return v;
  }
  readInt(): number {
    this.ensure(4);
    const v = this.view.getInt32(this.offset, false);
    this.offset += 4;
    return v;
  }
  readLong(): string {
    this.ensure(8);
    const hi = this.view.getUint32(this.offset, false);
    const lo = this.view.getUint32(this.offset + 4, false);
    this.offset += 8;
    // Signed 64-bit via BigInt
    const big = (BigInt(hi) << 32n) | BigInt(lo);
    const signed =
      big & 0x8000000000000000n ? big - 0x10000000000000000n : big;
    return signed.toString();
  }
  readFloat(): number {
    this.ensure(4);
    const v = this.view.getFloat32(this.offset, false);
    this.offset += 4;
    return v;
  }
  readDouble(): number {
    this.ensure(8);
    const v = this.view.getFloat64(this.offset, false);
    this.offset += 8;
    return v;
  }
  readString(): string {
    const len = this.readUShort();
    this.ensure(len);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
    this.offset += len;
    return this.utf8.decode(bytes);
  }
  readByteArray(): number[] {
    const len = this.readInt();
    const out: number[] = [];
    for (let i = 0; i < len; i++) out.push(this.readByte());
    return out;
  }
  readIntArray(): number[] {
    const len = this.readInt();
    const out: number[] = [];
    for (let i = 0; i < len; i++) out.push(this.readInt());
    return out;
  }
  readLongArray(): string[] {
    const len = this.readInt();
    const out: string[] = [];
    for (let i = 0; i < len; i++) out.push(this.readLong());
    return out;
  }

  readPayload(type: TagId): NbtNode["value"] {
    switch (type) {
      case 1: return this.readByte();
      case 2: return this.readShort();
      case 3: return this.readInt();
      case 4: return this.readLong();
      case 5: return this.readFloat();
      case 6: return this.readDouble();
      case 7: return this.readByteArray();
      case 8: return this.readString();
      case 11: return this.readIntArray();
      case 12: return this.readLongArray();
      case 9: {
        const elementType = this.readUByte() as TagId;
        const len = this.readInt();
        const arr: NbtNode[] = [];
        for (let i = 0; i < len; i++) {
          arr.push(this.readNamedPayload(elementType, ""));
        }
        return { elementType, value: arr } as unknown as NbtNode["value"];
      }
      case 10: {
        const children: NbtNode[] = [];
        for (;;) {
          const childType = this.readUByte() as TagId;
          if (childType === 0) break;
          const name = this.readString();
          children.push(this.readNamedPayload(childType, name));
        }
        return children;
      }
      default:
        throw new Error(`NBT: unknown tag id ${type}`);
    }
  }

  readNamedPayload(type: TagId, name: string): NbtNode {
    if (type === 0) return { type: "end", name };
    const payload = this.readPayload(type);
    // Build typed node
    const typeName = TYPE_NAMES[type];
    if (type === 9) {
      const listPayload = payload as { elementType: TagId; value: NbtNode[] };
      return { type: "list", name, elementType: listPayload.elementType, value: listPayload.value };
    }
    if (type === 10) {
      return { type: "compound", name, value: payload as NbtNode[] };
    }
    return { type: typeName as NbtNode["type"], name, value: payload } as NbtNode;
  }

  readRoot(): NbtNode {
    const type = this.readUByte() as TagId;
    if (type === 0) return { type: "end", name: "" };
    const name = this.readString();
    return this.readNamedPayload(type, name);
  }
}

export function parseNbt(bytes: Uint8Array): NbtNode {
  const reader = new NbtReader(bytes);
  return reader.readRoot();
}

/** Convert an NbtNode tree to a plain JSON-friendly structure (drops type metadata). */
export function nbtToJson(node: NbtNode): unknown {
  if (!node) return null;
  switch (node.type) {
    case "end": return null;
    case "byte":
    case "short":
    case "int":
    case "float":
    case "double":
    case "string": return node.value;
    case "long": return node.value; // already string
    case "byte_array":
    case "int_array": return node.value;
    case "long_array": return node.value;
    case "list": return (node.value || []).map(nbtToJson);
    case "compound": {
      const obj: Record<string, unknown> = {};
      for (const child of node.value || []) {
        if (child.type === "end") continue;
        obj[child.name || "_"] = nbtToJson(child);
      }
      return obj;
    }
    default: return null;
  }
}
