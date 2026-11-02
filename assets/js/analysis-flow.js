/* ============================================================
   GuardX · Interprocedural flow engine
   Builds call edges through the class hierarchy, lambdas and
   unique signatures, then correlates collection, network writes,
   execution, loading, archives and endpoints.
   Exposes: GX.analysis.analyze
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});
  var A = GX.analysis;
  var B = A.B;
  var NETWORK = A.NETWORK;
  var WRITE = A.WRITE;
  var READ = A.READ;
  var COLLECT = A.COLLECT;

  function analyze(model) {
    var t0 = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    var classes = model.classes || [];
    var textFiles = model.textFiles || Object.create(null);
    var entries = model.entries || [];
    var meta = model.meta || {};
    var coverage = model.coverage || {};

    var mainPrefix = "";
    if (meta.main && meta.main.indexOf(".") !== -1) {
      var mainParts = meta.main.split(".");
      mainParts.pop();
      mainPrefix = mainParts.slice(0, 2).join(".");
    }

    function locate(className, archive) {
      var lib = null;
      for (var i = 0; i < A.KNOWN_LIBRARIES.length; i++) {
        if (A.KNOWN_LIBRARIES[i].test(className)) {
          lib = className.split(".").slice(0, 2).join(".");
          break;
        }
      }
      if (!lib && /\.(libs|shaded|relocated)\./i.test(className)) {
        lib = className.split(".").slice(0, 4).join(".");
      }
      var dependency = !!lib;
      var external = !!mainPrefix && className.indexOf(mainPrefix + ".") !== 0;
      return {
        className: className,
        dependency: dependency,
        library: lib,
        external: external,
        nested: !!archive,
        archive: archive || null,
        packageName: className.split(".").slice(0, -1).join(".")
      };
    }

    function locationFor(ctx, line, offset) {
      var loc = locate(ctx.className, ctx.archive);
      loc.method = ctx.display;
      loc.line = line == null ? ctx.startLine : line;
      loc.offset = offset == null ? null : offset;
      loc.source = ctx.uid;
      return loc;
    }

    /* ---- indexes ---- */
    var classInstances = Object.create(null);
    var methodIndex = Object.create(null);
    var methodBySig = Object.create(null);
    var methodCount = 0;

    classes.forEach(function (cl) {
      if (!cl.className || !cl.methods) return;
      cl.uid = cl.uid || cl.name || cl.className;
      cl.archive = cl.archive || "";
      cl.depth = cl.depth || 0;
      // Two copies of the same class (same bytes) in different archives are
      // real, but presenting them as separate findings doubles the noise.
      // Findings merge by content fingerprint while keeping both locations.
      cl.dupKey = cl.className + "|" + (cl.entrySize || 0) + "|" + (cl.crc == null ? "" : (cl.crc >>> 0));
      (classInstances[cl.className] || (classInstances[cl.className] = [])).push(cl);
      cl.methods.forEach(function (m) {
        var key = cl.uid + "|" + m.name + m.descriptor;
        var ctx0 = { key: key, uid: cl.uid, cl: cl, className: cl.className, archive: cl.archive, method: m };
        methodIndex[key] = ctx0;
        var sig = m.name + m.descriptor;
        (methodBySig[sig] || (methodBySig[sig] = [])).push(ctx0);
        methodCount++;
      });
    });

    function classCandidates(owner, ctx) {
      var list = classInstances[owner] || [];
      if (!list.length) return [];
      var same = [];
      var other = [];
      for (var i = 0; i < list.length; i++) {
        if (ctx && list[i].archive === ctx.archive) same.push(list[i]);
        else other.push(list[i]);
      }
      return same.concat(other);
    }

    function methodIn(cl, name, desc) {
      return methodIndex[cl.uid + "|" + name + desc] || null;
    }

    function walkHierarchy(cl, name, desc, ctx, out, seen, depth) {
      if (!cl || depth > 12 || seen[cl.uid]) return;
      seen[cl.uid] = 1;
      var parents = [];
      if (cl.superName) parents.push(cl.superName);
      (cl.interfaces || []).forEach(function (i) { parents.push(i); });
      for (var p = 0; p < parents.length; p++) {
        var candidates = classCandidates(parents[p], ctx);
        for (var c = 0; c < candidates.length; c++) {
          var found = methodIn(candidates[c], name, desc);
          if (found && !out.some(function (o) { return o.key === found.key; })) out.push(found);
          walkHierarchy(candidates[c], name, desc, ctx, out, seen, depth + 1);
        }
      }
    }

    var implCache = Object.create(null);
    function implementationsOf(owner, name, desc, ctx) {
      var cacheKey = owner + "|" + name + desc + "|" + (ctx.archive || "");
      if (implCache[cacheKey]) return implCache[cacheKey];
      var out = [];
      var ownerClasses = classInstances[owner] || [];
      var ownerIsInterface = ownerClasses.some(function (c) { return c.isInterface; });
      if (!ownerIsInterface && !ownerClasses.length) {
        implCache[cacheKey] = out;
        return out;
      }
      classes.forEach(function (cl) {
        if (!cl.className || cl.className === owner) return;
        if (ctx && cl.archive !== ctx.archive && out.length) return;
        var matches = false;
        if ((cl.interfaces || []).indexOf(owner) !== -1) matches = true;
        if (!matches) {
          var seen = Object.create(null);
          var cur = cl;
          var guard = 0;
          while (cur && cur.superName && guard++ < 12) {
            if (seen[cur.superName]) break;
            seen[cur.superName] = 1;
            var supers = classCandidates(cur.superName, ctx);
            if (!supers.length) break;
            cur = supers[0];
            if ((cur.interfaces || []).indexOf(owner) !== -1) { matches = true; break; }
          }
        }
        if (!matches) return;
        var found = methodIn(cl, name, desc);
        if (found) out.push(found);
      });
      implCache[cacheKey] = out;
      return out;
    }

    function resolveCallTargets(cp, ctx) {
      if (!cp || !cp.owner || !cp.name) return [];
      var desc = cp.descriptor || "";
      var out = [];
      var candidates = classCandidates(cp.owner, ctx);
      var seen = Object.create(null);

      for (var i = 0; i < candidates.length; i++) {
        var found = methodIn(candidates[i], cp.name, desc);
        if (found && !seen[found.key]) { seen[found.key] = 1; out.push(found); }
      }

      if (!out.length) {
        var hseen = Object.create(null);
        for (var h = 0; h < candidates.length; h++) {
          walkHierarchy(candidates[h], cp.name, desc, ctx, out, hseen, 0);
        }
      }

      if (!out.length) {
        var global = methodBySig[cp.name + desc] || [];
        if (global.length === 1) {
          out.push(global[0]);
        } else if (global.length > 1) {
          var impls = implementationsOf(cp.owner, cp.name, desc, ctx);
          if (impls.length && impls.length <= 4) out = impls;
        }
      }

      // Unique by method key.
      var unique = [];
      out.forEach(function (o) { if (!seen[o.key]) { seen[o.key] = 1; if (o) unique.push(o); } });
      return unique;
    }

    /* ---- method line lookup (lineNumbers is a plain map) ---- */
    function lineAt(method, offset) {
      var numbers = method && method.lineNumbers;
      if (!numbers || offset == null) return null;
      var best = null;
      var bestOffset = -1;
      for (var key in numbers) {
        if (!Object.prototype.hasOwnProperty.call(numbers, key)) continue;
        var at = Number(key);
        if (at <= offset && at > bestOffset) {
          bestOffset = at;
          best = numbers[key];
        }
      }
      return best;
    }

    /* ---- scan methods ---- */
    var contexts = [];
    var classStats = Object.create(null);

    function addCall(ctx, target, cp, line, offset) {
      if (!target || !target.key) return;
      if (ctx.callKeys[target.key]) return;
      ctx.callKeys[target.key] = 1;
      ctx.calls.push({ key: target.key, owner: cp.owner, name: cp.name, line: line, offset: offset });
    }

    function classifyAndAdd(ctx, owner, name, line, offset, stats) {
      var apis = A.classifyApi(owner, name);
      for (var ai = 0; ai < apis.length; ai++) {
        var api = apis[ai];
        var apiKey = api.api + "|" + api.mask;
        if (ctx.apiKeys[apiKey]) continue;
        ctx.apiKeys[apiKey] = 1;
        ctx.apis.push({ category: api.category, api: api.api, mask: api.mask, line: line, offset: offset });
        ctx.mask |= api.mask;
        stats.apiCounts[api.api] = (stats.apiCounts[api.api] || 0) + 1;
      }
    }

    function addEndpoint(ctx, u, line, offset, sourceType, field) {
      if (!u || !u.host) return;
      var key = u.url + "|" + (u.dynamic ? "d" : "s") + "|" + (field || "");
      if (ctx.endpointKeys[key]) return;
      ctx.endpointKeys[key] = 1;
      if (ctx.endpoints.length >= 80) return;
      var traits = A.hostTraits(u.host);
      ctx.endpoints.push({
        url: u.url,
        host: u.host,
        scheme: u.scheme || "",
        port: u.port || null,
        path: u.path || "/",
        dynamic: !!u.dynamic,
        line: line,
        offset: offset == null ? null : offset,
        className: ctx.className,
        method: ctx.display,
        methodName: ctx.name,
        api: null,
        usage: "no-api",
        source: ctx.uid,
        archive: ctx.archive || null,
        field: field || null,
        sourceType: sourceType || "bytecode",
        local: traits.local,
        webhook: traits.webhook,
        tunnel: traits.tunnel,
        ip: traits.ip
      });
    }

    function handleString(ctx, value, line, offset, stats) {
      if (typeof value !== "string") return;
      if (ctx.strings.length < 900) ctx.strings.push({ value: value, line: line, offset: offset });
      if (stats.strings < 5000) stats.strings++;

      var info = A.inspectString(value);
      info.urls.forEach(function (u) { addEndpoint(ctx, u, line, offset, "bytecode"); });

      if (info.sensitive) {
        ctx.mask |= B.SENSITIVE;
        ctx.sensitive = true;
        if (ctx.paths.length < 30) ctx.paths.push(A.truncate(value, 160));
      }
      if (info.escapePath) {
        ctx.escapePath = true;
        if (ctx.paths.length < 30) ctx.paths.push(A.truncate(value, 160));
      }
      if (info.command) {
        ctx.commands.push(A.truncate(value, 180));
        if (stats.commands.length < 12) stats.commands.push(A.truncate(value, 180));
        if (/\b(curl|wget)\b/i.test(value) && /(https?:\/\/|wss?:\/\/)/i.test(value)) {
          ctx.mask |= B.HTTP | B.HTTP_READ;
        }
      }
      if (info.base64) {
        ctx.base64++;
        stats.base64++;
      }
      if (info.decoded && info.decoded.length) {
        ctx.mask |= B.DECODE;
        info.decoded.forEach(function (d) {
          if (ctx.decoded.length >= 10) return;
          if (ctx.decoded.some(function (x) { return x.kind === d.kind && x.preview === d.preview && x.encoding === d.encoding; })) return;
          ctx.decoded.push({ encoding: d.encoding, kind: d.kind, label: d.label, preview: d.preview, value: d.value, line: line, offset: offset });
          stats.decoded++;
        });
      }
      info.secrets.forEach(function (s) {
        if (ctx.secrets.length < 12) {
          ctx.secrets.push({ label: s.label, value: s.value, example: s.example, line: line });
        }
      });
      if (info.className && ctx.classNames.length < 24) {
        ctx.classNames.push({ value: value, line: line });
      }
      if (ctx.paths.length < 30 && /[\\/]/.test(value) && value.length < 260 && /\.(yml|yaml|json|properties|txt|dat|jar|log|env|pem|key|class)$/i.test(value)) {
        ctx.paths.push(A.truncate(value, 160));
      }
    }

    classes.forEach(function (cl) {
      if (!cl.className) return;
      var stats = {
        className: cl.className,
        uid: cl.uid,
        archive: cl.archive || null,
        methods: 0,
        instructions: 0,
        shortClass: false,
        shortMethods: 0,
        namedMethods: 0,
        synthetic: 0,
        base64: 0,
        decoded: 0,
        strings: 0,
        sensitivePaths: [],
        commands: [],
        apiCounts: Object.create(null)
      };
      classStats[cl.uid] = stats;
      if (!classStats[cl.className]) classStats[cl.className] = stats;
      var simple = A.simpleName(cl.className || "").replace(/\$/g, "");
      stats.shortClass = simple.length <= 2 || /^[a-zA-Z]{1,2}\d*$/.test(simple);

      (cl.methods || []).forEach(function (m) {
        stats.methods++;
        stats.instructions += (m.instructions || []).length;
        if (m.synthetic) stats.synthetic++;
        if (m.name !== "<init>" && m.name !== "<clinit>") {
          stats.namedMethods++;
          if (!m.synthetic && m.name.replace(/^\d+$/, "").length <= 2) stats.shortMethods++;
        }
        if (!m.instructions || !m.instructions.length) return;

        var ctx = {
          key: cl.uid + "|" + m.name + m.descriptor,
          uid: cl.uid,
          dupKey: cl.dupKey || cl.uid,
          cl: cl,
          className: cl.className,
          classNameRaw: cl.classNameRaw,
          archive: cl.archive || null,
          depth: cl.depth || 0,
          name: m.name,
          descriptor: m.descriptor,
          display: A.methodDisplay(m.name, m.descriptor),
          startLine: A.methodStartLine(m),
          synthetic: !!m.synthetic,
          mask: 0,
          reach: 0,
          apis: [],
          apiKeys: Object.create(null),
          endpoints: [],
          endpointKeys: Object.create(null),
          calls: [],
          callKeys: Object.create(null),
          edges: [],
          strings: [],
          paths: [],
          secrets: [],
          commands: [],
          classNames: [],
          decoded: [],
          base64: 0,
          sensitive: false,
          escapePath: false,
          hasDynamicStrings: false
        };

        m.instructions.forEach(function (insn) {
          var line = lineAt(m, insn.offset);
          var cp = insn.cp;
          if (!cp) return;

          if (cp.kind === "method") {
            resolveCallTargets(cp, ctx).forEach(function (target) { addCall(ctx, target, cp, line, insn.offset); });
            classifyAndAdd(ctx, cp.owner, cp.name, line, insn.offset, stats);
          } else if (cp.kind === "invokeDynamic" && cp.impl) {
            var impl = cp.impl;
            if (impl.kind === "method") {
              resolveCallTargets(impl, ctx).forEach(function (target) { addCall(ctx, target, impl, line, insn.offset); });
              if (!classInstances[impl.owner]) classifyAndAdd(ctx, impl.owner, impl.name, line, insn.offset, stats);
            }
          } else if (cp.kind === "methodHandle" && cp.ref && cp.ref.kind === "method") {
            resolveCallTargets(cp.ref, ctx).forEach(function (target) { addCall(ctx, target, cp.ref, line, insn.offset); });
            classifyAndAdd(ctx, cp.ref.owner, cp.ref.name, line, insn.offset, stats);
          } else if (cp.kind === "string") {
            handleString(ctx, cp.value, line, insn.offset, stats);
          } else if (cp.kind === "class") {
            var type = cp.owner || A.dot(cp.className);
            if (insn.op === 0xbb || insn.op === 0xbd || insn.op === 0xc0 || insn.op === 0xc1) {
              if (/^java\.net\.URLClassLoader$/.test(type)) ctx.mask |= B.CLASSLOADER;
              if (/^java\.lang\.ProcessBuilder$/.test(type)) ctx.mask |= B.EXEC_SETUP;
              if (/^java\.io\.File$/.test(type)) ctx.mask |= B.FILE_PATH;
              if (/^(java\.util\.zip\.(ZipFile|ZipInputStream)|java\.util\.jar\.JarFile)$/.test(type)) ctx.mask |= B.ARCHIVE;
              if (/^(sun\.misc\.Unsafe|jdk\.internal\.misc\.Unsafe)$/.test(type)) ctx.mask |= B.UNSAFE;
            }
          }

          if (/StringBuilder|StringBuffer/.test(cp.owner || "") && /append/.test(cp.name || "")) {
            ctx.hasDynamicStrings = true;
            ctx.mask |= B.DYNAMIC;
          }
          if (cp.owner === "java.lang.String" && /^(concat|format|join)$/.test(cp.name || "")) {
            ctx.hasDynamicStrings = true;
            ctx.mask |= B.DYNAMIC;
          }
        });

        // HTTP method strings are often set with setRequestMethod("POST") or
        // HttpRequest.Builder.method("POST", ...). The API alone does not
        // reveal the verb, so use the constants in the same method.
        if (ctx.mask & B.HTTP) {
          for (var si = 0; si < ctx.strings.length; si++) {
            if (/\b(POST|PUT|PATCH)\b/.test(ctx.strings[si].value)) {
              ctx.mask |= B.HTTP_WRITE;
              break;
            }
          }
        }

        inferDynamicUrls(ctx);
        contexts.push(ctx);
      });
    });

    function inferDynamicUrls(ctx) {
      var strings = ctx.strings;
      var existing = Object.create(null);
      ctx.endpoints.forEach(function (e) { existing[e.url] = 1; });

      for (var i = 0; i < strings.length && i < 160; i++) {
        var s = strings[i].value;
        if (typeof s !== "string" || s.length > 140) continue;
        if (!/^(?:https?|wss?):\/\/?/i.test(s) && !/^\/\//.test(s)) continue;

        var joined = s;
        if (!/^[a-z]+:\/\/[^/]/i.test(joined)) {
          for (var j = i + 1; j < Math.min(strings.length, i + 5); j++) {
            var next = strings[j].value;
            if (typeof next !== "string" || next.length > 140) break;
            if (/^(?:https?|wss?):\/\//i.test(next)) break;
            if (!/^[a-z0-9.-]+(?::\d{2,5})?(\/.*)?$/i.test(next) &&
                !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(next)) break;
            joined = joined.replace(/\/$/, "/") + next;
            if (/^[a-z]+:\/\/[^/]+\.[a-z]{2,}/i.test(joined)) break;
          }
        }

        var parsedList = A.inspectString(joined).urls;
        if (!parsedList.length) continue;
        var parsed = parsedList[0];
        if (existing[parsed.url]) continue;
        if (parsed.host.indexOf(".") === -1 && !A.isIp(parsed.host)) continue;
        existing[parsed.url] = 1;
        addEndpoint(ctx, parsed, strings[i].line, strings[i].offset, "dynamic");
      }
    }

    // Resolve call edges to analysis contexts.
    var contextByKey = Object.create(null);
    contexts.forEach(function (ctx) { contextByKey[ctx.key] = ctx; });
    contexts.forEach(function (ctx) {
      ctx.edges = ctx.calls.map(function (c) { return contextByKey[c.key]; }).filter(Boolean);
    });

    /* ---- call graph reachability ---- */
    var reachCache = Object.create(null);
    var reachStack = Object.create(null);
    var reachSteps = 0;

    function reachMask(ctx, depth) {
      if (!ctx) return 0;
      if (reachCache[ctx.key] != null) return reachCache[ctx.key];
      if (depth > 60 || reachSteps++ > 800000) return ctx.mask;
      if (reachStack[ctx.key]) return ctx.mask;
      reachStack[ctx.key] = 1;
      var mask = ctx.mask;
      for (var i = 0; i < ctx.edges.length; i++) {
        mask |= reachMask(ctx.edges[i], depth + 1);
      }
      delete reachStack[ctx.key];
      reachCache[ctx.key] = mask;
      return mask;
    }

    contexts.forEach(function (ctx) { ctx.reach = reachMask(ctx, 0); });

    var reverse = Object.create(null);
    contexts.forEach(function (ctx) {
      ctx.edges.forEach(function (target) {
        (reverse[target.key] || (reverse[target.key] = [])).push(ctx);
      });
    });

    /* ---- findings ---- */
    var findings = [];
    var findingIndex = Object.create(null);

    function addFinding(f) {
      if (!f) return;
      if (f.dedupeKey && findingIndex[f.dedupeKey]) {
        A.mergeFinding(findingIndex[f.dedupeKey], f);
        return;
      }
      if (f.dedupeKey) findingIndex[f.dedupeKey] = f;
      findings.push(f);
    }

    function apiLabels(ctx, mask, limit) {
      var out = [];
      ctx.apis.forEach(function (a) {
        if ((a.mask & mask) && out.indexOf(a.api) === -1 && out.length < (limit || 4)) out.push(a.api);
      });
      return out;
    }

    function apiLine(ctx, mask) {
      for (var i = 0; i < ctx.apis.length; i++) {
        if (ctx.apis[i].mask & mask) return ctx.apis[i].line;
      }
      return ctx.startLine;
    }

    function apiOffset(ctx, mask) {
      for (var i = 0; i < ctx.apis.length; i++) {
        if (ctx.apis[i].mask & mask) return ctx.apis[i].offset;
      }
      return null;
    }

    function collectApis(ctx, mask, limit) {
      var out = apiLabels(ctx, mask, limit);
      if (out.length >= (limit || 4)) return out;
      var seen = Object.create(null);
      seen[ctx.key] = 1;
      var queue = ctx.edges.slice(0, 80);
      var guard = 0;
      while (queue.length && out.length < (limit || 4) && guard++ < 300) {
        var next = queue.shift();
        if (!next || seen[next.key]) continue;
        seen[next.key] = 1;
        apiLabels(next, mask, limit).forEach(function (a) { if (out.indexOf(a) === -1 && out.length < (limit || 4)) out.push(a); });
        for (var i = 0; i < next.edges.length && i < 40; i++) queue.push(next.edges[i]);
      }
      return out;
    }

    function findForwardSource(ctx, mask) {
      var queue = [{ ctx: ctx, path: [ctx.display] }];
      var seen = Object.create(null);
      seen[ctx.key] = 1;
      var guard = 0;
      while (queue.length && guard++ < 400) {
        var item = queue.shift();
        if (item.ctx.mask & mask) return item;
        if (item.path.length > 6) continue;
        for (var i = 0; i < item.ctx.edges.length; i++) {
          var e = item.ctx.edges[i];
          if (seen[e.key]) continue;
          seen[e.key] = 1;
          queue.push({ ctx: e, path: item.path.concat([e.display]) });
        }
      }
      return null;
    }

    function findCollectorCaller(sink) {
      var queue = (reverse[sink.key] || []).map(function (c) {
        return { ctx: c, path: [c.display, sink.display], depth: 1 };
      });
      queue.sort(function (a, b) {
        return (a.ctx.className === sink.className ? 0 : 1) - (b.ctx.className === sink.className ? 0 : 1);
      });
      var seen = Object.create(null);
      seen[sink.key] = 1;
      var guard = 0;
      while (queue.length && guard++ < 500) {
        var item = queue.shift();
        if (seen[item.ctx.key]) continue;
        seen[item.ctx.key] = 1;
        if (item.ctx.mask & COLLECT) return item;
        if (item.depth >= 5) continue;
        (reverse[item.ctx.key] || []).forEach(function (c) {
          if (!seen[c.key]) queue.push({ ctx: c, path: [c.display].concat(item.path), depth: item.depth + 1 });
        });
      }
      return null;
    }

    function findEndpointInReach(ctx) {
      var queue = [{ ctx: ctx, path: [ctx.display], depth: 0 }];
      var seen = Object.create(null);
      seen[ctx.key] = 1;
      var guard = 0;
      while (queue.length && guard++ < 400) {
        var item = queue.shift();
        var external = item.ctx.endpoints.filter(function (e) { return !e.local; });
        if (external.length) return { ctx: item.ctx, endpoints: external, path: item.path };
        if (item.depth >= 5) continue;
        item.ctx.edges.forEach(function (e) {
          if (!seen[e.key]) {
            seen[e.key] = 1;
            queue.push({ ctx: e, path: item.path.concat([e.display]), depth: item.depth + 1 });
          }
        });
      }
      return null;
    }

    /* ---- field constants as endpoint references ---- */
    var fieldEndpoints = [];
    classes.forEach(function (cl) {
      (cl.fieldConstants || []).forEach(function (fc) {
        var info = A.inspectString(fc.value);
        info.urls.forEach(function (u) {
          var traits = A.hostTraits(u.host);
          fieldEndpoints.push({
            url: u.url,
            host: u.host,
            scheme: u.scheme,
            port: u.port,
            path: u.path,
            dynamic: false,
            line: null,
            offset: null,
            className: cl.className,
            method: null,
            methodName: null,
            api: null,
            usage: "campo constante",
            source: cl.uid,
            archive: cl.archive || null,
            field: fc.name,
            sourceType: "field",
            local: traits.local,
            webhook: traits.webhook,
            tunnel: traits.tunnel,
            ip: traits.ip
          });
        });
      });
    });

    /* ---- endpoint findings ---- */
    var endpointEntries = [];

    contexts.forEach(function (ctx) {
      if (!ctx.endpoints.length) return;

      var netOwn = !!(ctx.mask & NETWORK);
      var writeApis = collectApis(ctx, WRITE, 3);
      var netApis = collectApis(ctx, NETWORK, 3);
      var collectApisFound = collectApis(ctx, COLLECT, 4);
      var collectMask = ctx.reach & COLLECT;
      var collector = null;
      if (!collectMask && writeApis.length) collector = findCollectorCaller(ctx);
      var sensitiveFlow = !!(ctx.reach & B.SENSITIVE) || !!(collector && (collector.ctx.mask & B.SENSITIVE));
      var dataFlow = !!((netOwn || netApis.length) && writeApis.length && (collectMask || collector));
      var chain = null;

      if (dataFlow) {
        var source = findForwardSource(ctx, COLLECT);
        if (source && source.path.length >= 1) {
          chain = source.path.slice().reverse();
          if (chain[chain.length - 1] !== ctx.display) chain.push(ctx.display);
        } else if (collector) {
          chain = collector.path.slice();
          if (chain[chain.length - 1] !== ctx.display) chain.push(ctx.display);
        } else {
          chain = [ctx.display];
        }
        if (writeApis[0] && chain[chain.length - 1] !== writeApis[0]) chain.push(writeApis[0]);
      }

      var groups = Object.create(null);
      ctx.endpoints.forEach(function (ep) {
        var g = groups[ep.host] || (groups[ep.host] = []);
        g.push(ep);
      });

      Object.keys(groups).forEach(function (host) {
        var eps = groups[host];
        var traits = A.hostTraits(host);
        var first = eps[0];
        var hook = eps.some(function (e) { return A.isWebhookUrl(e.url); });
        var severity = "info";

        if (traits.local) {
          severity = "info";
        } else if (dataFlow) {
          severity = (hook || traits.tunnel || sensitiveFlow) ? "critical" : "high";
        } else if (hook || traits.tunnel) {
          severity = (netOwn || netApis.length) ? "high" : "medium";
        } else if (traits.ip) {
          severity = (netOwn || netApis.length) ? "medium" : "low";
        } else if (writeApis.length) {
          severity = "medium";
        } else if (first.scheme === "http") {
          severity = "low";
        } else {
          severity = (netOwn || netApis.length) ? "low" : "info";
        }

        var confidence;
        if (dataFlow) confidence = (sensitiveFlow || (collectMask & B.FILE_READ)) ? 90 : 78;
        else if (hook || traits.tunnel) confidence = (netOwn || netApis.length) ? 80 : 55;
        else if (traits.ip) confidence = (netOwn || netApis.length) ? 68 : 45;
        else if (writeApis.length) confidence = 60;
        else confidence = (netOwn || netApis.length) ? 45 : 30;

        if (traits.local) confidence = 30;
        var loc = locate(ctx.className, ctx.archive);
        if (loc.dependency) confidence -= 8;
        confidence = Math.max(10, Math.min(99, confidence));

        var title;
        if (dataFlow && (hook || traits.tunnel)) title = "Posible exfiltración mediante " + (hook ? "webhook" : "servicio de túnel");
        else if (dataFlow) title = "Transmisión externa de datos";
        else if (hook) title = "Webhook de mensajería externo";
        else if (traits.tunnel) title = "Endpoint de túnel o almacenamiento temporal";
        else if (traits.ip) title = "Comunicación con IP literal";
        else if (!netOwn && !netApis.length) title = "Endpoint externo referenciado";
        else title = "Comunicación HTTP externa";

        var evidence = [];
        if (netApis.length) evidence.push("API de red: " + netApis.join(", "));
        eps.slice(0, 4).forEach(function (e) {
          evidence.push("Endpoint: " + e.url +
            (e.dynamic ? " (construcción dinámica)" : "") +
            (e.field ? " (campo " + e.field + ")" : "") +
            (e.line ? " · línea " + e.line : ""));
        });
        if (!netOwn && !netApis.length) evidence.push("No se observó una llamada HTTP directa en este método: la URL podría usarse desde otro punto o construirse dinámicamente.");
        if (writeApis.length) evidence.push("Operación de escritura: " + writeApis.join(", "));
        if (collectApisFound.length) evidence.push("Recolección en el flujo: " + collectApisFound.join(", "));
        if (collector) evidence.push("El método llamador " + collector.ctx.className + "#" + collector.ctx.display + " recopila datos antes del envío.");
        if (chain && chain.length > 1) evidence.push("Cadena: " + chain.join(" → "));
        if (ctx.archive) evidence.push("Archivo contenedor: " + ctx.archive);

        var desc = dataFlow
          ? "Se combinan operaciones de recolección de datos (archivos, configuración, entorno o información del servidor) con un envío a un host externo en el mismo flujo de ejecución."
          : (traits.webhook || traits.tunnel)
            ? "El archivo contiene un endpoint asociado a canales usados con frecuencia para enviar datos. Su presencia no implica malicia por sí sola."
            : "El archivo referencia un host externo. Se muestra el punto exacto del bytecode para que puedas evaluar si corresponde a una función legítima.";

        var reason = dataFlow
          ? "La atribución se apoya en referencias reales del bytecode: la API de escritura, la operación de recolección y el endpoint aparecen en el mismo método o en una cadena de llamadas verificada dentro del archivo."
          : "La atribución se apoya en la referencia a la URL y en la API de red detectada. Sin una operación de recolección y escritura en el flujo, se clasifica como informativo o de revisión.";

        var fp = [
          "Métricas o telemetría del autor (bStats, updaters, estadísticas).",
          "Verificación de actualizaciones o de licencias.",
          "API pública del plugin (economía, web, panel de administración).",
          "Notificaciones legítimas a un webhook de Discord/Telegram del servidor."
        ];
        if (loc.dependency) fp.push("La clase pertenece a una dependencia empaquetada (shaded); puede ser una librería legítima.");
        if (ctx.archive) fp.push("El endpoint está dentro de un archivo anidado; puede ser una librería de terceros.");

        var locations = [locationFor(ctx, first.line, first.offset)];
        if (collector && collector.ctx !== ctx) locations.push(locationFor(collector.ctx, null, null));
        eps.forEach(function (e) {
          if (e.method && e.className !== ctx.className) {
            locations.push({ className: e.className, method: e.method, line: e.line, offset: e.offset, source: e.source, archive: e.archive, dependency: loc.dependency, library: loc.library });
          }
        });

        addFinding(A.newFinding(
          dataFlow ? "data-exfiltration" : "external-endpoint",
          title,
          severity,
          dataFlow ? "Exfiltración" : "Red",
          {
            description: desc,
            reason: reason,
            confidence: confidence,
            className: ctx.className,
            method: ctx.display,
            line: first.line,
            offset: first.offset,
            api: netApis[0] || null,
            endpoint: first.url,
            endpoints: eps,
            evidence: evidence,
            chain: chain || [],
            locations: locations,
            dependency: loc.dependency,
            library: loc.library,
            archive: ctx.archive,
            flow: {
              collect: collectApisFound,
              write: writeApis,
              network: netApis,
              sensitive: sensitiveFlow,
              collector: collector ? collector.ctx.className + "#" + collector.ctx.display : null,
              host: host
            },
            falsePositives: fp,
            recommendation: dataFlow
              ? "Revisa el código fuente del plugin y el destino del envío antes de instalarlo. Si no reconoces el endpoint, bloquea la salida de red del servidor."
              : "Comprueba si el dominio pertenece al autor del plugin y si la función declarada justifica la conexión.",
            source: ctx.uid,
            dedupeKey: loc.dependency
              ? "dep|" + (dataFlow ? "exfil" : "endpoint") + "|" + host + "|" + (dataFlow ? "d" : "n")
              : (dataFlow ? "exfil" : "endpoint") + "|" + (ctx.dupKey || ctx.uid) + "|" + host + "|" + (dataFlow ? "d" : "n")
          }
        ));

        eps.forEach(function (e) {
          e.risk = severity;
          e.usage = netApis.length ? "HTTP/Socket" : "sin API directa";
          e.api = netApis[0] || null;
          e.write = writeApis.length > 0;
          e.dataFlow = dataFlow;
          e.archive = ctx.archive || null;
        });
      });

      ctx.endpoints.forEach(function (e) { endpointEntries.push(e); });
    });

    /* ============================================================
       Capability findings
       Every capability below is emitted only when the bytecode really
       references the API or the constant; nothing is inferred from
       the file name or from the author.
       ============================================================ */

    function clampConf(n) {
      n = Math.round(n);
      return Math.max(10, Math.min(99, n));
    }

    function downgrade(sev, levels) {
      var order = ["critical", "high", "medium", "low", "info"];
      var i = order.indexOf(sev);
      if (i === -1) return sev;
      return order[Math.min(order.length - 1, i + (levels || 1))];
    }

    function uniquePush(list, value, limit) {
      if (value == null || value === "") return;
      if (list.indexOf(value) !== -1) return;
      if (list.length >= (limit || 8)) return;
      list.push(value);
    }

    function collectCommands(ctx, limit) {
      var out = [];
      var seen = Object.create(null);
      seen[ctx.key] = 1;
      var queue = [ctx];
      var guard = 0;
      while (queue.length && out.length < (limit || 6) && guard++ < 120) {
        var cur = queue.shift();
        (cur.commands || []).forEach(function (c) { uniquePush(out, c, limit || 6); });
        for (var i = 0; i < cur.edges.length && i < 24; i++) {
          var e = cur.edges[i];
          if (seen[e.key]) continue;
          seen[e.key] = 1;
          queue.push(e);
        }
      }
      return out;
    }

    function collectPaths(ctx, re, limit) {
      var out = [];
      var seen = Object.create(null);
      seen[ctx.key] = 1;
      var queue = [ctx];
      var guard = 0;
      while (queue.length && out.length < (limit || 6) && guard++ < 120) {
        var cur = queue.shift();
        (cur.paths || []).forEach(function (p) {
          if (re && !re.test(p)) return;
          uniquePush(out, p, limit || 6);
        });
        for (var i = 0; i < cur.edges.length && i < 24; i++) {
          var e = cur.edges[i];
          if (seen[e.key]) continue;
          seen[e.key] = 1;
          queue.push(e);
        }
      }
      return out;
    }

    function apiEvidence(ctx, mask, label, limit) {
      var apis = apiLabels(ctx, mask, limit || 5);
      if (!apis.length) return null;
      var line = apiLine(ctx, mask);
      return label + ": " + apis.join(", ") + (line ? " (línea " + line + ")" : "");
    }

    function capFinding(ctx, kind, title, severity, category, opts) {
      opts = opts || {};
      var loc = locate(ctx.className, ctx.archive);
      var conf = opts.confidence == null ? 72 : opts.confidence;
      if (loc.dependency) {
        conf -= 12;
        severity = downgrade(severity, 1);
      }
      if (opts.downgrade) severity = downgrade(severity, opts.downgrade);
      var line = opts.line == null ? ctx.startLine : opts.line;
      var finding = A.newFinding(kind, title, severity, category, {
        description: opts.description || "",
        reason: opts.reason || "",
        confidence: clampConf(conf),
        className: ctx.className,
        method: ctx.display,
        line: line,
        offset: opts.offset == null ? null : opts.offset,
        api: opts.api || null,
        evidence: opts.evidence || [],
        chain: opts.chain || [],
        locations: opts.locations || [locationFor(ctx, line, opts.offset)],
        dependency: loc.dependency,
        library: loc.library,
        archive: ctx.archive,
        falsePositives: opts.falsePositives || [],
        recommendation: opts.recommendation || "",
        source: ctx.uid,
        dedupeKey: "cap|" + kind + "|" + (ctx.dupKey || ctx.uid)
      });
      addFinding(finding);
      return finding;
    }

    /* ---- process execution ---- */
    contexts.forEach(function (ctx) {
      if (!(ctx.mask & B.EXEC)) return;
      var netApis = collectApis(ctx, NETWORK, 3);
      var commands = collectCommands(ctx, 6);
      var shell = commands.some(function (c) {
        return /\b(cmd(\.exe)?|powershell|pwsh|bash|sh|zsh|ksh)\b|\/bin\/(sh|bash)|\/etc\/|\bcurl\b|\bwget\b/i.test(c);
      });
      var scriptEngine = ctx.apis.some(function (a) {
        return (a.mask & B.EXEC) && /ScriptEngine/.test(a.api);
      });
      var severity = netApis.length ? "critical" : "high";
      if (scriptEngine && netApis.length) severity = "critical";
      var evidence = [];
      var apiLineEv = apiEvidence(ctx, B.EXEC, "API de ejecución");
      if (apiLineEv) evidence.push(apiLineEv);
      if (ctx.mask & B.EXEC_SETUP) {
        var setupEv = apiEvidence(ctx, B.EXEC_SETUP, "Preparación de proceso");
        if (setupEv) evidence.push(setupEv);
      }
      commands.forEach(function (c) { evidence.push("Comando o argumento: " + c); });
      if (shell) evidence.push("Se observan indicios de intérprete de comandos del sistema.");
      if (scriptEngine) evidence.push("Se evalúa código con un motor de scripts (javax.script).");
      if (netApis.length) evidence.push("El mismo flujo usa red: " + netApis.join(", "));
      if (ctx.archive) evidence.push("Archivo contenedor: " + ctx.archive);

      capFinding(ctx, "process-execution", netApis.length ? "Ejecución de procesos con salida de red" : "Ejecución de procesos del sistema", severity, "Ejecución", {
        description: netApis.length
          ? "El bytecode invoca la ejecución de programas del sistema y, en el mismo flujo de llamadas, utiliza APIs de red. Es el patrón típico de una puerta trasera que recibe órdenes de forma remota."
          : "El bytecode invoca la ejecución de programas del sistema. Muchos plugins legítimos lo usan para tareas administrativas, pero también es la vía habitual para ejecutar comandos arbitrarios.",
        reason: "Se resolvieron las llamadas reales del bytecode hasta java.lang.Runtime.exec/ProcessBuilder.start (o un motor de scripts) y se recogieron los argumentos constantes del método.",
        confidence: shell || scriptEngine ? 90 : 78,
        line: apiLine(ctx, B.EXEC),
        offset: apiOffset(ctx, B.EXEC),
        api: apiLabels(ctx, B.EXEC, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Tareas de mantenimiento que ejecutan scripts propios (backups, reinicios).",
          "Integración con herramientas externas instaladas por el administrador."
        ],
        recommendation: "Revisa qué programa y argumentos se ejecutan. Si el comando se construye con datos de red o de jugadores, no instales el plugin.",
        downgrade: shell ? 0 : 1
      });
    });

    /* ---- dynamic class loading ---- */
    contexts.forEach(function (ctx) {
      var mask = ctx.mask & (B.CLASSLOADER | B.CLASS_LOAD);
      if (!mask) return;
      var strong = !!(ctx.mask & B.CLASSLOADER) || !!(ctx.reach & B.DECODE) || !!(ctx.reach & B.REFLECT);
      var evidence = [];
      var ev = apiEvidence(ctx, mask, "Carga de clases");
      if (ev) evidence.push(ev);
      if (ctx.reach & B.DECODE) evidence.push("Hay contenido decodificado (Base64/hex) en el mismo flujo: el código puede cargarse desde memoria.");
      if (ctx.reach & B.REFLECT) evidence.push("Se combina con reflexión para localizar y ejecutar métodos por nombre.");
      if (ctx.reach & B.NETWORK) {
        var net = collectApis(ctx, NETWORK, 2);
        if (net.length) evidence.push("El flujo también usa red: " + net.join(", "));
      }
      collectPaths(ctx, /\.(jar|class|zip)$/i, 4).forEach(function (p) {
        evidence.push("Ruta de clase o archivo: " + p);
      });
      capFinding(ctx, "dynamic-classloading", "Carga dinámica de clases o bytecode", strong ? "high" : "low", "Carga dinámica", {
        description: "El código carga clases en tiempo de ejecución mediante ClassLoader, MethodHandles.Lookup.defineClass o Class.forName. Si el origen es un recurso oculto o una descarga, el comportamiento real no aparece en el código visible.",
        reason: "La referencia a la API de carga dinámica se encontró en el bytecode y se siguió la cadena de llamadas para ver si además decodifica datos o usa red.",
        confidence: strong ? 85 : 60,
        line: apiLine(ctx, mask),
        offset: apiOffset(ctx, mask),
        api: apiLabels(ctx, mask, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Carga de drivers JDBC o implementaciones de ServiceLoader.",
          "Plugins que cargan módulos opcionales desde su propia carpeta."
        ],
        recommendation: "Comprueba el origen del bytecode cargado. Si procede de red, Base64 o de una entrada con extensión distinta a .class, trátalo como código oculto."
      });
    });

    /* ---- reflection ---- */
    contexts.forEach(function (ctx) {
      if (!(ctx.mask & B.REFLECT)) return;
      var strong = !!(ctx.reach & (B.CLASSLOADER | B.DECODE)) || !!(ctx.mask & B.UNSAFE);
      var evidence = [];
      var ev = apiEvidence(ctx, B.REFLECT, "Reflexión");
      if (ev) evidence.push(ev);
      if (ctx.classNames.length) {
        evidence.push("Clases referenciadas como texto: " + ctx.classNames.slice(0, 4).map(function (c) { return c.value; }).join(", "));
      }
      if (ctx.reach & B.DECODE) evidence.push("Se decodifican datos antes de la reflexión.");
      capFinding(ctx, "reflection", "Uso de reflexión para acceder a clases y métodos", strong ? "medium" : "low", "Reflexión", {
        description: "El bytecode accede a clases, campos o métodos por nombre en tiempo de ejecución. Es habitual en librerías, pero también permite invocar código que no aparece como llamada directa.",
        reason: "Se detectaron referencias a java.lang.reflect, Class.getDeclaredMethod/getField o Method.invoke.",
        confidence: strong ? 75 : 55,
        line: apiLine(ctx, B.REFLECT),
        offset: apiOffset(ctx, B.REFLECT),
        api: apiLabels(ctx, B.REFLECT, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Compatibilidad entre versiones de Bukkit/Paper.",
          "Serialización y frameworks de inyección de dependencias."
        ],
        recommendation: "Revisa qué nombres de clase y método se resuelven y desde dónde provienen."
      });
    });

    /* ---- Unsafe / instrumentation / attach ---- */
    contexts.forEach(function (ctx) {
      var mask = ctx.mask & (B.UNSAFE | B.INSTRUMENT | B.ATTACH);
      if (!mask) return;
      var severity = (ctx.mask & (B.ATTACH | B.INSTRUMENT)) ? "critical" : "high";
      var evidence = [];
      var ev = apiEvidence(ctx, mask, "API privilegiada");
      if (ev) evidence.push(ev);
      if (ctx.mask & B.ATTACH) evidence.push("Se referencia la API de attach de la JVM (com.sun.tools.attach).");
      if (ctx.mask & B.INSTRUMENT) evidence.push("Se referencia java.lang.instrument para transformar clases en ejecución.");
      if (ctx.mask & B.UNSAFE) evidence.push("Se referencia sun.misc.Unsafe / jdk.internal.misc.Unsafe.");
      if (ctx.reach & B.NETWORK) evidence.push("El flujo también usa red.");
      capFinding(ctx, "privileged-runtime", "Acceso a APIs privilegiadas de la JVM", severity, "Evasión", {
        description: "El código usa instrumentación, attach o Unsafe. Estas APIs permiten modificar clases en memoria, leer memoria arbitraria o inyectar agentes, y rara vez son necesarias en un plugin de servidor.",
        reason: "Se encontraron referencias directas a java.lang.instrument, com.sun.tools.attach o Unsafe en el bytecode.",
        confidence: 92,
        line: apiLine(ctx, mask),
        offset: apiOffset(ctx, mask),
        api: apiLabels(ctx, mask, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Herramientas de profiling o agentes de observabilidad empaquetados.",
          "Librerías de compatibilidad que acceden a Unsafe de forma defensiva."
        ],
        recommendation: "No instales el plugin sin revisar el código que utiliza estas APIs; pueden alterar la JVM y otros plugins."
      });
    });

    /* ---- native libraries ---- */
    contexts.forEach(function (ctx) {
      if (!(ctx.mask & B.NATIVE)) return;
      var evidence = [];
      var ev = apiEvidence(ctx, B.NATIVE, "Carga nativa");
      if (ev) evidence.push(ev);
      collectPaths(ctx, /\.(dll|so|dylib)$/i, 4).forEach(function (p) { evidence.push("Biblioteca: " + p); });
      capFinding(ctx, "native-library", "Carga de bibliotecas nativas", "high", "Nativo", {
        description: "El plugin carga una biblioteca nativa (.dll/.so/.dylib). El código nativo no se puede revisar con el análisis de bytecode y se ejecuta con los permisos del servidor.",
        reason: "Se detectó java.lang.System.load/loadLibrary y/o rutas de bibliotecas nativas en las constantes.",
        confidence: 88,
        line: apiLine(ctx, B.NATIVE),
        offset: apiOffset(ctx, B.NATIVE),
        api: apiLabels(ctx, B.NATIVE, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Librerías de cifrado, bases de datos o compresión que incluyen su parte nativa.",
          "Integración con hardware o sistemas operativos específicos."
        ],
        recommendation: "Extrae la biblioteca y verifícala con antivirus y con el fabricante; no la ejecutes sin conocer su origen."
      });
    });

    /* ---- archive handling ---- */
    contexts.forEach(function (ctx) {
      if (!(ctx.mask & B.ARCHIVE)) return;
      var writes = !!(ctx.mask & B.FILE_WRITE);
      var evidence = [];
      var ev = apiEvidence(ctx, B.ARCHIVE, "API de archivos comprimidos");
      if (ev) evidence.push(ev);
      collectPaths(ctx, /\.(jar|zip|war|ear)$/i, 4).forEach(function (p) { evidence.push("Ruta de archivo: " + p); });
      if (writes) evidence.push("El mismo método escribe archivos en disco.");
      capFinding(ctx, "archive-access", writes ? "Lectura y escritura de archivos comprimidos" : "Lectura de archivos comprimidos", writes ? "medium" : "low", "Archivos", {
        description: writes
          ? "El código lee y escribe archivos ZIP/JAR. Puede extraer, modificar o crear paquetes en disco, una técnica usada para actualizarse o dejar componentes."
          : "El código abre archivos ZIP/JAR. Es normal en plugins que leen sus propios recursos, pero también permite inspeccionar o extraer otros archivos del servidor.",
        reason: "Se detectaron llamadas a java.util.zip/java.util.jar en el bytecode.",
        confidence: writes ? 78 : 60,
        line: apiLine(ctx, B.ARCHIVE),
        offset: apiOffset(ctx, B.ARCHIVE),
        api: apiLabels(ctx, B.ARCHIVE, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Lectura de recursos propios del plugin con getResourceAsStream.",
          "Actualizadores que descargan y reemplazan su propio JAR."
        ],
        recommendation: "Comprueba qué archivos se abren y si la ruta proviene de configuración o de red."
      });
    });

    /* ---- file writes ---- */
    contexts.forEach(function (ctx) {
      if (!(ctx.mask & B.FILE_WRITE) || (ctx.mask & B.ARCHIVE)) return;
      var evidence = [];
      var ev = apiEvidence(ctx, B.FILE_WRITE, "Escritura de archivos");
      if (ev) evidence.push(ev);
      var paths = collectPaths(ctx, /[\\/]/, 4);
      paths.forEach(function (p) { evidence.push("Ruta: " + p); });
      capFinding(ctx, "file-write", "Escritura de archivos en el servidor", paths.length ? "medium" : "low", "Archivos", {
        description: "El plugin escribe archivos en el sistema. Puede ser configuración o caché legítima, pero también persistencia de componentes descargados.",
        reason: "Se detectaron APIs de escritura (FileOutputStream, Files.write, FileChannel.write) en el bytecode.",
        confidence: 65,
        line: apiLine(ctx, B.FILE_WRITE),
        offset: apiOffset(ctx, B.FILE_WRITE),
        api: apiLabels(ctx, B.FILE_WRITE, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Guardado de configuración, logs o caché del plugin.",
          "Descarga de recursos actualizados del propio autor."
        ],
        recommendation: "Revisa las rutas de escritura y si el contenido proviene de la red."
      });
    });

    /* ---- environment and server information ---- */
    contexts.forEach(function (ctx) {
      var own = ctx.mask & (B.ENV | B.SERVER_INFO | B.CONFIG_READ | B.SENSITIVE);
      if (!own) return;
      var categories = [];
      if (ctx.mask & B.ENV) categories.push("entorno del sistema");
      if (ctx.mask & B.SERVER_INFO) categories.push("información del servidor/jugadores");
      if (ctx.mask & B.CONFIG_READ) categories.push("configuración");
      if (ctx.mask & B.SENSITIVE) categories.push("valores sensibles");
      if (categories.length < 2 && !(ctx.mask & B.SENSITIVE)) return;
      var loc = locate(ctx.className, ctx.archive);
      if (loc.dependency) return;

      var evidence = [];
      var ev = apiEvidence(ctx, own, "Fuentes de información");
      if (ev) evidence.push(ev);
      if (ctx.secrets.length) evidence.push("Secretos en constantes: " + ctx.secrets.slice(0, 3).map(function (s) { return s.label; }).join(", "));
      if (ctx.paths.length) evidence.push("Recursos referenciados: " + ctx.paths.slice(0, 3).join(", "));

      capFinding(ctx, "data-collection", "Recolección de información del servidor", "low", "Recolección", {
        description: "El método reúne datos del entorno, del servidor o de su configuración. Aislado es informativo; combinado con un envío externo constituye exfiltración.",
        reason: "Se detectaron varias APIs de lectura de información (" + categories.join(", ") + ") en el mismo método.",
        confidence: 62,
        line: apiLine(ctx, own),
        offset: apiOffset(ctx, own),
        api: apiLabels(ctx, own, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Diagnóstico, métricas o mensajes de arranque del plugin.",
          "Funciones administrativas que muestran el estado del servidor."
        ],
        recommendation: "Comprueba si esa información se envía fuera del servidor."
      });
    });

    /* ---- hardcoded secrets ---- */
    contexts.forEach(function (ctx) {
      if (!ctx.secrets.length) return;
      var relevant = ctx.secrets.filter(function (s) {
        return !s.example;
      });
      if (!relevant.length) return;
      var severity = relevant.some(function (s) {
        return /clave privada|token|contraseña|api key|credencial/i.test(s.label);
      }) ? "high" : "medium";
      var evidence = relevant.slice(0, 6).map(function (s) {
        return s.label + ": " + s.value + (s.line ? " (línea " + s.line + ")" : "");
      });
      if (relevant.some(function (s) { return s.example; })) {
        evidence.push("Algunos valores parecen ejemplos y se han atenuado.");
      }
      var first = relevant[0];
      capFinding(ctx, "hardcoded-secret", "Credenciales o claves en el código", severity, "Secretos", {
        description: "El archivo contiene valores con forma de credencial (tokens, claves, contraseñas). Si son reales, cualquiera que descargue el plugin puede usarlos.",
        reason: "Las constantes del bytecode coinciden con patrones de credenciales conocidos y no parecen marcadores de ejemplo.",
        confidence: 80,
        line: first.line || ctx.startLine,
        offset: null,
        api: null,
        evidence: evidence,
        falsePositives: [
          "Claves públicas de API o identificadores sin privilegios.",
          "Valores de ejemplo/documentación que coinciden con el patrón."
        ],
        recommendation: "Rota cualquier credencial real y notifica al autor. No publiques capturas con estos valores."
      });
    });

    /* ---- decoded / encoded payloads ---- */
    contexts.forEach(function (ctx) {
      if (!ctx.decoded.length) return;
      var dangerous = ctx.decoded.filter(function (d) {
        return /^(zip|class|exe|elf|macho)$/.test(d.kind);
      });
      var notable = dangerous.length ? dangerous : ctx.decoded.filter(function (d) { return d.kind === "text"; });
      if (!notable.length) return;
      var severity = dangerous.length ? "critical" : "medium";
      var evidence = [];
      var ev = apiEvidence(ctx, B.DECODE | B.CRYPTO, "Decodificación");
      if (ev) evidence.push(ev);
      notable.slice(0, 6).forEach(function (d) {
        evidence.push(d.encoding + " → " + d.label + ": " + d.preview + (d.line ? " (línea " + d.line + ")" : ""));
      });
      if (ctx.reach & (B.CLASSLOADER | B.CLASS_LOAD)) evidence.push("El flujo también carga clases dinámicamente.");
      capFinding(ctx, "encoded-payload", dangerous.length ? "Carga útil codificada con firma ejecutable" : "Contenido codificado en el bytecode", severity, "Ofuscación", {
        description: dangerous.length
          ? "Una constante del código se decodifica a un archivo comprimido, una clase Java o un ejecutable. Es una forma de esconder código que no aparece como archivo dentro del JAR."
          : "El código contiene texto codificado en Base64/hex que se decodifica en tiempo de ejecución. Puede ser legítimo, pero también oculta URLs, comandos o código.",
        reason: "Los valores decodificados coinciden con firmas de archivo (ZIP/CAFEBABE/MZ/ELF) o contienen texto relevante, y la API de decodificación está presente en el bytecode.",
        confidence: dangerous.length ? 94 : 68,
        line: notable[0].line || ctx.startLine,
        offset: notable[0].offset,
        api: apiLabels(ctx, B.DECODE, 1)[0] || null,
        evidence: evidence,
        falsePositives: [
          "Recursos comprimidos legítimos del plugin (iconos, configuraciones).",
          "Ofuscación comercial de librerías empaquetadas."
        ],
        recommendation: "Decodifica el valor y revisa su contenido antes de confiar en el plugin."
      });
    });

    /* ---- proxy / dynamic proxies ---- */
    contexts.forEach(function (ctx) {
      if (!(ctx.mask & B.PROXY)) return;
      var evidence = [];
      var ev = apiEvidence(ctx, B.PROXY, "Proxy dinámico");
      if (ev) evidence.push(ev);
      capFinding(ctx, "dynamic-proxy", "Uso de proxies dinámicos", "low", "Reflexión", {
        description: "El código crea proxies dinámicos. Es una técnica legítima en frameworks, pero también permite interceptar llamadas y ocultar el destino real de un método.",
        reason: "Se detectó java.lang.reflect.Proxy.newProxyInstance en el bytecode.",
        confidence: 60,
        line: apiLine(ctx, B.PROXY),
        offset: apiOffset(ctx, B.PROXY),
        api: apiLabels(ctx, B.PROXY, 1)[0] || null,
        evidence: evidence,
        falsePositives: ["Frameworks de plugins, AOP o adaptadores de API."],
        recommendation: "Revisa qué interfaz se implementa y qué código se ejecuta en el handler."
      });
    });

    /* ---- secrets stored in fields ---- */
    classes.forEach(function (cl) {
      var hits = [];
      (cl.fieldConstants || []).forEach(function (fc) {
        if (typeof fc.value !== "string") return;
        var info = A.inspectString(fc.value);
        info.secrets.forEach(function (s) {
          if (s.example) return;
          hits.push({ field: fc.name, label: s.label, value: s.value });
        });
      });
      if (!hits.length) return;
      var loc = locate(cl.className, cl.archive);
      var severity = loc.dependency ? "medium" : "high";
      addFinding(A.newFinding("field-secret", "Credenciales en campos constantes", severity, "Secretos", {
        description: "Un campo estático contiene un valor con forma de credencial. Los campos públicos son accesibles desde cualquier clase del servidor y quedan visibles al descompilar el JAR.",
        reason: "El valor del campo coincide con un patrón de credencial y no parece un marcador de ejemplo.",
        confidence: 82,
        className: cl.className,
        method: null,
        line: null,
        offset: null,
        evidence: hits.slice(0, 6).map(function (h) { return h.field + " = " + h.value + " (" + h.label + ")"; }),
        locations: [{
          className: cl.className,
          method: null,
          line: null,
          source: cl.uid,
          archive: cl.archive || null,
          dependency: loc.dependency,
          library: loc.library
        }],
        dependency: loc.dependency,
        library: loc.library,
        archive: cl.archive || null,
        falsePositives: [
          "Claves públicas o identificadores de cliente sin privilegios.",
          "Valores de ejemplo copiados de la documentación del servicio."
        ],
        recommendation: "Comprueba si la credencial sigue activa y rótala si es real.",
        source: cl.uid,
        dedupeKey: "field-secret|" + (cl.dupKey || cl.uid)
      }));
    });

    /* ---- combined techniques ---- */
    contexts.forEach(function (ctx) {
      var net = ctx.reach & NETWORK;
      var netApis = collectApis(ctx, NETWORK, 3);

      if ((ctx.mask & B.EXEC) && net) {
        var cmds = collectCommands(ctx, 3);
        var evidence = [];
        var ev = apiEvidence(ctx, B.EXEC, "Ejecución");
        if (ev) evidence.push(ev);
        if (netApis.length) evidence.push("Red en el flujo: " + netApis.join(", "));
        cmds.forEach(function (c) { evidence.push("Comando: " + c); });
        var source = findForwardSource(ctx, NETWORK);
        if (source) evidence.push("Cadena: " + source.path.join(" → ") + " → " + ctx.display);
        capFinding(ctx, "remote-execution", "Ejecución de comandos conectada a la red", "critical", "Ejecución", {
          description: "La ejecución de procesos y una operación de red aparecen en el mismo flujo de llamadas. Este patrón permite recibir comandos o descargar un programa y ejecutarlo.",
          reason: "La cadena de llamadas resuelta desde el bytecode conecta una API de ejecución (Runtime/ProcessBuilder/ScriptEngine) con una API de red (HTTP o sockets).",
          confidence: 88,
          line: apiLine(ctx, B.EXEC),
          offset: apiOffset(ctx, B.EXEC),
          api: apiLabels(ctx, B.NETWORK, 1)[0] || apiLabels(ctx, B.EXEC, 1)[0] || null,
          evidence: evidence,
          falsePositives: [
            "Actualizadores que descargan un instalador y lo ejecutan con confirmación del administrador.",
            "Herramientas de administración remota instaladas a propósito."
          ],
          recommendation: "No instales el plugin hasta identificar qué se ejecuta y desde dónde llega el comando."
        });
      }

      var dangerousDecoded = ctx.decoded.some(function (d) {
        return /^(zip|class|exe|elf|macho)$/.test(d.kind);
      });
      if ((ctx.mask & B.DECODE) && (ctx.reach & (B.CLASSLOADER | B.CLASS_LOAD)) && (dangerousDecoded || (ctx.reach & NETWORK))) {
        var dEvidence = [];
        var dev = apiEvidence(ctx, B.DECODE, "Decodificación");
        if (dev) dEvidence.push(dev);
        if (ctx.reach & B.CLASSLOADER) dEvidence.push("El flujo define o carga clases en tiempo de ejecución.");
        if (dangerousDecoded) dEvidence.push("El contenido decodificado tiene firma de archivo ejecutable o clase.");
        ctx.decoded.slice(0, 3).forEach(function (d) { dEvidence.push(d.encoding + " → " + d.label); });
        capFinding(ctx, "staged-payload", "Carga útil decodificada y cargada en memoria", dangerousDecoded ? "critical" : "high", "Ofuscación", {
          description: "El código decodifica datos y después carga clases o bytecode. El contenido real no está en un archivo visible del JAR, por lo que puede eludir una revisión superficial.",
          reason: "Se combinan en el mismo flujo una API de decodificación (Base64/hex) y una API de carga de clases, y al menos un valor decodificado tiene firma ejecutable.",
          confidence: dangerousDecoded ? 95 : 82,
          line: ctx.decoded.length ? ctx.decoded[0].line : ctx.startLine,
          offset: ctx.decoded.length ? ctx.decoded[0].offset : null,
          api: apiLabels(ctx, B.DECODE, 1)[0] || null,
          evidence: dEvidence,
          falsePositives: [
            "Sistemas de plugins que cargan módulos ofuscados por licencia.",
            "Cifrado de recursos propios con una clave incluida."
          ],
          recommendation: "Extrae y decodifica el contenido; si es una clase, analízala por separado con GuardX."
        });
      }

      if ((ctx.mask & (B.UNSAFE | B.INSTRUMENT | B.ATTACH)) && (ctx.reach & (B.CLASSLOADER | B.CLASS_LOAD))) {
        var pEvidence = [];
        var pev = apiEvidence(ctx, B.UNSAFE | B.INSTRUMENT | B.ATTACH, "API privilegiada");
        if (pev) pEvidence.push(pev);
        pEvidence.push("El mismo flujo carga o define clases.");
        capFinding(ctx, "runtime-agent", "Modificación de la JVM combinada con carga de clases", "critical", "Evasión", {
          description: "El plugin usa instrumentación, attach o Unsafe y además carga clases. Esto permite inyectar o transformar código en otros plugins y en la propia JVM.",
          reason: "Se resolvió una cadena que contiene APIs de instrumentación/Unsafe y de definición o carga de clases.",
          confidence: 93,
          line: apiLine(ctx, B.UNSAFE | B.INSTRUMENT | B.ATTACH),
          offset: apiOffset(ctx, B.UNSAFE | B.INSTRUMENT | B.ATTACH),
          api: apiLabels(ctx, B.UNSAFE | B.INSTRUMENT | B.ATTACH, 1)[0] || null,
          evidence: pEvidence,
          falsePositives: ["Agentes de monitorización o profiling empaquetados con el plugin."],
          recommendation: "Audita el código completo antes de ejecutarlo; puede modificar otros plugins y el servidor."
        });
      }

      if ((ctx.mask & B.ARCHIVE) && (ctx.mask & B.FILE_WRITE) && net && (ctx.reach & COLLECT)) {
        var aEvidence = [];
        var aev = apiEvidence(ctx, B.ARCHIVE, "Archivos comprimidos");
        if (aev) aEvidence.push(aev);
        var aev2 = apiEvidence(ctx, B.FILE_WRITE, "Escritura");
        if (aev2) aEvidence.push(aev2);
        if (netApis.length) aEvidence.push("Red: " + netApis.join(", "));
        aEvidence.push("En el flujo se leen datos del servidor o de su configuración.");
        capFinding(ctx, "archive-exfiltration", "Empaquetado de datos y envío externo", "high", "Exfiltración", {
          description: "El flujo lee datos, los empaqueta en un archivo comprimido y usa la red. Es un patrón habitual para preparar y enviar información del servidor.",
          reason: "Coinciden en la misma cadena de llamadas APIs de archivo comprimido, escritura, recolección de datos y red.",
          confidence: 84,
          line: apiLine(ctx, B.ARCHIVE),
          offset: apiOffset(ctx, B.ARCHIVE),
          api: apiLabels(ctx, B.ARCHIVE, 1)[0] || null,
          evidence: aEvidence,
          falsePositives: [
            "Sistemas de backup que comprimen y suben copias con autorización.",
            "Envío de logs o diagnósticos a un servicio del autor."
          ],
          recommendation: "Comprueba qué se comprime y a dónde se envía. Bloquea la salida si no está documentado."
        });
      }
    });

    /* ---- resources: text, configs and scripts ---- */
    var resourceKeys = Object.keys(textFiles);
    var resourceSecrets = [];
    var resourceEndpoints = [];
    var resourceScripts = [];
    var scannedResources = 0;
    resourceKeys.slice(0, 160).forEach(function (name) {
      var text = textFiles[name];
      if (typeof text !== "string" || !text) return;
      if (text.length > 40000) text = text.slice(0, 40000);
      scannedResources++;
      var info = A.inspectString(text);
      info.secrets.forEach(function (s) {
        if (s.example) return;
        if (resourceSecrets.length < 12) resourceSecrets.push({ name: name, label: s.label, value: s.value });
      });
      info.urls.forEach(function (u) {
        if (!u.host) return;
        var traits = A.hostTraits(u.host);
        if (traits.local) return;
        if (resourceEndpoints.length < 14) resourceEndpoints.push({ name: name, url: u.url, host: u.host, webhook: traits.webhook, tunnel: traits.tunnel, ip: traits.ip });
      });
      if (/(powershell(\.exe)?\s+-(enc|e|command)|Invoke-Expression|\bIEX\s*\(|curl\s+[^|]+\|\s*(sh|bash)|wget\s+[^|]+\|\s*(sh|bash)|base64\s+(-d|--decode))/i.test(text)) {
        if (resourceScripts.length < 8) resourceScripts.push(name);
      }
    });

    if (resourceSecrets.length) {
      addFinding(A.newFinding("resource-secret", "Credenciales en archivos de configuración", "high", "Secretos", {
        description: "Los recursos de texto del JAR contienen valores con forma de credencial. Un recurso es tan visible como el código al descomprimir el archivo.",
        reason: "El contenido del recurso coincide con patrones de tokens, claves o contraseñas.",
        confidence: 84,
        evidence: resourceSecrets.map(function (s) { return s.name + " · " + s.label + ": " + s.value; }),
        locations: resourceSecrets.slice(0, 6).map(function (s) {
          return { className: null, method: null, line: null, source: s.name, archive: s.name.indexOf("!/") !== -1 ? s.name.split("!/")[0] : null, dependency: false, library: null };
        }),
        source: resourceSecrets[0].name,
        archive: null,
        falsePositives: ["Plantillas de configuración con valores de ejemplo."],
        recommendation: "Sustituye los valores reales por marcadores antes de publicar el plugin.",
        dedupeKey: "res|secrets"
      }));
    }

    if (resourceEndpoints.length) {
      var suspicious = resourceEndpoints.filter(function (u) { return u.webhook || u.tunnel || u.ip; });
      addFinding(A.newFinding("resource-endpoints", "Endpoints declarados en recursos", suspicious.length ? "medium" : "info", "Red", {
        description: "Los archivos de configuración o recursos de texto contienen URLs. GuardX las muestra porque el código puede leerlas en tiempo de ejecución aunque no aparezcan en el bytecode.",
        reason: "Se encontraron URLs en recursos de texto del paquete (incluidos los anidados).",
        confidence: 70,
        evidence: resourceEndpoints.slice(0, 10).map(function (u) {
          return u.name + " → " + u.url + (u.webhook ? " (webhook)" : "") + (u.tunnel ? " (túnel)" : "") + (u.ip ? " (IP)" : "");
        }),
        locations: resourceEndpoints.slice(0, 6).map(function (u) {
          return { className: null, method: null, line: null, source: u.name, archive: u.name.indexOf("!/") !== -1 ? u.name.split("!/")[0] : null, dependency: false, library: null };
        }),
        source: resourceEndpoints[0].name,
        archive: null,
        falsePositives: ["Enlaces de documentación, donaciones o soporte del autor."],
        recommendation: "Comprueba si el plugin envía datos a esos endpoints o solo los muestra.",
        dedupeKey: "res|endpoints"
      }));
    }

    if (resourceScripts.length) {
      addFinding(A.newFinding("resource-script", "Comandos peligrosos en recursos de texto", "high", "Ejecución", {
        description: "Un recurso de texto contiene instrucciones típicas de descarga y ejecución (PowerShell codificado, curl/wget a shell, Base64). Aunque no es código Java, puede ejecutarse desde el plugin o por el administrador.",
        reason: "El texto del recurso coincide con patrones de ejecución remota de comandos.",
        confidence: 86,
        evidence: resourceScripts.slice(0, 8),
        locations: resourceScripts.slice(0, 6).map(function (n) {
          return { className: null, method: null, line: null, source: n, archive: n.indexOf("!/") !== -1 ? n.split("!/")[0] : null, dependency: false, library: null };
        }),
        source: resourceScripts[0],
        archive: null,
        falsePositives: ["Scripts de instalación documentados por el autor."],
        recommendation: "No ejecutes esos comandos; revisa qué descargan y desde dónde.",
        dedupeKey: "res|scripts"
      }));
    }

    /* ---- obfuscation and parsing coverage ---- */
    var obf = {
      totalClasses: 0,
      analyzedClasses: 0,
      shortClassNames: 0,
      namedMethods: 0,
      shortMethods: 0,
      syntheticMethods: 0,
      totalMethods: 0,
      decodeErrors: 0,
      duplicateNames: 0,
      score: 0,
      level: "none",
      samples: [],
      duplicates: []
    };
    var nameArchives = Object.create(null);
    var depClasses = 0;
    var depMap = Object.create(null);
    var nestedClasses = 0;

    classes.forEach(function (cl) {
      if (!cl.className) return;
      if (cl.archive) nestedClasses++;
      var loc = locate(cl.className, cl.archive);
      if (loc.dependency) {
        depClasses++;
        var key = loc.library || loc.packageName;
        var dep = depMap[key] || (depMap[key] = { name: key, classes: 0, methods: 0, archives: [], samples: [] });
        dep.classes++;
        dep.methods += (cl.methods || []).length;
        if (cl.archive && dep.archives.indexOf(cl.archive) === -1 && dep.archives.length < 6) dep.archives.push(cl.archive);
        if (dep.samples.length < 4 && dep.samples.indexOf(cl.className) === -1) dep.samples.push(cl.className);
        return;
      }
      obf.totalClasses++;
      var simple = A.simpleName(cl.className).replace(/\$/g, "");
      if (simple.length <= 2 || /^[a-z]{1,2}\d{0,2}$/i.test(simple)) {
        obf.shortClassNames++;
        if (obf.samples.length < 8) obf.samples.push(cl.className);
      }
      (cl.methods || []).forEach(function (m) {
        obf.totalMethods++;
        if (m.synthetic) obf.syntheticMethods++;
        if (m.name === "<init>" || m.name === "<clinit>") return;
        obf.namedMethods++;
        var bare = m.name.replace(/\$/g, "");
        if (bare.length <= 2 || /^[a-z]{1,2}\d{0,2}$/i.test(bare)) obf.shortMethods++;
      });
      if (cl.decodeErrors && cl.decodeErrors.length) {
        obf.decodeErrors += cl.decodeErrors.length;
        obf.analyzedClasses++;
      }
      var key2 = cl.className;
      (nameArchives[key2] || (nameArchives[key2] = [])).push(cl.archive || "(raíz)");
    });

    Object.keys(nameArchives).forEach(function (name) {
      var archives = nameArchives[name];
      if (archives.length < 2) return;
      var unique = [];
      archives.forEach(function (a) { if (unique.indexOf(a) === -1) unique.push(a); });
      if (unique.length < 2) return;
      obf.duplicateNames++;
      if (obf.duplicates.length < 6) obf.duplicates.push({ className: name, archives: unique });
    });

    if (obf.totalClasses >= 4) {
      var classRatio = obf.shortClassNames / obf.totalClasses;
      var methodRatio = obf.namedMethods ? obf.shortMethods / obf.namedMethods : 0;
      var synthRatio = obf.totalMethods ? obf.syntheticMethods / obf.totalMethods : 0;
      obf.score = Math.round(Math.min(100,
        classRatio * 52 + methodRatio * 34 + synthRatio * 8 +
        (obf.decodeErrors ? 6 : 0)));
      obf.level = obf.score >= 60 ? "high" : obf.score >= 30 ? "medium" : obf.score >= 12 ? "low" : "none";
      if (obf.score >= 25) {
        var oEvidence = [
          obf.shortClassNames + " de " + obf.totalClasses + " clases tienen nombres de 1-2 caracteres.",
          obf.shortMethods + " de " + obf.namedMethods + " métodos tienen nombres de 1-2 caracteres.",
          obf.syntheticMethods + " métodos sintéticos (lambdas/bridges)."
        ];
        if (obf.samples.length) oEvidence.push("Ejemplos: " + obf.samples.join(", "));
        addFinding(A.newFinding("obfuscation", "Nombres de clase y método ofuscados", obf.level === "high" ? "medium" : "low", "Ofuscación", {
          description: "Una proporción alta de clases y métodos tiene nombres muy cortos. Es propio de código ofuscado, aunque algunas librerías empaquetadas también lo hacen.",
          reason: "Se calculó la proporción de nombres cortos sobre las clases que no pertenecen a librerías conocidas.",
          confidence: obf.level === "high" ? 78 : 62,
          evidence: oEvidence,
          source: obf.samples[0] || null,
          falsePositives: ["Librerías sombreadas u ofuscadas por su autor.", "Generadores de código y proxies."],
          recommendation: "La ofuscación no es maliciosa por sí sola, pero dificulta la revisión. Cruza este dato con las capacidades detectadas.",
          dedupeKey: "global|obfuscation"
        }));
      }
    }

    var parseErrors = classes.reduce(function (n, cl) { return n + ((cl.decodeErrors && cl.decodeErrors.length) || 0); }, 0);
    if (parseErrors || coverage.truncated || (coverage.unparsedClasses || 0) > 0) {
      var pEvidence = [];
      pEvidence.push((coverage.parsedClasses || classes.length) + " clases analizadas de " + (coverage.classEntries || classes.length) + " entradas .class.");
      if (parseErrors) pEvidence.push(parseErrors + " métodos o atributos no se pudieron decodificar por completo.");
      if (coverage.unparsedClasses) pEvidence.push(coverage.unparsedClasses + " clases no se pudieron interpretar.");
      (coverage.unparsedSamples || []).slice(0, 6).forEach(function (s) { pEvidence.push("Sin interpretar: " + s); });
      (coverage.notes || []).slice(0, 4).forEach(function (n) { pEvidence.push(n); });
      addFinding(A.newFinding("parse-coverage", "Cobertura parcial del análisis", "info", "Cobertura", {
        description: "Parte del bytecode no se pudo interpretar por completo (atributos desconocidos, clases truncadas o límites de tamaño). Los hallazgos mostrados son reales, pero puede haber código no evaluado.",
        reason: "El analizador registró errores de decodificación o alcanzó un límite explícito.",
        confidence: 99,
        evidence: pEvidence,
        falsePositives: [],
        recommendation: "Si necesitas certeza total, analiza las clases señaladas con una herramienta como javap o un descompilador.",
        dedupeKey: "global|coverage"
      }));
    }

    /* ---- cross-class attack chain ---- */
    var globalMask = 0;
    contexts.forEach(function (ctx) { globalMask |= ctx.mask; });
    var hasExec = !!(globalMask & B.EXEC);
    var hasNet = !!(globalMask & NETWORK);
    var hasCollect = !!(globalMask & COLLECT);
    var hasLoad = !!(globalMask & (B.CLASSLOADER | B.CLASS_LOAD));
    var hasDecode = !!(globalMask & B.DECODE);
    var hasPriv = !!(globalMask & (B.UNSAFE | B.INSTRUMENT | B.ATTACH));

    if (hasExec && hasNet && hasCollect) {
      addFinding(A.newFinding("attack-chain", "Cadena completa de recolección, ejecución y red", "critical", "Exfiltración", {
        description: "En el mismo archivo coexisten recolección de información, ejecución de procesos y comunicación de red. Aunque estén en clases distintas, la combinación permite operar el servidor de forma remota.",
        reason: "Se agregaron las capacidades reales de todas las clases analizadas (incluidas las anidadas) y las tres categorías están presentes.",
        confidence: 84,
        evidence: [
          "Ejecución de procesos detectada en el bytecode.",
          "Recolección de archivos, entorno, configuración o información del servidor.",
          "APIs de red (HTTP o sockets) presentes en el archivo."
        ],
        falsePositives: [
          "Paneles de administración remota instalados deliberadamente.",
          "Plugins de backup o monitorización con todas esas funciones."
        ],
        recommendation: "Audita el flujo completo antes de instalar. Es la combinación de mayor riesgo del análisis estático.",
        dedupeKey: "global|attack-chain"
      }));
    } else if (hasNet && hasLoad && hasDecode) {
      addFinding(A.newFinding("downloader-chain", "Descarga y carga de código en tiempo de ejecución", "high", "Carga dinámica", {
        description: "El archivo combina red, decodificación y carga de clases. Es el patrón de un cargador que descarga u obtiene código y lo ejecuta sin dejarlo como archivo visible.",
        reason: "Las tres capacidades aparecen en clases analizadas del mismo archivo.",
        confidence: 80,
        evidence: [
          "APIs de red presentes.",
          "Decodificación Base64/hex presente.",
          "Carga o definición dinámica de clases presente."
        ],
        falsePositives: ["Sistemas de módulos o actualizadores firmados."],
        recommendation: "Localiza el origen del bytecode y verifica su firma antes de ejecutarlo.",
        dedupeKey: "global|downloader-chain"
      }));
    }

    if (hasPriv && hasLoad) {
      addFinding(A.newFinding("runtime-tampering", "Capacidad de modificar la JVM y cargar código", "critical", "Evasión", {
        description: "El archivo puede transformar clases en ejecución o inyectar agentes y además carga clases. Esto afecta a otros plugins y al propio servidor, fuera del alcance del plugin original.",
        reason: "Se agregaron las capacidades de instrumentación/Unsafe y de carga dinámica de todas las clases.",
        confidence: 86,
        evidence: ["Instrumentación, attach o Unsafe detectados.", "Carga o definición de clases detectada."],
        falsePositives: ["Agentes de observabilidad legítimos."],
        recommendation: "No lo instales en un servidor de producción sin una auditoría manual.",
        dedupeKey: "global|runtime-tampering"
      }));
    }

    /* ---- dependencies ---- */
    var dependencies = Object.keys(depMap).map(function (k) {
      var d = depMap[k];
      return {
        name: d.name,
        classes: d.classes,
        methods: d.methods,
        archives: d.archives,
        samples: d.samples
      };
    }).sort(function (a, b) { return b.classes - a.classes; }).slice(0, 40);

    /* ---- endpoint aggregation ---- */
    var allEndpoints = endpointEntries.concat(fieldEndpoints);
    allEndpoints.forEach(function (ep) {
      if (!ep.risk) ep.risk = "info";
      if (!ep.usage) ep.usage = "sin API directa";
    });
    var hostMap = Object.create(null);
    allEndpoints.forEach(function (ep) {
      var host = ep.host;
      if (!host) return;
      var h = hostMap[host] || (hostMap[host] = {
        host: host,
        count: 0,
        endpoints: [],
        classes: [],
        methods: [],
        schemes: [],
        archives: [],
        risk: "info",
        ip: !!ep.ip,
        webhook: !!ep.webhook,
        tunnel: !!ep.tunnel,
        local: !!ep.local,
        nested: false
      });
      var dup = h.endpoints.some(function (e) {
        return e.url === ep.url && e.className === ep.className && e.method === ep.method && e.archive === ep.archive;
      });
      if (!dup) {
        h.endpoints.push(ep);
        h.count++;
      }
      if (ep.className && h.classes.indexOf(ep.className) === -1 && h.classes.length < 12) h.classes.push(ep.className);
      var label = (ep.className || ep.source || "") + (ep.method ? "#" + ep.method : "");
      if (label && h.methods.indexOf(label) === -1 && h.methods.length < 12) h.methods.push(label);
      if (ep.scheme && h.schemes.indexOf(ep.scheme) === -1) h.schemes.push(ep.scheme);
      if (ep.archive) {
        h.nested = true;
        if (h.archives.indexOf(ep.archive) === -1 && h.archives.length < 6) h.archives.push(ep.archive);
      }
      h.risk = A.maxSeverity(h.risk, ep.risk || "info");
      h.ip = h.ip || !!ep.ip;
      h.webhook = h.webhook || !!ep.webhook;
      h.tunnel = h.tunnel || !!ep.tunnel;
      h.local = h.local || !!ep.local;
    });
    var endpoints = Object.keys(hostMap).map(function (k) { return hostMap[k]; });
    endpoints.sort(function (a, b) {
      var d = A.SEVERITY_ORDER[a.risk] - A.SEVERITY_ORDER[b.risk];
      if (d !== 0) return d;
      return b.count - a.count || a.host.localeCompare(b.host);
    });
    var urlSeen = Object.create(null);
    var urls = [];
    allEndpoints.forEach(function (ep) {
      if (urlSeen[ep.url]) return;
      urlSeen[ep.url] = 1;
      urls.push(ep.url);
    });

    /* ---- capability summary ---- */
    var CAPABILITY_DEFS = [
      { id: "network", label: "Comunicación de red", mask: NETWORK, severity: "low", category: "Red" },
      { id: "network-write", label: "Envío de datos a la red", mask: WRITE, severity: "medium", category: "Red" },
      { id: "process-execution", label: "Ejecución de procesos", mask: B.EXEC, severity: "critical", category: "Ejecución" },
      { id: "classloading", label: "Carga dinámica de clases", mask: B.CLASSLOADER | B.CLASS_LOAD, severity: "high", category: "Carga dinámica" },
      { id: "reflection", label: "Reflexión", mask: B.REFLECT, severity: "low", category: "Reflexión" },
      { id: "unsafe", label: "Unsafe / instrumentación", mask: B.UNSAFE | B.INSTRUMENT | B.ATTACH, severity: "critical", category: "Evasión" },
      { id: "native", label: "Bibliotecas nativas", mask: B.NATIVE, severity: "high", category: "Nativo" },
      { id: "file-read", label: "Lectura de archivos", mask: B.FILE_READ, severity: "low", category: "Archivos" },
      { id: "file-write", label: "Escritura de archivos", mask: B.FILE_WRITE, severity: "medium", category: "Archivos" },
      { id: "archive", label: "Manejo de ZIP/JAR", mask: B.ARCHIVE, severity: "medium", category: "Archivos" },
      { id: "environment", label: "Lectura de entorno", mask: B.ENV, severity: "medium", category: "Recolección" },
      { id: "server-info", label: "Información del servidor", mask: B.SERVER_INFO, severity: "low", category: "Recolección" },
      { id: "config", label: "Acceso a configuración", mask: B.CONFIG_READ | B.CONFIG_WRITE, severity: "low", category: "Configuración" },
      { id: "sensitive", label: "Valores sensibles", mask: B.SENSITIVE, severity: "high", category: "Secretos" },
      { id: "decode", label: "Decodificación Base64/hex", mask: B.DECODE, severity: "medium", category: "Ofuscación" },
      { id: "crypto", label: "Criptografía", mask: B.CRYPTO, severity: "low", category: "Criptografía" },
      { id: "proxy", label: "Proxies dinámicos", mask: B.PROXY, severity: "low", category: "Reflexión" }
    ];
    var capabilities = [];
    CAPABILITY_DEFS.forEach(function (def) {
      var count = 0;
      var classSet = [];
      var methodSet = [];
      contexts.forEach(function (ctx) {
        if (!(ctx.mask & def.mask)) return;
        count++;
        if (classSet.indexOf(ctx.className) === -1 && classSet.length < 10) classSet.push(ctx.className);
        if (methodSet.length < 6) methodSet.push(ctx.className + "#" + ctx.display);
      });
      if (!count) return;
      capabilities.push({
        id: def.id,
        label: def.label,
        severity: def.severity,
        category: def.category,
        count: count,
        classes: classSet,
        methods: methodSet
      });
    });
    capabilities.sort(function (a, b) {
      return A.SEVERITY_ORDER[a.severity] - A.SEVERITY_ORDER[b.severity] || b.count - a.count;
    });

    /* ---- stats ---- */
    var instructionTotal = 0;
    var stringTotal = 0;
    classes.forEach(function (cl) {
      (cl.methods || []).forEach(function (m) {
        instructionTotal += (m.instructions || []).length;
      });
    });
    contexts.forEach(function (ctx) { stringTotal += ctx.strings.length; });

    var durationMs = Math.round(((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - t0);
    var stats = {
      classCount: classes.length,
      methodCount: methodCount,
      instructionCount: instructionTotal,
      stringCount: stringTotal,
      endpointCount: allEndpoints.length,
      hostCount: endpoints.length,
      dependencyClassCount: depClasses,
      dependencyCount: dependencies.length,
      nestedClassCount: nestedClasses,
      capabilityCount: capabilities.length,
      findingCount: findings.length,
      resourceScanned: scannedResources,
      durationMs: durationMs,
      apiCounts: (function () {
        var counts = Object.create(null);
        contexts.forEach(function (ctx) {
          ctx.apis.forEach(function (a) { counts[a.api] = (counts[a.api] || 0) + 1; });
        });
        return counts;
      })()
    };

    var coverageOut = {
      classEntries: coverage.classEntries == null ? classes.length : coverage.classEntries,
      parsedClasses: coverage.parsedClasses == null ? classes.length : coverage.parsedClasses,
      skippedClasses: coverage.skippedClasses || 0,
      unparsedClasses: coverage.unparsedClasses || 0,
      unparsedSamples: coverage.unparsedSamples || [],
      truncated: !!coverage.truncated,
      notes: coverage.notes || [],
      archives: coverage.archives || (meta.nestedArchiveCount || 0) + 1,
      nestedArchives: coverage.nestedArchives || meta.nestedArchiveCount || 0,
      parseErrors: parseErrors,
      resourceFiles: resourceKeys.length,
      resourceScanned: scannedResources
    };

    return {
      findings: findings,
      endpoints: endpoints,
      endpointCount: allEndpoints.length,
      dependencies: dependencies,
      obfuscation: obf,
      capabilities: capabilities,
      stats: stats,
      classStats: classStats,
      urls: urls,
      coverage: coverageOut
    };

  }

  GX.analysis.analyze = analyze;
})(window);
