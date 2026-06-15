import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Args } from "./messages.js";
import { TerminalClient } from "./terminal-client.js";

export async function runMCPServer(): Promise<void> {
	const serverClient = new TerminalClient();

	const server = new Server(
		{
			name: "terminalcp",
			version: "1.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Define the terminal tool
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			{
				name: "terminalcp",
				description: `Control background processes with virtual terminals. IMPORTANT: Always clean up processes with "stop" action when done.

Examples:
  Start dev server: {"action": "start", "command": "npm run dev", "cwd": "/path/to/project"}
  Send text with Enter: {"action": "stdin", "id": "proc-123", "data": "npm test\\r"}
  Send arrow keys: {"action": "stdin", "id": "proc-123", "data": "echo hello\\u001b[D\\u001b[D\\u001b[Dhi \\r"}
  Send Ctrl+C: {"action": "stdin", "id": "proc-123", "data": "\\u0003"}
  Stop process: {"action": "stop", "id": "proc-abc123"}
  Stop all processes: {"action": "stop"}

  Get terminal screen: {"action": "stdout", "id": "proc-123"}  # Current view + scrollback
  Get last 50 lines: {"action": "stdout", "id": "proc-123", "lines": 50}
  Get all output ever: {"action": "stream", "id": "proc-123"}  # From process start
  Get new output only: {"action": "stream", "id": "proc-123", "since_last": true}  # Since last stream call

  Run shell cmd, block until done: {"action": "run", "id": "proc-123", "data": "ls -la", "marker": true}
  Run in a REPL, wait for a printed sentinel: {"action": "run", "id": "rails", "data": "User.count; puts 'TCPDONE'\\r", "until": "^TCPDONE"}

PREFER "run" over stdin+stdout when you expect a command to finish: it sends the input and
returns ONLY that command's new output the moment it completes - no guessing a sleep, no
extra stdout call. This is the fastest, most token-efficient path for interactive sessions.
  - Shell commands (incl. over SSH): pass a bare command (NO trailing Enter) and set
    "marker": true. terminalcp appends a hidden exit-code sentinel, waits for it, strips it,
    and appends "[exit: N]". Most reliable. (Don't use marker for commands that end the shell,
    like "exit" or "logout" - the sentinel can't run; you'll get a session-exited note instead.)
  - REPLs / debuggers / SQL CLIs (rails console, psql, lldb, python): include your own Enter
    (\\r) and END your command with a statement that prints a unique sentinel at column 0,
    then set "until": "^SENTINEL". This is the REPL analog of marker and is robust even when
    the command is silent for a while (e.g. a slow query). Matching the REPL's prompt also
    works but ONLY for commands that print output promptly - it fires early on silent ones.
  - Fallback when you can't print a sentinel: omit until/marker; "run" returns once the screen
    goes quiet for "idle" ms (default 500). Unreliable for commands that pause without output.
  - Bound the wait with "timeout" (ms, default 30000). On timeout it returns what it has and
    says so; the command keeps running - read more with stdout/stream.
Use plain "stdin" only to send keystrokes you do NOT want to wait on (Ctrl+C, navigation,
answering a prompt), and "stream"/"stdout" for long-running processes you monitor over time.

Output modes:
  stdout: Terminal emulator output - returns the rendered screen as user would see it.
          Limited to 10K lines scrollback. Best for: interactive tools, TUIs, REPLs, debuggers.

  stream: Raw process output - returns all text the process has written to stdout/stderr.
          Strips ANSI codes by default (set strip_ansi: false to keep). No limit on history.
          With since_last: true, returns only new output since last stream call on this process.
          Best for: build logs, test output, monitoring long-running processes.

Common escape sequences for stdin:
  Enter: \\r or \\u000d
  Tab: \\t or \\u0009
  Escape: \\u001b
  Backspace: \\u007f
  Ctrl+C: \\u0003
  Ctrl+D: \\u0004
  Ctrl+Z: \\u001a

  Arrow keys: Up=\\u001b[A Down=\\u001b[B Right=\\u001b[C Left=\\u001b[D
  Navigation: Home=\\u001b[H End=\\u001b[F PageUp=\\u001b[5~ PageDown=\\u001b[6~
  Delete: \\u001b[3~ Insert: \\u001b[2~
  Function keys: F1=\\u001bOP F2=\\u001bOQ F3=\\u001bOR F4=\\u001bOS
  Meta/Alt: Alt+x=\\u001bx (ESC followed by character)

Interactive examples:
  Vim: stdin "vim test.txt\\r" → stdin "iHello\\u001b:wq\\r" → stdout
  Python: start "python3 -i" → stdin "2+2\\r" → stdout
  Build monitoring: start "npm run build" → stream (since_last: true) → repeat
  Interrupt: stdin "sleep 10\\r" → stdin "\\u0003" (Ctrl+C)

Note: Commands run via bash -c. Use absolute paths, not aliases.`,
				inputSchema: {
					type: "object",
					properties: {
						args: {
							type: "object",
							properties: {
								action: {
									type: "string",
									enum: [
										"start",
										"stop",
										"stdout",
										"stdin",
										"run",
										"list",
										"stream",
										"term-size",
										"kill-server",
									],
									description: "The action to perform",
								},
								command: {
									type: "string",
									description: "Command to execute (required for 'start' action)",
								},
								cwd: {
									type: "string",
									description: "Working directory for the process (optional for 'start' action)",
								},
								name: {
									type: "string",
									description: "Human-readable name for the session (optional for 'start' action)",
								},
								id: {
									type: "string",
									description:
										"Process ID (required for 'stdout', 'stdin', 'stream', 'term-size' actions; optional for 'stop' - if omitted, stops all processes)",
								},
								data: {
									type: "string",
									description:
										"String to send for 'stdin'/'run' with escape sequences (e.g., '\\r' for Enter, '\\u001b[A' for Up arrow). For 'run' with marker:true, pass a bare shell command WITHOUT a trailing Enter.",
								},
								until: {
									type: "string",
									description:
										"Regex for 'run' action, matched per-line against the rendered screen (the `m` flag is applied, so `^` anchors to a line start). Best practice: end your REPL command with a printed sentinel and match it anchored, e.g. \"^TCPDONE\".",
								},
								idle: {
									type: "number",
									description:
										"Milliseconds of output silence that count as complete for 'run' (default 500). Used when neither marker nor until is set.",
								},
								timeout: {
									type: "number",
									description:
										"Hard cap in milliseconds for 'run' (default 30000). On timeout, returns partial output and a note; the command keeps running.",
								},
								marker: {
									type: "boolean",
									description:
										"For 'run' on a shell session: append a hidden exit-code sentinel and wait for it. Most reliable completion signal; also returns the exit code.",
								},
								lines: {
									type: "number",
									description: "Number of lines to retrieve (optional for 'stdout' action)",
								},
								since_last: {
									type: "boolean",
									description:
										"Only return output since last stream read (optional for 'stream' action, defaults to false)",
								},
								strip_ansi: {
									type: "boolean",
									description:
										"Strip ANSI escape codes from output (optional for 'stream' action, defaults to true)",
								},
							},
							required: ["action"],
							additionalProperties: false,
						},
					},
					required: ["args"],
					additionalProperties: false,
				},
			},
		],
	}));

	// Handle terminal tool calls
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		if (request.params.name !== "terminalcp") {
			throw new Error(`Unknown tool: ${request.params.name}`);
		}
		const args = request.params.arguments?.args as Args;
		if (!args || typeof args !== "object") {
			throw new Error("Invalid arguments: expected JSON object");
		}

		try {
			const result = await serverClient.request(args);
			return {
				content: [
					{
						type: "text",
						text: result || "",
					},
				],
			};
		} catch (error) {
			// Handle cases where server is not running - but NOT for start actions (let auto-start work)
			if (error instanceof Error && (error.message === "No server running" || error.message === "Request timeout")) {
				if (args.action === "list") {
					return {
						content: [
							{
								type: "text",
								text: "No active sessions",
							},
						],
					};
				} else if (args.action === "start") {
					// Don't catch errors for start actions - let the terminal client auto-start
					throw error;
				} else {
					return {
						content: [
							{
								type: "text",
								text: `Error: No terminal server running. Use "list" to check status or start a process to auto-start the server.`,
							},
						],
					};
				}
			}
			throw error;
		}
	});

	// Cleanup on exit
	process.on("SIGINT", async () => {
		console.error("Shutting down MCP server...");
		serverClient.close();
		process.exit(0);
	});

	// Start the server
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("terminalcp MCP server running on stdio");
}
