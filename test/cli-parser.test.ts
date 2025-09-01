import assert from "node:assert";
import { describe, it } from "node:test";
import { isError, parseArgs } from "../src/cli-parser.js";

describe("CLI Parser", () => {
	describe("parseArgs", () => {
		it("should return error for empty args", () => {
			const result = parseArgs([]);
			assert.ok(isError(result));
			assert.strictEqual(result.error, "No command provided");
		});

		it("should parse simple list command", () => {
			const result = parseArgs(["list"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "list");
			assert.deepStrictEqual(result.args, {});
			assert.deepStrictEqual(result.flags, {});
		});

		it("should parse ls alias for list", () => {
			const result = parseArgs(["ls"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "list");
		});

		it("should return error for unknown command", () => {
			const result = parseArgs(["unknown"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("Unknown command: unknown"));
			assert.ok(result.usage?.includes("help"));
		});
	});

	describe("start command", () => {
		it("should parse basic start command", () => {
			const result = parseArgs(["start", "my-session", "echo", "hello"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "start");
			assert.strictEqual(result.args.sessionId, "my-session");
			assert.strictEqual(result.args.command, "echo hello");
			assert.deepStrictEqual(result.flags, {});
		});

		it("should parse start command with --cwd flag", () => {
			const result = parseArgs(["start", "my-session", "pwd", "--cwd", "/tmp"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "start");
			assert.strictEqual(result.args.sessionId, "my-session");
			assert.strictEqual(result.args.command, "pwd");
			assert.strictEqual(result.flags.cwd, "/tmp");
		});

		it("should parse start command with --cwd in different position", () => {
			const result = parseArgs(["start", "--cwd", "/home/user", "test", "ls", "-la"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "start");
			assert.strictEqual(result.args.sessionId, "test");
			assert.strictEqual(result.args.command, "ls -la");
			assert.strictEqual(result.flags.cwd, "/home/user");
		});

		it("should return error when missing session id", () => {
			const result = parseArgs(["start"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id and command"));
			assert.ok(result.usage?.includes("terminalcp start"));
		});

		it("should return error when missing command", () => {
			const result = parseArgs(["start", "session-only"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id and command"));
		});

		it("should return error when --cwd has no value", () => {
			const result = parseArgs(["start", "session", "command", "--cwd"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("--cwd requires a directory path"));
			assert.ok(result.usage?.includes("--cwd <directory>"));
		});

		it("should handle complex command with multiple arguments", () => {
			const result = parseArgs(["start", "build", "npm", "run", "build", "--watch", "--cwd", "/project"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.args.sessionId, "build");
			assert.strictEqual(result.args.command, "npm run build --watch");
			assert.strictEqual(result.flags.cwd, "/project");
		});
	});

	describe("stop command", () => {
		it("should parse stop command with session id", () => {
			const result = parseArgs(["stop", "my-session"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "stop");
			assert.strictEqual(result.args.sessionId, "my-session");
		});

		it("should parse stop command without session id", () => {
			const result = parseArgs(["stop"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "stop");
			assert.strictEqual(result.args.sessionId, undefined);
		});
	});

	describe("attach command", () => {
		it("should parse attach command", () => {
			const result = parseArgs(["attach", "session123"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "attach");
			assert.strictEqual(result.args.sessionId, "session123");
		});

		it("should return error when missing session id", () => {
			const result = parseArgs(["attach"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id"));
		});
	});

	describe("stdout command", () => {
		it("should parse stdout command with session id", () => {
			const result = parseArgs(["stdout", "session1"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "stdout");
			assert.strictEqual(result.args.sessionId, "session1");
			assert.strictEqual(result.args.lines, undefined);
		});

		it("should parse stdout command with lines parameter", () => {
			const result = parseArgs(["stdout", "session1", "50"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.args.sessionId, "session1");
			assert.strictEqual(result.args.lines, 50);
		});

		it("should return error when missing session id", () => {
			const result = parseArgs(["stdout"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id"));
		});
	});

	describe("stream command", () => {
		it("should parse stream command with flags", () => {
			const result = parseArgs(["stream", "session1", "--since-last", "--with-ansi"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "stream");
			assert.strictEqual(result.args.sessionId, "session1");
			assert.strictEqual(result.flags.sinceLast, true);
			assert.strictEqual(result.flags.withAnsi, true);
		});

		it("should parse stream command without flags", () => {
			const result = parseArgs(["stream", "session1"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.args.sessionId, "session1");
			assert.deepStrictEqual(result.flags, {});
		});

		it("should return error when missing session id", () => {
			const result = parseArgs(["stream"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id"));
		});
	});

	describe("stdin command", () => {
		it("should parse stdin command with data", () => {
			const result = parseArgs(["stdin", "session1", "hello", "world"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "stdin");
			assert.strictEqual(result.args.sessionId, "session1");
			assert.deepStrictEqual(result.args.data, ["hello", "world"]);
		});

		it("should return error when missing data", () => {
			const result = parseArgs(["stdin", "session1"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id and data"));
		});
	});

	describe("resize command", () => {
		it("should parse resize command", () => {
			const result = parseArgs(["resize", "session1", "120", "40"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "resize");
			assert.strictEqual(result.args.sessionId, "session1");
			assert.strictEqual(result.args.cols, 120);
			assert.strictEqual(result.args.rows, 40);
		});

		it("should return error for invalid numbers", () => {
			const result = parseArgs(["resize", "session1", "abc", "40"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("must be numbers"));
		});

		it("should return error when missing parameters", () => {
			const result = parseArgs(["resize", "session1", "120"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id, cols, and rows"));
		});
	});

	describe("term-size command", () => {
		it("should parse term-size command", () => {
			const result = parseArgs(["term-size", "session1"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "term-size");
			assert.strictEqual(result.args.sessionId, "session1");
		});

		it("should return error when missing session id", () => {
			const result = parseArgs(["term-size"]);
			assert.ok(isError(result));
			assert.ok(result.error.includes("requires session-id"));
		});
	});

	describe("system commands", () => {
		it("should parse version command", () => {
			const result = parseArgs(["version"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "version");
		});

		it("should parse kill-server command", () => {
			const result = parseArgs(["kill-server"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "kill-server");
		});

		it("should parse --mcp flag", () => {
			const result = parseArgs(["--mcp"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "mcp");
		});

		it("should parse --server flag", () => {
			const result = parseArgs(["--server"]);
			assert.ok(!isError(result));
			assert.strictEqual(result.command, "server");
		});
	});
});
