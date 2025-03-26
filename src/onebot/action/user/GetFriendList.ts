import { OB11User } from '@/onebot';
import { OB11Construct } from '@/onebot/helper/data';
import { OneBotAction } from '@/onebot/action/OneBotAction';
import { ActionName } from '@/onebot/action/router';
import { Static, Type } from '@sinclair/typebox';

const SchemaData = Type.Object({
    no_cache: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
});

type Payload = Static<typeof SchemaData>;

export default class GetFriendList extends OneBotAction<Payload, OB11User[]> {
    override actionName = ActionName.GetFriendList;
    override payloadSchema = SchemaData;

    async _handle(_payload: Payload) {
        // 获取好友列表
        let buddyList = await this.core.apis.FriendApi.getBuddyV2SimpleInfoMap();
        const buddyArray = Array.from(buddyList.values());

        // 批量并行获取用户详情
        const userDetailsPromises = buddyArray.map(member =>
            this.core.apis.UserApi.getUserDetailInfoV2(member.uin ?? '')
                .catch(_ => {
                    return { uin: member.uin, uid: member.uid };
                })
        );
        const userDetails = await Promise.all(userDetailsPromises);

        const friendList = buddyArray.map((friend, index) => {
            const userDetail = userDetails[index] || { uin: friend.uin, uid: friend.uid };
            return OB11Construct.friend(friend, userDetail);
        });

        return friendList;
    }
}