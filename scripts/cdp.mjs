#!/usr/bin/env node
// cdp.mjs — Thin CDP client for browser-use skill
// Zero dependencies. Connects to Chrome via Chrome DevTools Protocol.
//
// Usage:
//   cdp.mjs launch [--headless] [--port 9222]    Launch Chrome
//   cdp.mjs connect [--port 9222]                 Connect to running Chrome
//   cdp.mjs <ws-url> <command> [args...]          Run command on connected browser
//
// Commands: navigate, open, click, clkt, clicki, send, type, press, screenshot,
//           snapshot, state, evaluate, scroll, back, html, text, frames,
//           wait, tabs, newtab, focus, switch, cookies, close

import { spawn } from "child_process"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { tmpdir, homedir } from "os"
import { join } from "path"

const CDP_PORT = parseInt(process.env.CDP_PORT || "9222")
let _http

function httpGet(url) {
  return new Promise((resolve, reject) => {
    (_http ??= import("http")).then((http) =>
      http.get(url, (res) => {
        let d = ""
        res.on("data", (c) => (d += c))
        res.on("end", () => {
          try { resolve(JSON.parse(d)) }
          catch { reject(new Error(`Bad JSON from ${url}: ${d.slice(0, 200)}`)) }
        })
      }).on("error", reject)
    )
  })
}

// --- CDP WebSocket client ---

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.id = 0
    this.pending = new Map()
    this._events = new Map()
  }

  async connect() {
    let WS
    try {
      const mod = await import("ws")
      WS = mod.WebSocket
    } catch {
      if (globalThis.WebSocket) WS = globalThis.WebSocket
      else throw new Error("No WebSocket. Install 'ws' or use Node 22+")
    }
    return new Promise((resolve, reject) => {
      this.ws = new WS(this.wsUrl)
      this._native = typeof this.ws.addEventListener === "function"
      const on = (ev, fn) => this._native ? this.ws.addEventListener(ev, fn) : this.ws.on(ev, fn)
      on("open", () => resolve())
      on("error", (e) => reject(e))
      on("close", () => this._rejectAll("WebSocket closed"))
      on("message", (e) => this._onMessage(JSON.parse(this._native ? e.data : e.toString())))
    })
  }

  _rejectAll(reason) {
    for (const [id, { reject }] of this.pending) {
      reject(new Error(reason))
    }
    this.pending.clear()
  }

  _onMessage(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      msg.error ? reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : resolve(msg.result)
    } else if (msg.method) {
      const listeners = this._events.get(msg.method)
      if (listeners) for (const fn of listeners) fn(msg.params)
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v) },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  once(eventName, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs)
      const handler = (params) => {
        clearTimeout(timer)
        const arr = this._events.get(eventName)
        if (arr) { const idx = arr.indexOf(handler); if (idx >= 0) arr.splice(idx, 1) }
        resolve(params)
      }
      if (!this._events.has(eventName)) this._events.set(eventName, [])
      this._events.get(eventName).push(handler)
    })
  }

  close() { if (this.ws) this.ws.close() }
}

// --- HTTP helpers ---

const getBrowserWSEndpoint = (port) => httpGet(`http://127.0.0.1:${port}/json/version`).then((r) => r.webSocketDebuggerUrl)
const getTargets = (port) => httpGet(`http://127.0.0.1:${port}/json/list`)
const newTab = (port, url = "about:blank") => httpGet(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`)

// --- Port persistence ---

function getPortConfigDir() {
  const dir = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "buc")
  mkdirSync(dir, { recursive: true })
  return dir
}

function saveDefaultPort(port) {
  writeFileSync(join(getPortConfigDir(), "default-port"), String(port))
}

function loadDefaultPort() {
  try { return parseInt(readFileSync(join(getPortConfigDir(), "default-port"), "utf8").trim()) }
  catch { return 9222 }
}

// --- Chrome launch ---

function launchChrome(headless, port) {
  const dataDir = tmpdir() + "/buc-profile-" + port
  const args = [`--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", `--user-data-dir=${dataDir}`]
  if (headless) args.push("--headless=new")

  let chromePath = process.env.CHROME_PATH
  if (!chromePath) {
    for (const c of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"]) {
      if (existsSync(c)) { chromePath = c; break }
    }
  }
  if (!chromePath) {
    console.error(JSON.stringify({ error: "Chrome not found. Set CHROME_PATH or install Chrome/Chromium." }))
    process.exit(1)
  }
  const child = spawn(chromePath, args, { detached: true, stdio: "ignore" })
  child.unref()
  return child.pid
}

// --- Accessibility tree helpers ---

const SKIP_ROLES = new Set(["none", "generic", "paragraph", "StaticText", "list", "listitem", "row", "rowgroup", "table", "LabelText", "LineBreak", "main", "contentinfo", "banner", "sectionheader", "sectionfooter"])

function buildAXTree(nodes) {
  const nodeMap = new Map()
  for (const n of nodes) nodeMap.set(n.nodeId, n)
  const childIds = new Set()
  for (const n of nodes) for (const c of n.childIds || []) childIds.add(c)
  return { nodeMap, rootIds: [...new Set(nodes.filter((n) => !childIds.has(n.nodeId) || n.role?.value === "RootWebArea").map((n) => n.nodeId))] }
}

function walkAX(nodeMap, nodeId, lines, depth = 0, parentName = "", visited = new Set()) {
  if (visited.has(nodeId)) return
  visited.add(nodeId)
  const node = nodeMap.get(nodeId)
  if (!node) return
  const name = node.name?.value || ""
  const role = node.role?.value || ""
  const isSkip = role === "InlineTextBox" || (!name && SKIP_ROLES.has(role)) || (role === "StaticText" && name === parentName)
  if (role !== "RootWebArea" && (name || role) && !isSkip) {
    lines.push(`${"  ".repeat(depth)}[${role}] ${name}`.trimEnd())
  }
  const childDepth = (name && role !== "RootWebArea" && !isSkip) ? depth + 1 : depth
  const passName = (!isSkip && name) ? name : parentName
  for (const child of node.childIds || []) walkAX(nodeMap, child, lines, childDepth, passName, visited)
}

function extractClickable(nodes) {
  const clickable = []
  const { nodeMap, rootIds } = buildAXTree(nodes)
  const visited = new Set()
  function walk(nodeId) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) return
    const role = node.role?.value || ""
    const name = node.name?.value || ""
    const isInteractive = ["link", "button", "textbox", "checkbox", "radio", "combobox", "menuitem", "tab", "option", "switch", "slider"].includes(role)
      || node.properties?.some((p) => p.name === "focusable" && p.value?.value === true)
    if (isInteractive && name) {
      const ref = node.attributes?.find((a) => a.name === "ref" || a.name === "data-ref")?.value?.value
      clickable.push({ index: clickable.length + 1, role, name: name.slice(0, 80), ref: ref || null })
    }
    for (const child of node.childIds || []) walk(child)
  }
  for (const id of rootIds) walk(id)
  return clickable
}

// --- Commands ---

async function cmd_navigate(client, url) {
  await client.send("Page.enable")
  const loadPromise = client.once("Page.loadEventFired", 8000)
  await client.send("Page.navigate", { url })
  await loadPromise
  await new Promise((r) => setTimeout(r, 500))
  const r = await client.send("Runtime.evaluate", { expression: "document.title", returnByValue: true })
  return { success: true, title: r.result?.value, url }
}

async function cmd_click(client, selector) {
  const r = await client.send("Runtime.evaluate", {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {error:"not found"}; el.scrollIntoView({block:"center"}); el.click(); return {success:true, tag:el.tagName, text:el.textContent?.slice(0,100)} })()`,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, 1000))
  return r.result?.value || { success: true }
}

async function cmd_click_text(client, text) {
  // Use includes() for partial match instead of exact innerText match
  const r = await client.send("Runtime.evaluate", {
    expression: `(() => { const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.trim().includes(${JSON.stringify(text)})); if (!el) return {error:"not found"}; const clickable = el.closest('button, a, [role="button"], [role="link"], [jsaction]') || el; clickable.scrollIntoView({block:"center"}); clickable.click(); return {success:true, tag:clickable.tagName, text:clickable.textContent?.slice(0,100)} })()`,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, 1000))
  return r.result?.value || { success: true }
}

async function cmd_click_index(client, index) {
  // Click by accessibility tree index (like browser-use `click 5`)
  await client.send("Accessibility.enable")
  const { nodes } = await client.send("Accessibility.getFullAXTree")
  const clickable = extractClickable(nodes)
  const target = clickable[index - 1]
  if (!target) return { error: `No element at index ${index}. Available: 1-${clickable.length}` }

  // Use ref if available, otherwise find by text
  if (target.ref) {
    const r = await client.send("Runtime.evaluate", {
      expression: `(() => { const el = document.querySelector('[data-ref="${target.ref}"]') || document.querySelector('[ref="${target.ref}"]'); if (!el) return {error:"ref not found"}; el.scrollIntoView({block:"center"}); el.click(); return {success:true, tag:el.tagName, text:el.textContent?.slice(0,100)} })()`,
      returnByValue: true,
    })
    await new Promise((r) => setTimeout(r, 1000))
    return r.result?.value || { success: true }
  }

  // Fallback: find by role + text
  const r = await client.send("Runtime.evaluate", {
    expression: `(() => { const els = document.querySelectorAll('${target.role === "link" ? "a" : target.role === "button" ? "button" : "input, textarea, select, [role]"}}'); for (const el of els) { if (el.textContent?.trim().includes(${JSON.stringify(target.name.slice(0, 30))})) { el.scrollIntoView({block:"center"}); el.click(); return {success:true, tag:el.tagName} } } return {error:"not found by text"} })()`,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, 1000))
  return r.result?.value || { success: true }
}

async function cmd_send(client, text) {
  // Find visible input: textbox, search, textarea, or contenteditable
  await client.send("Runtime.evaluate", {
    expression: `(() => { const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable="true"]'); for (const el of inputs) { const rect = el.getBoundingClientRect(); const style = getComputedStyle(el); if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') { el.focus(); return true; } } return false })()`,
    returnByValue: true,
  })
  await client.send("Input.insertText", { text })
  await new Promise((r) => setTimeout(r, 300))
  await client.send("Runtime.evaluate", {
    expression: `(() => { const el = document.activeElement; if (!el) return; el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',code:'Enter',keyCode:13,bubbles:true,cancelable:true})) })()`,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, 1000))
  return { success: true, sent: text.length }
}

async function cmd_type(client, selector, text) {
  // Focus element and clear using select+delete (works with React controlled inputs)
  await client.send("Runtime.evaluate", {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.select(); document.execCommand('delete'); return true })()`,
    returnByValue: true,
  })
  await client.send("Input.insertText", { text })
  return { success: true, typed: text.length }
}

async function cmd_press(client, key) {
  const keys = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  }
  const info = keys[key] || { key, code: key }
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...info })
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...info })
  return { success: true, key }
}

async function cmd_screenshot(client, path) {
  const { data } = await client.send("Page.captureScreenshot", { format: "png" })
  const buf = Buffer.from(data, "base64")
  if (path) {
    writeFileSync(path, buf)
    return { success: true, path, size: buf.length }
  }
  return { success: true, base64: data.slice(0, 100) + "...(truncated)", fullLength: data.length }
}

async function cmd_snapshot(client) {
  await client.send("Accessibility.enable")
  const { nodes } = await client.send("Accessibility.getFullAXTree")
  const { nodeMap, rootIds } = buildAXTree(nodes)
  const lines = []
  const visited = new Set()
  for (const id of rootIds) walkAX(nodeMap, id, lines, 0, "", visited)
  return { success: true, snapshot: lines.join("\n").slice(0, 15000) }
}

async function cmd_state(client) {
  // Show numbered clickable elements (like browser-use `state`)
  await client.send("Accessibility.enable")
  const { nodes } = await client.send("Accessibility.getFullAXTree")
  const clickable = extractClickable(nodes)
  return { success: true, elements: clickable, count: clickable.length }
}

async function cmd_evaluate(client, js) {
  const r = await client.send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return { error: r.exceptionDetails.text || "Eval failed" }
  return { success: true, result: r.result?.value }
}

async function cmd_scroll(client, dir) {
  const js = { up: "scrollBy(0,-innerHeight*.8)", down: "scrollBy(0,innerHeight*.8)", top: "scrollTo(0,0)", bottom: "scrollTo(0,document.body.scrollHeight)" }
  await client.send("Runtime.evaluate", { expression: `window.${js[dir] || js.down}`, returnByValue: true })
  const pos = await client.send("Runtime.evaluate", { expression: "({scrollY: window.scrollY, scrollMax: document.body.scrollHeight - innerHeight})", returnByValue: true })
  return { success: true, direction: dir || "down", ...pos.result?.value }
}

const cmd_back = async (client) => {
  await client.send("Runtime.evaluate", { expression: "history.back()", returnByValue: true })
  await new Promise((r) => setTimeout(r, 1000))
  return { success: true }
}

async function cmd_html(client, selector) {
  const expr = selector ? `document.querySelector(${JSON.stringify(selector)})?.innerHTML||""` : `document.documentElement.outerHTML`
  const r = await client.send("Runtime.evaluate", { expression: expr, returnByValue: true })
  return { success: true, html: r.result?.value?.slice(0, 10000) }
}

const cmd_text = async (client, selector) => {
  const expr = selector ? `document.querySelector(${JSON.stringify(selector)})?.textContent||""` : `document.body.innerText`
  const r = await client.send("Runtime.evaluate", { expression: expr, returnByValue: true })
  return { success: true, text: r.result?.value?.slice(0, 10000) }
}

async function cmd_wait(client, type, target) {
  if (type === "selector") {
    const timeout = parseInt(target) || 30000
    const r = await client.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => { let elapsed = 0; const check = () => { const el = document.querySelector(${JSON.stringify(target)}); if (el) resolve({found:true, tag:el.tagName}); else if (elapsed >= ${timeout}) resolve({found:false, error:"timeout"}); else { elapsed += 200; setTimeout(check, 200) } }; check() })`,
      returnByValue: true, awaitPromise: true,
    })
    return r.result?.value || { found: false }
  }
  if (type === "load") {
    const ev = await client.once("Page.loadEventFired", parseInt(target) || 10000)
    return { success: !!ev }
  }
  // Bare number: wait N ms
  const ms = parseInt(type) || 1000
  await new Promise((r) => setTimeout(r, ms))
  return { success: true, waited: ms }
}

async function cmd_frames(client) {
  const { frameTree } = await client.send("Page.getFrameTree")
  const flat = (ft, list = []) => { list.push({ id: ft.frame.id, url: ft.frame.url }); (ft.childFrames || []).forEach((c) => flat(c, list)); return list }
  return { success: true, frames: flat(frameTree) }
}

async function cmd_cookies(client, action, ...args) {
  if (action === "get") {
    const { cookies } = await client.send("Network.getCookies", { urls: args[0] ? [args[0]] : undefined })
    return { success: true, cookies }
  }
  if (action === "set") {
    const [name, value, ...rest] = args
    const domain = rest.find((a) => a.startsWith("domain="))?.slice(7) || undefined
    const path = rest.find((a) => a.startsWith("path="))?.slice(5) || "/"
    await client.send("Network.setCookie", { name, value, domain, path })
    return { success: true }
  }
  if (action === "clear") {
    await client.send("Network.clearBrowserCookies")
    return { success: true }
  }
  return { error: "Usage: cookies get [url] | cookies set <name> <value> [domain=...] | cookies clear" }
}

const cmd_tabs = async (port) => {
  const targets = await getTargets(port)
  return { success: true, tabs: targets.filter((t) => t.type === "page").map((t) => ({ id: t.id, title: t.title, url: t.url })) }
}

// --- HTTP requests (curl-like, no Chrome needed) ---

function httpRequest(method, url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === "https:" ? "https" : "http"
    import(mod).then((lib) => {
      const headers = { ...opts.headers }
      if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json"
      if (opts.bearer) headers["Authorization"] = `Bearer ${opts.bearer}`
      if (opts.basic) headers["Authorization"] = `Basic ${Buffer.from(opts.basic).toString("base64")}`

      const req = lib.request(url, {
        method,
        headers,
        timeout: opts.timeout || 10000,
        rejectUnauthorized: opts.insecure !== true,
      }, (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8")
          const isJson = (res.headers["content-type"] || "").includes("json")
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: isJson ? (() => { try { return JSON.parse(body) } catch { return body } })() : body,
            size: body.length,
          })
        })
      })
      req.on("error", reject)
      req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")) })
      if (opts.body) req.write(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body))
      req.end()
    })
  })
}

async function cmd_http(method, url, opts) {
  try {
    const result = await httpRequest(method, url, opts)
    return { success: true, ...result }
  } catch (e) {
    return { error: e.message }
  }
}

async function cmd_http_download(url, path, maxRedirects = 10) {
  try {
    if (maxRedirects <= 0) return { error: "Too many redirects" }
    const parsed = new URL(url)
    const mod = parsed.protocol === "https:" ? "https" : "http"
    const lib = await import(mod)
    return new Promise((resolve, reject) => {
      lib.get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return cmd_http_download(res.headers.location, path, maxRedirects - 1).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const buf = Buffer.concat(chunks)
          writeFileSync(path, buf)
          resolve({ success: true, path, size: buf.length })
        })
      }).on("error", reject)
    })
  } catch (e) {
    return { error: e.message }
  }
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2)
  const portArg = () => { const i = args.indexOf("--port"); return i >= 0 ? parseInt(args[i + 1]) : CDP_PORT }
  const quiet = args.includes("-q") || args.includes("--quiet")

  const cleanArgs = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-q" || args[i] === "--quiet") continue
    if (args[i] === "--port") { i++; continue }
    cleanArgs.push(args[i])
  }

  if (cleanArgs[0] === "launch" || cleanArgs[0] === "start") {
    const port = portArg()
    const pid = launchChrome(args.includes("--headless"), port)
    await new Promise((r) => setTimeout(r, 2000))
    const wsUrl = await getBrowserWSEndpoint(port)
    saveDefaultPort(port)
    if (quiet) console.log(wsUrl)
    else console.log(JSON.stringify({ success: true, pid, wsUrl, port }))
    return
  }

  if (cleanArgs[0] === "connect" || cleanArgs[0] === "attach") {
    const port = portArg()
    const targets = await getTargets(port)
    const page = targets.find((t) => t.type === "page") || (await newTab(port))
    if (quiet) console.log(page.webSocketDebuggerUrl)
    else console.log(JSON.stringify({ success: true, wsUrl: page.webSocketDebuggerUrl }))
    return
  }

  if (cleanArgs[0] === "tabs") { console.log(JSON.stringify(await cmd_tabs(portArg()))); return }

  if (cleanArgs[0] === "newtab") {
    const port = portArg()
    const page = await newTab(port, cleanArgs[1] || "about:blank")
    if (quiet) console.log(page.webSocketDebuggerUrl)
    else console.log(JSON.stringify({ success: true, url: page.url, id: page.id }))
    return
  }

  if (cleanArgs[0] === "focus") {
    const port = portArg()
    const targets = await getTargets(port)
    const target = targets.find((t) => t.id === cleanArgs[1])
    if (!target) { console.log(JSON.stringify({ error: "Tab not found: " + cleanArgs[1] })); return }
    const client = new CDPClient(target.webSocketDebuggerUrl)
    await client.connect()
    await client.send("Page.bringToFront")
    client.close()
    if (quiet) console.log(target.webSocketDebuggerUrl)
    else console.log(JSON.stringify({ success: true, id: target.id, title: target.title, url: target.url }))
    return
  }

  if (cleanArgs[0] === "switch") {
    const port = portArg()
    const pattern = (cleanArgs[1] || "").toLowerCase()
    const targets = await getTargets(port)
    const target = targets.find((t) => t.type === "page" && (t.url.toLowerCase().includes(pattern) || t.title.toLowerCase().includes(pattern)))
    if (!target) { console.log(JSON.stringify({ error: "No tab matching: " + pattern })); return }
    const client = new CDPClient(target.webSocketDebuggerUrl)
    await client.connect()
    await client.send("Page.bringToFront")
    client.close()
    if (quiet) console.log(target.webSocketDebuggerUrl)
    else console.log(JSON.stringify({ success: true, id: target.id, title: target.title, url: target.url, wsUrl: target.webSocketDebuggerUrl }))
    return
  }

  if (cleanArgs[0] === "close") {
    const port = portArg()
    try {
      const wsUrl = await getBrowserWSEndpoint(port)
      const client = new CDPClient(wsUrl)
      await client.connect()
      await client.send("Browser.close")
      client.close()
      console.log(JSON.stringify({ success: true }))
    } catch (e) { console.log(JSON.stringify({ error: e.message })) }
    return
  }

  // --- HTTP commands (no browser needed) ---
  if (cleanArgs[0] === "http") {
    const [, httpMethod, httpUrl, ...httpRest] = cleanArgs
    if (!httpMethod || !httpUrl) {
      console.log(JSON.stringify({ error: "Usage: http <get|post|put|delete|head> <url> [body] [-H key:val] [-b token] [--insecure]" }))
      return
    }
    const opts = {}
    for (let i = 0; i < httpRest.length; i++) {
      if (httpRest[i] === "-H" && httpRest[i + 1]) {
        const [k, ...v] = httpRest[i + 1].split(":")
        opts.headers = opts.headers || {}
        opts.headers[k.trim()] = v.join(":").trim()
        i++
      } else if (httpRest[i] === "-b" && httpRest[i + 1]) {
        opts.bearer = httpRest[i + 1]; i++
      } else if (httpRest[i] === "--insecure") {
        opts.insecure = true
      } else if (httpRest[i] === "-d" && httpRest[i + 1]) {
        opts.body = httpRest[i + 1]; i++
      } else if (!httpRest[i].startsWith("-")) {
        opts.body = httpRest[i]
      }
    }
    console.log(JSON.stringify(await cmd_http(httpMethod.toUpperCase(), httpUrl, opts)))
    return
  }

  if (cleanArgs[0] === "download" || cleanArgs[0] === "dl") {
    if (!cleanArgs[1]) { console.log(JSON.stringify({ error: "Usage: download <url> <path>" })); return }
    console.log(JSON.stringify(await cmd_http_download(cleanArgs[1], cleanArgs[2] || cleanArgs[1].split("/").pop())))
    return
  }

  const [wsUrl, command, ...rest] = cleanArgs
  if (!wsUrl || !command) {
    console.error("Usage: cdp.mjs <ws-url|launch|connect|tabs|close|focus|switch> [command] [-q]")
    process.exit(1)
  }

  const client = new CDPClient(wsUrl)
  await client.connect()

  try {
    const cmds = {
      navigate: () => cmd_navigate(client, rest[0]),
      open: () => cmd_navigate(client, rest[0]),
      click: () => cmd_click(client, rest[0]),
      clkt: () => cmd_click_text(client, rest.join(" ")),
      clicki: () => cmd_click_index(client, parseInt(rest[0]) || 1),
      send: () => cmd_send(client, rest.join(" ")),
      type: () => cmd_type(client, rest[0], rest.slice(1).join(" ")),
      press: () => cmd_press(client, rest[0]),
      screenshot: () => cmd_screenshot(client, rest[0]),
      snapshot: () => cmd_snapshot(client),
      state: () => cmd_state(client),
      evaluate: () => cmd_evaluate(client, rest.join(" ")),
      eval: () => cmd_evaluate(client, rest.join(" ")),
      scroll: () => cmd_scroll(client, rest[0] || "down"),
      back: () => cmd_back(client),
      html: () => cmd_html(client, rest[0]),
      text: () => cmd_text(client, rest[0]),
      wait: () => cmd_wait(client, rest[0], rest[1]),
      frames: () => cmd_frames(client),
      cookies: () => cmd_cookies(client, rest[0], ...rest.slice(1)),
    }
    const fn = cmds[command]
    const result = fn ? await fn() : { error: `Unknown: ${command}` }
    if (quiet) {
      const val = result.result ?? result.title ?? result.text ?? result.html ?? result.snapshot ?? result.path ?? result.elements
      console.log(typeof val === "object" ? JSON.stringify(val) : val ?? JSON.stringify(result))
    } else {
      console.log(JSON.stringify(result))
    }
  } finally {
    client.close()
  }
}

main().catch((e) => { console.log(JSON.stringify({ error: e.message })); process.exit(1) })
