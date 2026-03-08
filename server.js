#!/usr/bin/env node
/**
 * oculos-mcp-wrapper
 * Starts oculos.exe in HTTP mode and proxies its REST API as MCP tools.
 */

const { spawn } = require("child_process");
const readline = require("readline");
const http = require("http");

const OCULOS_EXE = "C:\\Users\\m_ren\\repos\\oculos\\target\\release\\oculos.exe";
const OCULOS_PORT = 7878;

// ── Start oculos in HTTP mode ────────────────────────────────────────────────
const oculos = spawn(OCULOS_EXE, [], { stdio: "ignore", detached: false });
process.on("exit", () => oculos.kill());

// ── HTTP helper ──────────────────────────────────────────────────────────────
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port: OCULOS_PORT, path, method,
        headers: { "Content-Type": "application/json",
                   ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => { try { resolve(JSON.parse(chunks)); } catch { resolve(chunks); } });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function waitReady(retries = 20) {
  return new Promise((resolve, reject) => {
    const attempt = (n) =>
      setTimeout(() =>
        request("GET", "/health").then(resolve).catch(() =>
          n > 0 ? attempt(n - 1) : reject(new Error("oculos failed to start"))
        ), 300);
    attempt(retries);
  });
}

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_windows",
    description: "List all visible desktop windows",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: () => request("GET", "/windows"),
  },
  {
    name: "get_ui_tree",
    description: "Get the full UI element tree for a process by PID",
    inputSchema: { type: "object", properties: { pid: { type: "number" } }, required: ["pid"] },
    handler: ({ pid }) => request("GET", `/windows/${pid}/tree`),
  },
  {
    name: "find_elements",
    description: "Search for UI elements in a window by label text or element type",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number" },
        q: { type: "string", description: "Text to match against label or automation_id" },
        type: { type: "string", description: "Element type e.g. Button, Edit, CheckBox" },
        interactive: { type: "string", enum: ["true", "false"] },
      },
      required: ["pid"],
    },
    handler: ({ pid, q, type, interactive }) => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (type) p.set("type", type);
      if (interactive) p.set("interactive", interactive);
      const qs = p.toString() ? "?" + p.toString() : "";
      return request("GET", `/windows/${pid}/find${qs}`);
    },
  },
  {
    name: "focus_window",
    description: "Bring a window to the foreground by PID",
    inputSchema: { type: "object", properties: { pid: { type: "number" } }, required: ["pid"] },
    handler: ({ pid }) => request("POST", `/windows/${pid}/focus`),
  },
  {
    name: "close_window",
    description: "Close a window gracefully by PID",
    inputSchema: { type: "object", properties: { pid: { type: "number" } }, required: ["pid"] },
    handler: ({ pid }) => request("POST", `/windows/${pid}/close`),
  },
  {
    name: "click_element",
    description: "Click a UI element by its oculos_id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: ({ id }) => request("POST", `/interact/${id}/click`),
  },
  {
    name: "set_text",
    description: "Set the text content of an input field by oculos_id",
    inputSchema: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] },
    handler: ({ id, text }) => request("POST", `/interact/${id}/set-text`, { text }),
  },
  {
    name: "send_keys",
    description: "Send keyboard input to a UI element by oculos_id",
    inputSchema: { type: "object", properties: { id: { type: "string" }, keys: { type: "string" } }, required: ["id", "keys"] },
    handler: ({ id, keys }) => request("POST", `/interact/${id}/send-keys`, { keys }),
  },
  {
    name: "toggle_element",
    description: "Toggle a checkbox or toggle button by oculos_id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: ({ id }) => request("POST", `/interact/${id}/toggle`),
  },
  {
    name: "expand_element",
    description: "Expand a dropdown or tree item by oculos_id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: ({ id }) => request("POST", `/interact/${id}/expand`),
  },
  {
    name: "select_element",
    description: "Select a list item, radio button, or tab by oculos_id",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: ({ id }) => request("POST", `/interact/${id}/select`),
  },
  {
    name: "scroll_element",
    description: "Scroll a container by oculos_id",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, direction: { type: "string", enum: ["up", "down", "left", "right"] } },
      required: ["id", "direction"],
    },
    handler: ({ id, direction }) => request("POST", `/interact/${id}/scroll`, { direction }),
  },
  {
    name: "health_check",
    description: "Check if oculos is running and get version/uptime",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: () => request("GET", "/health"),
  },
];

const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ── JSON-RPC 2.0 over stdio ───────────────────────────────────────────────────
function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
function ok(id, result) { send({ jsonrpc: "2.0", id, result }); }
function err(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "oculos-mcp-wrapper", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized") return;
  if (method === "ping") return ok(id, {});

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    const tool = TOOL_MAP[name];
    if (!tool) return err(id, -32601, `Unknown tool: ${name}`);
    try {
      await waitReady();
      const result = await tool.handler(args || {});
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      return err(id, -32603, e.message);
    }
  }

  if (id !== undefined) err(id, -32601, `Method not found: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => { if (line.trim()) handle(line); });