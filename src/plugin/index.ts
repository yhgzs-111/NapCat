import { NapCatOneBot11Adapter, OB11ArrayMessage, OB11MessageData } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { OpenAI } from 'openai';
import { ChatCompletionContentPart, ChatCompletionMessageParam } from 'openai/resources';
import { Mutex } from 'async-mutex';

const API_KEY = 'sk-vDXUiGa1fx8ygDJDjAlr2rUyoz3uPhMxr8zId8n3ycMkV23i';
const BASE_URL = 'https://api.bili2233.work/v1';
const MODEL = 'gemini-2.0-flash-thinking-exp';
const SHORT_TERM_MEMORY_LIMIT = 100;
const BOT_NAME = '千千';
const BOT_ADMIN = '1627126029';
const PROMPT = `你的名字叫千千,你现在处于一个QQ群聊之中,作为博学多识的可爱群员,不要故意装可爱卖萌,而是更自然,注意少使用标点符号,热心解答各种问题和高强度水群
记住你说的话要尽量的简洁但具有情感,不要长篇大论,一句话不宜超过五十个字但实际回复可以超过。`;
const CQCODE = `增加一下能力通过不同昵称和QQ进行区分哦,注意理清回复消息的人物, At人直接发送 [CQ:at,qq=1234] 这样可以直接at某个人喵这 回复消息需要发送[CQ:reply,id=xxx]这种格式叫CQ码,发送图片等操作你可以从聊天记录中学习哦, 如果聊天记录的image CQ码 maface类型你可以直接复制使用`;
const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL
});

const longTermMemory: Map<string, string> = new Map();
const shortTermMemory: Map<string, Array<ChatCompletionContentPart>[]> = new Map();
const MemoryCount: Map<string, number> = new Map();
const chatHot: Map<string, { count: number, usetime: number, usecount: number }> = new Map();
const chatHotMutex = new Mutex();
const memMutex = new Mutex();

async function createChatCompletionWithRetry(params: any, retries: number = 3): Promise<any> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await client.chat.completions.create(params);
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed:`, error);
            if (attempt === retries - 1) throw error;
        }
    }
}

async function messageToOpenAi(adapter: string, msg: OB11MessageData[], groupId: string, action: ActionMap, plugin: OB11PluginAdapter, message: OB11ArrayMessage) {
    const msgArray: Array<ChatCompletionContentPart> = [];
    let ret = '';
    for (const m of msg) {
        if (m.type === 'reply') {
            ret += `[CQ:reply,id=${m.data.id}]`;
        } else if (m.type === 'text') {
            ret += m.data.text;
        } else if (m.type === 'at') {
            const memberInfo = await action.get('get_group_member_info')
                ?.handle({ group_id: groupId, user_id: m.data.qq }, adapter, plugin.config);
            ret += `[CQ:at=${m.data.qq},name=${memberInfo?.data?.nickname}]`;
        } else if (m.type === 'image') {
            ret += `[CQ:image,file=${m.data.url}]`;
            msgArray.push({
                type: 'image_url',
                image_url: {
                    url: m.data.url?.replace('https://', 'http://') || ''
                }
            });
        } else if (m.type === 'face') {
            ret += '[CQ:face,id=' + m.data.id + ']';
        }
    }
    msgArray.push({
        type: 'text',
        text: `${message.sender.nickname}(${message.sender.user_id})发送了消息(消息id:${message.message_id}) :` + ret
    });
    return msgArray.reverse();
}

async function mergeAndUpdateMemory(existingMemories: Array<ChatCompletionContentPart>[], newMemory: Array<ChatCompletionContentPart>[]): Promise<string> {
    const prompt = `
你是合并、更新和组织记忆的专家。当提供现有记忆和新信息时，你的任务是合并和更新记忆列表，以反映最准确和最新的信息。你还会得到每个现有记忆与新信息的匹配分数。确保利用这些信息做出明智的决定，决定哪些记忆需要更新或合并。
指南：
- 消除重复的记忆，合并相关记忆，以确保列表简洁和更新。
- 如果一个记忆直接与新信息矛盾，请批判性地评估两条信息：
    - 如果新记忆提供了更近期或更准确的更新，用新记忆替换旧记忆。
    - 如果新记忆看起来不准确或细节较少，保留旧记忆并丢弃新记忆。
    - 注意区分对应人物的记忆和印象, 不要产生混淆人物的印象和记忆。
- 在所有记忆中保持一致且清晰的风格，确保每个条目简洁而信息丰富。
- 如果新记忆是现有记忆的变体或扩展，更新现有记忆以反映新信息。
`;
    const completion = await createChatCompletionWithRetry({
        messages: await toSingleRole([
            { role: 'user', content: [{ type: 'text', text: prompt }] },
            { role: 'user', content: [{ type: 'text', text: '接下来是旧记忆' }] },
            ...(existingMemories.map(msg => ({ role: 'user', content: msg.filter(e => e.type === 'text') }))),
            { role: 'user', content: [{ type: 'text', text: '接下来是新记忆' }] },
            ...(newMemory.map(msg => ({ role: 'user', content: msg.filter(e => e.type === 'text') })))]),
        model: MODEL
    });

    return completion.choices[0]?.message.content || '';
}

async function generateChatCompletion(contentData: Array<ChatCompletionMessageParam>): Promise<string> {
    const chatCompletion = await createChatCompletionWithRetry({
        messages: contentData,
        model: MODEL
    });
    return chatCompletion.choices[0]?.message.content || '';
}

async function updateMemory(groupId: string, newMessages: Array<ChatCompletionContentPart>[], core: NapCatCore) {
    const currentMemory = shortTermMemory.get(groupId) || [];
    const memCount = await memMutex.runExclusive(() => {
        const memCount = MemoryCount.get(groupId) || 0;
        MemoryCount.set(groupId, memCount + 1);
        return memCount + 1;
    });
    console.log('memCount', memCount);
    currentMemory.push(...newMessages);
    if (memCount > SHORT_TERM_MEMORY_LIMIT) {
        await memMutex.runExclusive(async () => {
            const containsBotName = currentMemory.some(messages => messages.some(msg => msg.type === 'text' && msg.text.includes(core.selfInfo.uin)));
            if (containsBotName) {
                const mergedMemory = await mergeAndUpdateMemory(currentMemory, newMessages);
                longTermMemory.set(groupId, mergedMemory);
            }
            shortTermMemory.set(groupId, currentMemory.slice(-SHORT_TERM_MEMORY_LIMIT));
            MemoryCount.set(groupId, 0);
        });
    }
    shortTermMemory.set(groupId, currentMemory);
}

async function clearMemory(groupId: string, type: 'short' | 'long') {
    if (type === 'short') {
        shortTermMemory.set(groupId, []);
    } else {
        longTermMemory.set(groupId, '');
    }
}

async function handleClearMemoryCommand(groupId: string, type: 'short' | 'long', action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    await clearMemory(groupId, type);
    const message = type === 'short' ? '短期上下文已清理' : '长期上下文已清理';
    await sendGroupMessage(groupId, message, action, adapter, instance);
}

async function sendGroupMessage(groupId: string, text: string, action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    return await action.get('send_group_msg')?.handle({
        group_id: String(groupId),
        message: text
    }, adapter, instance.config);
}

async function handleMessage(message: OB11ArrayMessage, adapter: string, action: ActionMap, instance: OB11PluginAdapter) {
    return await messageToOpenAi(adapter, message.message, message.group_id?.toString()!, action, instance, message);
}

async function toSingleRole(msg: Array<any>) {
    let ret = { role: 'user', content: new Array<ChatCompletionContentPart>() };
    for (const m of msg) {
        ret.content.push(...m.content as any)
    }
    console.log(JSON.stringify(ret, null, 2));
    return [ret] as Array<ChatCompletionMessageParam>;
}

async function handleChatResponse(message: OB11ArrayMessage, msgArray: Array<ChatCompletionContentPart>, adapter: string, action: ActionMap, instance: OB11PluginAdapter, _core: NapCatCore, reply?: Array<ChatCompletionContentPart>) {
    const group_id = message.group_id?.toString()!;
    const longTermMemoryList = longTermMemory.get(group_id) || '';
    let shortTermMemoryList = shortTermMemory.get(group_id);
    if (!shortTermMemoryList) {
        let MemoryShort: Array<ChatCompletionContentPart>[] = [];
        shortTermMemory.set(group_id, MemoryShort);
        shortTermMemoryList = MemoryShort;
    }
    const prompt = `请根据下面聊天内容，继续与 ${message?.sender?.card || message?.sender?.nickname} 进行对话。${CQCODE},注意回复内容只用输出内容,不要提及此段话,注意一定不要使用markdown,请采用纯文本回复。你的人设:${PROMPT}`
    let data = shortTermMemoryList.map(msg => ({ role: 'user' as const, content: msg.filter(e => e.type === 'text') }));
    let contentData: Array<ChatCompletionMessageParam> = await toSingleRole([
        { role: 'user', content: [{ type: 'text', text: prompt }] },
        { role: 'user', content: [{ type: 'text', text: '接下来是长时间记忆' }] },
        { role: 'user', content: [{ type: 'text', text: longTermMemoryList }] },
        { role: 'user', content: [{ type: 'text', text: '接下来是短时间记忆' }] },
        ...data,
        { role: 'user', content: [{ type: 'text' as const, text: '接下来是本次引用消息' }] },
        ...(reply ? [{ role: 'user' as const, content: reply }] : []),
        { role: 'user', content: [{ type: 'text' as const, text: '接下来是当前对话' }] },
        { role: 'user', content: msgArray }
    ]);
    const msgRet = await generateChatCompletion(contentData);
    const sentMsg = await sendGroupMessage(group_id, msgRet, action, adapter, instance);
    return { id: sentMsg?.data?.message_id, text: msgRet };
}

async function shouldRespond(message: OB11ArrayMessage, core: NapCatCore, oriMsg: any, currentHot: number, msgArray: Array<ChatCompletionContentPart>, reply?: Array<ChatCompletionContentPart>): Promise<boolean> {
    if (
        !message.raw_message.startsWith(BOT_NAME) &&
        !message.message.find(e => e.type == 'at' && e.data.qq == core.selfInfo.uin) &&
        oriMsg?.sender.user_id.toString() !== core.selfInfo.uin
    ) {
        if (currentHot > 0) {
            if (msgArray.length > 0) {
                const longTermMemoryList = longTermMemory.get(message.group_id?.toString()!) || '';
                let shortTermMemoryList = shortTermMemory.get(message.group_id?.toString()!);
                let prompt = `请根据在群内聊天与 ${message.sender.card || message.sender?.nickname} 发送的聊天消息推测本次消息是否应该回应。自身无关的话题和图片不要回复,尤其减少对图片消息的回复可能性, 注意回复内容只用输出2 - 3个字, 一定注意不想回复请回应不回复三个字即可, 想回复回应回复即可, 你的人设:${PROMPT}`;
                if (!shortTermMemoryList) {
                    let MemoryShort: Array<ChatCompletionContentPart>[] = [];
                    shortTermMemory.set(message.group_id?.toString()!, MemoryShort);
                    shortTermMemoryList = MemoryShort;
                }
                const contentData: Array<ChatCompletionMessageParam> = await toSingleRole([
                    { role: 'user', content: [{ type: 'text', text: prompt }] },
                    { role: 'user', content: [{ type: 'text', text: '接下来是长时间记忆' }] },
                    { role: 'user', content: [{ type: 'text', text: longTermMemoryList }] },
                    { role: 'user', content: [{ type: 'text', text: '接下来是短时间记忆' }] },

                    ...(shortTermMemoryList.map(msg => ({ role: 'user' as const, content: msg.filter(e => e.type === 'text') }))),
                    { role: 'user', content: [{ type: 'text' as const, text: '接下来是本次引用消息' }] },
                    ...(reply ? [{ role: 'user' as const, content: reply }] : []),
                    { role: 'user', content: [{ type: 'text' as const, text: '接下来是当前对话' }] },
                    { role: 'user', content: msgArray }
                ]);
                const msgRet = await generateChatCompletion(contentData);
                if (msgRet.indexOf('不回复') !== -1) {
                    return false;
                }
            }
        } else {
            return false;
        }
    }
    return true;
}

async function handleClearMemory(message: OB11ArrayMessage, action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    if (message.raw_message === '/清除短期上下文' && message.sender.user_id.toString() === BOT_ADMIN) {
        await handleClearMemoryCommand(message.group_id?.toString()!, 'short', action, adapter, instance);
        return true;
    }

    if (message.raw_message === '/清除长期上下文' && message.sender.user_id.toString() === BOT_ADMIN) {
        await handleClearMemoryCommand(message.group_id?.toString()!, 'long', action, adapter, instance);
        return true;
    }
    return false;
}

export const plugin_onmessage = async (
    adapter: string,
    core: NapCatCore,
    _obCtx: NapCatOneBot11Adapter,
    message: OB11ArrayMessage,
    action: ActionMap,
    instance: OB11PluginAdapter
) => {
    const currentHot = await chatHotMutex.runExclusive(async () => {
        const group_id = message.group_id?.toString()!;
        const chatHotData = chatHot.get(group_id);
        const currentTime = Date.now();
        if (chatHotData) {
            if (currentTime - chatHotData.usetime > 30000) {
                chatHot.set(group_id, { count: chatHotData.count, usetime: currentTime, usecount: 0 });
            } else if (chatHotData.usecount > 2) {
                chatHot.set(group_id, { count: 0, usetime: currentTime, usecount: 0 });
            }
        } else {
            chatHot.set(group_id, { count: 0, usetime: currentTime, usecount: 0 });
        }
        return chatHot.get(group_id)!;
    });
    console.log('currentHot', currentHot);
    const oriMsgId = message.message.find(e => e.type == 'reply')?.data.id;
    const oriMsg = (oriMsgId ? await action.get('get_msg')?._handle({ message_id: oriMsgId }, adapter, instance.config) : undefined) as OB11ArrayMessage | undefined;
    const msgArray = await handleMessage(message, adapter, action, instance);
    if (!msgArray) return;
    await updateMemory(message.group_id?.toString()!, [msgArray], core);

    if (await handleClearMemory(message, action, adapter, instance)) return;

    const oriMsgOpenai = oriMsg ? await handleMessage(oriMsg, adapter, action, instance) : undefined;

    if (await shouldRespond(message, core, oriMsg, currentHot?.count || 0, msgArray, oriMsgOpenai)) {
        const sentMsg = await handleChatResponse(message, msgArray, adapter, action, instance, core, oriMsgOpenai);
        await updateMemory(message.group_id?.toString()!, [[{
            type: 'text',
            text: `我(群昵称: 乔千)(${core.selfInfo.uin})发送了消息(消息id: ${sentMsg.id}) : ` + sentMsg.text
        }]], core);
        await chatHotMutex.runExclusive(() => {
            const currentTime = Date.now();
            const group_id = message.group_id?.toString()!;
            if (currentTime - currentHot.usetime < 40000) {
                chatHot.set(group_id, { count: currentHot.count + 1, usetime: currentHot.usetime, usecount: currentHot.usecount + 1 });
            } else {
                chatHot.set(group_id, { count: 0, usetime: currentTime, usecount: 0 });
            }
        })
    }

};