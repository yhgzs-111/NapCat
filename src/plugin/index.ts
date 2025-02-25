import { NapCatOneBot11Adapter, OB11ArrayMessage, OB11MessageData } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { OpenAI } from 'openai';
import { ChatCompletionContentPart, ChatCompletionMessageParam } from 'openai/resources';
import { MemoryManager } from './memory';
import { ChatHotManager } from './chathot';
import { API_KEY, BASE_URL, BOT_ADMIN, BOT_NAME, CQCODE, MODEL, PROMPT, PROMPT_MEMROY } from './config';
import { toSingleRole } from './helper';

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
const chatHotManager = new ChatHotManager();
const memoryManager = new MemoryManager(mergeAndUpdateMemory);

async function createChatCompletionWithRetry(params: any, retries: number = 5): Promise<any> {
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
            msgArray.push({ type: 'image_url', image_url: { url: m.data.url?.replace('https://', 'http://') || '' } });
        } else if (m.type === 'face') {
            ret += '[CQ:face,id=' + m.data.id + ']';
        }
    }
    msgArray.push({ type: 'text', text: `${message.sender.nickname}(${message.sender.user_id})发送了消息(消息id:${message.message_id}) :` + ret });
    return msgArray.reverse();
}

async function mergeAndUpdateMemory(existingMemories: Array<ChatCompletionContentPart>[], newMemory: Array<ChatCompletionContentPart>[]): Promise<string> {
    const completion = await createChatCompletionWithRetry({
        messages: await toSingleRole([
            { role: 'user', content: [{ type: 'text', text: PROMPT_MEMROY }] },
            { role: 'user', content: [{ type: 'text', text: '接下来是旧记忆' }] },
            ...(existingMemories.map(msg => ({ role: 'user', content: msg.filter(e => e.type === 'text') }))),
            { role: 'user', content: [{ type: 'text', text: '接下来是新记忆' }] },
            ...(newMemory.map(msg => ({ role: 'user', content: msg.filter(e => e.type === 'text') })))]),
        model: MODEL
    });

    return completion.choices[0]?.message.content || '';
}

async function generateChatCompletion(contentData: Array<ChatCompletionMessageParam>): Promise<string> {
    const chatCompletion = await createChatCompletionWithRetry({ messages: contentData, model: MODEL });
    return chatCompletion.choices[0]?.message.content || '';
}

async function handleClearMemoryCommand(groupId: string, type: 'short' | 'long', action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    await memoryManager.clearMemory(groupId, type);
    const message = type === 'short' ? '短期上下文已清理' : '长期上下文已清理';
    await sendGroupMessage(groupId, message, action, adapter, instance);
}

async function sendGroupMessage(groupId: string, text: string, action: ActionMap, adapter: string, instance: OB11PluginAdapter) {
    return await action.get('send_group_msg')?.handle({ group_id: String(groupId), message: text }, adapter, instance.config);
}


async function prepareContentData(message: OB11ArrayMessage, msgArray: Array<ChatCompletionContentPart>, prompt: string, reply?: Array<ChatCompletionContentPart>) {
    const group_id = message.group_id?.toString()!;
    const longTermMemoryList = memoryManager.getLongTermMemory(group_id);
    let shortTermMemoryList = memoryManager.getShortTermMemory(group_id);
    let data = shortTermMemoryList.map(msg => ({ role: 'user' as const, content: msg.filter(e => e.type === 'text') }));
    return await toSingleRole([
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
}

async function handleChatResponse(message: OB11ArrayMessage, msgArray: Array<ChatCompletionContentPart>, adapter: string, action: ActionMap, instance: OB11PluginAdapter, _core: NapCatCore, reply?: Array<ChatCompletionContentPart>) {
    const prompt = `请根据下面聊天内容，继续与 ${message?.sender?.card || message?.sender?.nickname} 进行对话。${CQCODE},注意回复内容只用输出内容,不要提及此段话,注意一定不要使用markdown,请采用纯文本回复。你的人设:${PROMPT}`;
    const contentData = await prepareContentData(message, msgArray, prompt, reply);
    const msgRet = await generateChatCompletion(contentData);
    const sentMsg = await sendGroupMessage(message.group_id?.toString()!, msgRet, action, adapter, instance);
    return { id: sentMsg?.data?.message_id, text: msgRet };
}

async function shouldRespond(message: OB11ArrayMessage, core: NapCatCore, oriMsg: any, currentHot: number, msgArray: Array<ChatCompletionContentPart>, reply?: Array<ChatCompletionContentPart>): Promise<boolean> {
    if (
        !message.raw_message.startsWith(BOT_NAME) &&
        !message.message.find(e => e.type == 'at' && e.data.qq == core.selfInfo.uin) &&
        oriMsg?.sender.user_id.toString() !== core.selfInfo.uin
    ) {
        if (currentHot > 0 && msgArray.length > 0) {
            const prompt = `请根据在群内聊天与 ${message.sender.card || message.sender?.nickname} 发送的聊天消息推测本次消息是否应该回应。自身无关的话题和图片不要回复,尤其减少对图片消息的回复可能性, 注意回复内容只用输出2 - 3个字, 一定注意不想回复请回应不回复三个字即可, 想回复回应回复即可, 你的人设:${PROMPT}`;
            const contentData = await prepareContentData(message, msgArray, prompt, reply);
            const msgRet = await generateChatCompletion(contentData);
            if (msgRet.indexOf('不回复') !== -1) {
                return false;
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
    const currentHot = await chatHotManager.getHotData(message.group_id?.toString()!);
    console.log('currentHot', currentHot);
    const oriMsgId = message.message.find(e => e.type == 'reply')?.data.id;
    const oriMsg = (oriMsgId ? await action.get('get_msg')?._handle({ message_id: oriMsgId }, adapter, instance.config) : undefined) as OB11ArrayMessage | undefined;
    const msgArray = await messageToOpenAi(adapter, message.message, message.group_id?.toString()!, action, instance, message);
    if (!msgArray) return;
    await memoryManager.updateMemory(message.group_id?.toString()!, [msgArray], core.selfInfo.uin);

    if (await handleClearMemory(message, action, adapter, instance)) return;

    const oriMsgOpenai = oriMsg ? await messageToOpenAi(adapter, oriMsg.message, oriMsg.group_id?.toString()!, action, instance, oriMsg) : undefined;

    if (await shouldRespond(message, core, oriMsg, currentHot, msgArray, oriMsgOpenai)) {
        const sentMsg = await handleChatResponse(message, msgArray, adapter, action, instance, core, oriMsgOpenai);
        await memoryManager.updateMemory(message.group_id?.toString()!, [[{
            type: 'text',
            text: `我(群昵称: 乔千)(${core.selfInfo.uin})发送了消息(消息id: ${sentMsg.id}) : ` + sentMsg.text
        }]], core.selfInfo.uin);
        await chatHotManager.incrementHot(message.group_id?.toString()!);
    }
};