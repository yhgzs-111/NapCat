import { OB11Message, OB11MessageData } from '@/onebot';
import { ActionMap } from '@/onebot/action';

/**
 * 发送消息工具函数
 */
export   async function sendMessage<T extends OB11MessageData[] | string>(
    message: OB11Message,
    action: ActionMap,
    content: T
) {
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
