import {init} from "@heyputer/puter.js/src/init.cjs";
import {ChatMessage} from "@heyputer/puter.js";

const puter = init(process.env["PUTER_TOKEN"] || '');

export default async function request(
	messages: ChatMessage[],
): Promise<string> {

	const response = await puter.ai.chat(messages);

	console.log({response})

	return response.message?.content as string
}
