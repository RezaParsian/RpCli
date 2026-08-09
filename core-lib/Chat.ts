import {assertValidTokenResponse} from './InvalidTokenError.js';
import continueChat from './ContinueChat.js';

export type ChatStreamChunk = {
	type: 'thinking' | 'response';
	content: string;
	messageId: number | null;
};

interface ChatProps {
	token: string;
	model_type?: 'default' | 'expert' | 'vision'
	thinking_enabled?: boolean
	search_enabled?: boolean
	challenge: string;
	sessionId: string;
	prompt: string;
	parentMessageId: number | null;
	onChunk?: (chunk: ChatStreamChunk) => void;
	logFn?: (data: { [key: string]: any, sessionId: string }) => void;
}

export interface ChatResult {
	ok: boolean;
	sessionId: string;
	content?: string;
	thinkingContent?: string;
	messageId?: number | null;
	parentId?: number | null;
	model?: string | null;
	status?: string | null;
	tokenUsage?: any | null;
	searchEnabled?: boolean | null;
	thinkingEnabled?: boolean | null;
	insertedAt?: string | null;
	updatedAt?: string | null;
	finished?: boolean;
	error?: string;
	bizCode?: number;
	raw?: any;
}

const MAX_CONTINUATIONS = 10;

export default async function chat({
									   token,
									   model_type = 'default',
									   thinking_enabled = false,
									   search_enabled = false,
									   challenge,
									   sessionId,
									   parentMessageId,
									   prompt,
									   onChunk,
									   logFn
								   }: ChatProps): Promise<ChatResult> {

	if (thinking_enabled && model_type === 'vision') throw new Error('This feature is not available for vision models');
	if (search_enabled && model_type !== 'default') throw new Error('Search is only supported in default model mode');

	let response = await fetch(
		"https://chat.deepseek.com/api/v0/chat/completion",
		{
			method: "POST",
			headers: {
				"x-ds-pow-response": challenge,
				"content-type": "application/json",
				authorization: "Bearer " + token,
			},
			body: JSON.stringify({
				chat_session_id: sessionId,
				parent_message_id: parentMessageId,
				model_type,
				prompt,
				thinking_enabled,
				search_enabled,
				ref_file_ids: [],
				action: null,
				preempt: false,
			}),
		}
	);
	assertValidTokenResponse(response);

	const contentType = response.headers.get("content-type");

	if (!contentType || !contentType.includes("text/event-stream")) {
		const json = await response.json();
		assertValidTokenResponse(response, json);
		if (json.data?.biz_code && json.data.biz_code !== 0) {
			return {
				ok: false,
				sessionId,
				error: json.data.biz_msg,
				bizCode: json.data.biz_code,
				raw: json,
			};
		}
		return {ok: false, sessionId, error: "unexpected non-stream response", raw: json};
	}

	if (!response.body) {
		return {ok: false, sessionId, error: "no response body"};
	}

	const decoder = new TextDecoder();

	const result: ChatResult = {
		ok: true,
		sessionId,
		content: "",
		thinkingContent: "",
		messageId: null,
		parentId: null,
		model: null,
		status: null,
		tokenUsage: null,
		searchEnabled: null,
		thinkingEnabled: null,
		insertedAt: null,
		updatedAt: null,
		finished: false,
	};

	const rawEvents: any[] = [];

	const fragments: Array<{ type: string; content: string }> = [];
	let activeFragmentIndex: number | null = null;
	let flatContent = "";
	let flatThinkingContent = "";
	let usingFragments = false;
	let activePatchPath = "";
	const emitChunk = (type: ChatStreamChunk['type'], content: string) => {
		if (content) onChunk?.({type, content, messageId: result.messageId ?? null});
	};

	let continuationCount = 0;

	while (true) {
		const reader = response.body.getReader();
		let buffer = "";

		while (true) {
		const {done, value} = await reader.read();

		if (done) break;

		buffer += decoder.decode(value, {stream: true});

		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.startsWith("data: ")) continue;

			let parsed: any;
			try {
				parsed = JSON.parse(line.slice(6));
				rawEvents.push(parsed);
			} catch (e) {
				continue;
			}

			if (typeof parsed.p === "string") activePatchPath = parsed.p;

			if (parsed.v?.response) {
				const r = parsed.v.response;
				result.messageId = r.message_id;
				result.parentId = r.parent_id;
				result.model = r.model;
				result.status = r.status;
				result.searchEnabled = r.search_enabled;
				result.thinkingEnabled = r.thinking_enabled;
				result.insertedAt = r.inserted_at;
				result.tokenUsage = r.accumulated_token_usage;

				if (Array.isArray(r.fragments) && r.fragments.length) {
					usingFragments = true;
					if (fragments.length === 0) {
						for (const f of r.fragments) {
							const type = f?.type ?? "RESPONSE";
							const content = f?.content ?? "";
							fragments.push({
								type,
								content,
							});
							emitChunk(type === "THINK" ? 'thinking' : 'response', content);
						}
						activeFragmentIndex = fragments.length - 1;
					}
				} else {
					if (typeof r.content === "string") {
						flatContent += r.content;
						emitChunk('response', r.content);
					}
					if (typeof r.thinking_content === "string") {
						flatThinkingContent += r.thinking_content;
						emitChunk('thinking', r.thinking_content);
					}
				}
				continue;
			}

			if (parsed.o === "APPEND" && activePatchPath === "response/fragments" && Array.isArray(parsed.v)) {
				usingFragments = true;
				for (const f of parsed.v) {
					const type = f?.type ?? "RESPONSE";
					const content = f?.content ?? "";
					fragments.push({
						type,
						content,
					});
					activeFragmentIndex = fragments.length - 1;
					emitChunk(type === "THINK" ? 'thinking' : 'response', content);
				}
				continue;
			}

			if (usingFragments && typeof parsed.v === "string" && activePatchPath.includes("fragments")) {
				if (activeFragmentIndex !== null) {
					fragments[activeFragmentIndex]!.content += parsed.v;
					emitChunk(
						fragments[activeFragmentIndex]!.type === "THINK"
							? 'thinking'
							: 'response',
						parsed.v,
					);
				} else {
					flatContent += parsed.v;
					emitChunk('response', parsed.v);
				}
				continue;
			}

			if (!usingFragments && typeof parsed.v === "string") {
				if (activePatchPath === "response/thinking_content") {
					flatThinkingContent += parsed.v;
					emitChunk('thinking', parsed.v);
					continue;
				}

				if (activePatchPath === "response/content") {
					flatContent += parsed.v;
					emitChunk('response', parsed.v);
					continue;
				}
			}

			if (parsed.p === "response" && parsed.o === "BATCH") {
				for (const item of parsed.v) {
					if (item.p === "accumulated_token_usage")
						result.tokenUsage = item.v;
					if (item.p === "quasi_status") {
						result.status = item.v;
						result.finished = item.v === "FINISHED";
					}
				}
				continue;
			}

			if (parsed.p === "response/accumulated_token_usage" && parsed.o === "SET") {
				result.tokenUsage = parsed.v;
				continue;
			}

			if (parsed.p === "response/status" && typeof parsed.v === "string") {
				result.status = parsed.v;
				result.finished = parsed.v === "FINISHED";
				continue;
			}

			if ("updated_at" in parsed && Object.keys(parsed).length === 1) {
				result.updatedAt = parsed.updated_at;
			}
		}
		}

		buffer += decoder.decode();
		if (buffer.startsWith("data: ")) {
			try {
				const parsed = JSON.parse(buffer.slice(6));
				if (parsed.p === "response/status" && typeof parsed.v === "string") {
					result.status = parsed.v;
					result.finished = parsed.v === "FINISHED";
				}
			} catch {
			}
		}

		if (result.status !== "INCOMPLETE") break;
		if (typeof result.messageId !== "number") {
			return {...result, ok: false, error: "cannot continue without a message id"};
		}
		if (continuationCount >= MAX_CONTINUATIONS) {
			return {...result, ok: false, error: "maximum continuation count reached"};
		}

		continuationCount += 1;
		response = await continueChat({token, sessionId, messageId: result.messageId});
		assertValidTokenResponse(response);

		const continuationContentType = response.headers.get("content-type");
		if (!continuationContentType?.includes("text/event-stream")) {
			const json = await response.json();
			assertValidTokenResponse(response, json);
			return {
				...result,
				ok: false,
				error: "unexpected non-stream continuation response",
				raw: json,
			};
		}
		if (!response.body) {
			return {...result, ok: false, error: "no continuation response body"};
		}
	}

	result.content = usingFragments
		? fragments
			.filter(fragment => fragment.type === "RESPONSE")
			.map(fragment => fragment.content)
			.join("")
		: flatContent;
	result.thinkingContent = usingFragments
		? fragments
			.filter(fragment => fragment.type === "THINK")
			.map(fragment => fragment.content)
			.join("")
		: flatThinkingContent;

	// Log raw events if a log function is provided
	if (logFn) {
		logFn({
			timestamp: new Date().toISOString(),
			sessionId,
			parentMessageId,
			prompt,
			model_type,
			thinking_enabled,
			search_enabled,
			events: rawEvents,
			result,
		});
	}

	return result;
}
