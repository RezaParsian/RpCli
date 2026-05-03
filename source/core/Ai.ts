import OpenAI from 'openai';
import type {ChatCompletionMessageParam} from "openai/resources/chat/completions";

const openai = new OpenAI({
	baseURL: 'https://gateway.hashpa.com/api/v0',
	apiKey: 'rsk-gLdm2gmnRStRCIFJi54JEDjmI2IPYagJvRZ8hDFiqCcP05rEIIUdLbhLYf0nsj3',
});

export default async function request(model_id: string, messages: ChatCompletionMessageParam[]) {
	const completion = await openai.chat.completions.create({
		model: model_id,
		messages,
		//@ts-ignore
		model_id,
		temperature: 0.1
	});

	return completion.choices.reduce((res, choice) => {
		return res + choice.message.content;
	}, '')
}
