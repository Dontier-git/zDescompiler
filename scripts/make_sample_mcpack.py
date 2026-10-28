#!/usr/bin/env python3
"""Create a sample .mcpack (ZIP) file for testing zDescompiler extraction."""
import zipfile
import json
import os

OUT = "/home/z/my-project/download/sample.mcpack"

manifest = {
    "format_version": 2,
    "header": {
        "name": "Sample Pack",
        "description": "A test resource pack for zDescompiler",
        "uuid": "8f2a9c1d-1234-4abc-9876-abcdef012345",
        "version": [1, 0, 0],
        "min_engine_version": [1, 20, 0],
    },
    "modules": [
        {
            "type": "resources",
            "uuid": "9b3a1c2d-5678-4def-a9b0-123456789abc",
            "version": [1, 0, 0],
        }
    ],
}

pack_meta = {
    "pack": {
        "pack_format": 15,
        "description": "Sample pack for testing zDescompiler",
    }
}

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("manifest.json", json.dumps(manifest, indent=2))
    z.writestr("pack.mcmeta", json.dumps(pack_meta, indent=2))
    z.writestr(
        "textures/terrain_texture.json",
        json.dumps(
            {
                "resource_pack_name": "sample",
                "texture_name": "atlas.terrain",
                "padding": 8,
                "num_mip_levels": 4,
                "texture_data": {
                    "grass": {"textures": "textures/blocks/grass"},
                    "dirt": {"textures": "textures/blocks/dirt"},
                },
            },
            indent=2,
        ),
    )
    z.writestr(
        "texts/en_US.lang",
        "pack.name=Sample Pack\npack.description=A test resource pack for zDescompiler\n",
    )
    # Tiny 1x1 PNG (grayscale, valid header)
    png_bytes = bytes(
        [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1
            0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B, 0x55,
            0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,  # IDAT
            0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
            0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ]
    )
    z.writestr("pack.png", png_bytes)
    z.writestr("pack_icon.png", png_bytes)

print(f"Created {OUT} ({os.path.getsize(OUT)} bytes)")
