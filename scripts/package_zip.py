#!/usr/bin/env python3
"""Package zDescompiler project into a clean .zip ready for a Git repo."""
import os
import zipfile
import sys

ROOT = "/home/z/my-project"
OUT = "/home/z/my-project/download/zDescompiler.zip"

INCLUDE_TOP = {
    "src",
    "public",
    "prisma",
    "scripts",
    ".github",
    "package.json",
    "bun.lock",
    "next.config.ts",
    "tsconfig.json",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "components.json",
    "eslint.config.mjs",
    "Caddyfile",
    ".gitignore",
    "README.md",
}

SKIP_NAMES = {
    "node_modules",
    ".next",
    ".git",
    ".zscripts",
    "__pycache__",
    ".DS_Store",
    "dev.log",
    "server.log",
}
SKIP_EXT = {".log", ".pid"}
SKIP_FILES = {
    ".env",
    "next-env.d.ts",
    "package-lock.json",
}


def should_skip(path: str) -> bool:
    name = os.path.basename(path)
    if name in SKIP_NAMES:
        return True
    if name in SKIP_FILES:
        return True
    _, ext = os.path.splitext(name)
    if ext in SKIP_EXT:
        return True
    return False


def main() -> int:
    if os.path.exists(OUT):
        os.remove(OUT)

    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for entry in sorted(os.listdir(ROOT)):
            if entry not in INCLUDE_TOP:
                continue
            full = os.path.join(ROOT, entry)
            if os.path.isfile(full):
                if should_skip(full):
                    continue
                arc = os.path.join("zDescompiler", entry)
                z.write(full, arc)
                count += 1
            else:
                for dirpath, dirnames, filenames in os.walk(full, topdown=True):
                    dirnames[:] = [d for d in dirnames if not should_skip(os.path.join(dirpath, d))]
                    for fn in filenames:
                        fp = os.path.join(dirpath, fn)
                        if should_skip(fp):
                            continue
                        rel = os.path.relpath(fp, ROOT)
                        arc = os.path.join("zDescompiler", rel)
                        z.write(fp, arc)
                        count += 1

    size = os.path.getsize(OUT)
    print(f"\nCreated: {OUT}")
    print(f"Files included: {count}")
    print(f"Compressed size: {size:,} bytes ({size/1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
