#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { AttachClient } from "./attach-client.js";
import { isError, parseArgs } from "./cli-parser.js";
import { parseKeyInput } from "./key-parser.js";
import { runMCPServer } from "./mcp-server.js";
import type { StartArgs } from "./messages.js";
import { TerminalClient } from "./terminal-client.js";
import { TerminalServer } from "./terminal-server.js";

// Read version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const CLIENT_VERSION = packageJson.version;

// Parse CLI arguments
const args = process.argv.slice(2);

// Show help if no arguments
if (args.length === 0) {
	console.log(`terminalcp - Terminal Control Protocol
A centralized terminal session manager with MCP server support

USAGE:
  terminalcp --mcp                       Start as MCP server for Claude Desktop
  terminalcp --server                    Start the terminal server daemon
  terminalcp <command> [options]         Run a CLI command

COMMANDS:
  list, ls                               List all active sessions
  start <id> <command> [--cwd <dir>]     Start a new named session
  stop [id]                              Stop session(s) (all if no id given)
  attach <id>                            Attach to a session interactively
  stdout <id> [lines]                    Get terminal output (rendered view)
  stream <id> [opts]                     Get raw output stream
  stdin <id> <data>                      Send input to a session
  resize <id> <cols> <rows>              Resize terminal dimensions
  term-size <id>                         Get terminal size
  version                                Show client and server versions
  kill-server                            Shutdown the terminal server

EXAMPLES:
  # Start as MCP server for Claude Desktop
  terminalcp --mcp

  # Start a development server
  terminalcp start dev-server "npm run dev"
  
  # Start a session in a specific directory
  terminalcp start build "make" --cwd /path/to/project

  # Start an interactive Python session
  terminalcp start python "python3 -i"
  terminalcp stdin python "print('Hello')\r"
  terminalcp stdout python

  # Debug with lldb
  terminalcp start debug "lldb ./myapp"
  terminalcp stdin debug "b main\r"
  terminalcp stdin debug "run\r"
  terminalcp attach debug  # Interactive debugging

  # Monitor build output
  terminalcp start build "npm run build"
  terminalcp stream build --since-last

  # Attach to interact with a session
  terminalcp attach python
  # Press Ctrl+B to detach

OPTIONS:
  --mcp                                  Run as MCP server on stdio
  --server                               Run as terminal server daemon
  --since-last                           Only show new output (stream)
  --with-ansi                            Keep ANSI codes (stream)
  --cwd <directory>                      Working directory for start command

CLAUDE DESKTOP CONFIGURATION:
  Add to claude_desktop_config.json:
  {
    "mcpServers": {
      "terminalcp": {
        "command": "npx",
        "args": ["-y", "@mariozechner/terminalcp", "--mcp"]
      }
    }
  }

For more information: https://github.com/badlogic/terminalcp`);
	process.exit(0);
}

// Parse command line arguments
const parsed = parseArgs(args);

if (isError(parsed)) {
	console.error(parsed.error);
	if (parsed.usage) {
		console.error(parsed.usage);
	}
	process.exit(1);
}

const { command, args: cmdArgs, flags } = parsed;

// Execute the parsed command
switch (command) {
	case "mcp":
		runMCPServer().catch((error) => {
			console.error("Fatal error:", error);
			process.exit(1);
		});
		break;

	case "server": {
		const server = new TerminalServer();
		server.start().catch((err) => {
			console.error("Failed to start server:", err);
			process.exit(1);
		});
		break;
	}

	case "list": {
		const listClient = new TerminalClient();
		listClient
			.request({ action: "list" })
			.then((response) => {
				const lines = response.split("\n").filter((line: string) => line.trim());
				if (lines.length === 0) {
					console.log("No active sessions");
				} else {
					for (const line of lines) {
						const [id, status, cwd, ...commandParts] = line.split(" ");
						const command = commandParts.join(" ");
						console.log(`  ${id}`);
						console.log(`    Status: ${status}`);
						console.log(`    CWD: ${cwd}`);
						console.log(`    Command: ${command}`);
						console.log();
					}
				}
				process.exit(0);
			})
			.catch((err) => {
				// If no server is running, just show "No active sessions"
				if (err.message === "No server running") {
					console.log("No active sessions");
					process.exit(0);
				}
				console.error(err.message);
				process.exit(1);
			});
		break;
	}

	case "start": {
		const startClient = new TerminalClient();
		const request: StartArgs = {
			action: "start",
			command: cmdArgs.command,
			name: cmdArgs.sessionId,
		};
		if (flags.cwd) {
			request.cwd = flags.cwd as string;
		}

		startClient
			.request(request)
			.then((id) => {
				console.log(`Started session: ${id}`);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to start session:", err.message);
				process.exit(1);
			});
		break;
	}

	case "stop": {
		const stopClient = new TerminalClient();
		stopClient
			.request({ action: "stop", id: cmdArgs.sessionId })
			.then((result) => {
				console.log(result);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to stop session:", err.message);
				process.exit(1);
			});
		break;
	}

	case "stdout": {
		const stdoutClient = new TerminalClient();
		stdoutClient
			.request({ action: "stdout", id: cmdArgs.sessionId, lines: cmdArgs.lines })
			.then((output) => {
				process.stdout.write(output as string);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get stdout:", err.message);
				process.exit(1);
			});
		break;
	}

	case "stream": {
		const streamClient = new TerminalClient();
		streamClient
			.request({
				action: "stream",
				id: cmdArgs.sessionId,
				since_last: !!flags.sinceLast,
				strip_ansi: !flags.withAnsi,
			})
			.then((output) => {
				process.stdout.write(output as string);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get stream:", err.message);
				process.exit(1);
			});
		break;
	}

	case "stdin": {
		const stdinClient = new TerminalClient();
		// Parse the input using the key parser with :: prefix support
		const data = parseKeyInput(cmdArgs.data);

		stdinClient
			.request({ action: "stdin", id: cmdArgs.sessionId, data })
			.then(() => {
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to send stdin:", err.message);
				process.exit(1);
			});
		break;
	}

	case "term-size": {
		const termSizeClient = new TerminalClient();
		termSizeClient
			.request({ action: "term-size", id: cmdArgs.sessionId })
			.then((result) => {
				console.log(result);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get terminal size:", err.message);
				process.exit(1);
			});
		break;
	}

	case "resize": {
		const resizeClient = new TerminalClient();
		resizeClient
			.request({ action: "resize", id: cmdArgs.sessionId, cols: cmdArgs.cols, rows: cmdArgs.rows })
			.then(() => {
				console.log("Terminal resized");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to resize terminal:", err.message);
				process.exit(1);
			});
		break;
	}

	case "attach": {
		const attachClient = new AttachClient();
		attachClient.attach(cmdArgs.sessionId).catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
		break;
	}

	case "version": {
		const versionClient = new TerminalClient();
		versionClient
			.request({ action: "version" })
			.then((version) => {
				console.log(`Server version: ${version}`);
				console.log(`Client version: ${CLIENT_VERSION}`);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get server version:", err.message);
				console.log(`Client version: ${CLIENT_VERSION}`);
				process.exit(1);
			});
		break;
	}

	case "kill-server": {
		// Check if server is running first
		const socketPath = path.join(os.homedir(), ".terminalcp", "server.sock");
		if (!fs.existsSync(socketPath)) {
			console.error("No server running");
			process.exit(1);
		}
		const killClient = new TerminalClient();
		killClient
			.request({ action: "kill-server" })
			.then(() => {
				console.log("Server killed");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to kill server:", err.message);
				process.exit(1);
			});
		break;
	}
}
