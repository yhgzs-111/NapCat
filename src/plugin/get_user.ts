import { RequestUtil } from '@/common/request';
import { GameUserDetail } from './api';

/**
 * 获取用户游戏记录信息
 * @param tap_id TapTap用户ID
 * @returns 用户游戏记录信息
 */

export async function get_user(tap_id: string): Promise<GameUserDetail> {
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

