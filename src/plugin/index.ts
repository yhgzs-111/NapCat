import { NapCatOneBot11Adapter, OB11ArrayMessage, OB11MessageDataType } from '@/onebot';
import { NapCatCore, RawMessage } from '@/core';
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
const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL
});

const longTermMemory: Map<string, string> = new Map();
const shortTermMemory: Map<string, string[]> = new Map();
const memoryTransferCount: Map<string, number> = new Map();

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

async function handleMessage2String(message: RawMessage): Promise<string> {
    let data = '';
    for (let element of message.elements) {
        if (element.textElement) {
            data += element.textElement.content.replaceAll('->', '').replaceAll('<-', '');
        }
        if (element.replyElement) {
            const records = message.records.find(msgRecord => msgRecord.msgId === element.replyElement?.sourceMsgIdInRecords);
            if (records) {
                data += '[Reply] 回应内容 源消息[' + await handleMessage2String(records) + ']';
            }
        }
    }
    if (data.length === 0) throw new Error('消息为空');
    return (message.sendMemberName || message.sendNickName) + ' 说: ->' + data + '<- ';
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

async function generateChatCompletion(content_data: string): Promise<string> {
    console.log(content_data);
    const chatCompletion = await createChatCompletionWithRetry({
        messages: [{ role: 'user', content: content_data }],
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
    await action.get('send_group_msg')?.handle({
        group_id: String(group_id),
        message: [
            {
                type: OB11MessageDataType.text,
                data: { text }
            }
        ]
    }, adapter, instance.config);
}

export const plugin_onmessage = async (
    adapter: string,
    core: NapCatCore,
    _obCtx: NapCatOneBot11Adapter,
    message: OB11ArrayMessage,
    action: ActionMap,
    instance: OB11PluginAdapter
) => {
    const user_id = message.message.find(m => m.type === 'at')?.data.qq ?? message.sender.user_id;
    const user_uid = await core.apis.UserApi.getUidByUinV2(user_id.toString());
    if (!user_uid) {
        return;
    }
    let msg_string = '';
    try {
        msg_string = await handleMessage2String(message.raw!);
    } catch (error) {
        if (msg_string == '') {
            return;
        }
    }

    const user_info = await action.get('get_group_member_info')?.handle({ group_id: message.group_id?.toString()!, user_id: user_id }, adapter, instance.config);
    //const text = `${message.sender.nickname}(${message.sender.user_id})发送了消息 : ${msg_string}`;
    if (message.raw_message === '/清除短期上下文') {
        await handleClearMemoryCommand(message.group_id?.toString()!, 'short', action, adapter, instance);
        return;
    }

    if (message.raw_message === '/清除长期上下文') {
        await handleClearMemoryCommand(message.group_id?.toString()!, 'long', action, adapter, instance);
        return;
    }
    const orimsgid = message.message.find(e => e.type == 'reply')?.data.id;
    const orimsg = orimsgid ? await action.get('get_msg')?._handle({ message_id: orimsgid }, adapter, instance.config) : undefined;
    if (
        !message.raw_message.startsWith(BOT_NAME) &&
        !message.message.find(e => e.type == 'at' && e.data.qq == core.selfInfo.uin) &&
        orimsg?.sender.user_id.toString() !== core.selfInfo.uin
    ) {
        return;
    }
    await updateMemory(message.group_id?.toString()!, msg_string);

    const longTermMemoryString = longTermMemory.get(message.group_id?.toString()!) || '';
    const shortTermMemoryString = shortTermMemory.get(message.group_id?.toString()!)?.join('\n') || '';

    const content_data =
        `请根据下面聊天内容，继续与 ${user_info?.data?.card || user_info?.data?.nickname} 进行对话。注意回复内容只用输出内容,不要提及此段话,注意一定不要使用markdown,请采用纯文本回复。你的人设:${PROMPT}长时间记忆:\n${longTermMemoryString}\n短时间记忆:\n${shortTermMemoryString}\n当前对话:\n${msg_string}\n}`;
    const msg_ret = await generateChatCompletion(content_data);
    await sendGroupMessage(message.group_id?.toString()!, msg_ret, action, adapter, instance);
};