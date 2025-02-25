import { Mutex } from "async-mutex";
import { ChatCompletionContentPart } from "openai/resources";

export class MemoryManager {
    private longTermMemory: Map<string, string> = new Map();
    private shortTermMemory: Map<string, Array<ChatCompletionContentPart>[]> = new Map();
    private memoryCount: Map<string, number> = new Map();
    private memMutex = new Mutex();
    private SHORT_TERM_MEMORY_LIMIT = 100;
    private mergeAndUpdateMemory: (currentMemory: Array<ChatCompletionContentPart>[], newMessages: Array<ChatCompletionContentPart>[]) => Promise<string>;

    constructor(mergeAndUpdateMemory: (currentMemory: Array<ChatCompletionContentPart>[], newMessages: Array<ChatCompletionContentPart>[]) => Promise<string>) {
        this.mergeAndUpdateMemory = mergeAndUpdateMemory;
    }

    async updateMemory(
        groupId: string,
        newMessages: Array<ChatCompletionContentPart>[],
        selfuin: string
    ) {
        const currentMemory = this.shortTermMemory.get(groupId) || [];
        const memCount = await this.incrementMemoryCount(groupId);
        console.log('memCount', memCount);
        currentMemory.push(...newMessages);

        if (memCount > this.SHORT_TERM_MEMORY_LIMIT) {
            await this.handleMemoryOverflow(groupId, currentMemory, newMessages, selfuin);
        }

        this.shortTermMemory.set(groupId, currentMemory);
    }

    async incrementMemoryCount(groupId: string): Promise<number> {
        return this.memMutex.runExclusive(() => {
            const memCount = (this.memoryCount.get(groupId) || 0) + 1;
            this.memoryCount.set(groupId, memCount);
            return memCount;
        });
    }

    async handleMemoryOverflow(
        groupId: string,
        currentMemory: Array<ChatCompletionContentPart>[],
        newMessages: Array<ChatCompletionContentPart>[],
        selfuin: string
    ) {
        await this.memMutex.runExclusive(async () => {
            const containsBotName = currentMemory.some(messages =>
                messages.some(msg => msg.type === 'text' && msg.text.includes(selfuin))
            );

            if (containsBotName) {
                const mergedMemory = await this.mergeAndUpdateMemory(currentMemory, newMessages);
                this.longTermMemory.set(groupId, mergedMemory);
            }

            this.shortTermMemory.set(groupId, currentMemory.slice(-this.SHORT_TERM_MEMORY_LIMIT));
            this.memoryCount.set(groupId, 0);
        });
    }

    async clearMemory(groupId: string, type: 'short' | 'long') {
        if (type === 'short') {
            this.shortTermMemory.set(groupId, []);
        } else {
            this.longTermMemory.set(groupId, '');
        }
    }

    getLongTermMemory(groupId: string): string {
        return this.longTermMemory.get(groupId) || '';
    }

    getShortTermMemory(groupId: string): Array<ChatCompletionContentPart>[] {
        return this.shortTermMemory.get(groupId) || [];
    }
}