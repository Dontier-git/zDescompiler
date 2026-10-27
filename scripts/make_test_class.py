#!/usr/bin/env python3
"""Build a minimal but REAL .class file by hand for testing zDescompiler.

The class produced is the JVM equivalent of:

    package com.zdescompiler.test;
    public class TestPlugin {
        public TestPlugin() { super(); }
        public String getVersion() { return "1.0.0"; }
        public void onEnable() { System.out.println("Hello, Minecraft!"); }
    }
"""

import struct
import os

OUT_DIR = "/home/z/my-project/scripts/test_plugin/com/zdescompiler/test"
OUT = os.path.join(OUT_DIR, "TestPlugin.class")
JAR = "/home/z/my-project/download/TestPlugin.jar"

# --- Build constant pool entries ---
# Each entry: (tag, payload_bytes)
cp = [None]  # index 0 unused

def add_utf8(s):
    """Add a Utf8 constant and return its index."""
    # Encode as Java modified UTF-8 — for ASCII it's identical
    b = s.encode("utf-8")
    cp.append((1, struct.pack(">H", len(b)) + b))
    return len(cp) - 1

def add_class(utf8_idx):
    cp.append((7, struct.pack(">H", utf8_idx)))
    return len(cp) - 1

def add_name_and_type(name_idx, desc_idx):
    cp.append((12, struct.pack(">HH", name_idx, desc_idx)))
    return len(cp) - 1

def add_methodref(class_idx, nat_idx):
    cp.append((10, struct.pack(">HH", class_idx, nat_idx)))
    return len(cp) - 1

def add_fieldref(class_idx, nat_idx):
    cp.append((9, struct.pack(">HH", class_idx, nat_idx)))
    return len(cp) - 1

def add_string(utf8_idx):
    cp.append((8, struct.pack(">H", utf8_idx)))
    return len(cp) - 1


# Utf8 strings — reserve indices up front
# (we just need to add them in order; order matters for indices)
i_this = add_utf8("com/zdescompiler/test/TestPlugin")
i_obj = add_utf8("java/lang/Object")
i_init_name = add_utf8("<init>")
i_init_desc = add_utf8("()V")
i_code_attr = add_utf8("Code")
i_getver_name = add_utf8("getVersion")
i_getver_desc = add_utf8("()Ljava/lang/String;")
i_version_str = add_utf8("1.0.0")
i_onenable_name = add_utf8("onEnable")
i_hello_str = add_utf8("Hello, Minecraft!")
i_sys = add_utf8("java/lang/System")
i_out_name = add_utf8("out")
i_out_desc = add_utf8("Ljava/io/PrintStream;")
i_printstream = add_utf8("java/io/PrintStream")
i_println_name = add_utf8("println")
i_println_desc = add_utf8("(Ljava/lang/String;)V")

# Classes
c_this = add_class(i_this)
c_obj = add_class(i_obj)
c_sys = add_class(i_sys)
c_printstream = add_class(i_printstream)

# NameAndType
nat_init = add_name_and_type(i_init_name, i_init_desc)
nat_out = add_name_and_type(i_out_name, i_out_desc)
nat_println = add_name_and_type(i_println_name, i_println_desc)

# Method/Field refs
m_obj_init = add_methodref(c_obj, nat_init)
f_sys_out = add_fieldref(c_sys, nat_out)
m_ps_println = add_methodref(c_printstream, nat_println)

# String constants
s_version = add_string(i_version_str)
s_hello = add_string(i_hello_str)

cp_count = len(cp)


def build_class():
    out = b""
    out += struct.pack(">I", 0xCAFEBABE)  # magic
    out += struct.pack(">H", 0)            # minor
    out += struct.pack(">H", 52)           # major = Java 8
    out += struct.pack(">H", cp_count)     # cp count

    # Constant pool entries
    for entry in cp[1:]:
        tag, payload = entry
        out += struct.pack(">B", tag) + payload

    # access_flags: ACC_PUBLIC | ACC_SUPER = 0x0001 | 0x0020 = 0x0021
    out += struct.pack(">H", 0x0021)
    # this_class, super_class
    out += struct.pack(">H", c_this)
    out += struct.pack(">H", c_obj)

    # interfaces_count
    out += struct.pack(">H", 0)
    # fields_count
    out += struct.pack(">H", 0)

    # methods_count = 3
    out += struct.pack(">H", 3)

    # --- Method 1: <init>()V ---
    # access_flags: ACC_PUBLIC = 0x0001
    out += struct.pack(">H", 0x0001)
    out += struct.pack(">H", i_init_name)
    out += struct.pack(">H", i_init_desc)
    # attributes_count = 1 (Code)
    out += struct.pack(">H", 1)
    # Code attribute
    out += struct.pack(">H", i_code_attr)
    # attribute_length (calculated below)
    code1 = b""
    code1 += struct.pack(">H", 1)   # max_stack
    code1 += struct.pack(">H", 1)   # max_locals
    code1 += struct.pack(">I", 5)   # code_length
    # aload_0, invokespecial #m_obj_init, return
    code1 += bytes([0x2a, 0xb7, (m_obj_init >> 8) & 0xff, m_obj_init & 0xff, 0xb1])
    code1 += struct.pack(">H", 0)   # exception_table_length
    code1 += struct.pack(">H", 0)   # attributes_count
    out += struct.pack(">I", len(code1))
    out += code1

    # --- Method 2: getVersion()Ljava/lang/String; ---
    out += struct.pack(">H", 0x0001)  # public
    out += struct.pack(">H", i_getver_name)
    out += struct.pack(">H", i_getver_desc)
    out += struct.pack(">H", 1)
    out += struct.pack(">H", i_code_attr)
    code2 = b""
    code2 += struct.pack(">H", 1)
    code2 += struct.pack(">H", 1)
    code2 += struct.pack(">I", 3)
    # ldc #s_version, areturn
    code2 += bytes([0x12, s_version & 0xff, 0xb0])
    code2 += struct.pack(">H", 0)
    code2 += struct.pack(">H", 0)
    out += struct.pack(">I", len(code2))
    out += code2

    # --- Method 3: onEnable()V ---
    out += struct.pack(">H", 0x0001)  # public
    out += struct.pack(">H", i_onenable_name)
    out += struct.pack(">H", i_init_desc)  # descriptor ()V
    out += struct.pack(">H", 1)
    out += struct.pack(">H", i_code_attr)
    code3 = b""
    code3 += struct.pack(">H", 2)  # max_stack
    code3 += struct.pack(">H", 1)  # max_locals
    code3 += struct.pack(">I", 9)  # code_length (3 + 2 + 3 + 1 = 9)
    # getstatic #f_sys_out, ldc #s_hello, invokevirtual #m_ps_println, return
    code3 += bytes([
        0xb2, (f_sys_out >> 8) & 0xff, f_sys_out & 0xff,
        0x12, s_hello & 0xff,
        0xb6, (m_ps_println >> 8) & 0xff, m_ps_println & 0xff,
        0xb1,
    ])
    code3 += struct.pack(">H", 0)
    code3 += struct.pack(">H", 0)
    out += struct.pack(">I", len(code3))
    out += code3

    # class attributes_count = 0
    out += struct.pack(">H", 0)

    return out


data = build_class()
os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, "wb") as f:
    f.write(data)

print(f"Created: {OUT} ({len(data)} bytes)")

# Build a JAR (just a ZIP with the .class inside + manifest)
import zipfile
with zipfile.ZipFile(JAR, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\nMain-Class: com.zdescompiler.test.TestPlugin\n")
    z.writestr("com/zdescompiler/test/TestPlugin.class", data)
    # Also add some plugin metadata
    z.writestr("plugin.yml", "name: TestPlugin\nversion: 1.0.0\nmain: com.zdescompiler.test.TestPlugin\napi-version: 1.20\n")
    z.writestr("config.yml", "settings:\n  enabled: true\n  max-players: 20\n")

print(f"Created JAR: {JAR} ({os.path.getsize(JAR)} bytes)")
