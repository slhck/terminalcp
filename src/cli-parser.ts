// CLI argument parsing for terminalcp

export interface ParsedCommand {
	command: string;
	args: Record<string, any>;
	flags: Record<string, string | boolean>;
}

export interface ParseError {
	error: string;
	usage?: string;
}

export type ParseResult = ParsedCommand | ParseError;

function isError(result: ParseResult): result is ParseError {
	return "error" in result;
}

export function parseArgs(args: string[]): ParseResult {
	if (args.length === 0) {
		return { error: "No command provided" };
	}

	const [commandName, ...rest] = args;

	switch (commandName) {
		case "start":
			return parseStartCommand(rest);
		case "stop":
			return parseStopCommand(rest);
		case "list":
		case "ls":
			return { command: "list", args: {}, flags: {} };
		case "attach":
			return parseAttachCommand(rest);
		case "stdout":
			return parseStdoutCommand(rest);
		case "stream":
			return parseStreamCommand(rest);
		case "stdin":
			return parseStdinCommand(rest);
		case "resize":
			return parseResizeCommand(rest);
		case "term-size":
			return parseTermSizeCommand(rest);
		case "version":
			return { command: "version", args: {}, flags: {} };
		case "kill-server":
			return { command: "kill-server", args: {}, flags: {} };
		case "--mcp":
			return { command: "mcp", args: {}, flags: {} };
		case "--server":
			return { command: "server", args: {}, flags: {} };
		default:
			return {
				error: `Unknown command: ${commandName}`,
				usage: "Run 'terminalcp' without arguments to see help",
			};
	}
}

function parseStartCommand(args: string[]): ParseResult {
	if (args.length < 2) {
		return {
			error: "start command requires session-id and command",
			usage: "terminalcp start <session-id> <command> [args...] [--cwd <directory>]",
		};
	}

	let sessionId: string | undefined;
	let cwd: string | undefined;
	const commandArgs: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--cwd") {
			if (i + 1 >= args.length) {
				return {
					error: "--cwd requires a directory path",
					usage: "terminalcp start <session-id> <command> [args...] [--cwd <directory>]",
				};
			}
			cwd = args[i + 1];
			i++; // Skip the next argument since it's the cwd value
		} else if (!sessionId) {
			sessionId = arg;
		} else {
			commandArgs.push(arg);
		}
	}

	if (!sessionId || commandArgs.length === 0) {
		return {
			error: "Missing required arguments",
			usage: "terminalcp start <session-id> <command> [args...] [--cwd <directory>]",
		};
	}

	return {
		command: "start",
		args: {
			sessionId,
			command: commandArgs.join(" "),
		},
		flags: cwd ? { cwd } : {},
	};
}

function parseStopCommand(args: string[]): ParseResult {
	return {
		command: "stop",
		args: {
			sessionId: args[0], // Optional
		},
		flags: {},
	};
}

function parseAttachCommand(args: string[]): ParseResult {
	if (args.length < 1) {
		return {
			error: "attach command requires session-id",
			usage: "terminalcp attach <id>",
		};
	}

	return {
		command: "attach",
		args: { sessionId: args[0] },
		flags: {},
	};
}

function parseStdoutCommand(args: string[]): ParseResult {
	if (args.length < 1) {
		return {
			error: "stdout command requires session-id",
			usage: "terminalcp stdout <id> [lines]",
		};
	}

	return {
		command: "stdout",
		args: {
			sessionId: args[0],
			lines: args[1] ? parseInt(args[1]) : undefined,
		},
		flags: {},
	};
}

function parseStreamCommand(args: string[]): ParseResult {
	if (args.length < 1) {
		return {
			error: "stream command requires session-id",
			usage: "terminalcp stream <id> [--since-last] [--with-ansi]",
		};
	}

	const sessionId = args[0];
	const flags: Record<string, boolean> = {};

	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--since-last") {
			flags.sinceLast = true;
		} else if (args[i] === "--with-ansi") {
			flags.withAnsi = true;
		}
	}

	return {
		command: "stream",
		args: { sessionId },
		flags,
	};
}

function parseStdinCommand(args: string[]): ParseResult {
	if (args.length < 2) {
		return {
			error: "stdin command requires session-id and data",
			usage: "terminalcp stdin <id> <text> [text] ...",
		};
	}

	return {
		command: "stdin",
		args: {
			sessionId: args[0],
			data: args.slice(1),
		},
		flags: {},
	};
}

function parseResizeCommand(args: string[]): ParseResult {
	if (args.length < 3) {
		return {
			error: "resize command requires session-id, cols, and rows",
			usage: "terminalcp resize <id> <cols> <rows>",
		};
	}

	const cols = parseInt(args[1]);
	const rows = parseInt(args[2]);

	if (isNaN(cols) || isNaN(rows)) {
		return {
			error: "cols and rows must be numbers",
			usage: "terminalcp resize <id> <cols> <rows>",
		};
	}

	return {
		command: "resize",
		args: {
			sessionId: args[0],
			cols,
			rows,
		},
		flags: {},
	};
}

function parseTermSizeCommand(args: string[]): ParseResult {
	if (args.length < 1) {
		return {
			error: "term-size command requires session-id",
			usage: "terminalcp term-size <id>",
		};
	}

	return {
		command: "term-size",
		args: { sessionId: args[0] },
		flags: {},
	};
}

export { isError };
