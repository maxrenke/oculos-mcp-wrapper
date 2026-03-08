# oculos-mcp-wrapper
A Node.js MCP server that wraps [OculOS](https://github.com/huseyinstif/oculos) ΓÇö exposing its REST API as MCP tools for Claude Desktop and other MCP-compatible AI agents.
OculOS reads the OS accessibility tree and lets you control any desktop app (click buttons, type text, navigate menus) without screenshots or pixel coordinates. This wrapper bridges the gap between OculOS's HTTP server and the MCP protocol that Claude Desktop expects.
## Why this exists
OculOS ships with a built-in `--mcp` flag, but its JSON-RPC implementation has a schema compatibility issue with Claude Desktop's MCP client validator. This wrapper sidesteps that entirely by:
1. Starting `oculos.exe` in HTTP mode (its stable REST API)
2. Implementing a clean MCP server over stdio
3. Proxying every tool call to OculOS over localhost HTTP
## Prerequisites
- [OculOS](https://github.com/huseyinstif/oculos) built from source (`cargo build --release`)
- Node.js 18+
- Claude Desktop (or any MCP-compatible client)
## Installation
```bash
git clone https://github.com/maxrenke/oculos-mcp-wrapper
cd oculos-mcp-wrapper
```
No npm install needed ΓÇö uses only Node.js built-ins (`http`, `readline`, `child_process`).
Update the `OCULOS_EXE` path at the top of `server.js` to point to your OculOS binary:
```js
const OCULOS_EXE = "C:\\Users\\your-username\\repos\\oculos\\target\\release\\oculos.exe";
```
## Claude Desktop setup
Add this to your `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "oculos": {
      "command": "node",
      "args": ["C:\\path\\to\\oculos-mcp-wrapper\\server.js"]
    }
  }
}
```
Restart Claude Desktop. OculOS will start automatically in the background when the MCP server initializes.
## Available tools
| Tool | Description |
|---|---|
| `list_windows` | List all visible desktop windows |
| `get_ui_tree` | Get full UI element tree for a process by PID |
| `find_elements` | Search elements by label, type, or interactivity |
| `focus_window` | Bring a window to the foreground |
| `close_window` | Close a window gracefully |
| `click_element` | Click a UI element by `oculos_id` |
| `set_text` | Set text in an input field |
| `send_keys` | Send keyboard input (supports `{ENTER}`, `^c`, etc.) |
| `toggle_element` | Toggle a checkbox or toggle button |
| `expand_element` | Expand a dropdown or tree item |
| `select_element` | Select a list item, radio button, or tab |
| `scroll_element` | Scroll a container up/down/left/right |
| `health_check` | Check OculOS status and uptime |
## Example usage
Once connected, you can ask Claude things like:
- *"List all open windows"*
- *"Find the search bar in Spotify and type 'Clair de Lune'"*
- *"Click the Submit button in the active window"*
- *"Focus VS Code and press Ctrl+Shift+P"*
## How it works
```
Claude Desktop
     |  MCP (JSON-RPC 2.0 over stdio)
     v
oculos-mcp-wrapper (Node.js)
     |  HTTP REST
     v
oculos.exe (127.0.0.1:7878)
     |  Windows UI Automation
     v
Any desktop app
```
The wrapper spawns `oculos.exe` on startup and kills it on exit. It waits up to 6 seconds for the HTTP server to become ready before handling the first tool call.
## Platform support
OculOS supports Windows (full), Linux (AT-SPI2), and macOS (Accessibility API). Update the `OCULOS_EXE` path accordingly for non-Windows platforms.
## License
MIT