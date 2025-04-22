import { NapCatOneBot11Adapter, OB11Message, OB11MessageDataType } from '@/onebot';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { OB11PluginAdapter } from '@/onebot/network/plugin';
import { TapAccountManager } from './TapAccountManager';
import { sendMessage } from './sendMessage';
import { get_user } from './get_user';
import { generate1999HelpMenu } from './canvas';
import { generate1999AccountListImage, generate1999BindImage, generate1999CharacterImage, generate1999InfoImage, generate1999SwitchImage, generate1999WeaponImage } from './new';

const tapAccountManager = new TapAccountManager();

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

        try {
            // 验证账号有效性并获取角色名称
            const userInfo = await get_user(tap_id);
            const characterName = userInfo.data.list[0]?.basic_module?.name;
            if (!characterName) {
                await sendMessage(message, action, '获取角色名称失败，请检查账号是否有效');
                return;
            }
            // 使用账号管理器绑定账号
            tapAccountManager.bindAccount(userId, tap_id, characterName);
            await sendMessage(message, action, [{
                type: OB11MessageDataType.image,
                data: {
                    file: await generate1999BindImage(tap_id, characterName),
                    summary: '绑定成功'
                }
            }]);
        } catch (error) {
            await sendMessage(message, action, `绑定失败，可能是TapTap ID无效或未关联游戏账号`);
            console.error(`绑定TapTap ID失败:`, error);
        }
    }
    else if (message.raw_message.startsWith('#1999 切换')) {
        const tap_id = message.raw_message.slice(8).trim();
        const userId = message.user_id.toString();

        if (tap_id.length === 0) {
            await sendMessage(message, action, '请输入要切换的 TapTap ID');
            return;
        }

        // 使用账号管理器切换账号
        const result = tapAccountManager.switchAccount(userId, tap_id);
        if (!result) {
            const accountList = tapAccountManager.getAccountList(userId);
            if (!accountList.hasAccounts) {
                await sendMessage(message, action, '您尚未绑定任何账号，请先使用"#1999 绑定"命令');
            } else {
                await sendMessage(message, action, `未找到ID为 ${tap_id} 的绑定记录，请先绑定该账号`);
            }
            return;
        }

        const accountInfo = tapAccountManager.getAccountList(userId);
        const account = accountInfo.accounts?.find(a => a.id === tap_id);
        await sendMessage(message, action, [{
            type: OB11MessageDataType.image,
            data: {
                file: await generate1999SwitchImage(tap_id, account?.name ?? ''),
                summary: '切换成功'
            }
        }]);
    }
    else if (message.raw_message.startsWith('#1999 删除')) {
        const tap_id = message.raw_message.slice(8).trim();
        const userId = message.user_id.toString();

        if (tap_id.length === 0) {
            await sendMessage(message, action, '请输入要删除的 TapTap ID');
            return;
        }

        // 使用账号管理器删除账号
        const result = await tapAccountManager.deleteAccount(userId, tap_id);

        if (!result.success) {
            if (result.isEmpty) {
                await sendMessage(message, action, '您尚未绑定任何账号');
            } else {
                await sendMessage(message, action, `未找到ID为 ${tap_id} 的绑定记录`);
            }
            return;
        }

        if (result.isEmpty) {
            await sendMessage(message, action, `已删除账号 ${tap_id}(${result.deletedAccount?.name})，您当前没有绑定任何账号`);
        } else {
            await sendMessage(message, action, `已删除账号 ${tap_id}(${result.deletedAccount?.name})，当前默认账号为 ${result.defaultAccount?.id}(${result.defaultAccount?.name})`);
        }
    }
    else if (message.raw_message.startsWith('#1999 账号')) {
        const userId = message.user_id.toString();
        const accountList = tapAccountManager.getAccountList(userId);

        if (!accountList.hasAccounts) {
            await sendMessage(message, action, '您尚未绑定任何账号');
            return;
        }

        await sendMessage(message, action, [{
            type: OB11MessageDataType.image,
            data: {
                file: await generate1999AccountListImage(accountList.accounts!),
                summary: '账号列表'
            }
        }]);
    }
    else if (message.raw_message.startsWith('#1999 信息')) {
        const userId = message.user_id.toString();
        const defaultAccount = tapAccountManager.getDefaultAccount(userId);

        if (!defaultAccount.hasDefault) {
            await sendMessage(message, action, '请先绑定 TapTap ID');
            return;
        }

        const tap_id = defaultAccount.tapId!;

        try {
            const userInfo = await get_user(tap_id);
            const user_1999_name = userInfo.data.list[0]?.basic_module?.name;
            if (!user_1999_name) {
                await sendMessage(message, action, '获取账号信息失败，请检查账号是否有效');
                return;
            }
            await sendMessage(message, action, [{
                type: OB11MessageDataType.image,
                data: {
                    file: await generate1999InfoImage(userInfo),
                    summary: '账号信息'
                }
            }]);
        } catch (error) {
            await sendMessage(message, action, '获取账号信息失败，请检查账号是否有效');
            console.error('获取用户信息失败:', error);
        }
    }
    else if (message.raw_message.startsWith('#1999 心相')) {
        const userId = message.user_id.toString();
        const defaultAccount = tapAccountManager.getDefaultAccount(userId);

        if (!defaultAccount.hasDefault) {
            await sendMessage(message, action, '请先绑定 TapTap ID');
            return;
        }

        const tap_id = defaultAccount.tapId!;
        try {
            const userInfo = await get_user(tap_id);
            await sendMessage(message, action, [
                {
                    type: OB11MessageDataType.image,
                    data: {
                        file: await generate1999WeaponImage(userInfo),
                        summary: '心相信息'
                    }
                }
            ]);
        } catch (error) {
            await sendMessage(message, action, '获取心相信息失败，请检查账号是否有效');
            console.error('获取心相信息失败:', error);
        }
    }
    else if (message.raw_message.startsWith('#1999 角色')) {
        const userId = message.user_id.toString();
        const defaultAccount = tapAccountManager.getDefaultAccount(userId);

        if (!defaultAccount.hasDefault) {
            await sendMessage(message, action, '请先绑定 TapTap ID');
            return;
        }

        const tap_id = defaultAccount.tapId!;
        try {
            const userInfo = await get_user(tap_id);
            const user_1999_name = userInfo.data.list[0]?.basic_module?.name;
            if (!user_1999_name) {
                await sendMessage(message, action, '获取角色信息失败，请检查账号是否有效');
                return;
            }
            await sendMessage(message, action, [
                {
                    type: OB11MessageDataType.image,
                    data: {
                        file: await generate1999CharacterImage(userInfo),
                        summary: '角色信息'
                    }
                }
            ]);
        } catch (error) {
            await sendMessage(message, action, '获取角色信息失败，请检查账号是否有效');
            console.error('获取角色信息失败:', error);
        }
    }
    else if (message.raw_message.startsWith('#1999 帮助') || message.raw_message.startsWith('#1999 菜单')) {
        await sendMessage(message, action, [
            { type: OB11MessageDataType.image, data: { file: await generate1999HelpMenu() } }
        ]);
    }
};