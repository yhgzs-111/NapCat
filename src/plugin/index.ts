import { NapCatOneBot11Adapter, OB11Message, OB11MessageDataType } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { MsgData } from '@/core/packet/client/nativeClient';
import { ProtoBufDecode } from 'napcat.protobuf';
import { drawJsonContent } from '@/shell/napcat';
import appidList from "@/core/external/appid.json";

export const plugin_onmessage = async (adapter: string, _core: NapCatCore, _obCtx: NapCatOneBot11Adapter, message: OB11Message, action: ActionMap, instance: OB11PluginAdapter) => {
    if (typeof message.message === 'string' || !message.raw) return;
    if (!message.message.find(e => e.type == 'text' && e.data.text == '#取')) return;

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
};