import { Mutex } from "async-mutex";

export class ChatHotManager {
    // 存储群组的热度信息，键为群组ID，值为使用时间和使用计数
    private chatHot: Map<string, { usetime: number, usecount: number }> = new Map();
    // 互斥锁，确保热度信息的读写操作是安全的
    private chatHotMutex = new Mutex();

    /**
     * 获取群组是否需要回复
     * @param groupId 群组ID
     * @returns 是否需要回复
     */
    async getHot(groupId: string): Promise<boolean> {
        return await this.chatHotMutex.runExclusive(async () => {
            const chatHotData = this.chatHot.get(groupId);
            const currentTime = Date.now();
            if (chatHotData) {
                console.log("原始热度", chatHotData?.usecount, currentTime - chatHotData.usetime > 30000);
                if (currentTime - chatHotData.usetime > 30000) {
                    chatHotData.usetime = currentTime;
                    chatHotData.usecount = 0;
                    this.chatHot.set(groupId, chatHotData);
                    // 超出时间段重置计数
                    return false;
                } else if (currentTime - chatHotData.usetime < 30000 && chatHotData.usecount > 0 && chatHotData.usecount < 2) {
                    // 在短时间内没请求，回复
                    return true;
                }
                // 在时间段内有请求，回复
                return false;
            }
            // 初始化，不回复
            this.chatHot.set(groupId, { usetime: currentTime, usecount: 0 });
            return false;
        });
    }

    /**
     * 增加群组的热度计数
     * @param groupId 群组ID
     */
    async incrementHot(groupId: string) {
        await this.chatHotMutex.runExclusive(() => {
            const chatHotData = this.chatHot.get(groupId);
            const currentTime = Date.now();
            if (chatHotData) {
                // 引用增加
                chatHotData.usecount += 1;
                this.chatHot.set(groupId, chatHotData);
            } else {
                // 初始化
                this.chatHot.set(groupId, { usetime: currentTime, usecount: 1 });
            }
        });
    }
}