import { NapCatOneBot11Adapter, OB11Message, OB11MessageData, OB11MessageDataType, OB11MessageNode } from '@/onebot';
import { ChatType, NapCatCore, NTMsgAtType } from '@/core';
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
const jieba = Jieba.withDict(dict);
function timestampToDateText(timestamp: string): string {
    const date = new Date(+(timestamp + '000'));
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}
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
            '#Ta最爱的表情包 <@reply> 返回这个人最爱的表情包'
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
            let msg = jieba.cut(text_msg_list_item, false);
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
    else if (message.message.find(e => e.type == 'text' && (e.data.text.startsWith('#群友今日最爱表情包') || e.data.text.startsWith('#群友本周最爱表情包')))) {
        let time = 0;
        if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#群友本周最爱表情包'))) {
            time = 7 * 24 * 60 * 60; // 一周的秒数
        } else if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#群友今日最爱表情包'))) {
            time = 24 * 60 * 60; // 一天的秒数
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
};