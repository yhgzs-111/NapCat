import { NapCatOneBot11Adapter, OB11ArrayMessage, OB11MessageData } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { OpenAI } from 'openai';

const API_KEY = 'sk-vDXUiGa1fx8ygDJDjAlr2rUyoz3uPhMxr8zId8n3ycMkV23i';
const BASE_URL = 'https://api.bili2233.work/v1';
const MODEL = 'gemini-2.0-flash-thinking-exp';
const SHORT_TERM_MEMORY_LIMIT = 100;
const BOT_NAME = '千千';
const PROMPT =
    `你的名字叫千千,你现在处于一个QQ群聊之中,作为博学多识的可爱群员,热心解答各种问题和高强度水群
记住你说的话要尽量的简洁但具有情感,不要长篇大论,一句话不宜超过五十个字。`;
const CQCODE = `增加一下能力通过不同昵称和QQ进行区分哦,注意理清回复消息的人物, At人直接发送 [CQ:at,qq=1234] 这样可以直接at某个人喵这 回复消息需要发送[CQ:reply,id=xxx]这种格式叫CQ码,发送图片等操作你可以从聊天记录中学习哦, 如果聊天记录的image CQ码 maface类型你可以直接复制使用`
const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL
});

const longTermMemory: Map<string, string> = new Map();
const shortTermMemory: Map<string, string[]> = new Map();
const memoryTransferCount: Map<string, number> = new Map();
//聊天热度
const chatHot: Map<string, number> = new Map();

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

async function msg2string(adapter: string, msg: OB11MessageData[], group_id: string, action: ActionMap, plugin: OB11PluginAdapter): Promise<string> {
    let ret = '';
    for (const m of msg) {
        if (m.type === 'reply') {
            ret += `[CQ:reply,id=${m.data.id}]`;
        } else if (m.type === 'text') {
            ret += m.data.text;
        } else if (m.type === 'at') {
            const memberInfo = await action.get('get_group_member_info')
                ?.handle({ group_id: group_id, user_id: m.data.qq }, adapter, plugin.config);
            ret += `[CQ:at=${m.data.qq},name=${memberInfo?.data?.nickname}]`;
        } else if (m.type === 'image') {
            ret += '[CQ:image,file=' + m.data.url + ']';
        } else if (m.type === 'face') {
            ret += '[CQ:face,id=' + m.data.id + ']';
        }
    }
    return ret;
}

function updateMemoryLayer(memoryLayer: Map<string, string[]>, group_id: string, newMessages: string[]) {
    const currentMemory = memoryLayer.get(group_id) || [];
    currentMemory.push(...newMessages);
    if (currentMemory.length > SHORT_TERM_MEMORY_LIMIT) {
        memoryLayer.set(group_id, currentMemory.slice(-SHORT_TERM_MEMORY_LIMIT));
    } else {
        memoryLayer.set(group_id, currentMemory);
    }
}

async function mergeAndUpdateMemory(existing_memories: string, new_memory: string): Promise<string> {
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
以下是任务的详细信息：
- 现有记忆：
${existing_memories}
- 新记忆：
${new_memory}`;

    const completion = await createChatCompletionWithRetry({
        messages: [{ role: 'user', content: prompt }],
        model: MODEL
    });

    return completion.choices[0]?.message.content || '';
}

async function generateChatCompletion(content_data: string, url_image?: string[]): Promise<string> {
    const messages: any = {
        role: 'user', content: [{
            type: 'text',
            text: content_data
        }]
    };
    if (url_image && url_image.length > 0) {
        url_image.forEach(url => {
            messages.content.push({
                type: 'image_url',
                image_url: {
                    url: url.replace('https://', 'http://')
                }
            });
        });
    }
    console.log(JSON.stringify(messages, null, 2));
    const chatCompletion = await createChatCompletionWithRetry({
        messages: [messages],
        model: MODEL
    });
    return chatCompletion.choices[0]?.message.content || '';
}

async function updateMemory(group_id: string, newMessages: string) {
    updateMemoryLayer(shortTermMemory, group_id, [newMessages]);
    const currentMemory = longTermMemory.get(group_id) || '';
    const transferCount = memoryTransferCount.get(group_id) || 0;

    if (shortTermMemory.get(group_id)!.length >= SHORT_TERM_MEMORY_LIMIT) {
        memoryTransferCount.set(group_id, transferCount + 1);
        if (memoryTransferCount.get(group_id)! >= 1) {
            const mergedMemory = await mergeAndUpdateMemory(currentMemory, shortTermMemory.get(group_id)!.join('\n'));
            longTermMemory.set(group_id, mergedMemory);
            shortTermMemory.set(group_id, []);
            memoryTransferCount.set(group_id, 0);
        }
    }
}

async function clearShortTermMemory(group_id: string) {
    shortTermMemory.set(group_id, []);
    memoryTransferCount.set(group_id, 0);
}

async function clearLongTermMemory(group_id: string) {
    longTermMemory.set(group_id, '');
}

async function handleClearMemoryCommand(group_id: string, type: 'short' | 'long', action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    if (type === 'short') {
        await clearShortTermMemory(group_id);
        await sendGroupMessage(group_id, '短期上下文已清理', action, adapter, instance);
    } else {
        await clearLongTermMemory(group_id);
        await sendGroupMessage(group_id, '长期上下文已清理', action, adapter, instance);
    }
}

async function sendGroupMessage(group_id: string, text: string, action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    return await action.get('send_group_msg')?.handle({
        group_id: String(group_id),
        message: text
    }, adapter, instance.config);
}

async function handleMessage(message: OB11ArrayMessage, adapter: string, action: ActionMap, instance: OB11PluginAdapter): Promise<string> {
    let msg_string = '';
    try {
        msg_string += `${message.sender.nickname}(${message.sender.user_id})发送了消息(消息id:${message.message_id}) :`
        msg_string += await msg2string(adapter, message.message, message.group_id?.toString()!, action, instance);
    } catch (error) {
        if (msg_string == '') {
            return '';
        }
    }
    return msg_string;
}

async function handleChatResponse(message: OB11ArrayMessage, msg_string: string, adapter: string, action: ActionMap, instance: OB11PluginAdapter, _core: NapCatCore) {
    const longTermMemoryString = longTermMemory.get(message.group_id?.toString()!) || '';
    const shortTermMemoryString = shortTermMemory.get(message.group_id?.toString()!)?.join('\n') || '';
    const user_info = await action.get('get_group_member_info')?.handle({ group_id: message.group_id?.toString()!, user_id: message.sender.user_id }, adapter, instance.config);
    const content_data =
        `请根据下面聊天内容，继续与 ${user_info?.data?.card || user_info?.data?.nickname} 进行对话。${CQCODE},注意回复内容只用输出内容,不要提及此段话,注意一定不要使用markdown,请采用纯文本回复。你的人设:${PROMPT}长时间记忆:\n${longTermMemoryString}\n短时间记忆:\n${shortTermMemoryString}\n当前对话:\n${msg_string}\n}`;
    const msg_ret = await generateChatCompletion(content_data, message.message.filter(e => e.type === 'image').map(e => e.data.url!));
    let msg = await sendGroupMessage(message.group_id?.toString()!, msg_ret, action, adapter, instance);
    chatHot.set(message.group_id?.toString()!, (chatHot.get(message.group_id?.toString()!) || 0) + 3);
    return msg?.data?.message_id;
}

export const plugin_onmessage = async (
    adapter: string,
    core: NapCatCore,
    _obCtx: NapCatOneBot11Adapter,
    message: OB11ArrayMessage,
    action: ActionMap,
    instance: OB11PluginAdapter
) => {
    const current_hot = chatHot.get(message.group_id?.toString()!) || 0;
    const orimsgid = message.message.find(e => e.type == 'reply')?.data.id;
    const orimsg = orimsgid ? await action.get('get_msg')?._handle({ message_id: orimsgid }, adapter, instance.config) : undefined;

    if (message.raw_message === '/清除短期上下文') {
        await handleClearMemoryCommand(message.group_id?.toString()!, 'short', action, adapter, instance);
        return;
    }

    if (message.raw_message === '/清除长期上下文') {
        await handleClearMemoryCommand(message.group_id?.toString()!, 'long', action, adapter, instance);
        return;
    }

    if (
        !message.raw_message.startsWith(BOT_NAME) &&
        !message.message.find(e => e.type == 'at' && e.data.qq == core.selfInfo.uin) &&
        orimsg?.sender.user_id.toString() !== core.selfInfo.uin
    ) {
        if (current_hot > 0) {
            const msg_string = await handleMessage(message, adapter, action, instance);
            if (msg_string) {
                const longTermMemoryString = longTermMemory.get(message.group_id?.toString()!) || '';
                const shortTermMemoryString = shortTermMemory.get(message.group_id?.toString()!)?.join('\n') || '';
                const user_info = await action.get('get_group_member_info')?.handle({ group_id: message.group_id?.toString()!, user_id: message.sender.user_id }, adapter, instance.config);
                const content_data =
                    `请根据在群内聊天与 ${user_info?.data?.card || user_info?.data?.nickname} 发送的聊天消息推测本次消息是否应该回应。${CQCODE},注意回复内容只用输出内容,一定注意不想回复请回应不回复三个字即可,想回复回应回复即可,你的人设:${PROMPT}长时间记忆:\n${longTermMemoryString}\n短时间记忆:\n${shortTermMemoryString}\n当前对话:\n${msg_string}\n}`
                const msg_ret = await generateChatCompletion(content_data, message.message.filter(e => e.type === 'image').map(e => e.data.url!));
                if (msg_ret.indexOf('不回复') == -1) {
                    return;
                }
            }
        } else {
            return;
        }
    }

    const msg_string = await handleMessage(message, adapter, action, instance);
    if (!msg_string) return;

    await updateMemory(message.group_id?.toString()!, msg_string);
    let sended_msg = await handleChatResponse(message, msg_string, adapter, action, instance, core);
    await updateMemory(message.group_id?.toString()!, `乔千(${core.selfInfo.uin})发送了消息(消息id:${sended_msg}) :` + msg_string);
};