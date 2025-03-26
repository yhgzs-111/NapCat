import { NapCatOneBot11Adapter, OB11Message, OB11MessageData, OB11MessageDataType, OB11MessageNode } from '@/onebot';
import { ChatType, NapCatCore, NTMsgAtType, RawMessage } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { MsgData } from '@/core/packet/client/nativeClient';
import { ProtoBufDecode } from 'napcat.protobuf';
import appidList from "@/core/external/appid.json";
import { MessageUnique } from '@/common/message-unique';
import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict.js';
import { generateWordCloud } from './wordcloud';
import { drawJsonContent } from '@/shell/drawJson';
import { drawWordNetwork } from './network';
import { drawTimePattern } from './drawTime';
const jieba = Jieba.withDict(dict);
function timestampToDateText(timestamp: string): string {
    const date = new Date(+(timestamp + '000'));
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}
// 定义计算时间模式的函数 (如果不存在)
function calculateTimePattern(messages: any[]): Map<string, number> {
    // 统计每个时间段的消息数量
    const hourCount = new Map<number, number>(); // 0-23 小时
    const weekdayCount = new Map<number, number>(); // 0-6 对应周日到周六

    // 处理所有消息
    for (const msg of messages) {
        if (!msg.msgTime) continue;

        // 将消息时间转换为日期对象
        const timestamp = parseInt(msg.msgTime) * 1000;
        const date = new Date(timestamp);

        // 获取小时 (0-23)
        const hour = date.getHours();
        hourCount.set(hour, (hourCount.get(hour) || 0) + 1);

        // 获取星期几 (0-6, 0代表周日)
        const weekday = date.getDay();
        weekdayCount.set(weekday, (weekdayCount.get(weekday) || 0) + 1);
    }

    // 规范化时间模式
    const pattern = new Map<string, number>();

    // 处理小时分布
    const totalHours = Array.from(hourCount.values()).reduce((a, b) => a + b, 0) || 1;
    for (let hour = 0; hour < 24; hour++) {
        const count = hourCount.get(hour) || 0;
        pattern.set(`hour_${hour}`, count / totalHours);
    }

    // 处理星期分布
    const totalWeekdays = Array.from(weekdayCount.values()).reduce((a, b) => a + b, 0) || 1;
    for (let day = 0; day < 7; day++) {
        const count = weekdayCount.get(day) || 0;
        pattern.set(`day_${day}`, count / totalWeekdays);
    }

    return pattern;
}

// 定义计算相似度的函数 (如果不存在)
function calculateSimilarity(pattern1: Map<string, number>, pattern2: Map<string, number>): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    // 计算小时分布的余弦相似度
    for (let hour = 0; hour < 24; hour++) {
        const key = `hour_${hour}`;
        const val1 = pattern1.get(key) || 0;
        const val2 = pattern2.get(key) || 0;

        dotProduct += val1 * val2;
        norm1 += val1 * val1;
        norm2 += val2 * val2;
    }

    // 添加星期分布的余弦相似度权重
    for (let day = 0; day < 7; day++) {
        const key = `day_${day}`;
        const val1 = pattern1.get(key) || 0;
        const val2 = pattern2.get(key) || 0;

        dotProduct += val1 * val2 * 0.5; // 星期分布权重为小时分布的一半
        norm1 += val1 * val1 * 0.5;
        norm2 += val2 * val2 * 0.5;
    }

    // 计算余弦相似度
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
}
let ai_character = '';
export const plugin_onmessage = async (adapter: string, _core: NapCatCore, _obCtx: NapCatOneBot11Adapter, message: OB11Message, action: ActionMap, instance: OB11PluginAdapter) => {
    if (typeof message.message === 'string' || !message.raw) return;
    if (message.message.find(e => e.type == 'text' && e.data.text == '#千千的菜单')) {
        let innermsg =
            '#取 <@reply> 取回数据\n' +
            '#取Onebot <@reply> 取回Onebot数据\n' +
            '#取消息段 <@reply> 取回Onebot数据\n' +
            '#谁说过 <关键词> 随机返回说过这个关键词的人的消息\n' +
            '#谁经常说 <关键词> 随机返回说过这个关键词的人\n' +
            '#Ta经常说什么 <@reply> 返回这个人说过的关键词\n' +
            '#Ta经常什么时候聊天 <@reply> 返回这个人聊天的时间段\n' +
            '#Ta经常和谁一起聊天 <@reply> 返回这个人聊天的对象\n' +
            '#群友今日最爱表情包 <@reply> 返回这今天表情包\n' +
            '#群友本周最爱表情包 <@reply> 返回这本周表情包\n' +
            '#群友本月最爱表情包 <@reply> 返回这个人最爱的表情包\n' +
            '#Ta最爱的表情包 <@reply> 返回这个人最爱的表情包\n' +
            '#Ta今天最爱的表情包 <@reply> 返回这个人今天最爱的表情包\n' +
            '#Ta本周最爱的表情包 <@reply> 返回这个人本周最爱的表情包\n' +
            '#Ta本月最爱的表情包 <@reply> 返回这个人本月最爱的表情包\n' +
            '#今日词分析 <system> 返回今日词分析\n' +
            '#本周词分析 <system> 返回本周词分析\n' +
            '#本月词分析 <system> 返回本月词分析\n' +
            '#Ta的今日词分析 <@reply> 返回这个人说过的关键词\n' +
            '#Ta的本周词分析 <@reply> 返回这个人说过的关键词\n' +
            '#Ta的本月词分析 <@reply> 返回这个人说过的关键词\n' +
            '#寻找同时间水群群友 <system> 返回同时间水群群友\n' +
            '#寻找今日同时间水群群友 <system> 返回同时间水群群友\n' +
            '#寻找本周同时间水群群友 <system> 返回同时间水群群友\n' +
            '#寻找本月同时间水群群友 <system> 返回同时间水群群友\n' +
            '#文本转图片 <system> 将文本转换为图片\n' +
            '#Ai语音文本 <system> 返回Ai语音文本\n' +
            '#Ai语音角色列表 <system> 返回Ai语音角色\n' +
            '#Ai语音设置角色 <system> 设置Ai语音角色\n' +
            '#网页截图 <system> 返回网页截图\n' +
            `#关于千千 <system> 返回千千的介绍`;
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.image,
                data: {
                    file: await drawJsonContent(innermsg)
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text == '#取')) {

        let reply = message.raw.elements.find(e => e.replyElement)?.replyElement?.replayMsgSeq;
        if (!reply) return;

        let msg_id = message.group_id?.toString() + "_" + reply;
        let hex_data = MsgData.get(msg_id);
        if (!hex_data) {
            console.log('未找到' + msg_id);
            return;
        }

        let decodedData: any = ProtoBufDecode(new Uint8Array(Buffer.from(hex_data, 'hex')), (data) => Buffer.from(data).toString('hex'));
        let msgList = [];
        for (const keyData of decodedData['1']['3']['1']['2']) {
            let mdInner = JSON.stringify(keyData, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
            msgList.push({
                type: OB11MessageDataType.node,
                data: {
                    content: [
                        {
                            type: OB11MessageDataType.image,
                            data: {
                                file: await drawJsonContent(mdInner)
                            }
                        }
                    ]
                }
            });
        }

        let now_appid = decodedData['1']['1']['4'];
        let versionList = Object.entries(appidList).filter(([_, appidData]) => appidData.appid == now_appid).map(([version, appidData]) => ({ version, appidData }));

        if (versionList.length > 0) {
            let msg = `用户应用号: ${now_appid}`;
            if (versionList.length > 1) {
                versionList.forEach(version => {
                    msg += `\n可能的客户端版本: ${version.version}\n可能的客户端识别码: ${version.appidData.qua}`;
                });
            } else {
                msg += `\n客户端版本: ${versionList[0]?.version}\n客户端识别码: ${versionList[0]?.appidData.qua}`;
            }

            msgList.push({
                type: OB11MessageDataType.node,
                data: {
                    content: [
                        {
                            type: OB11MessageDataType.image,
                            data: {
                                file: await drawJsonContent(msg)
                            }
                        }
                    ]
                }
            });
        }
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: msgList as any
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && (e.data.text == '#取Onebot' || e.data.text == '#取消息段'))) {
        let reply_msg = message.message.find(e => e.type == 'reply')?.data.id;
        if (!reply_msg) return;
        let msg = await action.get('get_msg')?.handle({ message_id: reply_msg }, adapter, instance.config);
        if (!msg) return;
        let msgcontent = msg.data?.message;
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.node,
                data: {
                    content: [
                        {
                            type: OB11MessageDataType.text,
                            data: {
                                text: JSON.stringify(msgcontent, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2)
                            }
                        }
                    ] as OB11MessageData[]
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#谁说过'))) {
        let text = message.message.find(e => e.type == 'text')?.data.text;
        if (!text) return;
        let keyWords = text.slice(4);
        let search_result = await _core.apis.MsgApi.searchMsgWithKeywords([keyWords], {
            chatType: ChatType.KCHATTYPEGROUP,
            peerUid: message.group_id?.toString() ?? "",
            searchFields: 1,
            pageLimit: 20
        });
        type typeinner = typeof search_result[1]['resultItems'];
        let msgItems: typeinner = [];
        for (let i = 0; i < search_result[1].resultItems.length; i++) {
            let data = search_result[1].resultItems[i];
            if (data && data.fieldText.indexOf('#谁说过') === -1) {
                msgItems.push(data);
            }
        }
        let item = msgItems.length;
        if (item > 0) {
            let randomIndex = Math.floor(Math.random() * item);
            let msg = msgItems[randomIndex];
            let onebotmsgid = MessageUnique.createUniqueMsgId({ chatType: ChatType.KCHATTYPEGROUP, peerUid: message.group_id?.toString() ?? "" }, msg?.msgId ?? '');
            let msgJson = '关键词是:' + keyWords + '\n';
            for (const msgitem of msgItems) {
                msgJson += msgitem.senderNick + ' 在 ' + timestampToDateText(msgitem.msgTime) + ' 说 ' + msgitem.fieldText + '\n';
            }
            msgJson = msgJson.slice(0, -1);
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.reply,
                    data: {
                        id: onebotmsgid.toString(),
                    }
                },
                {
                    type: OB11MessageDataType.text,
                    data: {
                        text: '抓到你啦',
                    }
                }, {
                    type: OB11MessageDataType.image,
                    data: {
                        file: await drawJsonContent(msgJson)
                    }
                }]
            }, adapter, instance.config);
        }
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#谁经常说'))) {
        let text = message.message.find(e => e.type == 'text')?.data.text;
        if (!text) return;
        let keyWords = text.slice(5);
        let search_result = await _core.apis.MsgApi.searchMsgWithKeywords([keyWords], {
            chatType: ChatType.KCHATTYPEGROUP,
            peerUid: message.group_id?.toString() ?? "",
            searchFields: 1,
            pageLimit: 500
        });
        type typeinner = typeof search_result[1]['resultItems'];
        let msgItems: typeinner = [];
        let senderUinMap = new Map<string, number>();
        for (let i = 0; i < search_result[1].resultItems.length; i++) {
            let data = search_result[1].resultItems[i];
            if (data && data.fieldText.indexOf('#谁经常说') === -1) {
                senderUinMap.set(data.senderUin, (senderUinMap.get(data.senderUin) ?? 0) + 1);
                msgItems.push(data);
            }
        }
        let rank = Array.from(senderUinMap.entries()).sort((a, b) => b[1] - a[1]);
        let rankOne = rank[0];
        msgItems = msgItems.filter(e => e.senderUin == rankOne?.[0]);
        let item = msgItems.length;
        if (item > 0) {
            let msgJson = '关键词是:' + keyWords + '\n' + '' + rankOne?.[0] + ' 说过 ' + rankOne?.[1] + ' 次\n';
            for (const msgitem of msgItems) {
                msgJson += msgitem.senderNick + ' 说 ' + msgitem.fieldText + '\n';
            }
            msgJson = msgJson.slice(0, -1);
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.at,
                    data: {
                        qq: rankOne?.[0] ?? message.user_id.toString(),
                    }
                },
                {
                    type: OB11MessageDataType.text,
                    data: {
                        text: ' 抓到你啦',
                    }
                }, {
                    type: OB11MessageDataType.image,
                    data: {
                        file: await drawJsonContent(msgJson)
                    }
                }]
            }, adapter, instance.config);
        }
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta经常说什么'))) {
        let text_msg = message.message.find(e => e.type == 'text')?.data.text;
        let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
        if (!at_msg) {
            at_msg = message.user_id.toString();
        }
        if (!text_msg || !at_msg) return;
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let sender_uid = await _core.apis.UserApi.getUidByUinV2(at_msg);
        let msgs = (await _core.apis.MsgApi.queryFirstMsgBySender(peer, [sender_uid])).msgList;
        let text_msg_list = msgs.map(e => e.elements.filter(e => e.textElement)).flat().map(e => e.textElement!.content);
        let cutMap = new Map<string, number>();
        for (const text_msg_list_item of text_msg_list) {
            let msg = jieba.cut(text_msg_list_item, true);
            for (const msg_item of msg) {
                if (msg_item.length > 1) {
                    cutMap.set(msg_item, (cutMap.get(msg_item) ?? 0) + 1);
                }
            }
        }
        let rank = Array.from(cutMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 100);
        let info = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", at_msg.toString())
        let msgJson = info?.nick + ' 的历史发言词分析\n';
        for (const rankItem of rank) {
            msgJson += rankItem[0] + ' 提到 ' + rankItem[1] + ' 次\n';
        }
        msgJson = msgJson.slice(0, -1);
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.at,
                data: {
                    qq: at_msg,
                }
            }, {
                type: OB11MessageDataType.image,
                data: {
                    file: await generateWordCloud(rank.map(e => ({ word: e[0], frequency: e[1] })))
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta经常什么时候聊天'))) {
        let text_msg = message.message.find(e => e.type == 'text')?.data.text;
        let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
        if (!at_msg) {
            at_msg = message.user_id.toString();
        }
        if (!text_msg || !at_msg) return;
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let sender_uid = await _core.apis.UserApi.getUidByUinV2(at_msg);
        let msgs = (await _core.apis.MsgApi.queryFirstMsgBySender(peer, [sender_uid])).msgList;

        // 统计每个时间段的消息数量
        const weekdayCount = new Map<number, number>(); // 0-6 对应周日到周六
        const hourCount = new Map<number, number>(); // 0-23 小时
        const timeSlotCount = new Map<string, number>(); // 早上/下午/晚上等时段

        // 定义时间段
        const timeSlots = [
            { name: "凌晨(0-6点)", start: 0, end: 6 },
            { name: "早上(6-10点)", start: 6, end: 10 },
            { name: "中午(10-14点)", start: 10, end: 14 },
            { name: "下午(14-18点)", start: 14, end: 18 },
            { name: "晚上(18-22点)", start: 18, end: 22 },
            { name: "深夜(22-24点)", start: 22, end: 24 }
        ];

        // 星期几的名称
        const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

        // 统计消息时间分布
        for (const msg of msgs) {
            if (!msg.msgTime) continue;

            // 将消息时间转换为日期对象
            const timestamp = parseInt(msg.msgTime) * 1000;
            const date = new Date(timestamp);

            // 获取星期几 (0-6, 0代表周日)
            const weekday = date.getDay();
            weekdayCount.set(weekday, (weekdayCount.get(weekday) || 0) + 1);

            // 获取小时 (0-23)
            const hour = date.getHours();
            hourCount.set(hour, (hourCount.get(hour) || 0) + 1);

            // 判断属于哪个时间段
            for (const slot of timeSlots) {
                if (hour >= slot.start && hour < slot.end) {
                    timeSlotCount.set(slot.name, (timeSlotCount.get(slot.name) || 0) + 1);
                    break;
                }
            }
        }

        // 准备结果文本
        let info = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", at_msg.toString());
        let msgJson = `${info?.nick || at_msg} 的聊天时间分析\n`;
        msgJson += `总计分析消息: ${msgs.length}条\n\n`;

        // 添加星期几统计
        msgJson += "按星期统计:\n";
        const totalWeekday = Array.from(weekdayCount.values()).reduce((a, b) => a + b, 0);
        for (let i = 0; i < 7; i++) {
            const count = weekdayCount.get(i) || 0;
            const percentage = totalWeekday > 0 ? ((count / totalWeekday) * 100).toFixed(2) : "0.00";
            msgJson += `${weekdayNames[i]}: ${count}条 (${percentage}%)\n`;
        }

        // 添加时间段统计
        msgJson += "\n按时间段统计:\n";
        const totalTimeSlot = Array.from(timeSlotCount.values()).reduce((a, b) => a + b, 0);
        for (const slot of timeSlots) {
            const count = timeSlotCount.get(slot.name) || 0;
            const percentage = totalTimeSlot > 0 ? ((count / totalTimeSlot) * 100).toFixed(2) : "0.00";
            msgJson += `${slot.name}: ${count}条 (${percentage}%)\n`;
        }

        // 发送结果
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.at,
                data: {
                    qq: at_msg,
                }
            }, {
                type: OB11MessageDataType.text,
                data: {
                    text: " 的聊天时间分析"
                }
            }, {
                type: OB11MessageDataType.image,
                data: {
                    file: await drawJsonContent(msgJson)
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta经常和谁一起聊天'))) {
        let text_msg = message.message.find(e => e.type == 'text')?.data.text;
        let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
        if (!at_msg) {
            at_msg = message.user_id.toString();
        }
        if (!text_msg || !at_msg) return;
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let sender_uid = await _core.apis.UserApi.getUidByUinV2(at_msg);
        let msgs = (await _core.apis.MsgApi.queryFirstMsgBySender(peer, [sender_uid])).msgList;
        let uinCount = new Map<string, number>();

        // 收集所有直接可用的 UIN
        for (const msg of msgs) {
            for (const elem of msg.elements) {
                // 处理回复消息
                if (elem.replyElement) {
                    if (elem.replyElement.senderUin) {
                        uinCount.set(elem.replyElement.senderUin, (uinCount.get(elem.replyElement.senderUin) ?? 0) + 1);
                    }
                }

                // 先处理那些不需要异步获取的 UIN
                if (elem.textElement && elem.textElement?.atType == NTMsgAtType.ATTYPEONE) {
                    if (elem.textElement.atUid && elem.textElement.atUid !== '0') {
                        uinCount.set(elem.textElement.atUid, (uinCount.get(elem.textElement.atUid) ?? 0) + 1);
                    }
                }
            }
        }

        // 收集所有需要异步获取的 UIN 查询结果
        const uidQueries: Promise<{ uin: string | null, count: number }>[] = [];

        for (const msg of msgs) {
            // 处理需要异步解析的记录
            for (const record of msg.records) {
                if (record.senderUin) {
                    uinCount.set(record.senderUin, (uinCount.get(record.senderUin) ?? 0) + 1);
                } else if (record.senderUid) {
                    uidQueries.push((async () => {
                        const qq = await _core.apis.UserApi.getUinByUidV2(record.senderUid);
                        return { uin: qq, count: 1 };
                    })());
                }
            }

            // 处理需要异步解析的 @ 消息
            for (const elem of msg.elements) {
                if (elem.textElement && elem.textElement?.atType == NTMsgAtType.ATTYPEONE) {
                    const { atNtUid, atUid } = elem.textElement;
                    if (atNtUid && (!atUid || atUid === '0')) {
                        uidQueries.push((async () => {
                            const qq = await _core.apis.UserApi.getUinByUidV2(atNtUid);
                            return { uin: qq, count: 1 };
                        })());
                    }
                }
            }
        }

        // 等待所有异步查询完成并处理结果
        const results = await Promise.all(uidQueries);

        // 在所有异步操作完成后统一更新计数
        for (const result of results) {
            if (result.uin) {
                uinCount.set(result.uin, (uinCount.get(result.uin) ?? 0) + result.count);
            }
        }

        const rank = Array.from(uinCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // 只取前10名

        // 获取目标用户信息
        let info = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", at_msg.toString());
        let msgJson = `${info?.nick || at_msg} 的互动用户分析\n`;
        msgJson += `总计分析消息: ${msgs.length}条\n\n`;

        // 获取互动用户的昵称并生成结果
        if (rank.length > 0) {
            msgJson += "最常互动的用户:\n";

            // 收集所有获取昵称的异步操作
            const nicknamePromises = rank.map(async ([uin, count]) => {
                try {
                    const memberInfo = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", uin);
                    return { uin, count, nickname: memberInfo?.nick || uin };
                } catch (e) {
                    return { uin, count, nickname: uin };
                }
            });

            // 等待所有昵称获取完成
            const nicknames = await Promise.all(nicknamePromises);

            // 生成最终消息
            for (const { nickname, count } of nicknames) {
                msgJson += `${nickname}: ${count}次互动\n`;
            }
        } else {
            msgJson += "未找到互动记录\n";
        }

        msgJson = msgJson.slice(0, -1);
        // 发送结果
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.at,
                data: {
                    qq: at_msg,
                }
            }, {
                type: OB11MessageDataType.text,
                data: {
                    text: " 的互动用户分析"
                }
            }, {
                type: OB11MessageDataType.image,
                data: {
                    file: await drawJsonContent(msgJson)
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && (e.data.text.startsWith('#群友今日最爱表情包') || e.data.text.startsWith('#群友本周最爱表情包') || e.data.text.startsWith('#群友本月最爱表情包')))) {
        let time = 0;
        if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#群友本周最爱表情包'))) {
            time = 7 * 24 * 60 * 60; // 一周的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#群友今日最爱表情包'))) {
            time = 24 * 60 * 60; // 一天的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#群友本月最爱表情包'))) {
            time = 30 * 24 * 60 * 60; // 一月的秒数
        }
        let timebefore = (Math.floor(Date.now() / 1000) - time).toString();
        let timeafter = Math.floor(Date.now() / 1000).toString();
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let msgList = (await _core.apis.MsgApi.queryFirstMsgByTime(peer, timebefore, timeafter)).msgList;

        // 记录每个表情包的发送次数和发送者
        let countMap = new Map<string, {
            count: number,
            url: string,
            senders: Map<string, number> // 记录每个用户发送次数
        }>();

        // 处理所有表情包和图片
        for (const msg of msgList) {
            // 获取消息发送者
            const senderUin = msg.senderUin;
            if (!senderUin) continue;

            // 提取消息中的表情包或图片
            const mediaElements = msg.elements.filter(e => e.marketFaceElement || e.picElement);

            for (const elem of mediaElements) {
                let mediaPart = elem.marketFaceElement || elem.picElement;
                if (!mediaPart) continue;

                if ('emojiId' in mediaPart) {
                    // 处理表情包
                    const { emojiId } = mediaPart;
                    const dir = emojiId.substring(0, 2);
                    const url = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw300.gif`;

                    const existing = countMap.get(emojiId) || { count: 0, url, senders: new Map() };
                    existing.count += 1;
                    existing.senders.set(senderUin, (existing.senders.get(senderUin) || 0) + 1);
                    countMap.set(emojiId, existing);
                } else {
                    // 处理图片
                    let unique = mediaPart.fileName || "";
                    let existing = countMap.get(unique) || { count: 0, url: '', senders: new Map() };

                    if (!existing.url) {
                        existing.url = await _core.apis.FileApi.getImageUrl(mediaPart);
                    }

                    existing.count += 1;
                    existing.senders.set(senderUin, (existing.senders.get(senderUin) || 0) + 1);
                    countMap.set(unique, existing);
                }
            }
        }

        // 对表情包进行排名，取前10名
        let rank = Array.from(countMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        // 准备消息内容
        let msgContent: OB11MessageNode[] = [];
        // 为每个表情包添加最爱发这个表情的人
        for (let i = 0; i < rank.length; i++) {
            const item = rank[i];
            if (!item) continue; // 防御性检查

            const [_unique, data] = item;
            const { count, url, senders } = data;

            // 查找最常发送此表情包的用户
            const topSenders = Array.from(senders.entries())
                .sort((a, b) => b[1] - a[1]);

            if (topSenders.length > 0) {
                const topSender = topSenders[0];
                const senderUin = topSender?.[0];
                const userCount = topSender?.[1];
                if (!senderUin || !userCount) continue; // 防御性检查
                // 获取用户昵称
                let senderInfo;
                try {
                    senderInfo = await _core.apis.GroupApi.getGroupMember(
                        message.group_id?.toString() ?? "",
                        senderUin
                    );
                } catch (e) {
                    // 获取失败时使用QQ号
                }

                const nickname = senderInfo?.nick || senderUin;
                const userPercent = ((userCount / count) * 100).toFixed(1);



                // 添加表情图片，带上发送者信息
                msgContent.push({
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `${i + 1}. 表情使用${count}次 - ${nickname}发了${userCount}次(${userPercent}%)\n`
                                }
                            },
                            {
                                type: OB11MessageDataType.image,
                                data: {
                                    file: url
                                }
                            }
                        ] as OB11MessageData[]
                    }
                });
            }
        }
        if (msgContent.length > 0) {
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: '群友今日最爱表情包Top10'
                                }
                            }
                        ]
                    }
                }, ...msgContent]
            }, adapter, instance.config);
        } else {
            // 没有找到表情包时发送提示
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.text,
                    data: {
                        text: '今日群里没有人发送表情包哦'
                    }
                }]
            }, adapter, instance.config);
        }
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta最爱的表情包'))) {
        // 获取目标用户
        let text_msg = message.message.find(e => e.type == 'text')?.data.text;
        let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
        if (!at_msg) {
            at_msg = message.user_id.toString();
        }
        if (!text_msg || !at_msg) return;

        // 获取用户历史消息
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let sender_uid = await _core.apis.UserApi.getUidByUinV2(at_msg);
        let msgs = (await _core.apis.MsgApi.queryFirstMsgBySender(peer, [sender_uid])).msgList;

        // 记录表情包使用频率
        let countMap = new Map<string, {
            count: number,
            url: string,
            lastUsed: number
        }>();

        // 处理所有消息中的表情
        for (const msg of msgs) {
            // 提取消息中的表情包元素
            const mediaElements = msg.elements.filter(e => e.marketFaceElement || e.picElement);

            for (const elem of mediaElements) {
                let mediaPart = elem.marketFaceElement || elem.picElement;
                if (!mediaPart) continue;

                if ('emojiId' in mediaPart) {
                    // 处理表情包
                    const { emojiId } = mediaPart;
                    const dir = emojiId.substring(0, 2);
                    const url = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw300.gif`;

                    const existing = countMap.get(emojiId) || { count: 0, url, lastUsed: 0 };
                    existing.count += 1;
                    existing.lastUsed = Math.max(existing.lastUsed, parseInt(msg.msgTime || '0'));
                    countMap.set(emojiId, existing);
                } else {
                    // 处理图片
                    let unique = mediaPart.fileName || "";
                    let existing = countMap.get(unique) || { count: 0, url: '', lastUsed: 0 };

                    if (!existing.url) {
                        existing.url = await _core.apis.FileApi.getImageUrl(mediaPart);
                    }

                    existing.count += 1;
                    existing.lastUsed = Math.max(existing.lastUsed, parseInt(msg.msgTime || '0'));
                    countMap.set(unique, existing);
                }
            }
        }

        // 对表情包进行排名，取前10名
        let rank = Array.from(countMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        // 获取用户信息
        let info = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", at_msg.toString());

        // 准备消息内容
        let msgContent: OB11MessageNode[] = [];

        // 为每个表情包生成一个节点
        for (let i = 0; i < rank.length; i++) {
            const item = rank[i];
            if (!item) continue;

            const [_unique, data] = item;
            const { count, url } = data;

            // 添加表情图片节点
            msgContent.push({
                type: OB11MessageDataType.node,
                data: {
                    content: [
                        {
                            type: OB11MessageDataType.text,
                            data: {
                                text: `${i + 1}. 使用了${count}次\n`
                            }
                        },
                        {
                            type: OB11MessageDataType.image,
                            data: {
                                file: url
                            }
                        }
                    ] as OB11MessageData[]
                }
            });
        }

        if (msgContent.length > 0) {
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `${info?.nick || at_msg} 的最爱表情包Top${Math.min(10, rank.length)}`
                                }
                            }
                        ]
                    }
                }, ...msgContent]
            }, adapter, instance.config);
        } else {
            // 没有找到表情包时发送提示
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.at,
                    data: {
                        qq: at_msg,
                    }
                }, {
                    type: OB11MessageDataType.text,
                    data: {
                        text: ' 似乎没有发过表情包呢'
                    }
                }]
            }, adapter, instance.config);
        }
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#关于千千'))) {
        let msg = `千千是完全基于NapCat集成开发的测试Bot,开源在NapCat Branch上`;
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.text,
                data: {
                    text: msg
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && (e.data.text.startsWith('#今日词分析') || e.data.text.startsWith('#本周词分析') || e.data.text.startsWith('#本月词分析')))) {
        let time = 0;
        if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#本周词分析'))) {
            time = 7 * 24 * 60 * 60; // 一周的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#今日词分析'))) {
            time = 24 * 60 * 60; // 一天的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#本月词分析'))) {
            time = 30 * 24 * 60 * 60; // 一月的秒数
        }
        let timebefore = (Math.floor(Date.now() / 1000) - time).toString();
        let timeafter = Math.floor(Date.now() / 1000).toString();
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let msgs = (await _core.apis.MsgApi.queryFirstMsgByTime(peer, timebefore, timeafter)).msgList;

        // 词频统计
        let cutMap = new Map<string, number>();
        // 建立词共现关系映射
        let cooccurrenceMap = new Map<string, Map<string, number>>();

        // 遍历所有消息
        for (const msg of msgs) {
            let msg_list = msg.elements.filter(e => e.textElement).map(e => e.textElement!.content);

            for (const msg_list_item of msg_list) {
                // 对每条消息进行分词
                let words = jieba.cut(msg_list_item, true)
                    .filter(word => word.length > 1); // 过滤掉单字词

                // 词频统计
                for (const word of words) {
                    cutMap.set(word, (cutMap.get(word) ?? 0) + 1);
                }

                // 构建共现关系
                for (let i = 0; i < words.length; i++) {
                    for (let j = i + 1; j < words.length; j++) {
                        // 对每对词建立共现关系
                        const wordA = words[i];
                        const wordB = words[j];

                        if (!wordA || !wordB) continue; // 防御性检查
                        // 为第一个词添加共现
                        if (!cooccurrenceMap.has(wordA)) {
                            cooccurrenceMap.set(wordA!, new Map<string, number>());
                        }
                        cooccurrenceMap.get(wordA)!.set(wordB, (cooccurrenceMap.get(wordA)!.get(wordB) ?? 0) + 1);

                        // 为第二个词添加共现（双向关系）
                        if (!cooccurrenceMap.has(wordB)) {
                            cooccurrenceMap.set(wordB, new Map<string, number>());
                        }
                        cooccurrenceMap.get(wordB)!.set(wordA, (cooccurrenceMap.get(wordB)!.get(wordA) ?? 0) + 1);
                    }
                }
            }
        }

        // 限制节点数量，只保留词频最高的50个
        let topWords = Array.from(cutMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(entry => entry[0]);

        // 构建图形数据
        let nodes: { id: string, label: string, value: number }[] = [];
        let edges: { from: string, to: string, value: number }[] = [];

        // 添加节点
        for (const word of topWords) {
            const frequency = cutMap.get(word) ?? 0;
            nodes.push({
                id: word,
                label: word,
                value: frequency
            });
        }

        // 最小共现阈值 - 忽略共现次数太少的连接
        const minCooccurrenceThreshold = 2;
        // 每个节点最多保留的连接数
        const maxEdgesPerNode = 3;

        // 为每个节点添加最重要的几个连接
        for (const wordA of topWords) {
            if (!wordA) continue;

            const cooccurrences = cooccurrenceMap.get(wordA);
            if (!cooccurrences) continue;

            // 获取当前词与其他topWords中词的共现数据
            const relevantCooccurrences = Array.from(cooccurrences.entries())
                .filter(([wordB]) => topWords.includes(wordB) && wordB !== wordA)
                .filter(([_, count]) => count >= minCooccurrenceThreshold) // 忽略共现次数太少的
                .sort((a, b) => b[1] - a[1]) // 按共现次数降序排序
                .slice(0, maxEdgesPerNode); // 只保留最重要的几个连接

            // 添加边（只从一个方向添加，避免重复）
            for (const [wordB, weight] of relevantCooccurrences) {
                // 确保无重复边（只添加wordA < wordB的情况）
                if (wordA < wordB) {
                    edges.push({
                        from: wordA,
                        to: wordB,
                        value: weight
                    });
                }
            }
        }

        // 构建完整的网络图数据
        const networkData = {
            nodes: nodes,
            edges: edges,
            title: `${message.group_id ?? "未知群聊"} 群词语关联分析`
        };

        // 使用新的网络图绘制函数
        const networkImageUrl = await drawWordNetwork(networkData);

        // 输出词频统计
        const topWordsText = topWords.slice(0, 20).map((word, index) =>
            `${index + 1}. ${word}: ${cutMap.get(word)}次`
        ).join('\n');

        // 发送结果
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [
                {
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `词频分析 (总消息数: ${msgs.length})`
                                }
                            }
                        ]
                    }
                },
                {
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `热词TOP20:\n${topWordsText}`
                                }
                            }
                        ]
                    }
                },
                {
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `词语关联网络图:`
                                }
                            },
                            {
                                type: OB11MessageDataType.image,
                                data: {
                                    file: networkImageUrl
                                }
                            }
                        ]
                    }
                }
            ]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && (e.data.text.startsWith('#Ta的今日词分析') || e.data.text.startsWith('#Ta的本周词分析') || e.data.text.startsWith('#Ta的本月词分析')))) {
        let time = 0;
        if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta的本周词分析'))) {
            time = 7 * 24 * 60 * 60; // 一周的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta的今日词分析'))) {
            time = 24 * 60 * 60; // 一天的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta的本月词分析'))) {
            time = 30 * 24 * 60 * 60; // 一月的秒数
        }

        // 获取目标用户
        let text_msg = message.message.find(e => e.type == 'text')?.data.text;
        let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
        if (!at_msg) {
            at_msg = message.user_id.toString();
        }
        if (!text_msg || !at_msg) return;

        // 获取时间范围
        let timebefore = (Math.floor(Date.now() / 1000) - time).toString();
        let timeafter = Math.floor(Date.now() / 1000).toString();

        // 获取群组信息和用户信息
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let sender_uid = await _core.apis.UserApi.getUidByUinV2(at_msg);

        let userMsgs = (await _core.apis.MsgApi.queryFirstMsgBySenderTime(peer, [sender_uid], timebefore, timeafter)).msgList;

        // 词频统计
        let cutMap = new Map<string, number>();
        // 建立词共现关系映射
        let cooccurrenceMap = new Map<string, Map<string, number>>();

        // 遍历用户的所有消息
        for (const msg of userMsgs) {
            let msg_list = msg.elements.filter(e => e.textElement).map(e => e.textElement!.content);

            for (const msg_list_item of msg_list) {
                // 对每条消息进行分词
                let words = jieba.cut(msg_list_item, true)
                    .filter(word => word.length > 1); // 过滤掉单字词

                // 词频统计
                for (const word of words) {
                    cutMap.set(word, (cutMap.get(word) ?? 0) + 1);
                }

                // 构建共现关系
                for (let i = 0; i < words.length; i++) {
                    for (let j = i + 1; j < words.length; j++) {
                        // 对每对词建立共现关系
                        const wordA = words[i];
                        const wordB = words[j];

                        if (!wordA || !wordB) continue; // 防御性检查
                        // 为第一个词添加共现
                        if (!cooccurrenceMap.has(wordA)) {
                            cooccurrenceMap.set(wordA, new Map<string, number>());
                        }
                        cooccurrenceMap.get(wordA)!.set(wordB, (cooccurrenceMap.get(wordA)!.get(wordB) ?? 0) + 1);

                        // 为第二个词添加共现（双向关系）
                        if (!cooccurrenceMap.has(wordB)) {
                            cooccurrenceMap.set(wordB, new Map<string, number>());
                        }
                        cooccurrenceMap.get(wordB)!.set(wordA, (cooccurrenceMap.get(wordB)!.get(wordA) ?? 0) + 1);
                    }
                }
            }
        }

        // 构建结果数据
        let timeRangeText = "今日";
        if (time === 7 * 24 * 60 * 60) {
            timeRangeText = "本周";
        } else if (time === 30 * 24 * 60 * 60) {
            timeRangeText = "本月";
        }

        // 获取用户信息
        let info = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", at_msg.toString());
        let username = info?.nick || at_msg;

        // 如果用户在该时间段内没有发言，发送提示
        if (userMsgs.length === 0) {
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.at,
                    data: {
                        qq: at_msg,
                    }
                }, {
                    type: OB11MessageDataType.text,
                    data: {
                        text: ` ${timeRangeText}没有发言记录哦`
                    }
                }]
            }, adapter, instance.config);
            return;
        }

        // 如果词频数据为空，也发送提示
        if (cutMap.size === 0) {
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.at,
                    data: {
                        qq: at_msg,
                    }
                }, {
                    type: OB11MessageDataType.text,
                    data: {
                        text: ` ${timeRangeText}没有有效的文本消息哦`
                    }
                }]
            }, adapter, instance.config);
            return;
        }

        // 限制节点数量，只保留词频最高的词
        let maxNodes = Math.min(50, cutMap.size);
        let topWords = Array.from(cutMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxNodes)
            .map(entry => entry[0]);

        // 构建网络图数据
        let nodes: { id: string, label: string, value: number }[] = [];
        let edges: { from: string, to: string, value: number }[] = [];

        // 添加节点
        for (const word of topWords) {
            const frequency = cutMap.get(word) ?? 0;
            nodes.push({
                id: word,
                label: word,
                value: frequency
            });
        }

        // 最小共现阈值和每个节点最多保留的连接数
        const minCooccurrenceThreshold = 1;  // 对个人分析降低阈值
        const maxEdgesPerNode = 3;

        // 为每个节点添加最重要的几个连接
        for (const wordA of topWords) {
            if (!wordA) continue;

            const cooccurrences = cooccurrenceMap.get(wordA);
            if (!cooccurrences) continue;

            // 获取当前词与其他topWords中词的共现数据
            const relevantCooccurrences = Array.from(cooccurrences.entries())
                .filter(([wordB]) => topWords.includes(wordB) && wordB !== wordA)
                .filter(([_, count]) => count >= minCooccurrenceThreshold)
                .sort((a, b) => b[1] - a[1])
                .slice(0, maxEdgesPerNode);

            // 添加边（只从一个方向添加，避免重复）
            for (const [wordB, weight] of relevantCooccurrences) {
                if (wordA < wordB) {
                    edges.push({
                        from: wordA,
                        to: wordB,
                        value: weight
                    });
                }
            }
        }

        // 构建网络图数据
        const networkData = {
            nodes: nodes,
            edges: edges,
            title: `${username} ${timeRangeText}词语关联分析`
        };

        // 绘制网络图
        const networkImageUrl = await drawWordNetwork(networkData);

        // 输出词频统计（只取TOP15，因为是个人而非整个群）
        const topWordsText = topWords.slice(0, 15).map((word, index) =>
            `${index + 1}. ${word}: ${cutMap.get(word)}次`
        ).join('\n');

        // 发送结果
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [
                {
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `${username} ${timeRangeText}词频分析 (总消息数: ${userMsgs.length})`
                                }
                            }
                        ]
                    }
                },
                {
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `热词TOP15:\n${topWordsText}`
                                }
                            }
                        ]
                    }
                },
                {
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `词语关联网络图:`
                                }
                            },
                            {
                                type: OB11MessageDataType.image,
                                data: {
                                    file: networkImageUrl
                                }
                            }
                        ]
                    }
                }
            ]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && (e.data.text.startsWith('#Ta今天最爱的表情包') || e.data.text.startsWith('#Ta本周最爱的表情包') || e.data.text.startsWith('#Ta本月最爱的表情包')))) {
        // 确定时间范围
        let time = 0;
        let timeRangeText = "今天";

        if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta本周最爱的表情包'))) {
            time = 7 * 24 * 60 * 60; // 一周的秒数
            timeRangeText = "本周";
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta今天最爱的表情包'))) {
            time = 24 * 60 * 60; // 一天的秒数
            timeRangeText = "今天";
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ta本月最爱的表情包'))) {
            time = 30 * 24 * 60 * 60; // 一月的秒数
            timeRangeText = "本月";
        }

        // 获取目标用户
        let text_msg = message.message.find(e => e.type == 'text')?.data.text;
        let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
        if (!at_msg) {
            at_msg = message.user_id.toString();
        }
        if (!text_msg || !at_msg) return;

        // 获取时间范围
        let timebefore = (Math.floor(Date.now() / 1000) - time).toString();
        let timeafter = Math.floor(Date.now() / 1000).toString();

        // 获取用户信息
        let peer = { peerUid: message.group_id?.toString() ?? "", chatType: ChatType.KCHATTYPEGROUP };
        let sender_uid = await _core.apis.UserApi.getUidByUinV2(at_msg);

        // 查询特定时间范围内的用户消息
        let msgs = (await _core.apis.MsgApi.queryFirstMsgBySenderTime(peer, [sender_uid], timebefore, timeafter)).msgList;

        // 记录表情包使用频率
        let countMap = new Map<string, {
            count: number,
            url: string,
            lastUsed: number
        }>();

        // 处理所有消息中的表情
        for (const msg of msgs) {
            // 提取消息中的表情包元素
            const mediaElements = msg.elements.filter(e => e.marketFaceElement || e.picElement);

            for (const elem of mediaElements) {
                let mediaPart = elem.marketFaceElement || elem.picElement;
                if (!mediaPart) continue;

                if ('emojiId' in mediaPart) {
                    // 处理表情包
                    const { emojiId } = mediaPart;
                    const dir = emojiId.substring(0, 2);
                    const url = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw300.gif`;

                    const existing = countMap.get(emojiId) || { count: 0, url, lastUsed: 0 };
                    existing.count += 1;
                    existing.lastUsed = Math.max(existing.lastUsed, parseInt(msg.msgTime || '0'));
                    countMap.set(emojiId, existing);
                } else {
                    // 处理图片
                    let unique = mediaPart.fileName || "";
                    let existing = countMap.get(unique) || { count: 0, url: '', lastUsed: 0 };

                    if (!existing.url) {
                        existing.url = await _core.apis.FileApi.getImageUrl(mediaPart);
                    }

                    existing.count += 1;
                    existing.lastUsed = Math.max(existing.lastUsed, parseInt(msg.msgTime || '0'));
                    countMap.set(unique, existing);
                }
            }
        }

        // 对表情包进行排名，取前10名
        let rank = Array.from(countMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10);

        // 获取用户信息
        let info = await _core.apis.GroupApi.getGroupMember(message.group_id?.toString() ?? "", at_msg.toString());

        // 准备消息内容
        let msgContent: OB11MessageNode[] = [];

        // 为每个表情包生成一个节点
        for (let i = 0; i < rank.length; i++) {
            const item = rank[i];
            if (!item) continue;

            const [_unique, data] = item;
            const { count, url } = data;

            // 添加表情图片节点
            msgContent.push({
                type: OB11MessageDataType.node,
                data: {
                    content: [
                        {
                            type: OB11MessageDataType.text,
                            data: {
                                text: `${i + 1}. 使用了${count}次\n`
                            }
                        },
                        {
                            type: OB11MessageDataType.image,
                            data: {
                                file: url
                            }
                        }
                    ] as OB11MessageData[]
                }
            });
        }

        if (msgContent.length > 0) {
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.node,
                    data: {
                        content: [
                            {
                                type: OB11MessageDataType.text,
                                data: {
                                    text: `${info?.nick || at_msg} ${timeRangeText}最爱表情包Top${Math.min(10, rank.length)}`
                                }
                            }
                        ]
                    }
                }, ...msgContent]
            }, adapter, instance.config);
        } else {
            // 没有找到表情包时发送提示
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.at,
                    data: {
                        qq: at_msg,
                    }
                }, {
                    type: OB11MessageDataType.text,
                    data: {
                        text: ` ${timeRangeText}似乎没有发送过表情包呢`
                    }
                }]
            }, adapter, instance.config);
        }
    }
    else if (message.message.find(e => e.type == 'text' && (
        e.data.text.startsWith('#寻找同时间水群群友') ||
        e.data.text.startsWith('#寻找今日同时间水群群友') ||
        e.data.text.startsWith('#寻找本周同时间水群群友') ||
        e.data.text.startsWith('#寻找本月同时间水群群友')
    ))) {
        try {
            // 获取目标用户
            let at_msg = message.message.find(e => e.type == 'at')?.data.qq;
            if (!at_msg) {
                at_msg = message.user_id.toString();
            }

            // 确定查询时间范围
            let lookbackDays = 30; // 默认查询过去30天的数据
            let timeRangeText = "本月";

            const text = message.message.find(e => e.type == 'text')?.data.text || '';
            if (text.includes('今日')) {
                lookbackDays = 1;
                timeRangeText = "今日";
            } else if (text.includes('本周')) {
                lookbackDays = 7;
                timeRangeText = "本周";
            }

            const groupId = message.group_id?.toString() ?? "";

            // 计算时间范围
            const timeBefore = (Math.floor(Date.now() / 1000) - (lookbackDays * 24 * 60 * 60)).toString();
            const timeAfter = Math.floor(Date.now() / 1000).toString();

            // 获取目标用户信息
            const targetInfo = await _core.apis.GroupApi.getGroupMember(groupId, at_msg);
            if (!targetInfo) {
                await action.get('send_group_msg')?.handle({
                    group_id: String(message.group_id),
                    message: [{
                        type: OB11MessageDataType.text,
                        data: {
                            text: "获取目标用户信息失败"
                        }
                    }]
                }, adapter, instance.config);
                return;
            }

            // 使用 queryFirstMsgByTime 一次性获取所有消息
            const peer = { peerUid: groupId, chatType: ChatType.KCHATTYPEGROUP };
            const allMsgs = (await _core.apis.MsgApi.queryFirstMsgByTime(peer, timeBefore, timeAfter)).msgList;

            if (allMsgs.length === 0) {
                await action.get('send_group_msg')?.handle({
                    group_id: String(message.group_id),
                    message: [{
                        type: OB11MessageDataType.text,
                        data: {
                            text: `${timeRangeText}内没有聊天记录`
                        }
                    }]
                }, adapter, instance.config);
                return;
            }

            // 优化: 使用Map按用户UID分组消息，避免循环中重复判断
            const userMsgsMap = new Map<string, { uin: string, nick: string, msgs: RawMessage[] }>();

            // 第一轮: 收集所有用户的消息并按UID分组
            for (const msg of allMsgs) {
                if (!msg.senderUid || !msg.msgTime) continue;

                // 使用消息中的UIN或通过UID获取UIN
                let uin = msg.senderUin || '';
                if (uin === '0' || uin === '') {
                    uin = await _core.apis.UserApi.getUinByUidV2(msg.senderUid);
                    if (!uin) continue;
                }

                // 获取或创建用户数据条目
                let userData = userMsgsMap.get(msg.senderUid);
                if (!userData) {
                    userData = {
                        uin,
                        nick: msg.sendNickName || msg.sendMemberName || uin,
                        msgs: []
                    };
                    userMsgsMap.set(msg.senderUid, userData);
                }
                userData.msgs.push(msg);
            }

            // 优化: 获取目标用户的消息
            const targetUid = await _core.apis.UserApi.getUidByUinV2(at_msg);
            if (!targetUid || !userMsgsMap.has(targetUid)) {
                await action.get('send_group_msg')?.handle({
                    group_id: String(message.group_id),
                    message: [{
                        type: OB11MessageDataType.at,
                        data: {
                            qq: at_msg,
                        }
                    }, {
                        type: OB11MessageDataType.text,
                        data: {
                            text: ` ${timeRangeText}内没有发言记录`
                        }
                    }]
                }, adapter, instance.config);
                return;
            }

            const targetUserData = userMsgsMap.get(targetUid)!;
            const targetMessages = targetUserData.msgs;

            // 确保目标用户有足够的消息用于分析
            const minMsgCount = lookbackDays === 1 ? 5 : 10; // 如果是今日数据，降低阈值

            if (targetMessages.length < minMsgCount) {
                await action.get('send_group_msg')?.handle({
                    group_id: String(message.group_id),
                    message: [{
                        type: OB11MessageDataType.at,
                        data: {
                            qq: at_msg,
                        }
                    }, {
                        type: OB11MessageDataType.text,
                        data: {
                            text: ` ${timeRangeText}的消息太少(${targetMessages.length}条)，无法进行有效分析`
                        }
                    }]
                }, adapter, instance.config);
                return;
            }

            // 计算目标用户的时间模式
            const targetPattern = calculateTimePattern(targetMessages);

            // 分析其他用户的时间模式并计算相似度
            const similarityResults: {
                uin: string,
                nickname: string,
                similarity: number,
                msgCount: number,
                pattern: Map<string, number>
            }[] = [];

            // 优化: 一次性计算所有用户的相似度，避免多次循环
            for (const [uid, userData] of userMsgsMap.entries()) {
                // 排除目标用户自己和消息数量太少的用户
                if (uid === targetUid || userData.msgs.length < minMsgCount) continue;

                const pattern = calculateTimePattern(userData.msgs);
                const similarity = calculateSimilarity(targetPattern, pattern);

                similarityResults.push({
                    uin: userData.uin,
                    nickname: userData.nick,
                    similarity,
                    msgCount: userData.msgs.length,
                    pattern
                });
            }

            // 按相似度排序取前5
            const topMatches = similarityResults
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 5);

            if (topMatches.length === 0) {
                await action.get('send_group_msg')?.handle({
                    group_id: String(message.group_id),
                    message: [{
                        type: OB11MessageDataType.at,
                        data: {
                            qq: at_msg,
                        }
                    }, {
                        type: OB11MessageDataType.text,
                        data: {
                            text: ` ${timeRangeText}内没有找到与你聊天时间模式相似的群友`
                        }
                    }]
                }, adapter, instance.config);
                return;
            }

            // 准备可视化数据
            const visualizationData = {
                targetUser: targetInfo.nick || at_msg,
                matchedUsers: topMatches.map(match => ({
                    username: match.nickname,
                    similarity: match.similarity,
                    pattern: match.pattern
                })),
                targetPattern,
                timeRange: timeRangeText
            };

            // 生成可视化图表 - 保持原有调用不变
            const visualizationImage = await drawTimePattern(visualizationData);

            // 准备文本结果
            let resultText = `${targetInfo.nick || at_msg} ${timeRangeText}聊天模式匹配结果\n`;
            resultText += `分析消息: ${targetMessages.length}条\n\n`;
            resultText += `与你聊天模式最相似的群友:\n`;

            for (let i = 0; i < topMatches.length; i++) {
                const match = topMatches[i];
                if (!match) continue;
                const similarityPercent = (match.similarity * 100).toFixed(1);
                resultText += `${i + 1}. ${match.nickname}: ${similarityPercent}% 匹配 (${match.msgCount}条消息)\n`;
            }

            // 发送结果
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [
                    {
                        type: OB11MessageDataType.node,
                        data: {
                            content: [
                                {
                                    type: OB11MessageDataType.text,
                                    data: {
                                        text: resultText
                                    }
                                }
                            ]
                        }
                    },
                    {
                        type: OB11MessageDataType.node,
                        data: {
                            content: [
                                {
                                    type: OB11MessageDataType.text,
                                    data: {
                                        text: `聊天时间模式对比图:`
                                    }
                                },
                                {
                                    type: OB11MessageDataType.image,
                                    data: {
                                        file: visualizationImage
                                    }
                                }
                            ]
                        }
                    }
                ]
            }, adapter, instance.config);
        } catch (error) {
            console.error("Error in 寻找同时间水群群友:", error);
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.text,
                    data: {
                        text: `处理请求时出错: ${error instanceof Error ? error.message : String(error)}`
                    }
                }]
            }, adapter, instance.config);
        }
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#文本转图片'))) {
        let content = message.message.filter(e => e.type == 'text').map(e => e.data.text).join(' ').replace('#文本转图片', '').trim();
        if (!content) {
            await action.get('send_group_msg')?.handle({
                group_id: String(message.group_id),
                message: [{
                    type: OB11MessageDataType.text,
                    data: {
                        text: '请输入要转换的文本'
                    }
                }]
            }, adapter, instance.config);
            return;
        }
        let imageUrl = await drawJsonContent(content);

        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.image,
                data: {
                    file: imageUrl
                }
            }]
        }, adapter, instance.config);

    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ai语音文本'))) {
        let content = message.message.filter(e => e.type == 'text').map(e => e.data.text).join(' ').replace('#Ai语音文本', '').trim();

        await action.get('send_group_ai_record')?._handle({
            group_id: String(message.group_id),
            character: ai_character,
            text: content
        })

    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ai语音设置角色'))) {
        let content = message.message.filter(e => e.type == 'text').map(e => e.data.text).join(' ').replace('#Ai语音设置角色', '').trim();
        ai_character = content;
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.image,
                data: {
                    file: await drawJsonContent(`已设置角色为: ${ai_character}`)
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#Ai语音角色列表'))) {
        let ret = await action.get('get_ai_characters')?._handle({
            group_id: String(message.group_id),
            chat_type: 1
        })
        if (!ret) return;
        let msgJson = `可用角色列表:\n`;
        for (const ai of ret) {
            msgJson += `角色类型: ${ai.type}\n`;
            for (const character of ai.characters) {
                msgJson += `  角色识别: ${character.character_id}\n`;
                msgJson += `  角色名称: ${character.character_name}\n`;
            }
        }
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.image,
                data: {
                    file: await drawJsonContent(msgJson)
                }
            }]
        }, adapter, instance.config);
    }
    else if (message.message.find(e => e.type == 'text' && (e.data.text.indexOf('https://') || e.data.text.indexOf('http://')))) {
        let text = message.message.filter(e => e.type == 'text').map(e => e.data.text).join(' ');
        //(https?|ftp|file)://[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]
        let url = text.match(/(https?|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/g)?.[0];
        if (!url) return;
        let imageMirror = ['https://urlscan.io/liveshot/?url=', 'https://image.thum.io/get/'];
        let imageUrl = imageMirror[Math.floor(Math.random() * imageMirror.length)] + url;
        await action.get('send_group_msg')?.handle({
            group_id: String(message.group_id),
            message: [{
                type: OB11MessageDataType.image,
                data: {
                    file: imageUrl
                }
            }]
        }, adapter, instance.config);
    }
};