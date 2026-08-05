import {assertValidTokenResponse} from './InvalidTokenError.js';

interface ChatProps {
	token: string;
	model_type?: 'default' | 'expert' | 'vision';
	thinking_enabled?: boolean;
	search_enabled?: boolean;
	challenge: string;
	sessionId: string;
	prompt: string;
	parentMessageId: number | null;
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

export default async function chat({
	token,
	model_type = 'default',
	thinking_enabled = false,
	search_enabled = false,
	challenge,
	sessionId,
	parentMessageId,
	prompt,
}: ChatProps): Promise<ChatResult> {
	if (thinking_enabled && model_type === 'vision')
		throw new Error('This feature is not available for vision models');
	if (search_enabled && model_type !== 'default')
		throw new Error('Search is only supported in default model mode');

	const response = await fetch(
		'https://chat.deepseek.com/api/v0/chat/completion',
		{
			method: 'POST',
			headers: {
				'x-ds-pow-response': challenge,
				'content-type': 'application/json',
				authorization: 'Bearer ' + token,
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
		},
	);
	assertValidTokenResponse(response);

	const contentType = response.headers.get('content-type');

	if (!contentType || !contentType.includes('text/event-stream')) {
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
		return {
			ok: false,
			sessionId,
			error: 'unexpected non-stream response',
			raw: json,
		};
	}

	if (!response.body) {
		return {ok: false, sessionId, error: 'no response body'};
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	const result: ChatResult = {
		ok: true,
		sessionId,
		content: '',
		thinkingContent: '',
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

	const fragmentOrder: (number | string)[] = [];
	const fragmentText: Record<string, string> = {};
	const fragmentTypes: Record<string, string> = {};
	let lastFragmentId: number | string | null = null;
	let flatContent = '';
	let usingFragments = false;

	const appendFragment = (fragment: any) => {
		const id = fragment?.id;
		if (id === undefined || id === null) return;

		const key = String(id);
		if (!(key in fragmentText)) {
			fragmentOrder.push(id);
			fragmentText[key] = '';
		}

		if (typeof fragment?.type === 'string') {
			fragmentTypes[key] = fragment.type;
		}

		fragmentText[key] += fragment?.content ?? '';
		lastFragmentId = id;
	};

	let buffer = '';

	while (true) {
		const {done, value} = await reader.read();

		if (done) break;

		buffer += decoder.decode(value, {stream: true});

		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;

			let parsed: any;
			try {
				parsed = JSON.parse(line.slice(6));
			} catch (e) {
				continue;
			}

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
					for (const fragment of r.fragments) {
						appendFragment(fragment);
					}
				} else if (typeof r.content === 'string' && r.content.length) {
					flatContent += r.content;
				}
				continue;
			}

			if (
				Array.isArray(parsed.v) &&
				parsed.p === 'response/fragments' &&
				parsed.o === 'APPEND'
			) {
				usingFragments = true;
				for (const fragment of parsed.v) {
					appendFragment(fragment);
				}
				continue;
			}

			if (
				usingFragments &&
				typeof parsed.v === 'string' &&
				typeof parsed.p === 'string' &&
				parsed.p.includes('fragments')
			) {
				if (lastFragmentId !== null) {
					fragmentText[String(lastFragmentId)] += parsed.v;
				} else {
					flatContent += parsed.v;
				}
				continue;
			}

			if (
				!usingFragments &&
				typeof parsed.v === 'string' &&
				(!parsed.p || parsed.p.includes('response/content'))
			) {
				flatContent += parsed.v;
				continue;
			}

			if (parsed.p === 'response' && parsed.o === 'BATCH') {
				for (const item of parsed.v) {
					if (item.p === 'accumulated_token_usage') result.tokenUsage = item.v;
					if (item.p === 'quasi_status' && item.v === 'FINISHED')
						result.finished = true;
				}
				continue;
			}

			if (
				parsed.p === 'response/accumulated_token_usage' &&
				parsed.o === 'SET'
			) {
				result.tokenUsage = parsed.v;
				continue;
			}

			if (parsed.p === 'response/status' && parsed.v === 'FINISHED') {
				result.status = 'FINISHED';
				result.finished = true;
				continue;
			}

			if ('updated_at' in parsed && Object.keys(parsed).length === 1) {
				result.updatedAt = parsed.updated_at;
			}
		}
	}

	buffer += decoder.decode();
	if (buffer.startsWith('data: ')) {
		try {
			const parsed = JSON.parse(buffer.slice(6));
			if (parsed.p === 'response/status' && parsed.v === 'FINISHED') {
				result.status = 'FINISHED';
				result.finished = true;
			}
		} catch {}
	}

	if (usingFragments) {
		result.content = fragmentOrder
			.filter(id => fragmentTypes[String(id)] !== 'THINK')
			.map(id => fragmentText[String(id)])
			.join('');
		result.thinkingContent = fragmentOrder
			.filter(id => fragmentTypes[String(id)] === 'THINK')
			.map(id => fragmentText[String(id)])
			.join('');
	} else {
		result.content = flatContent;
	}

	return result;
}
