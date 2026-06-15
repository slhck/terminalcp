// Request types
export interface StartArgs {
	action: "start";
	command: string;
	cwd?: string;
	name?: string;
}

export interface StopArgs {
	action: "stop";
	id?: string; // Optional - if not provided, stops all
}

export interface StdinArgs {
	action: "stdin";
	id: string;
	data: string;
}

export interface RunArgs {
	action: "run";
	id: string;
	data: string;
	until?: string; // Regex; completion when new output matches it
	idle?: number; // Milliseconds of output silence to treat as complete (default 500)
	timeout?: number; // Hard cap in milliseconds (default 30000)
	marker?: boolean; // Shell mode: append an exit-code sentinel and wait for it (most reliable)
	strip_ansi?: boolean; // Strip ANSI escape codes from returned output (default true)
}

export interface StdoutArgs {
	action: "stdout";
	id: string;
	lines?: number;
}

export interface StreamArgs {
	action: "stream";
	id: string;
	since_last?: boolean;
	strip_ansi?: boolean;
}

export interface TermSizeArgs {
	action: "term-size";
	id: string;
}

export interface ResizeArgs {
	action: "resize";
	id: string;
	cols: number;
	rows: number;
}

export interface AttachArgs {
	action: "attach";
	id: string;
}

export interface DetachArgs {
	action: "detach";
	id: string;
}

export interface ListArgs {
	action: "list";
}

export interface KillServerArgs {
	action: "kill-server";
}

export interface VersionArgs {
	action: "version";
}

export type Args =
	| StartArgs
	| StopArgs
	| StdinArgs
	| RunArgs
	| StdoutArgs
	| StreamArgs
	| TermSizeArgs
	| ResizeArgs
	| AttachArgs
	| DetachArgs
	| ListArgs
	| KillServerArgs
	| VersionArgs;

export interface AttachResult {
	cols: number;
	rows: number;
	rawOutput?: string;
}

export interface TermSizeResult {
	rows: number;
	cols: number;
	scrollback_lines: number;
}

// Request message
export interface ServerRequest {
	id: string;
	type: "request";
	args: Args;
}

// Response message
export interface ServerResponse {
	id: string;
	type: "response";
	result?: string | AttachResult | TermSizeResult;
	error?: string;
}

export interface OutputEvent {
	event: "output";
	sessionId: string;
	data: string; // Output data
}

export interface ResizeEvent {
	event: "resize";
	sessionId: string;
	cols: number;
	rows: number; // New terminal size
}

export interface ExitEvent {
	event: "exit";
	sessionId: string;
	exitCode: number; // Exit code of the process
}

export type ServerEvent = { type: "event" } & (OutputEvent | ResizeEvent | ExitEvent);

export type ServerMessage = ServerResponse | ServerEvent;

let requestCounter = 0;
// Helper to create typed requests
export function createRequest(args: Args): ServerRequest {
	return {
		id: `req-${++requestCounter}`,
		type: "request",
		args,
	};
}
