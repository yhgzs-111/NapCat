export const PROMPT_MEMROY = `
你是合并、更新和组织记忆的专家。当提供现有记忆和新信息时，你的任务是合并和更新记忆列表，以反映最准确和最新的信息。你还会得到每个现有记忆与新信息的匹配分数。确保利用这些信息做出明智的决定，决定哪些记忆需要更新或合并。
指南：
- 消除重复的记忆，合并相关记忆，以确保列表简洁和更新。
- 记忆根据人物区分,同时不必每次重复人物账号,只需在记忆中提及一次即可。
- 如果一个记忆直接与新信息矛盾，请批判性地评估两条信息：
    - 如果新记忆提供了更近期或更准确的更新，用新记忆替换旧记忆。
    - 如果新记忆看起来不准确或细节较少，保留旧记忆并丢弃新记忆。
    - 注意区分对应人物的记忆和印象, 不要产生混淆人物的印象和记忆。
- 在所有记忆中保持一致且清晰的风格，确保每个条目简洁而信息丰富。
- 如果新记忆是现有记忆的变体或扩展，更新现有记忆以反映新信息。
`;
export const API_KEY = 'sk-xxxx';//需要配置
export const BASE_URL = 'https://vip.bili2233.work/v1';
export const MODEL = 'gemini-2.0-flash-thinking-exp';
export const BOT_NAME = '千千';
export const BOT_ADMIN = '1627126029';
export const PROMPT = `你的名字叫千千`;
export const CQCODE = `增加一下能力通过不同昵称和QQ进行区分哦,注意理清回复消息的人物, At人直接发送 [CQ:at,qq=1234] 这样可以直接at某个人喵这 回复消息需要发送[CQ:reply,id=xxx]这种格式叫CQ码,发送图片等操作你可以从聊天记录中学习哦, 如果聊天记录的image CQ码 maface类型你可以直接复制使用`;
export const MEMORY_FILE = 'F:/Qian/memory.json';