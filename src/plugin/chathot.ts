import { Mutex } from "async-mutex";

export class ChatHotManager {
    private chatHot: Map<string, { count: number, usetime: number, usecount: number }> = new Map();
    private chatHotMutex = new Mutex();

    async getHotData(groupId: string): Promise<number> {
        return await this.chatHotMutex.runExclusive(async () => {
            const chatHotData = this.chatHot.get(groupId);
            const currentTime = Date.now();

            if (chatHotData) {
                if (currentTime - chatHotData.usetime > 30000) {
                    // 超出时间段一切重置关注度
                    chatHotData.count = 0;
                    chatHotData.usetime = currentTime;
                    chatHotData.usecount = 0;
                    this.chatHot.set(groupId, chatHotData);
                    return this.chatHot.get(groupId)?.count ?? 0;
                } else if (currentTime - chatHotData.usetime < 3000 && chatHotData.usecount > 2) {
                    // 时间内超出使用次数
                    chatHotData.usetime = currentTime;
                    chatHotData.usecount = 1;
                    this.chatHot.set(groupId, chatHotData);
                    return 0;
                }
                // 时间内未超过使用次数
                chatHotData.usecount += 1;
                this.chatHot.set(groupId, chatHotData);
                return this.chatHot.get(groupId)?.count ?? 0;
            }
            // 初始化
            this.chatHot.set(groupId, { count: 0, usetime: currentTime, usecount: 0 });
            return this.chatHot.get(groupId)?.count ?? 0;
        });
    }

    async incrementHot(groupId: string) {
        await this.chatHotMutex.runExclusive(() => {
            const chatHotData = this.chatHot.get(groupId);
            const currentTime = Date.now();
            if (chatHotData) {
                //引用增加
                chatHotData.count += 1;
                chatHotData.usecount += 1;
                this.chatHot.set(groupId, chatHotData);
            } else {
                //初始化
                this.chatHot.set(groupId, { count: 1, usetime: currentTime, usecount: 1 });
            }
        });
    }
}