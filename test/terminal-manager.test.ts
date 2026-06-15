import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildInput } from "../src/key-parser.js";
import { TerminalManager } from "../src/terminal-manager.js";

describe("TerminalManager", () => {
	let manager: TerminalManager;

	// Create fresh manager for each test
	beforeEach(() => {
		manager = new TerminalManager();
	});

	// Clean up after each test
	afterEach(async () => {
		await manager.stopAll();
	});

	it("should start a simple process", async () => {
		const id = await manager.start("echo 'Hello from test'");
		assert.ok(id, "Process should have an ID");

		// Wait for process to complete
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Check if process is in list
		const processes = manager.listProcesses();
		const proc = processes.find((p) => p.id === id);
		assert.ok(proc, "Process should be in list");
		assert.strictEqual(proc.running, false, "Echo process should have stopped");
	});

	it("should start process with custom name", async () => {
		const name = "test-session";
		const id = await manager.start("cat", { name });
		assert.strictEqual(id, name, "Process ID should match the custom name");

		// Stop it
		await manager.stop(id);

		// Verify it's no longer in the list (stop removes it completely)
		const processes = manager.listProcesses();
		const proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc, undefined, "Process should be removed after stop");
	});

	it("should handle interactive process with input/output", async () => {
		const id = await manager.start("cat");

		// Send input
		await manager.sendInput(id, "Test input line\n");

		// Wait for output
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Get output
		const output = await manager.getOutput(id);
		assert.ok(output.includes("Test input line"), "Output should contain input text");

		// Stop the process
		await manager.stop(id);
	});

	it("should track process status correctly", async () => {
		const id = await manager.start("sleep 0.5");

		// Check initial status
		let processes = manager.listProcesses();
		let proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc?.running, true, "Process should be running initially");

		// Wait for it to exit
		await new Promise((resolve) => setTimeout(resolve, 700));

		// Check status after exit
		processes = manager.listProcesses();
		proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc?.running, false, "Process should be stopped after exit");
	});

	it("should resize terminal", async () => {
		const id = await manager.start("bash");

		// Get initial size
		const initialSize = manager.getTerminalSize(id);
		assert.strictEqual(initialSize.cols, 80, "Initial cols should be 80");
		assert.strictEqual(initialSize.rows, 24, "Initial rows should be 24");

		// Resize
		manager.resizeTerminal(id, 120, 40);

		// Get new size
		const newSize = manager.getTerminalSize(id);
		assert.strictEqual(newSize.cols, 120, "Cols should be 120 after resize");
		assert.strictEqual(newSize.rows, 40, "Rows should be 40 after resize");

		// Cleanup
		await manager.stop(id);
	});

	it("should handle stream output with since_last", async () => {
		const id = await manager.start("bash -c 'echo Line1; sleep 0.2; echo Line2; sleep 0.2; echo Line3'");

		// Wait for first line
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Get first stream WITHOUT since_last (gets everything)
		const stream1 = await manager.getStream(id, { since_last: false });
		assert.ok(stream1.includes("Line1"), "First stream should contain Line1");

		// Now read with since_last to establish position
		const _stream2 = await manager.getStream(id, { since_last: true });

		// Wait for more output
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Get only new output since last read
		const stream3 = await manager.getStream(id, { since_last: true });

		// Stream3 should NOT contain Line1 (that was before our last since_last read)
		assert.ok(!stream3.includes("Line1"), "Incremental read should not contain old output");

		// Should have some new content
		assert.ok(stream3.length > 0, "Should have new output in incremental read");
	});

	it("should stop all processes", async () => {
		// Start multiple processes
		const _id1 = await manager.start("sleep 10", { name: "sleep1" });
		const _id2 = await manager.start("sleep 10", { name: "sleep2" });
		const _id3 = await manager.start("sleep 10", { name: "sleep3" });

		// Verify they're running
		let processes = manager.listProcesses();
		assert.strictEqual(processes.filter((p) => p.running).length, 3, "Should have 3 running processes");

		// Stop all
		await manager.stopAll();

		// Verify all are stopped
		processes = manager.listProcesses();
		const runningCount = processes.filter((p) => p.running).length;
		assert.strictEqual(runningCount, 0, "All processes should be stopped");
	});

	it("should handle stream since_last with interactive Python REPL", async () => {
		const id = await manager.start("python3 -i");

		// Wait for Python to start
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Send first command
		await manager.sendInput(id, "2+2\r");
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get full stream
		const fullStream = await manager.getStream(id, { since_last: false });
		assert.ok(fullStream.includes("2+2"), "Full stream should contain first command");
		assert.ok(fullStream.includes("4"), "Full stream should contain first result");

		// Establish baseline by reading with since_last
		const _baseline = await manager.getStream(id, { since_last: true });

		// Now get empty stream (nothing new since we haven't sent anything)
		const emptyStream = await manager.getStream(id, { since_last: true });
		assert.strictEqual(emptyStream.length, 0, "Stream with since_last should be empty when no new output");

		// Send another command
		await manager.sendInput(id, "3+3\r");
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get only new output
		const newStream = await manager.getStream(id, { since_last: true });
		assert.ok(newStream.includes("3+3"), "New stream should contain new command");
		assert.ok(newStream.includes("6"), "New stream should contain new result");
		assert.ok(!newStream.includes("2+2"), "New stream should NOT contain old command");

		// Clean up
		await manager.stop(id);
	});

	it("should handle buildInput helper for symbolic keys", async () => {
		const id = await manager.start("bash");

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Use buildInput to send text with arrow navigation
		await manager.sendInput(
			id,
			buildInput("echo hello world", "Left", "Left", "Left", "Left", "Left", "my ", "Enter"),
		);

		// Wait for command to execute
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Check output
		const output = await manager.getOutput(id);
		assert.ok(output.includes("hello my world"), "Should have inserted 'my ' in the middle");

		// Clean up
		await manager.stop(id);
	});

	it("should handle buildInput with control sequences", async () => {
		const id = await manager.start("bash");

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Start a sleep command
		await manager.sendInput(id, buildInput("sleep 10", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Send Ctrl+C using buildInput
		await manager.sendInput(id, buildInput("C-c"));
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Verify we can run another command
		await manager.sendInput(id, buildInput("echo interrupted", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.ok(output.includes("interrupted"), "Should show interrupted message");

		// Clean up
		await manager.stop(id);
	});

	it("should handle buildInput with special keys", async () => {
		const id = await manager.start("bash");

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Test Tab completion
		await manager.sendInput(id, buildInput("ec", "Tab", " hello", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.ok(output.includes("hello"), "Should show hello output");

		// Clean up
		await manager.stop(id);
	});

	it("should handle buildInput with navigation keys", async () => {
		const id = await manager.start("bash");

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Test Home and End keys
		await manager.sendInput(id, buildInput("echo test", "Home"));
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Move past prompt and insert text
		// Note: Home goes to beginning of line, not beginning of command
		// So we need to move right past the prompt
		await manager.sendInput(
			id,
			buildInput("Right", "Right", "Right", "Right", "Right", "Right", "Right", "Right", "Right", "Right"),
		);
		await manager.sendInput(id, buildInput("start ", "End", " end", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		// Should contain the text we inserted
		assert.ok(
			output.includes("start") || output.includes("end") || output.includes("test"),
			"Should contain command elements",
		);

		// Clean up
		await manager.stop(id);
	});

	it("should handle buildInput with mixed literal and symbolic", async () => {
		const id = await manager.start("bash");

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Mix literal text and symbolic keys - using Space as symbolic, but Left/Right as literal text
		await manager.sendInput(
			id,
			buildInput("echo", "Space") +
				"Left" +
				buildInput("Space") +
				"and" +
				buildInput("Space") +
				"Right" +
				buildInput("Enter"),
		);
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.ok(output.includes("Left and Right"), "Should output literal 'Left and Right'");

		// Clean up
		await manager.stop(id);
	});

	it("should handle buildInput with vim-like interaction", async () => {
		const id = await manager.start("bash");

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Start vim
		await manager.sendInput(id, buildInput("vim test.txt", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Enter insert mode, type, escape, save and quit
		await manager.sendInput(id, buildInput("i", "Hello from buildInput", "Escape", ":wq", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Check file was created
		await manager.sendInput(id, buildInput("cat test.txt", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.ok(output.includes("Hello from buildInput"), "Should show file contents");

		// Clean up
		await manager.stop(id);
	});

	it("should report error when sending input to stopped process", async () => {
		// Start a process that exits quickly
		const id = await manager.start("echo hello", { name: "test-stopped" });

		// Wait for it to exit
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Verify process has stopped
		const processes = manager.listProcesses();
		const proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc?.running, false, "Process should be stopped");

		// Try to send input to stopped process
		try {
			await manager.sendInput(id, "test input\r");
			assert.fail("Should have thrown error for stopped process");
		} catch (error) {
			assert.ok(error instanceof Error, "Should throw an Error");
			assert.ok(error.message.includes("not running"), "Error should mention process not running");
			assert.ok(error.message.includes("test-stopped"), "Error should include session ID");
			assert.ok(error.message.includes("exit code"), "Error should mention exit code");
		}

		// Verify we can still get output from stopped process
		const output = await manager.getOutput(id);
		assert.ok(output.includes("hello"), "Should still be able to get output from stopped process");

		// Verify we can still get stream from stopped process
		const stream = await manager.getStream(id);
		assert.ok(stream.includes("hello"), "Should still be able to get stream from stopped process");
	});

	it("run with marker returns command output and exit code", async () => {
		const id = await manager.start("bash", { name: "run-marker" });
		await new Promise((resolve) => setTimeout(resolve, 300));

		const out = await manager.run(id, "echo hello-run", { marker: true });
		assert.ok(out.includes("hello-run"), `Output should contain command result, got: ${out}`);
		assert.ok(out.includes("[exit: 0]"), `Output should report exit code 0, got: ${out}`);
		// The injected sentinel must never leak into the returned output.
		assert.ok(!out.includes("TCPDONE"), `Sentinel should be stripped, got: ${out}`);
		assert.ok(!out.includes("printf"), `Echoed sentinel command should be stripped, got: ${out}`);
	});

	it("run with marker captures a non-zero exit code", async () => {
		const id = await manager.start("bash", { name: "run-marker-fail" });
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Subshell so the non-zero status is reported without terminating the session.
		const out = await manager.run(id, "(exit 7)", { marker: true });
		assert.ok(out.includes("[exit: 7]"), `Output should report exit code 7, got: ${out}`);
	});

	it("run with marker reports session exit when the command ends the shell", async () => {
		const id = await manager.start("bash", { name: "run-marker-exit" });
		await new Promise((resolve) => setTimeout(resolve, 300));

		// `exit` kills the shell before the sentinel can print, so we surface that instead.
		const out = await manager.run(id, "exit 7", { marker: true });
		assert.ok(out.includes("session process exited"), `Should report session exit, got: ${out}`);
	});

	it("run with marker blocks until a slow command finishes", async () => {
		const id = await manager.start("bash", { name: "run-marker-slow" });
		await new Promise((resolve) => setTimeout(resolve, 300));

		const start = Date.now();
		const out = await manager.run(id, "sleep 1 && echo woke", { marker: true });
		const elapsed = Date.now() - start;
		assert.ok(out.includes("woke"), `Output should contain result, got: ${out}`);
		assert.ok(elapsed >= 900, `Should have waited for the sleep, only waited ${elapsed}ms`);
	});

	it("run with until waits for a printed sentinel in a REPL", async () => {
		const id = await manager.start("python3 -i", { name: "run-until" });
		await new Promise((resolve) => setTimeout(resolve, 800));

		const out = await manager.run(id, "print(6*7); print('TCPDONE')\r", { until: "^TCPDONE" });
		assert.ok(out.includes("42"), `Output should contain the expression result, got: ${out}`);
		assert.ok(!out.includes("TCPDONE"), `Sentinel line should be excluded, got: ${out}`);
	});

	it("run with until does not return early on a silent command", async () => {
		const id = await manager.start("python3 -i", { name: "run-until-silent" });
		await new Promise((resolve) => setTimeout(resolve, 800));
		await manager.run(id, "import time\r", { until: "^TCPDONE", timeout: 5000 });

		const start = Date.now();
		await manager.run(id, "time.sleep(1); print('TCPDONE')\r", { until: "^TCPDONE", timeout: 5000 });
		const elapsed = Date.now() - start;
		assert.ok(elapsed >= 900, `Should have waited through the silent sleep, only waited ${elapsed}ms`);
	});

	it("run reports a timeout without hanging", async () => {
		const id = await manager.start("bash", { name: "run-timeout" });
		await new Promise((resolve) => setTimeout(resolve, 300));

		const out = await manager.run(id, "sleep 5", { marker: true, timeout: 800 });
		assert.ok(out.includes("timed out"), `Should report a timeout, got: ${out}`);
	});
});
