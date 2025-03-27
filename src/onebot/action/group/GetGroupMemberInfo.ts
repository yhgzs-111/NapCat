import { OB11GroupMember } from '@/onebot';
import { OB11Construct } from '@/onebot/helper/data';
import { OneBotAction } from '@/onebot/action/OneBotAction';
import { ActionName } from '@/onebot/action/router';
import { Static, Type } from '@sinclair/typebox';

const SchemaData = Type.Object({
    group_id: Type.Union([Type.Number(), Type.String()]),
    user_id: Type.Union([Type.Number(), Type.String()]),
    no_cache: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
});

type Payload = Static<typeof SchemaData>;

class GetGroupMemberInfo extends OneBotAction<Payload, OB11GroupMember> {
    override actionName = ActionName.GetGroupMemberInfo;
    override payloadSchema = SchemaData;

    private parseBoolean(value: boolean | string): boolean {
        return typeof value === 'string' ? value === 'true' : value;
    }

    private async getUid(userId: string | number): Promise<string> {
        const uid = await this.core.apis.UserApi.getUidByUinV2(userId.toString());
        if (!uid) throw new Error(`Uin2Uid Error: 用户ID ${userId} 不存在`);
        return uid;
    }

    private async getGroupMemberInfo(payload: Payload, uid: string, isNocache: boolean) {
        const groupMemberCache = this.core.apis.GroupApi.groupMemberCache.get(payload.group_id.toString());
        const groupMember = groupMemberCache?.get(uid);

        const [member, info] = await Promise.all([
            this.core.apis.GroupApi.getGroupMemberEx(payload.group_id.toString(), uid, isNocache),
            this.core.apis.UserApi.fetchUserDetailInfoV2(uid),
        ]);

        if (!member || !groupMember) throw new Error(`群(${payload.group_id})成员${payload.user_id}不存在`);

        return { member, info, groupMember };
    }

    async _handle(payload: Payload) {
        const isNocache = this.parseBoolean(payload.no_cache ?? true);
        const uid = await this.getUid(payload.user_id);
        const { member, info } = await this.getGroupMemberInfo(payload, uid, isNocache);
        console.log('member', JSON.stringify(member, null, 2), 'info', JSON.stringify(info, null, 2));
        return OB11Construct.groupMember(payload.group_id.toString(), member, info);
    }
}

export default GetGroupMemberInfo;