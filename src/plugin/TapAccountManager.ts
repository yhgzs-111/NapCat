/**
 * TapTap账号管理类
 */
import * as fs from 'fs';
import * as path from 'path';

export class TapAccountManager {
    private userBindTapMap = new Map<string, {
        default: string;
        list: Array<{
            id: string;
            name: string;
        }>;
    }>();
    private dataFilePath: string;

    constructor(dataDir: string = './data') {
        // 确保数据目录存在
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.dataFilePath = path.join(dataDir, 'tap_accounts.json');
        this.loadData();
    }

    saveData() {
        try {
            // 将 Map 转换为可序列化的对象
            const dataObj: Record<string, any> = {};
            this.userBindTapMap.forEach((value, key) => {
                dataObj[key] = value;
            });

            fs.writeFileSync(
                this.dataFilePath,
                JSON.stringify(dataObj, null, 2),
                'utf-8'
            );
        } catch (error) {
            console.error('保存 TapTap 账号数据失败:', error);
        }
    }

    loadData() {
        try {
            if (fs.existsSync(this.dataFilePath)) {
                const fileContent = fs.readFileSync(this.dataFilePath, 'utf-8');
                const dataObj = JSON.parse(fileContent);

                // 清空当前数据并加载新数据
                this.userBindTapMap.clear();
                for (const [key, value] of Object.entries(dataObj)) {
                    this.userBindTapMap.set(key, value as any);
                }

                console.log('TapTap 账号数据已加载');
            } else {
                console.log('未找到 TapTap 账号数据文件，将创建新的数据存储');
            }
        } catch (error) {
            console.error('加载 TapTap 账号数据失败:', error);
        }
    }

    /**
     * 绑定TapTap ID
     */
    async bindAccount(userId: string, tapId: string, characterName: string): Promise<boolean> {
        // 用户首次绑定账号
        if (!this.userBindTapMap.has(userId)) {
            this.userBindTapMap.set(userId, {
                default: tapId,
                list: [{
                    id: tapId,
                    name: characterName
                }]
            });
            await this.saveData();
            return true;
        }

        // 用户已有账号，追加新账号
        const userData = this.userBindTapMap.get(userId)!;
        // 检查是否已经绑定过该ID
        if (!userData.list.some(item => item.id === tapId)) {
            userData.list.push({
                id: tapId,
                name: characterName
            });
            userData.default = tapId; // 新绑定的账号自动设为默认
            await this.saveData();
            return true;
        }

        // 账号已存在
        return false;
    }

    /**
     * 切换默认TapTap ID
     */
    async switchAccount(userId: string, tapId: string): Promise<boolean> {
        const userData = this.userBindTapMap.get(userId);
        if (!userData) return false;

        const accountItem = userData.list.find(item => item.id === tapId);
        if (!accountItem) return false;

        userData.default = tapId;
        await this.saveData();
        return true;
    }

    /**
     * 删除绑定的TapTap ID
     * @returns 删除结果、剩余默认账号信息（如果有）
     */
    async deleteAccount(userId: string, tapId: string): Promise<{
        success: boolean;
        deletedAccount?: { id: string; name: string; };
        defaultAccount?: { id: string; name: string; };
        isEmpty: boolean;
    }> {
        const userData = this.userBindTapMap.get(userId);
        if (!userData) {
            return { success: false, isEmpty: true };
        }

        const index = userData.list.findIndex(item => item.id === tapId);
        if (index === -1) {
            return { success: false, isEmpty: false };
        }

        const deletedAccount = userData.list[index];
        userData.list.splice(index, 1);

        // 如果删除的是当前默认账号，则需要重新设置默认账号
        if (userData.default === tapId) {
            userData.default = userData.list.length > 0 ? userData.list[0]?.id ?? '' : '';
        }

        // 如果没有绑定账号了，则删除该用户的记录
        let result;
        if (userData.list.length === 0) {
            this.userBindTapMap.delete(userId);
            result = {
                success: true,
                deletedAccount,
                isEmpty: true
            };
        } else {
            const defaultAccount = userData.list.find(item => item.id === userData.default);
            result = {
                success: true,
                deletedAccount,
                defaultAccount,
                isEmpty: false
            };
        }

        await this.saveData();
        return result;
    }

    /**
     * 获取用户账号列表
     */
    getAccountList(userId: string): {
        hasAccounts: boolean;
        accounts?: Array<{
            id: string;
            name: string;
            isDefault: boolean;
        }>;
    } {
        const userData = this.userBindTapMap.get(userId);
        if (!userData || userData.list.length === 0) {
            return { hasAccounts: false };
        }

        const accounts = userData.list.map(item => ({
            id: item.id,
            name: item.name,
            isDefault: item.id === userData.default
        }));

        return { hasAccounts: true, accounts };
    }

    /**
     * 获取用户当前默认账号ID
     */
    getDefaultAccount(userId: string): {
        hasDefault: boolean;
        tapId?: string;
    } {
        const userData = this.userBindTapMap.get(userId);
        if (!userData || !userData.default) {
            return { hasDefault: false };
        }
        return { hasDefault: true, tapId: userData.default };
    }
}