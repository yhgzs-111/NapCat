import { NapCatOneBot11Adapter, OB11ArrayMessage, OB11MessageDataType } from '@/onebot';
import { ChatType, NapCatCore, Peer, RawMessage } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { OpenAI } from 'openai';
import { RequestUtil } from '@/common/request';
import { randomBytes } from 'node:crypto';
const client = new OpenAI({
    apiKey: 'sk-vDXUiGa1fx8ygDJDjAlr2rUyoz3uPhMxr8zId8n3ycMkV23i',
    baseURL: 'https://api.bili2233.work/v1'
});

async function handleMessageArray2String(messages: RawMessage[]): Promise<string[]> {
    const result = [];
    let data = '';
    for (let i = 0; i < messages.length; i++) {
        try {
            if (messages[i]) {
                data += await handleMessage2String(messages[i]!) + '\n';
            }
        } catch {
            continue;
        }
        if ((i + 1) % 1000 === 0 || i === messages.length - 1) {
            result.push(data);
            data = '';
        }
    }
    return result;
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
                data += '[Reply] 回应别人的消息 ->' + await handleMessage2String(records) + '<-';
            }
        }
    }
    if (data.length === 0) throw new Error('消息为空');
    return (message.sendMemberName || message.sendNickName) + ' 说: ->' + data + '<- ';
}

async function generateChatCompletion(content_data: string): Promise<string> {
    const chatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: content_data }],
        model: 'gemini-2.0-flash-thinking-exp'
    });
    console.log(chatCompletion);
    return chatCompletion.choices[0]?.message.content || '';
}

async function generateChatCompletionWithImg(content_data: string, url: string): Promise<string> {
    const chatCompletion = await client.chat.completions.create({
        messages: [
            {
                role: 'user', content: [
                    {
                        type: 'text',
                        text: content_data
                    }, {
                        type: 'image_url',
                        image_url: {
                            url: url
                        }
                    }
                ]
            },

        ],
        model: 'gemini-2.0-flash-thinking-exp'
    });
    return chatCompletion.choices[0]?.message.content || '';
}

export const plugin_onmessage = async (
    adapter: string,
    core: NapCatCore,
    _obCtx: NapCatOneBot11Adapter,
    message: OB11ArrayMessage,
    action: ActionMap,
    instance: OB11PluginAdapter
) => {


    if (!message.message.find(m => m.type === 'text' && m.data.text.includes('#画像'))) {
        return;
    }

    const user_id = message.message.find(m => m.type === 'at')?.data.qq ?? message.sender.user_id;
    const user_uid = await core.apis.UserApi.getUidByUinV2(user_id.toString());
    if (!user_uid) {
        return;
    }

    const peer: Peer = { chatType: ChatType.KCHATTYPEGROUP, peerUid: message.group_id?.toString() ?? '' };
    const msg = await core.apis.MsgApi.queryFirstMsgBySender(peer, [user_uid]);
    if (msg.msgList.length < 1) {
        return;
    }
    let msg_tag = '根据下面图片提取该图片的描述的描述，回应只用给出头像描述即可不要给出 好的 等等无关句子也不得提及该提示词，下面为图片内容。';
    let avater_info = '头像仅供参考,Ta的头像描述: ' + await generateChatCompletionWithImg(msg_tag, `https://thirdqq.qlogo.cn/g?b=sdk&nk=${user_id}&s=100`);
    console.log(`Final avater_info ret: ${avater_info}`)
    const msg_string_all = await handleMessageArray2String(msg.msgList);
    const user_info = await action.get('get_group_member_info')?.handle({ group_id: message.group_id?.toString()!, user_id: user_id }, adapter, instance.config);

    if (msg_string_all.length > 1) {
        const summaryPromises = msg_string_all.map(async (msg_string, i) => {
            const content_data = `请根据下面聊天内容，分析 ${user_info?.data?.card || user_info?.data?.nickname} 的聊天风格分析其性格特点和一些有趣的信息和好笑的信息,为其建立用户画像,并加以幽默风趣的吐槽,下面是聊天内容,通过-><-字符区分结构。注意回复内容只用输出内容,不要提及此段话,注意一定不要使用markdown,请采用纯文本回复。附加提示信息:${avater_info} \n精选聊天记录: ${msg_string}`;
            try {
                const data = await generateChatCompletion(content_data);
                if (data) {
                    msg_string_all[i] = '[总结(此消息过长Ai已压缩改为总结)] ->' + data + '<- ';
                    console.log(`Summary for part ${i + 1}: ${data}`);
                }
            } catch (error) {
                msg_string_all[i] = '';
            }
        });
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [
                {
                    type: OB11MessageDataType.reply,
                    data: {
                        id: message.message_id.toString()
                    }
                },
                {
                    type: OB11MessageDataType.text,
                    data: {
                        text: `消息过长,共` + msg.msgList.length + `条消息,预计时间` + Math.round(10 * msg.msgList.length / 1000) + `秒,请稍等...`
                    }
                }]
        }, adapter, instance.config);
        await Promise.all(summaryPromises);
    }

    const msg_string = msg_string_all.join('\n');

    const content_data =
        `请根据下面聊天内容，分析 ${user_info?.data?.card || user_info?.data?.nickname} 的聊天风格分析其性格特点和一些有趣的信息和好笑的信息,为其建立用户画像,并加以幽默风趣的吐槽,下面是聊天内容,通过-><-字符区分结构。注意回复内容只用输出内容,不要提及此段话,注意一定不要使用markdown,请采用纯文本回复。附加信息:${avater_info} \n精选聊天记录:${msg_string}`;
    console.log(`Final content data: ${content_data}`);
    const msg_ret = await generateChatCompletion(content_data);
    console.log(`Final content ret: ${msg_ret}`)
    let pic_tag = `请根据下面对该人物性格的分析,并虚构想象一个场景,生成如 (1 cute girl with (cat ear and cat tail:1.2) stands in the garden:1.1), (cute:1.35), (detailed beautiful eyes:1.3), (beautiful face:1.3), casual, silver hair, silver ear, (blue hair:0.8), (blue ear:0.8), long hair, coat, short skirt, hair blowing with the wind, (blue eye:1.2), flowers, (little girl:0.65), butterflys flying around 格式的文本用于描述人物,注意格式为英文加空格加逗号进行区分,请务必多的描述人物和想象和场景,至少50个描述Tag,风格是可爱动漫二次元风,注意一定要是人为主体描述,不要好的什么的回应,只用给出要求格式的文本,不需要 好的 的回应,也不要提及此段话,下面为该人物性格分析.附加信息:${avater_info}.下面是人物分析.\n${msg_ret}`;
    let pic_tag_ret = await generateChatCompletion(pic_tag);
    let pic = `https://thirdqq.qlogo.cn/g?b=sdk&nk=${user_id}&s=100`;
    try {
        let pic_generate = await RequestUtil.HttpGetJson<{ images?: Array<{ url: string }> }>
            ('https://api.siliconflow.cn/v1/images/generations', 'POST', {
                "model": "stabilityai/stable-diffusion-xl-base-1.0",
                "prompt": 'original, (masterpiece), (illustration), (extremely fine and beautiful), perfect detailed, photorealistic, (beautiful and clear background:1.25), (depth of field:0.7),' + pic_tag_ret,
                "seed": randomBytes(4).readUInt32LE(0),
                "negative_prompt": "(copyright name:1.5),logo,(watermark:1.5),character_watermark,lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, bad feet, ((cowboy)),(((pubic))), ((((pubic_hair))))sketch, duplicate, ugly, huge eyes, text, logo, monochrome, worst face, (bad and mutated hands:1.3), (worst quality:2.0), (low quality:2.0), (blurry:2.0), horror, geometry, bad_prompt, (bad hands), (missing fingers), multiple limbs, bad anatomy, (interlocked fingers:1.2), Ugly Fingers, (extra digit and hands and fingers and legs and arms:1.4), crown braid, ((2girl)), (deformed fingers:1.2), (long fingers:1.2),succubus wings,horn,succubus horn,succubus hairstyle, (bad-artist-anime), bad-artist, bad hand"
            }, {
                Authorization: 'Bearer sk-knisudffvoodbxtdvaslrbiklezgzcvheoqsygpguvazkvfu',
                'Content-Type': 'application/json'
            });
        if (pic_generate?.images?.[0]) {
            pic = pic_generate?.images?.[0].url;
        }
    } catch (error) {

    }
    await action.get('send_group_msg')?.handle({
        group_id: String(message.group_id),
        message: [{
            type: OB11MessageDataType.node,
            data: {
                user_id: user_id,
                nickname: user_info?.data?.card || user_info?.data?.nickname || '',
                content: [
                    {
                        type: OB11MessageDataType.text,
                        data: { text: msg_ret }
                    }
                ]
            }
        },
        {
            type: OB11MessageDataType.node,
            data: {
                user_id: user_id,
                nickname: user_info?.data?.card || user_info?.data?.nickname || '',
                content: [
                    {
                        type: OB11MessageDataType.text,
                        data: { text: 'Tag: ' + pic_tag_ret }
                    }
                ]
            }
        },
        {
            type: OB11MessageDataType.node,
            data: {
                user_id: user_id,
                nickname: user_info?.data?.card || user_info?.data?.nickname || '',
                content: [
                    {
                        type: OB11MessageDataType.image,
                        data: {
                            file: pic
                        }
                    }
                ]
            }
        }
        ]
    }, adapter, instance.config);

};