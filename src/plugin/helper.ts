import { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources";

export async function toSingleRole(msg: Array<any>) {
    let ret = { role: 'user', content: new Array<ChatCompletionContentPart>() };
    for (const m of msg) {
        ret.content.push(...m.content as any)
    }
    console.log(JSON.stringify(ret, null, 2));
    return [ret] as Array<ChatCompletionMessageParam>;
}