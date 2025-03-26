import { OB11GroupMember } from '@/onebot';
import { OB11Construct } from '@/onebot/helper/data';
import { OneBotAction } from '@/onebot/action/OneBotAction';
import { ActionName } from '@/onebot/action/router';
import { Static, Type } from '@sinclair/typebox';
import { GroupMember } from '@/core';

const SchemaData = Type.Object({
    group_id: Type.Union([Type.Number(), Type.String()]),
    no_cache: Type.Optional(Type.Union([Type.Boolean(), Type.String()]))
});

type Payload = Static<typeof SchemaData>;

export class GetGroupMemberList extends OneBotAction<Payload, OB11GroupMember[]> {
    override actionName = ActionName.GetGroupMemberList;
    override payloadSchema = SchemaData;

    /**
     * 处理获取群成员列表请求
     */
    async _handle(payload: Payload) {
        const groupIdStr = payload.group_id.toString();
        const noCache = this.parseBoolean(payload.no_cache ?? false);

        // 获取群成员基本信息
        const groupMembers = await this.getGroupMembers(groupIdStr, noCache);
        const memberArray = Array.from(groupMembers.values());

        // 批量并行获取用户详情
        const userDetailsPromises = memberArray.map(member =>
            this.core.apis.UserApi.getUserDetailInfoV2(member.uin)
                .catch(_ => {
                    return { uin: member.uin, uid: member.uid };
                })
        );
        const userDetails = await Promise.all(userDetailsPromises);

        // 并行构建 OneBot 格式的群成员数据
        const groupMembersList = memberArray.map((member, index) => {
            // 确保用户详情不会是undefined
            const userDetail = userDetails[index] || { uin: member.uin, uid: member.uid };
            return OB11Construct.groupMember(groupIdStr, member, userDetail);
        });

        // 直接返回处理后的成员列表，不进行去重
        return groupMembersList;
    }

    private parseBoolean(value: boolean | string): boolean {
        return typeof value === 'string' ? value === 'true' : value;
    }

    private async getGroupMembers(groupIdStr: string, noCache: boolean): Promise<Map<string, GroupMember>> {
        const memberCache = this.core.apis.GroupApi.groupMemberCache;
        let groupMembers = memberCache.get(groupIdStr);

        if (noCache || !groupMembers) {
            try {
                const refreshPromise = this.core.apis.GroupApi.refreshGroupMemberCache(groupIdStr, true);

                groupMembers = memberCache.get(groupIdStr) || (await refreshPromise);

                if (!groupMembers) {
                    throw new Error(`无法获取群 ${groupIdStr} 的成员列表`);
                }
            } catch (error) {
                throw new Error(`获取群 ${groupIdStr} 成员列表失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return groupMembers;
    }
}