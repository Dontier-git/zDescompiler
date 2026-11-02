/* ============================================================
   GuardX · Static analysis core
   Behavior masks, string inspection, API classification, finding
   helpers and scoring. The interprocedural flow engine lives in
   analysis-flow.js and uses these primitives.
   Exposes: GX.analysis
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});

  /* ---------------- behavior masks ---------------- */
  var B = {
    HTTP: 1,
    HTTP_WRITE: 2,
    HTTP_READ: 4,
    SOCKET: 8,
    SOCKET_WRITE: 16,
    SOCKET_READ: 32,
    EXEC: 64,
    FILE_READ: 128,
    FILE_WRITE: 256,
    FILE_PATH: 512,
    CLASS_LOAD: 1024,
    CLASSLOADER: 2048,
    REFLECT: 4096,
    CRYPTO: 8192,
    ENV: 16384,
    SERVER_INFO: 32768,
    ATTACH: 65536,
    NATIVE: 131072,
    CONFIG_READ: 262144,
    SENSITIVE: 524288,
    DYNAMIC: 1048576,
    DECODE: 2097152,
    UNSAFE: 4194304,
    INSTRUMENT: 8388608,
    PROXY: 16777216,
    ARCHIVE: 33554432,
    EXEC_SETUP: 67108864,
    CONFIG_WRITE: 134217728
  };

  var NETWORK = B.HTTP | B.SOCKET;
  var WRITE = B.HTTP_WRITE | B.SOCKET_WRITE;
  var READ = B.HTTP_READ | B.SOCKET_READ;
  var COLLECT = B.FILE_READ | B.CONFIG_READ | B.ENV | B.SERVER_INFO | B.SENSITIVE;

  var SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  var WEIGHTS = { critical: 30, high: 14, medium: 6, low: 2, info: 0 };
  var LEVEL_ORDER = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

  var KNOWN_LIBRARIES = [
    /^com\.google\./, /^com\.squareup\./, /^okhttp3\./, /^retrofit2\./,
    /^org\.apache\./, /^org\.jsoup\./, /^io\.netty\./, /^org\.yaml\./, /^com\.fasterxml\./,
    /^org\.slf4j\./, /^ch\.qos\./, /^org\.bstats\./, /^kotlin\./, /^org\.jetbrains\./,
    /^net\.kyori\./, /^org\.spongepowered\./, /^com\.mojang\./, /^org\.bukkit\./, /^net\.md_5\./,
    /^org\.json\./, /^com\.zaxxer\./, /^org\.h2\./, /^org\.sqlite\./, /^com\.mysql\./,
    /^org\.postgresql\./, /^redis\.clients\./, /^io\.lettuce\./, /^org\.mongodb\./, /^com\.rabbitmq\./,
    /^org\.objectweb\.asm\./, /^org\.ow2\.asm\./, /^javax\./, /^jakarta\./, /^jdk\./, /^sun\./
  ];

  var SUSPICIOUS_HOSTS = /(ngrok|transfer\.sh|webhook\.site|requestbin|pipedream|beeceptor|serveo|localtunnel|pastebin\.com|0x0\.st|file\.io|gofile|anonfiles|tmpfiles|termbin|interact\.sh|canarytokens|dnslog|oast\.|burpcollaborator|trycloudflare|loca\.lt|telebit|pagekite|serveo\.net|ngrok\.io)/i;

  /* ---------------- utilities ---------------- */

  function dot(s) { return String(s || "").replace(/\//g, "."); }

  function simpleName(className) {
    return String(className || "").split(".").pop();
  }

  function truncate(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function confidenceLabel(n) {
    if (n >= 85) return "Alta";
    if (n >= 65) return "Media";
    if (n >= 40) return "Baja";
    return "Muy baja";
  }

  function maxSeverity(a, b) {
    return (LEVEL_ORDER[a] || 0) >= (LEVEL_ORDER[b] || 0) ? a : b;
  }

  function isIp(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:]+\]$/i.test(host);
  }

  function isPrivateIp(host) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    var p = host.split(".").map(Number);
    return p[0] === 10 || p[0] === 127 ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 0);
  }

  function isLocalHost(host) {
    return /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\]|.*\.local)$/i.test(host) || isPrivateIp(host);
  }

  function hostTraits(host) {
    var h = String(host || "").toLowerCase();
    return {
      webhook: /(^|\.)discord(app)?\.com$/.test(h) || h === "api.telegram.org" || h === "hooks.slack.com",
      tunnel: SUSPICIOUS_HOSTS.test(h),
      ip: isIp(h),
      local: isLocalHost(h)
    };
  }

  function isWebhookUrl(url) {
    return /discord(app)?\.com\/api\/webhooks\//i.test(url) ||
      /api\.telegram\.org\/bot/i.test(url) ||
      /hooks\.slack\.com\/services\//i.test(url);
  }

  function describeDescriptor(desc) {
    var m = /^\((.*)\)/.exec(desc || "");
    if (!m) return "";
    var body = m[1];
    var out = [];
    var i = 0;
    while (i < body.length) {
      var arrays = 0;
      while (body[i] === "[") { arrays++; i++; }
      var c = body[i];
      if (c === "L") {
        var end = body.indexOf(";", i);
        if (end < 0) break;
        out.push(body.slice(i + 1, end).split("/").pop() + "[]".repeat(arrays));
        i = end + 1;
      } else {
        var map = { I: "int", J: "long", D: "double", F: "float", Z: "boolean", B: "byte", C: "char", S: "short" };
        out.push((map[c] || c || "?") + "[]".repeat(arrays));
        i++;
      }
    }
    return "(" + out.join(", ") + ")";
  }

  function methodDisplay(name, desc) {
    if (name === "<init>") return "constructor" + describeDescriptor(desc);
    if (name === "<clinit>") return "<clinit>";
    return name + describeDescriptor(desc);
  }

  function methodStartLine(m) {
    if (!m || !m.lineNumbers) return null;
    var min = Infinity;
    for (var k in m.lineNumbers) {
      if (Object.prototype.hasOwnProperty.call(m.lineNumbers, k)) {
        var n = m.lineNumbers[k];
        if (n < min) min = n;
      }
    }
    return isFinite(min) ? min : null;
  }

  /* ---------------- URL / string inspection ---------------- */

  var URL_RE = /\b(?:https?|wss?):\/\/[^\s"'<>\\`]+/gi;
  var BARE_HOOK_RE = /(?:discord(?:app)?\.com\/api\/webhooks\/[^\s"'<>\\]+|api\.telegram\.org\/bot[^\s"'<>\\]+|hooks\.slack\.com\/[^\s"'<>\\]+)/gi;
  var BARE_DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|dev|app|xyz|top|site|online|shop|club|info|me|co|ru|cn|tk|ml|ga|cf|gq|link|live|icu|tech|cloud|host|space|store|fun|website|pw|cc|ws|tv|us|uk|de|fr|es|br|mx|ar|cl|pl|nl|eu|jp|kr|in|ua|by|kz|su))\b(?::\d{2,5})?(\/[^\s"'<>\\]*)?/gi;
  var IP_RE = /\b(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?(\/[^\s"'<>\\]*)?/g;

  var SECRET_PATTERNS = [
    { id: "aws-key", label: "AWS Access Key", re: /\bAKIA[0-9A-Z]{16}\b/g, severity: "critical" },
    { id: "aws-secret", label: "AWS Secret Key", re: /\baws_secret_access_key\s*[=:]\s*["']?([A-Za-z0-9/+=]{30,60})/gi, severity: "critical", group: 1 },
    { id: "private-key", label: "Clave privada PEM", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, severity: "critical" },
    { id: "github-token", label: "Token GitHub", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, severity: "critical" },
    { id: "gitlab-token", label: "Token GitLab", re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, severity: "critical" },
    { id: "slack-token", label: "Token Slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, severity: "critical" },
    { id: "telegram-token", label: "Token de bot Telegram", re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g, severity: "critical" },
    { id: "google-api-key", label: "Google API Key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: "critical" },
    { id: "stripe-key", label: "Clave Stripe", re: /\bsk_live_[0-9A-Za-z]{16,}\b/g, severity: "critical" },
    { id: "sendgrid-key", label: "Clave SendGrid", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, severity: "critical" },
    { id: "jwt", label: "Token JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: "high" }
  ];

  var SECRET_MARKERS = /AKIA|PRIVATE KEY|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[baprs]-|aws_secret_access_key|AIza|sk_live_|SG\.|eyJ[A-Za-z0-9_-]{10,}\.|(\d{8,10}:[A-Za-z0-9_-]{35})/;

  function redact(value) {
    var s = String(value);
    if (s.length <= 12) return s.slice(0, 3) + "***";
    return s.slice(0, 6) + "…" + s.slice(-4);
  }

  function looksLikeExample(value) {
    return /example|demo|sample|dummy|placeholder|not.?a.?real|fake|test.?key|fixture/i.test(value);
  }

  function parseUrl(raw) {
    var s = String(raw || "").replace(/[.,;:!?)\]}]+$/, "");
    var m = /^(https?|wss?):\/\/(\[[0-9a-f:]+\]|[^\/?#:]+)(?::(\d{1,5}))?(\/[^?#]*)?/i.exec(s);
    if (!m) {
      m = /^\/\/(\[[0-9a-f:]+\]|[^\/?#:]+)(?::(\d{1,5}))?(\/[^?#]*)?/i.exec(s);
      if (m) m = [m[0], "http", m[1], m[2], m[3]];
      else return null;
    }
    var host = m[2].toLowerCase();
    if (!host) return null;
    if (!isLocalHost(host) && !isIp(host) && host.indexOf(".") === -1) return null;
    return {
      url: s,
      scheme: (m[1] || "").toLowerCase(),
      host: host,
      port: m[3] || null,
      path: m[4] || "/"
    };
  }

  var stringCache = new Map();
  var STRING_CACHE_MAX = 40000;

  function printableRatio(bytes) {
    if (!bytes.length) return 0;
    var ok = 0;
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) ok++;
    }
    return ok / bytes.length;
  }

  function classifyDecoded(bytes) {
    if (!bytes || bytes.length < 8) return null;
    var preview = "";
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return { kind: "zip", label: "Archivo ZIP/JAR", preview: "entrada comprimida de " + bytes.length + " bytes", interesting: true };
    }
    if (bytes.length >= 4 && bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) {
      return { kind: "class", label: "Clase Java compilada", preview: "class file de " + bytes.length + " bytes", interesting: true };
    }
    if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
      return { kind: "exe", label: "Ejecutable PE (MZ)", preview: "binario de " + bytes.length + " bytes", interesting: true };
    }
    if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
      return { kind: "elf", label: "Ejecutable ELF", preview: "binario de " + bytes.length + " bytes", interesting: true };
    }
    if (bytes.length >= 4 && (bytes[0] === 0xfe && bytes[1] === 0xed && bytes[2] === 0xfa) ||
        (bytes[0] === 0xcf && bytes[1] === 0xfa && bytes[2] === 0xed && bytes[3] === 0xfe)) {
      return { kind: "macho", label: "Ejecutable Mach-O", preview: "binario de " + bytes.length + " bytes", interesting: true };
    }
    if (printableRatio(bytes) >= 0.85) {
      var max = Math.min(bytes.length, 240);
      var text = "";
      for (var i = 0; i < max; i++) text += String.fromCharCode(bytes[i]);
      preview = text.replace(/\s+/g, " ").trim();
      var interesting = /https?:\/\/|wss?:\/\//i.test(text) ||
        /\b(cmd|powershell|bash|curl|wget|base64|chmod|chown)\b/i.test(text) ||
        /server\.properties|\.ssh|\.aws|token|password|secret/i.test(text);
      return { kind: "text", label: "Texto plano", preview: truncate(preview, 160), interesting: interesting };
    }
    return { kind: "binary", label: "Contenido binario", preview: bytes.length + " bytes", interesting: false };
  }

  function decodeBase64(value) {
    try {
      var s = String(value).replace(/\s+/g, "");
      if (s.length < 24 || s.length > 8192) return null;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
      if (s.length % 4 === 1) return null;
      while (s.length % 4) s += "=";
      var bin = (global.atob || atob)(s);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return classifyDecoded(bytes);
    } catch (e) { return null; }
  }

  function decodeHex(value) {
    try {
      var s = String(value).trim();
      if (s.length < 32 || s.length > 8192 || s.length % 2 !== 0) return null;
      if (!/^[0-9a-f]+$/i.test(s)) return null;
      var bytes = new Uint8Array(s.length / 2);
      for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.substr(i * 2, 2), 16);
      return classifyDecoded(bytes);
    } catch (e) { return null; }
  }

  function inspectString(value) {
    var cached = stringCache.get(value);
    if (cached) return cached;

    var info = {
      urls: [],
      secrets: [],
      decoded: [],
      sensitive: false,
      escapePath: false,
      command: false,
      base64: false,
      fragment: false,
      className: false
    };

    if (typeof value !== "string" || value.length < 4 || value.length > 8192) {
      if (stringCache.size < STRING_CACHE_MAX) stringCache.set(value, info);
      return info;
    }

    var lower = value.toLowerCase();
    var seen = Object.create(null);

    function addUrl(parsed, dynamic) {
      if (!parsed) return;
      var key = parsed.url + "|" + (dynamic ? "d" : "s");
      if (seen[key] || info.urls.length >= 8) return;
      seen[key] = 1;
      info.urls.push({
        url: parsed.url,
        host: parsed.host,
        scheme: parsed.scheme,
        port: parsed.port,
        path: parsed.path,
        dynamic: !!dynamic
      });
    }

    if (lower.indexOf("http") !== -1 || lower.indexOf("://") !== -1) {
      URL_RE.lastIndex = 0;
      var um;
      while ((um = URL_RE.exec(value)) !== null && info.urls.length < 8) {
        addUrl(parseUrl(um[0]), false);
        if (um.index === URL_RE.lastIndex) URL_RE.lastIndex++;
      }
    }

    BARE_HOOK_RE.lastIndex = 0;
    var hm;
    while ((hm = BARE_HOOK_RE.exec(value)) !== null && info.urls.length < 8) {
      addUrl(parseUrl("https://" + hm[0]), false);
      if (hm.index === BARE_HOOK_RE.lastIndex) BARE_HOOK_RE.lastIndex++;
    }

    if (!info.urls.length && (lower.indexOf(".com") !== -1 || lower.indexOf(".net") !== -1 ||
        lower.indexOf(".io") !== -1 || lower.indexOf(".org") !== -1 || lower.indexOf(".ru") !== -1)) {
      BARE_DOMAIN_RE.lastIndex = 0;
      var dm;
      while ((dm = BARE_DOMAIN_RE.exec(value)) !== null && info.urls.length < 5) {
        var domain = dm[1];
        var path = dm[2] || "";
        if (path || hostTraits(domain).webhook || hostTraits(domain).tunnel) {
          addUrl({ url: domain + (dm[0].slice(domain.length) || ""), scheme: "", host: domain.toLowerCase(), port: null, path: path || "/" }, false);
        }
        if (dm.index === BARE_DOMAIN_RE.lastIndex) BARE_DOMAIN_RE.lastIndex++;
      }
    }

    if (value.length <= 240 && /\d\.\d\.\d\.\d/.test(value)) {
      IP_RE.lastIndex = 0;
      var im;
      while ((im = IP_RE.exec(value)) !== null && info.urls.length < 8) {
        if (im[2] || im[3]) {
          var ipHost = im[1];
          addUrl({
            url: ipHost + (im[2] ? ":" + im[2] : "") + (im[3] || ""),
            scheme: "",
            host: ipHost,
            port: im[2] || null,
            path: im[3] || ""
          }, false);
        }
        if (im.index === IP_RE.lastIndex) IP_RE.lastIndex++;
      }
    }

    if (SECRET_MARKERS.test(value) && value.length <= 8192) {
      SECRET_PATTERNS.forEach(function (p) {
        var re = new RegExp(p.re.source, p.re.flags.indexOf("g") === -1 ? p.re.flags + "g" : p.re.flags);
        var m;
        var guard = 0;
        while ((m = re.exec(value)) !== null && guard++ < 6) {
          var raw = p.group ? m[p.group] : m[0];
          if (raw) {
            info.secrets.push({
              id: p.id,
              label: p.label,
              severity: p.severity,
              value: redact(raw),
              example: looksLikeExample(raw) || looksLikeExample(value)
            });
          }
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      });
    }

    var normalized = value.replace(/\\\\/g, "/").replace(/\\/g, "/");
    if (/(\.ssh|\.aws|\.gnupg|server\.properties|ops\.json|whitelist\.json|banned-(?:ips|players)\.json|usercache\.json|level\.dat|authorized_keys|id_rsa|\.env|credentials|\.git-credentials|\.npmrc|\.pypirc)/i.test(normalized)) {
      info.sensitive = true;
    }
    if (normalized.indexOf("../") !== -1 || /^[A-Za-z]:\//.test(normalized) ||
        /^\/(etc|home|root|opt|usr|var|tmp|proc)\//.test(normalized)) {
      info.escapePath = true;
    }

    if (/^(cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|bash|sh|zsh|curl|wget|chmod|chown|nc|ncat|socat|mshta|regsvr32|rundll32|bitsadmin|certutil|schtasks)$/i.test(value.trim()) ||
        /\b(?:cmd(?:\.exe)?|powershell|bash|sh)\s+(?:-c|\/c|-enc|-encodedcommand)\b/i.test(value) ||
        /\b(?:curl|wget)\s+[^|]+\|\s*(?:sh|bash)\b/i.test(value) ||
        /base64\s+(?:-d|--decode)/i.test(value) ||
        /certutil(?:\.exe)?\s+-decode/i.test(value) ||
        /chmod\s+\+x/i.test(value) ||
        /\b(?:nc|ncat|socat)\b.*\s-e\s/i.test(value)) {
      info.command = true;
    }

    if (value.length >= 24 && /^[A-Za-z0-9+/]{24,}={0,2}$/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value)) {
      info.base64 = true;
      var decoded = decodeBase64(value);
      if (decoded && decoded.interesting) info.decoded.push({ encoding: "base64", value: redact(value), kind: decoded.kind, label: decoded.label, preview: decoded.preview });
    }

    var hexDecoded = decodeHex(value);
    if (hexDecoded && hexDecoded.interesting) {
      info.decoded.push({ encoding: "hex", value: redact(value), kind: hexDecoded.kind, label: hexDecoded.label, preview: hexDecoded.preview });
    }

    // URL fragments used by string concatenation / StringBuilder
    if (/^(?:https?|wss?):\/\/?$/i.test(value) ||
        /^[a-z0-9.-]+\.[a-z]{2,}(?::\d{2,5})?$/i.test(value) ||
        /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,200}$/.test(value)) {
      info.fragment = true;
    }

    if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,}$/i.test(value) && value.length < 200) {
      info.className = true;
    }

    if (stringCache.size < STRING_CACHE_MAX) stringCache.set(value, info);
    return info;
  }

  /* ---------------- API classification ---------------- */

  var apiCache = Object.create(null);

  function httpOwner(owner) {
    return /^(java\.net\.URL$|java\.net\.(URLConnection|HttpURLConnection)$|javax\.net\.ssl\.(HttpsURLConnection|SSLSocket)$|java\.net\.http\.|okhttp3\.|com\.squareup\.okhttp3\.|org\.apache\.(http|hc)\.|org\.jsoup\.|io\.ktor\.|com\.mashape\.unirest\.|org\.asynchttpclient\.|reactor\.netty\.http\.|org\.eclipse\.jetty\.client\.)/.test(owner);
  }

  function classifyApi(ownerRaw, name) {
    var owner = dot(ownerRaw);
    var cacheKey = owner + "#" + name;
    if (apiCache[cacheKey]) return apiCache[cacheKey];

    var out = [];
    function add(cat, mask, api) {
      if (!mask) return;
      out.push({ category: cat, mask: mask, api: api || (owner + "." + name + "()") });
    }

    var isInit = name === "<init>" || name === "<clinit>";

    /* HTTP */
    if (owner === "java.net.URL") {
      if (name === "openConnection") add("HTTP", B.HTTP, "java.net.URL.openConnection()");
      if (name === "openStream") add("HTTP", B.HTTP | B.HTTP_READ, "java.net.URL.openStream()");
      if (name === "getContent") add("HTTP", B.HTTP | B.HTTP_READ, "java.net.URL.getContent()");
    } else if (/^java\.net\.(URLConnection|HttpURLConnection)$/.test(owner) || /^javax\.net\.ssl\.HttpsURLConnection$/.test(owner)) {
      if (name === "getOutputStream" || name === "setDoOutput" || name === "setChunkedStreamingMode") add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
      else if (name === "getInputStream" || name === "getContent" || name === "getContentLength" || name === "getHeaderField") add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (/^java\.net\.http\.HttpClient$/.test(owner)) {
      if (name === "send" || name === "sendAsync") add("HTTP", B.HTTP, "java.net.http.HttpClient." + name + "()");
      else add("HTTP", B.HTTP, "java.net.http.HttpClient." + name + "()");
    } else if (/^java\.net\.http\.HttpRequest\$Builder$/.test(owner)) {
      if (/^(POST|PUT|PATCH|DELETE)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_WRITE, "java.net.http.HttpRequest.Builder." + name + "()");
      else if (name === "method") add("HTTP", B.HTTP, "java.net.http.HttpRequest.Builder.method()");
      else add("HTTP", B.HTTP, "java.net.http.HttpRequest.Builder." + name + "()");
    } else if (/^java\.net\.http\.HttpRequest\$BodyPublishers$/.test(owner)) {
      add("HTTP", B.HTTP | B.HTTP_WRITE, "java.net.http.HttpRequest.BodyPublishers." + name + "()");
    } else if (/^java\.net\.http\.HttpResponse\$BodyHandlers$/.test(owner) || /^java\.net\.http\.HttpResponse$/.test(owner)) {
      add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
    } else if (/^java\.net\.http\.WebSocket/.test(owner)) {
      if (/^(sendText|sendBinary|sendPing|sendClose)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (/^okhttp3\.(OkHttpClient|OkHttpClient\$Builder|Call)$/.test(owner)) {
      if (/^(execute|enqueue|newCall)$/.test(name)) add("HTTP", B.HTTP, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (/^okhttp3\.Request\$Builder$/.test(owner)) {
      if (/^(post|put|patch|delete|method)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_WRITE, "okhttp3.Request.Builder." + name + "()");
      else add("HTTP", B.HTTP, "okhttp3.Request.Builder." + name + "()");
    } else if (/^okhttp3\.(RequestBody|MultipartBody|FormBody)/.test(owner)) {
      add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
    } else if (/^okhttp3\.(Response|ResponseBody)$/.test(owner)) {
      add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
    } else if (/^org\.apache\.(http|hc)\./.test(owner)) {
      if (isInit && /^(HttpGet|HttpHead)/.test(simpleName(owner))) add("HTTP", B.HTTP | B.HTTP_READ, owner + ".<init>");
      else if (isInit && /^(HttpPost|HttpPut|HttpPatch|HttpDelete|HttpEntityEnclosingRequestBase)/.test(simpleName(owner))) add("HTTP", B.HTTP | B.HTTP_WRITE, owner + ".<init>");
      else if (/^(setEntity|setHeader|addHeader)$/.test(name)) add("HTTP", name === "setEntity" ? B.HTTP | B.HTTP_WRITE : B.HTTP, owner + "." + name + "()");
      else if (/^(execute|executeOpen|prepareGet|preparePost)$/.test(name)) add("HTTP", /preparePost/.test(name) ? B.HTTP | B.HTTP_WRITE : B.HTTP, owner + "." + name + "()");
      else if (/^(toString|consume|toByteArray)$/.test(name) && /EntityUtils$/.test(owner)) add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (/^org\.jsoup\.(Jsoup|Connection)/.test(owner)) {
      if (name === "connect") add("HTTP", B.HTTP, "org.jsoup.Jsoup.connect()");
      else if (/^(get|execute|parse)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
      else if (/^(post|data)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (/^io\.ktor\./.test(owner)) {
      if (/^(post|put|patch|submitForm|submitFormWithBinaryData)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
      else if (/^(get|request|bodyAsText|body|readBytes|readText)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (/^com\.mashape\.unirest\./.test(owner)) {
      if (/^(post|put|patch)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
      else if (/^(get|asString|asBytes|asJson)$/.test(name)) add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
      else add("HTTP", B.HTTP, owner + "." + name + "()");
    } else if (httpOwner(owner)) {
      if (/^(getOutputStream|setDoOutput|setEntity|setRequestBody|POST|PUT|PATCH|post|put|patch|body|create|sendText|sendBinary)$/.test(name)) {
        add("HTTP", B.HTTP | B.HTTP_WRITE, owner + "." + name + "()");
      } else if (/^(getInputStream|getContent|openStream|read|execute|get|asString|asBytes|string|bytes|bodyAsText)$/.test(name)) {
        add("HTTP", B.HTTP | B.HTTP_READ, owner + "." + name + "()");
      } else {
        add("HTTP", B.HTTP, owner + "." + name + "()");
      }
    }

    /* Sockets and channels */
    if (/^java\.net\.(Socket|ServerSocket|DatagramSocket|MulticastSocket)$/.test(owner) ||
        /^javax\.net\.ssl\.SSLSocket$/.test(owner) ||
        /^java\.nio\.channels\.(SocketChannel|ServerSocketChannel|DatagramChannel|AsynchronousSocketChannel)$/.test(owner)) {
      if (name === "getOutputStream" || name === "send" || name === "write") add("Socket", B.SOCKET | B.SOCKET_WRITE, owner + "." + name + "()");
      else if (name === "getInputStream" || name === "receive" || name === "read") add("Socket", B.SOCKET | B.SOCKET_READ, owner + "." + name + "()");
      else add("Socket", B.SOCKET, owner + "." + name + "()");
    }

    /* Process execution */
    if (owner === "java.lang.Runtime" && name === "exec") add("Ejecución", B.EXEC, "java.lang.Runtime.exec()");
    if (owner === "java.lang.ProcessBuilder") {
      if (name === "start") add("Ejecución", B.EXEC, "java.lang.ProcessBuilder.start()");
      else if (isInit || /^(command|directory|inheritIO|redirectOutput|redirectError)$/.test(name)) add("Ejecución", B.EXEC_SETUP, "java.lang.ProcessBuilder" + (isInit ? ".<init>" : "." + name) + "()");
    }
    if (owner === "java.lang.ProcessHandle" && /^(of|current|info|destroy|onExit)$/.test(name)) add("Ejecución", B.EXEC, owner + "." + name + "()");
    if (owner === "javax.script.ScriptEngine" && name === "eval") add("Ejecución", B.EXEC, "javax.script.ScriptEngine.eval()");
    if (owner === "javax.script.ScriptEngineManager" && isInit) add("Ejecución", B.EXEC_SETUP, "javax.script.ScriptEngineManager.<init>");

    /* Files */
    if (/^java\.io\.(FileInputStream|FileReader)$/.test(owner) && isInit) add("Archivos", B.FILE_READ, owner + ".<init>");
    if (/^java\.io\.(FileOutputStream|FileWriter)$/.test(owner) && isInit) add("Archivos", B.FILE_WRITE, owner + ".<init>");
    if (owner === "java.io.RandomAccessFile" && isInit) add("Archivos", B.FILE_READ | B.FILE_WRITE, "java.io.RandomAccessFile.<init>");
    if (owner === "java.io.File" && isInit) add("Archivos", B.FILE_PATH, "java.io.File.<init>");
    if (owner === "java.io.File" && /^(list|listFiles|walk|toPath|exists|canRead|length|getAbsolutePath|getCanonicalPath)$/.test(name)) add("Archivos", B.FILE_READ | B.FILE_PATH, "java.io.File." + name + "()");
    if (owner === "java.io.File" && /^(delete|deleteOnExit|mkdir|mkdirs|createNewFile|renameTo|setWritable)$/.test(name)) add("Archivos", B.FILE_WRITE, "java.io.File." + name + "()");
    if (owner === "java.nio.file.Paths" && (name === "get" || isInit)) add("Archivos", B.FILE_PATH, "java.nio.file.Paths.get()");
    if (owner === "java.nio.file.Path" && /^(of|toAbsolutePath|resolve|normalize|toRealPath)$/.test(name)) add("Archivos", B.FILE_PATH, "java.nio.file.Path." + name + "()");
    if (owner === "java.nio.file.Files") {
      if (/^(readAllBytes|readString|readAllLines|lines|newInputStream|newBufferedReader|walk|walkFileTree|list|find|size|getLastModifiedTime)$/.test(name)) add("Archivos", B.FILE_READ, "java.nio.file.Files." + name + "()");
      else if (/^(write|writeString|newOutputStream|newBufferedWriter|delete|deleteIfExists|move|createDirectories|createFile|copy)$/.test(name)) add("Archivos", B.FILE_WRITE | (name === "copy" ? B.FILE_READ : 0), "java.nio.file.Files." + name + "()");
    }
    if (owner === "java.nio.channels.FileChannel" && name === "open") add("Archivos", B.FILE_READ | B.FILE_WRITE, "java.nio.channels.FileChannel.open()");
    if (owner === "java.nio.channels.FileChannel" && name === "read") add("Archivos", B.FILE_READ, "java.nio.channels.FileChannel.read()");
    if (owner === "java.nio.channels.FileChannel" && name === "write") add("Archivos", B.FILE_WRITE, "java.nio.channels.FileChannel.write()");
    if (/^java\.util\.(Properties|PropertyResourceBundle)$/.test(owner) && name === "load") add("Configuración", B.CONFIG_READ | B.FILE_READ, owner + ".load()");
    if (owner === "java.util.Properties" && name === "store") add("Configuración", B.CONFIG_WRITE | B.FILE_WRITE, "java.util.Properties.store()");
    if (/^org\.bukkit\.configuration\.file\.(YamlConfiguration|FileConfiguration)$/.test(owner)) {
      if (name === "load" || name === "loadFromString") add("Configuración", B.CONFIG_READ | (name === "load" ? B.FILE_READ : 0), owner + "." + name + "()");
      if (name === "save") add("Configuración", B.CONFIG_WRITE | B.FILE_WRITE, owner + ".save()");
    }
    if (/^org\.bukkit\.configuration\.ConfigurationSection$/.test(owner)) {
      if (/^get/.test(name)) add("Configuración", B.CONFIG_READ, owner + "." + name + "()");
      if (/^set/.test(name)) add("Configuración", B.CONFIG_WRITE, owner + "." + name + "()");
    }
    if (/^(org\.bukkit\.plugin\.java\.JavaPlugin|org\.bukkit\.plugin\.Plugin)$/.test(owner)) {
      if (name === "getConfig") add("Configuración", B.CONFIG_READ, owner + ".getConfig()");
      if (name === "getDataFolder") add("Archivos", B.FILE_PATH, owner + ".getDataFolder()");
      if (/^(saveResource|saveDefaultConfig)$/.test(name)) add("Archivos", B.FILE_WRITE, owner + "." + name + "()");
      if (name === "getResource" || name === "getTextResource") add("Archivos", B.FILE_READ, owner + "." + name + "()");
    }
    if (/^java\.util\.zip\.(ZipFile|ZipInputStream|JarInputStream)$/.test(owner) || /^java\.util\.jar\.JarFile$/.test(owner)) {
      add("Archivos", B.ARCHIVE | B.FILE_READ, owner + (isInit ? ".<init>" : "." + name) + "()");
    }
    if (/^java\.util\.zip\.ZipOutputStream$/.test(owner)) add("Archivos", B.ARCHIVE | B.FILE_WRITE, owner + (isInit ? ".<init>" : "." + name) + "()");

    /* Environment / server information */
    if (owner === "java.lang.System" && /^(getenv|getProperties|getProperty)$/.test(name)) add("Entorno", B.ENV, "java.lang.System." + name + "()");
    if (owner === "java.lang.Runtime" && /^(availableProcessors|freeMemory|totalMemory|maxMemory)$/.test(name)) add("Entorno", B.ENV, "java.lang.Runtime." + name + "()");
    if (owner === "java.net.InetAddress" && /^(getLocalHost|getHostName|getCanonicalHostName|getAllByName|getByName)$/.test(name)) add("Entorno", B.ENV | B.SERVER_INFO, "java.net.InetAddress." + name + "()");
    if (owner === "java.net.NetworkInterface" && /^(getNetworkInterfaces|getByInetAddress|getHardwareAddress|getDisplayName)$/.test(name)) add("Entorno", B.ENV, "java.net.NetworkInterface." + name + "()");
    if (/^java\.lang\.management\./.test(owner)) add("Entorno", B.ENV, owner + "." + name + "()");
    if (/^org\.bukkit\.Bukkit$/.test(owner) && /^(getServer|getOnlinePlayers|getIp|getPort|getVersion|getBukkitVersion|getMotd|getOperators|getWhitelistedPlayers|getBannedPlayers|getWorldContainer|getName|getLogger)$/.test(name)) {
      add("Información del servidor", B.SERVER_INFO, "org.bukkit.Bukkit." + name + "()");
    }
    if (/^org\.bukkit\.Server$/.test(owner) &&
        /^(getIp|getPort|getVersion|getBukkitVersion|getMotd|getOnlinePlayers|getOperators|getWhitelistedPlayers|getBannedPlayers|getWorldContainer|getPlugins|getName|getServerName)$/.test(name)) {
      add("Información del servidor", B.SERVER_INFO, "org.bukkit.Server." + name + "()");
    }
    if (/^org\.bukkit\.entity\.(Player|HumanEntity|OfflinePlayer)$/.test(owner) &&
        /^(getAddress|getUniqueId|getName|getLocation|getGameMode|getDisplayName|getPlayerListName|getFirstPlayed|getLastPlayed)$/.test(name)) {
      add("Información de jugadores", B.SERVER_INFO, owner + "." + name + "()");
    }
    if (/^org\.bukkit\.World$/.test(owner) && /^(getWorldFolder|getName|getUID|getSpawnLocation)$/.test(name)) {
      add("Información del servidor", B.SERVER_INFO, owner + "." + name + "()");
    }

    /* Dynamic class loading */
    if (owner === "java.lang.Class" && name === "forName") add("Carga dinámica", B.CLASS_LOAD, "java.lang.Class.forName()");
    if (/^(java\.lang\.ClassLoader|java\.security\.SecureClassLoader)$/.test(owner)) {
      if (/^(loadClass|defineClass)$/.test(name)) {
        add("Carga dinámica", name === "defineClass" ? B.CLASSLOADER : B.CLASS_LOAD, owner + "." + name + "()");
      }
    }
    if (owner === "java.net.URLClassLoader") add("Carga dinámica", B.CLASSLOADER, "java.net.URLClassLoader" + (isInit ? ".<init>" : "." + name) + "()");
    if (owner === "java.lang.invoke.MethodHandles$Lookup" && /^(defineClass|defineHiddenClass|defineAnonymousClass)$/.test(name)) add("Carga dinámica", B.CLASSLOADER, "MethodHandles.Lookup." + name + "()");
    if (owner === "java.util.ServiceLoader" && name === "load") add("Carga dinámica", B.CLASS_LOAD, "java.util.ServiceLoader.load()");
    if (/^sun\.misc\.Unsafe$/.test(owner) || /^jdk\.internal\.misc\.Unsafe$/.test(owner)) {
      if (/^(defineClass|defineAnonymousClass|allocateInstance|objectFieldOffset)$/.test(name)) add("Unsafe", B.UNSAFE, owner + "." + name + "()");
    }
    if (/^java\.lang\.instrument\.(Instrumentation|ClassFileTransformer)$/.test(owner)) add("Agente JVM", B.INSTRUMENT | B.ATTACH, owner + "." + name + "()");

    /* Reflection */
    if (owner === "java.lang.Class" && /^(getMethod|getDeclaredMethod|getField|getDeclaredField|getConstructor|getDeclaredConstructor|getMethods|getDeclaredMethods|getFields|getDeclaredFields|getConstructors|getDeclaredConstructors|newInstance|getClassLoader)$/.test(name)) {
      add("Reflexión", B.REFLECT, "java.lang.Class." + name + "()");
    }
    if (owner === "java.lang.reflect.AccessibleObject" && name === "setAccessible") add("Reflexión", B.REFLECT, "AccessibleObject.setAccessible()");
    if (owner === "java.lang.reflect.Method" && /^(invoke|setAccessible)$/.test(name)) add("Reflexión", B.REFLECT, "java.lang.reflect.Method." + name + "()");
    if (owner === "java.lang.reflect.Field" && /^(get|set|setAccessible)$/.test(name)) add("Reflexión", B.REFLECT, "java.lang.reflect.Field." + name + "()");
    if (owner === "java.lang.reflect.Constructor" && /^(newInstance|setAccessible)$/.test(name)) add("Reflexión", B.REFLECT, "java.lang.reflect.Constructor." + name + "()");
    if (/^java\.lang\.invoke\./.test(owner)) add("Reflexión", B.REFLECT, owner + "." + name + "()");
    if (owner === "java.lang.reflect.Proxy" && name === "newProxyInstance") add("Reflexión", B.PROXY | B.REFLECT, "java.lang.reflect.Proxy.newProxyInstance()");

    /* Crypto / encoding */
    if (owner === "javax.crypto.Cipher" && /^(init|doFinal|update|getInstance)$/.test(name)) add("Criptografía", B.CRYPTO, "javax.crypto.Cipher." + name + "()");
    if (/^javax\.crypto\.(spec\.|Mac$)/.test(owner)) add("Criptografía", B.CRYPTO, owner + "." + name + "()");
    if (/^java\.util\.Base64(\$Decoder|\$Encoder)?$/.test(owner)) {
      if (name === "decode" || /Decoder/.test(owner)) add("Criptografía", B.CRYPTO | B.DECODE, owner + "." + name + "()");
      else add("Criptografía", B.CRYPTO, owner + "." + name + "()");
    }
    if (owner === "java.security.MessageDigest" && /^(digest|getInstance)$/.test(name)) add("Criptografía", B.CRYPTO, "java.security.MessageDigest." + name + "()");
    if (/^java\.security\.(Signature|KeyGenerator|KeyPairGenerator|SecureRandom)$/.test(owner)) add("Criptografía", B.CRYPTO, owner + "." + name + "()");

    /* JVM attach / agents */
    if (/^com\.sun\.tools\.attach\./.test(owner) || /^sun\.tools\.attach\./.test(owner) || /^com\.sun\.tools\.attach\.VirtualMachine$/.test(owner)) {
      add("Agente JVM", B.ATTACH, owner + "." + name + "()");
    }

    /* Native libraries */
    if (owner === "java.lang.System" && /^(load|loadLibrary)$/.test(name)) add("Nativo", B.NATIVE, "java.lang.System." + name + "()");
    if (owner === "java.lang.Runtime" && /^(load|loadLibrary)$/.test(name)) add("Nativo", B.NATIVE, "java.lang.Runtime." + name + "()");

    apiCache[cacheKey] = out;
    return out;
  }

  /* ---------------- findings helpers ---------------- */

  function newFinding(id, title, severity, category, opts) {
    opts = opts || {};
    return {
      id: id,
      title: title,
      severity: severity,
      category: category,
      description: opts.description || "",
      reason: opts.reason || "",
      confidence: opts.confidence == null ? 70 : opts.confidence,
      confidenceLabel: confidenceLabel(opts.confidence == null ? 70 : opts.confidence),
      class: opts.className || null,
      method: opts.method || null,
      line: opts.line || null,
      offset: opts.offset || null,
      api: opts.api || null,
      endpoint: opts.endpoint || null,
      endpoints: opts.endpoints || [],
      evidence: opts.evidence || [],
      chain: opts.chain || [],
      locations: opts.locations || [],
      dependency: !!opts.dependency,
      library: opts.library || null,
      archive: opts.archive || null,
      nested: !!opts.archive,
      flow: opts.flow || null,
      falsePositives: opts.falsePositives || [],
      recommendation: opts.recommendation || "",
      source: opts.source || null,
      dedupeKey: opts.dedupeKey || null
    };
  }

  function mergeFinding(existing, incoming) {
    existing.severity = (SEVERITY_ORDER[incoming.severity] < SEVERITY_ORDER[existing.severity]) ? incoming.severity : existing.severity;
    existing.confidence = Math.max(existing.confidence, incoming.confidence);
    existing.confidenceLabel = confidenceLabel(existing.confidence);
    incoming.evidence.forEach(function (e) {
      if (existing.evidence.length < 16 && existing.evidence.indexOf(e) === -1) existing.evidence.push(e);
    });
    incoming.locations.forEach(function (loc) {
      var dup = existing.locations.some(function (l) {
        return l.className === loc.className && l.method === loc.method && l.source === loc.source && l.archive === loc.archive;
      });
      if (!dup && existing.locations.length < 20) existing.locations.push(loc);
    });
    // If the same content appears in the root and in a nested archive, the
    // container field must not claim only one of them. Keep the list of
    // locations as the source of truth and note every container.
    var containers = Object.create(null);
    existing.locations.forEach(function (l) { containers[l.archive || ""] = 1; });
    incoming.locations.forEach(function (l) { containers[l.archive || ""] = 1; });
    var containerKeys = Object.keys(containers);
    if (containerKeys.length > 1) {
      existing.archive = null;
      var where = "Presente en: " + containerKeys.map(function (k) { return k || "raíz"; }).join(", ");
      if (existing.evidence.length < 16 && existing.evidence.indexOf(where) === -1) existing.evidence.push(where);
    } else if (!existing.archive && incoming.archive) {
      existing.archive = incoming.archive;
    }
    incoming.endpoints.forEach(function (ep) {
      if (existing.endpoints.length < 20 && !existing.endpoints.some(function (e) { return e.url === ep.url; })) {
        existing.endpoints.push(ep);
      }
    });
    if (!existing.chain.length && incoming.chain.length) existing.chain = incoming.chain;
    if (!existing.dependency && incoming.dependency) existing.dependency = true;
    if (!existing.library && incoming.library) existing.library = incoming.library;
    if (!existing.api && incoming.api) existing.api = incoming.api;
    if (!existing.flow && incoming.flow) existing.flow = incoming.flow;
  }

  /* ---------------- scoring ---------------- */

  function scoreFindings(findings) {
    var counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    var score = 0;
    var strongCritical = false;

    findings.forEach(function (f) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
      var conf = f.confidence == null ? 65 : f.confidence;
      var factor = 0.55 + Math.min(100, conf) / 220;
      score += (WEIGHTS[f.severity] || 0) * factor;
      if (f.severity === "critical" && conf >= 65) strongCritical = true;
    });

    if (counts.critical >= 2) score += 6;
    if (counts.critical + counts.high >= 5) score += 5;
    score = Math.min(100, Math.round(score));

    var level;
    if (strongCritical || score >= 70) level = "critical";
    else if (score >= 45) level = "high";
    else if (score >= 20) level = "medium";
    else if (score > 0) level = "low";
    else level = "clean";

    findings.sort(function (a, b) {
      var d = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (d !== 0) return d;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.title.localeCompare(b.title, "es");
    });

    return { findings: findings, counts: counts, score: score, level: level };
  }

  GX.analysis = {
    B: B,
    NETWORK: NETWORK,
    WRITE: WRITE,
    READ: READ,
    COLLECT: COLLECT,
    SEVERITY_ORDER: SEVERITY_ORDER,
    WEIGHTS: WEIGHTS,
    LEVEL_ORDER: LEVEL_ORDER,
    KNOWN_LIBRARIES: KNOWN_LIBRARIES,
    dot: dot,
    simpleName: simpleName,
    truncate: truncate,
    confidenceLabel: confidenceLabel,
    maxSeverity: maxSeverity,
    isIp: isIp,
    isPrivateIp: isPrivateIp,
    isLocalHost: isLocalHost,
    hostTraits: hostTraits,
    isWebhookUrl: isWebhookUrl,
    describeDescriptor: describeDescriptor,
    methodDisplay: methodDisplay,
    methodStartLine: methodStartLine,
    inspectString: inspectString,
    classifyApi: classifyApi,
    newFinding: newFinding,
    mergeFinding: mergeFinding,
    scoreFindings: scoreFindings
  };
})(window);
