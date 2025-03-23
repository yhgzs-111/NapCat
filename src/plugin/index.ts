import { NapCatOneBot11Adapter, OB11Message, OB11MessageDataType } from '@/onebot';
import { ChatType, NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { MsgData } from '@/core/packet/client/nativeClient';
import { ProtoBufDecode } from 'napcat.protobuf';
import { drawJsonContent } from '@/shell/napcat';
import appidList from "@/core/external/appid.json";
import { MessageUnique } from '@/common/message-unique';
function timestampToDateText(timestamp: string): string {
    const date = new Date(+(timestamp + '000'));
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}
export const plugin_onmessage = async (adapter: string, _core: NapCatCore, _obCtx: NapCatOneBot11Adapter, message: OB11Message, action: ActionMap, instance: OB11PluginAdapter) => {
    if (typeof message.message === 'string' || !message.raw) return;
    if (message.message.find(e => e.type == 'text' && e.data.text == '#取')) {

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
        console.log(now_appid);
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
    if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#谁说过'))) {
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
                msgJson += msgitem.senderNick + ' 在 ' + timestampToDateText(msgitem.msgTime) + ' 也说过哦' + '\n';
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
    if (message.message.find(e => e.type == 'text' && e.data.text.startsWith('#谁经常说'))) {
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
};