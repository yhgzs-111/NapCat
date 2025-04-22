import { NapCatOneBot11Adapter, OB11Message } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { RequestUtil } from '@/common/request';

// 用户绑定的TapTap ID存储，改为支持多账号
const userBindTapMap = new Map<string, {
    default: string;
    list: string[];
}>();

/**
 * 发送消息工具函数
 */
const sendMessage = async (
    message: OB11Message,
    action: ActionMap,
    content: string
) => {
    if (message.message_type === 'private') {
        await action.get('send_msg')?._handle({
            user_id: message.user_id.toString(),
            message: content,
        });
    } else {
        await action.get('send_msg')?._handle({
            group_id: message.group_id?.toString(),
            message: content,
        });
    }
};

/**
 * 插件消息处理函数
 */
export const plugin_onmessage = async (
    _adapter: string,
    _core: NapCatCore,
    _obCtx: NapCatOneBot11Adapter,
    message: OB11Message,
    action: ActionMap,
    _instance: OB11PluginAdapter
) => {
    if (message.raw_message.startsWith('#1999 绑定')) {
        const tap_id = message.raw_message.slice(8).trim();
        const userId = message.user_id.toString();

        if (tap_id.length === 0) {
            await sendMessage(message, action, '请输入正确的 TapTap ID');
            return;
        }

        // 判断用户是否已有绑定记录
        if (!userBindTapMap.has(userId)) {
            userBindTapMap.set(userId, {
                default: tap_id,
                list: [tap_id]
            });
        } else {
            const userData = userBindTapMap.get(userId)!;
            // 检查是否已经绑定过该ID
            if (!userData.list.includes(tap_id)) {
                userData.list.push(tap_id);
                userData.default = tap_id; // 新绑定的账号自动设为默认
            }
        }
        await sendMessage(message, action, `绑定成功，TapTap ID: ${tap_id}`);
    }
    else if (message.raw_message.startsWith('#1999 切换')) {
        const tap_id = message.raw_message.slice(8).trim();
        const userId = message.user_id.toString();

        if (tap_id.length === 0) {
            await sendMessage(message, action, '请输入要切换的 TapTap ID');
            return;
        }

        const userData = userBindTapMap.get(userId);
        if (!userData) {
            await sendMessage(message, action, '您尚未绑定任何账号，请先使用"#1999 绑定"命令');
            return;
        }

        if (!userData.list.includes(tap_id)) {
            await sendMessage(message, action, `未找到ID为 ${tap_id} 的绑定记录，请先绑定该账号`);
            return;
        }

        userData.default = tap_id;
        await sendMessage(message, action, `已切换到 TapTap ID: ${tap_id}`);
    }
    else if (message.raw_message.startsWith('#1999 删除')) {
        const tap_id = message.raw_message.slice(8).trim();
        const userId = message.user_id.toString();

        if (tap_id.length === 0) {
            await sendMessage(message, action, '请输入要删除的 TapTap ID');
            return;
        }

        const userData = userBindTapMap.get(userId);
        if (!userData) {
            await sendMessage(message, action, '您尚未绑定任何账号');
            return;
        }

        const index = userData.list.indexOf(tap_id);
        if (index === -1) {
            await sendMessage(message, action, `未找到ID为 ${tap_id} 的绑定记录`);
            return;
        }

        userData.list.splice(index, 1);

        // 如果删除的是当前默认账号，则需要重新设置默认账号
        if (userData.default === tap_id) {
            userData.default = userData.list.length > 0 ? userData.list[0] ?? '' : '';
        }

        // 如果没有绑定账号了，则删除该用户的记录
        if (userData.list.length === 0) {
            userBindTapMap.delete(userId);
            await sendMessage(message, action, `已删除账号 ${tap_id}，您当前没有绑定任何账号`);
        } else {
            await sendMessage(message, action, `已删除账号 ${tap_id}，当前默认账号为 ${userData.default}`);
        }
    }
    else if (message.raw_message.startsWith('#1999 账号')) {
        const userId = message.user_id.toString();
        const userData = userBindTapMap.get(userId);

        if (!userData || userData.list.length === 0) {
            await sendMessage(message, action, '您尚未绑定任何账号');
            return;
        }

        let accountList = userData.list.map(id => {
            return id === userData.default ? `${id} (当前使用)` : id;
        }).join('\n');

        await sendMessage(message, action, `已绑定的账号列表：\n${accountList}`);
    }
    else if (message.raw_message.startsWith('#1999 信息')) {
        const userId = message.user_id.toString();
        const userData = userBindTapMap.get(userId);

        if (!userData || !userData.default) {
            await sendMessage(message, action, '请先绑定 TapTap ID');
            return;
        }

        const tap_id = userData.default;
        const userInfo = await get_user(tap_id);
        const user_1999_name = userInfo.data.list[0].basic_module.name;
        const user_1999_role_id = userInfo.data.list[0].basic_module.role_id;

        const user_1999_character_num = userInfo.data.list[0].basic_module.custom_items[0].value;
        const user_1999_login_day = userInfo.data.list[0].basic_module.custom_items[1].value;
        const user_1999_raindrops = userInfo.data.list[0].basic_module.custom_items[2].value;
        const user_1999_start_day = userInfo.data.list[1].episode_module.custom_items[0].value;
        const user_1999_progress = userInfo.data.list[1].episode_module.custom_items[1].value;
        const user_1999_sleepwalking = userInfo.data.list[1].episode_module.custom_items[2].value;
        const msg = `REVERSE.1999\n` +
            `昵称: ${user_1999_name}\n` +
            `角色ID: ${user_1999_role_id}\n` +
            `角色数量: ${user_1999_character_num}\n` +
            `登录天数: ${user_1999_login_day}\n` +
            `雨滴数量: ${user_1999_raindrops}\n` +
            `你何时睁眼看这个世界: ${user_1999_start_day}\n`
            + `你在哪一幕: ${user_1999_progress}\n` +
            `人工梦游: ${user_1999_sleepwalking}`;

        await sendMessage(message, action, msg);
    }
    else if (message.raw_message.startsWith('#1999 心相')) {
        const userId = message.user_id.toString();
        const userData = userBindTapMap.get(userId);

        if (!userData || !userData.default) {
            await sendMessage(message, action, '请先绑定 TapTap ID');
            return;
        }

        const tap_id = userData.default;
        const userInfo = await get_user(tap_id);
        const user_1999_name = userInfo.data.list[0].basic_module.name;
        const user_1999_role_id = userInfo.data.list[0].basic_module.role_id;

        const user_1999_msg = userInfo.data.list[3].weapon_module.list.map((item: { name: string; level: number }) => item.name + ": LV." + item.level).join('\n');
        const msg = `REVERSE.1999\n` +
            `昵称: ${user_1999_name}\n` +
            `角色ID: ${user_1999_role_id}\n` +
            `=====>心相<=====\n` +
            user_1999_msg

        await sendMessage(message, action, msg);
    }
    else if (message.raw_message.startsWith('#1999 角色')) {
        const userId = message.user_id.toString();
        const userData = userBindTapMap.get(userId);

        if (!userData || !userData.default) {
            await sendMessage(message, action, '请先绑定 TapTap ID');
            return;
        }

        const tap_id = userData.default;
        const userInfo = await get_user(tap_id);
        const user_1999_name = userInfo.data.list[0].basic_module.name;
        const user_1999_role_id = userInfo.data.list[0].basic_module.role_id;

        const user_1999_msg = userInfo.data.list[2].character_module.list.map((item: { name: string; level: number }) => item.name + ": LV." + item.level).join('\n');
        const msg = `REVERSE.1999\n` +
            `昵称: ${user_1999_name}\n` +
            `角色ID: ${user_1999_role_id}\n` +
            `=====>角色<=====\n` +
            user_1999_msg

        await sendMessage(message, action, msg);
    }
    else if (message.raw_message.startsWith('#1999 帮助') || message.raw_message.startsWith('#1999 菜单')) {
        const helpMessage = `REVERSE.1999\n` +
            `#1999 绑定 <TapTap ID> - 绑定 TapTap ID\n` +
            `#1999 切换 <TapTap ID> - 切换当前使用的 TapTap ID\n` +
            `#1999 删除 <TapTap ID> - 删除绑定的 TapTap ID\n` +
            `#1999 账号 - 查看已绑定的账号列表\n` +
            `#1999 信息 - 查看当前账号信息\n` +
            `#1999 心相 - 查看心相信息\n` +
            `#1999 角色 - 查看角色信息\n` +
            `#1999 帮助 - 查看帮助信息`;

        await sendMessage(message, action, helpMessage);
    }
};

/**
 * 获取用户游戏记录信息
 * @param tap_id TapTap用户ID
 * @returns 用户游戏记录信息
 */
export async function get_user(tap_id: string): Promise<any> {
    try {
        const params = new URLSearchParams({
            'app_id': '221062',
            'user_id': tap_id,
            'X-UA': 'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&VN=0.1.0&LOC=CN&PLT=Android&DS=Android&UID=00e000ee-00e0-0e0e-ee00-f0c95d8ca115&VID=444444444&OS=Android&OSV=14.0.1'
        });

        const url = `https://www.taptap.cn/webapiv2/game-record/v1/detail-by-user?${params.toString()}`;
        return await RequestUtil.HttpGetJson(url, 'GET');
    } catch (error) {
        console.error('获取用户游戏记录失败:', error);
        throw error;
    }
}