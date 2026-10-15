// Cloudflare Worker: serves the page and proxies CheerpX + the Debian disk image
// through your own domain, so networks that block leaningtech.com / webvm.io still work.
const HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#000000\">\n<title>Termux Web</title>\n<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css\" crossorigin=\"anonymous\">\n<style>\n  :root { --keybar: #1b1b1b; --key: #2c2c2c; --key-on: #5c9dff; --fg: #e6e6e6; }\n  * { box-sizing: border-box; }\n  html, body { height: 100%; margin: 0; background: #000; color: var(--fg); }\n  body { display: flex; flex-direction: column; font-family: ui-monospace, \"DejaVu Sans Mono\", Menlo, Consolas, monospace; padding-top: env(safe-area-inset-top, 0px); }\n  #term { flex: 1; min-height: 0; padding: 6px 8px; }\n  #status { position: fixed; inset: 0 0 auto 0; padding: 6px 10px; font-size: 13px; color: #e5c07b; background: #000; pointer-events: none; z-index: 5; }\n  #status[hidden] { display: none; }\n  #keys { background: var(--keybar); display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0px)); }\n  #keys button { background: var(--key); color: var(--fg); border: 0; border-radius: 4px; font: 14px ui-monospace, monospace; padding: 11px 0; touch-action: manipulation; }\n  #keys button:active, #keys button.on { background: var(--key-on); color: #000; }\n  #keys button:focus-visible { outline: 2px solid var(--key-on); outline-offset: 1px; }\n  @media (min-width: 800px) { #keys { display: none; } #term { padding: 12px 16px; } }\n</style>\n<script src=\"https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js\" crossorigin=\"anonymous\"></script>\n<script src=\"https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js\" crossorigin=\"anonymous\"></script>\n</head>\n<body>\n<div id=\"status\" role=\"status\">Starting Linux&hellip; the first load downloads the CheerpX runtime.</div>\n<div id=\"term\"></div>\n<div id=\"keys\">\n  <button data-s=\"&#27;\">ESC</button><button data-s=\"/\">/</button><button data-s=\"-\">&minus;</button>\n  <button data-s=\"&#27;[H\">HOME</button><button data-s=\"&#27;[A\">&uarr;</button><button data-s=\"&#27;[F\">END</button><button data-s=\"&#27;[5~\">PGUP</button>\n  <button data-s=\"&#9;\">TAB</button><button data-m=\"ctrl\">CTRL</button><button data-m=\"alt\">ALT</button>\n  <button data-s=\"&#27;[D\">&larr;</button><button data-s=\"&#27;[B\">&darr;</button><button data-s=\"&#27;[C\">&rarr;</button><button data-s=\"&#27;[6~\">PGDN</button>\n</div>\n\n<script type=\"module\">\nconst status = document.getElementById(\"status\");\nconst say = t => { status.style.color = \"\"; status.textContent = t; status.hidden = !t; };\nconst fail = m => { status.hidden = false; status.style.color = \"#ff6b6b\"; status.textContent = m; };\naddEventListener(\"error\", e => fail(\"Error: \" + e.message));\naddEventListener(\"unhandledrejection\", e => fail(\"Error: \" + ((e.reason && e.reason.message) || e.reason)));\nif (typeof Terminal === \"undefined\" || typeof FitAddon === \"undefined\") {\n  fail(\"xterm.js failed to load from cdn.jsdelivr.net (blocked or offline). Try another network or disable ad blockers.\");\n  throw new Error(\"xterm missing\");\n}\nsay(\"crossOriginIsolated = \" + crossOriginIsolated + \" \\u2014 loading CheerpX runtime\\u2026\");\n\n// ---- terminal (xterm.js) with a Termux-like palette ----\nconst term = new Terminal({\n  cursorBlink: true, fontSize: 15, convertEol: true,\n  fontFamily: 'ui-monospace, \"DejaVu Sans Mono\", Menlo, Consolas, monospace',\n  theme: { background: \"#000000\", foreground: \"#e6e6e6\", cursor: \"#e6e6e6\" },\n});\nconst fit = new FitAddon.FitAddon();\nterm.loadAddon(fit);\nterm.open(document.getElementById(\"term\"));\nfit.fit();\n\ntry {\n  // ---- real x86 Linux (Debian) running in WebAssembly ----\n  if (!crossOriginIsolated) throw new Error(\"Page is not cross-origin isolated: the COOP + COEP headers are missing (deploy worker.js, it adds them).\");\n  const CheerpX = await import(\"/cx/1.2.8/cx.esm.js\");\n  say(\"Connecting to disk image\\u2026\");\n  const cloud = await CheerpX.CloudDevice.create((location.protocol === \"https:\" ? \"wss://\" : \"ws://\") + location.host + \"/disk/debian_large_20230522_5044875331.ext2\");\n  const idb = await CheerpX.IDBDevice.create(\"termux-web-disk\"); // persists your changes in this browser\n  if (location.hash === \"#reset\") { await idb.reset(); history.replaceState(null, \"\", location.pathname); }\n  const overlay = await CheerpX.OverlayDevice.create(cloud, idb);\n  const web = await CheerpX.WebDevice.create(\"\");\n  const data = await CheerpX.DataDevice.create();\n\n  say(\"Booting\\u2026\");\n  const cx = await CheerpX.Linux.create({\n    mounts: [\n      { type: \"ext2\", path: \"/\", dev: overlay },\n      { type: \"dir\", path: \"/app\", dev: web },\n      { type: \"dir\", path: \"/data\", dev: data },\n      { type: \"devs\", path: \"/dev\" },\n    ],\n  });\n\n  const send = cx.setCustomConsole(buf => term.write(new Uint8Array(buf)), term.cols, term.rows);\n  const enc = new TextEncoder();\n  let ctrl = false, alt = false;\n  const toggle = (name, on) => document.querySelector(`[data-m=\"${name}\"]`).classList.toggle(\"on\", on);\n  const feed = str => { for (const b of enc.encode(str)) send(b); };\n  const input = str => {\n    if (ctrl && str.length === 1) { const c = str.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) str = String.fromCharCode(c - 64); ctrl = false; toggle(\"ctrl\", false); }\n    if (alt) { str = \"\\x1b\" + str; alt = false; toggle(\"alt\", false); }\n    feed(str);\n  };\n\n  term.onData(input);\n  document.getElementById(\"keys\").addEventListener(\"pointerdown\", e => e.preventDefault()); // keep the soft keyboard open\n  document.getElementById(\"keys\").addEventListener(\"click\", e => {\n    const b = e.target.closest(\"button\"); if (!b) return;\n    if (b.dataset.m === \"ctrl\") { ctrl = !ctrl; toggle(\"ctrl\", ctrl); }\n    else if (b.dataset.m === \"alt\") { alt = !alt; toggle(\"alt\", alt); }\n    else input(b.dataset.s);\n    term.focus();\n  });\n  addEventListener(\"click\", () => term.focus());\n\n  say(\"\");\n  term.focus();\n  term.writeln(\"\\x1b[1mWelcome to Termux Web!\\x1b[0m\");\n  term.writeln(\"Real Debian (x86) running in your browser. Try: \\x1b[32mpython3 -V\\x1b[0m, \\x1b[32mgcc --version\\x1b[0m, \\x1b[32mls /usr/bin\\x1b[0m\");\n  term.writeln(\"Changes persist in this browser. Open /#reset to wipe them.\\n\");\n\n  // Bash without profile files so the Termux-style prompt below is used.\n  for (;;) {\n    await cx.run(\"/bin/bash\", [\"--noprofile\", \"--norc\", \"-i\"], {\n      env: [\n        \"HOME=/home/user\", \"USER=user\", \"SHELL=/bin/bash\", \"EDITOR=vim\",\n        \"LANG=en_US.UTF-8\", \"LC_ALL=C\", \"TERM=xterm-256color\",\n        \"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\",\n        \"PS1=\\\\[\\\\e[32m\\\\]\\\\w\\\\[\\\\e[0m\\\\] $ \",\n      ],\n      cwd: \"/home/user\", uid: 1000, gid: 1000,\n    });\n    term.writeln(\"\\r\\n[session ended \\u2014 restarting shell]\");\n  }\n} catch (err) {\n  console.error(err);\n  fail(\"Could not start Linux: \" + (err && err.message || err));\n  term.writeln(\"\\x1b[31mCould not start Linux: \" + (err && err.message || err) + \"\\x1b[0m\");\n  term.writeln(\"Make sure worker.js is deployed: it proxies CheerpX and the disk image and adds the COOP/COEP headers.\");\n}\n</script>\n</body>\n</html>\n";

const CX_ORIGIN = "https://cxrtnc.leaningtech.com";
const DISK_ORIGIN = "https://disks.webvm.io";

// Headers CheerpX needs (SharedArrayBuffer requires cross-origin isolation).
const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function withIsolation(resp, extra = {}) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries({ ...ISOLATION, ...extra })) r.headers.set(k, v);
  return r;
}

async function proxyCheerpX(request, url) {
  const target = CX_ORIGIN + url.pathname.slice("/cx".length) + url.search;
  const headers = { Accept: request.headers.get("Accept") || "*/*" };
  const range = request.headers.get("Range");
  if (range) headers.Range = range;
  const up = await fetch(target, { method: request.method, headers, cf: { cacheEverything: true, cacheTtl: 31536000 } });
  return withIsolation(up, { "Cache-Control": "public, max-age=31536000, immutable" });
}

async function proxyDisk(request, url) {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
  const target = DISK_ORIGIN + url.pathname.slice("/disk".length) + url.search;
  const up = await fetch(target, { headers: { Upgrade: "websocket" } });
  const upstream = up.webSocket;
  if (!upstream) return new Response("Disk server refused the connection (HTTP " + up.status + ")", { status: 502 });

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  upstream.accept();
  server.addEventListener("message", e => { try { upstream.send(e.data); } catch {} });
  upstream.addEventListener("message", e => { try { server.send(e.data); } catch {} });
  const closeBoth = e => { try { server.close(e.code && e.code !== 1005 ? e.code : 1000, e.reason); } catch {} try { upstream.close(e.code && e.code !== 1005 ? e.code : 1000, e.reason); } catch {} };
  server.addEventListener("close", closeBoth);
  upstream.addEventListener("close", closeBoth);
  server.addEventListener("error", () => { try { upstream.close(1011); } catch {} });
  upstream.addEventListener("error", () => { try { server.close(1011); } catch {} });
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/cx/")) return await proxyCheerpX(request, url);
      if (url.pathname.startsWith("/disk/")) return await proxyDisk(request, url);
    } catch (err) {
      return new Response("Proxy error: " + (err && err.message || err), { status: 502 });
    }
    return withIsolation(new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } }));
  },
};
