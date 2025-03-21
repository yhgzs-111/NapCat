import { OB11EmitEventContent, OB11NetworkReloadType } from './index';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { WebsocketServerConfig } from '@/onebot/config/config';
import { NapCatOneBot11Adapter } from '@/onebot';
import { IOB11NetworkAdapter } from '@/onebot/network/adapter';
import { serve } from '@hono/node-server';
import { Context, Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { WSContext, WSMessageReceive } from 'hono/ws';
import { OB11Response } from '../action/OneBotAction';
import { ActionName } from '../action/router';
import { OB11HeartbeatEvent } from '@/onebot/event/meta/OB11HeartbeatEvent';
import { LifeCycleSubType, OB11LifeCycleEvent } from '@/onebot/event/meta/OB11LifeCycleEvent';

export class OB11WebsocketServerAdapter extends IOB11NetworkAdapter<WebsocketServerConfig> {
    private app: Hono | undefined;
    private server: ReturnType<typeof serve> | undefined;
    private clients: Set<WSContext<any>> = new Set();
    private eventClients: Set<WSContext<any>> = new Set(); // 仅用于接收事件的客户端
    private heartbeatIntervalId: NodeJS.Timeout | null = null;

    constructor(name: string, config: WebsocketServerConfig, core: NapCatCore, obContext: NapCatOneBot11Adapter, actions: ActionMap) {
        super(name, config, core, obContext, actions);
    }

    override onEvent<T extends OB11EmitEventContent>(event: T) {
        if (!this.isEnable || this.eventClients.size === 0) return;

        try {
            const eventData = JSON.stringify(event);
            this.eventClients.forEach(client => {
                try {
                    client.send(eventData);
                } catch (e) {
                    this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 向客户端发送事件失败: ${e}`);
                }
            });

            if (this.config.debug) {
                this.core.context.logger.logDebug(`[OneBot] [Websocket Server Adapter] 已广播事件到 ${this.eventClients.size} 个客户端`);
            }
        } catch (e) {
            this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 事件序列化失败: ${e}`);
        }
    }

    open() {
        try {
            if (this.isEnable) {
                this.core.context.logger.logError('[OneBot] [Websocket Server Adapter] 无法打开已经启动的Websocket服务器');
                return;
            }
            this.initializeServer();
            this.isEnable = true;

            // 启动心跳
            if (this.config.heartInterval > 0) {
                this.registerHeartBeat();
            }
        } catch (e) {
            this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 启动错误: ${e}`);
        }
    }

    async close() {
        this.isEnable = false;
        this.clients.clear();
        this.eventClients.clear();

        // 清除心跳定时器
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = null;
        }

        this.server?.close();
        this.app = undefined;
    }

    private registerHeartBeat() {
        this.heartbeatIntervalId = setInterval(() => {
            if (!this.isEnable || this.eventClients.size === 0) return;

            try {
                const heartbeatEvent = new OB11HeartbeatEvent(
                    this.core,
                    this.config.heartInterval,
                    this.core.selfInfo.online ?? true,
                    true
                );

                const eventData = JSON.stringify(heartbeatEvent);
                this.eventClients.forEach(client => {
                    try {
                        client.send(eventData);
                    } catch (e) {
                        this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 发送心跳失败: ${e}`);
                    }
                });
            } catch (e) {
                this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 心跳事件生成失败: ${e}`);
            }
        }, this.config.heartInterval);
    }

    private initializeServer() {
        this.app = new Hono();
        const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: this.app });

        // 处理所有WebSocket请求
        this.app.all('/*', upgradeWebSocket((c) => {
            // 鉴权处理
            if (this.config.token && this.config.token.length > 0) {
                const url = new URL(c.req.url, `http://${c.req.header('host') || 'localhost'}`);
                const queryToken = url.searchParams.get('access_token');
                const authHeader = c.req.header('authorization');
                const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
                const clientToken = queryToken || headerToken;

                if (clientToken !== this.config.token) {
                    return {
                        onOpen: (_evt, ws) => {
                            ws.send(JSON.stringify(OB11Response.res(null, 'failed', 1403, 'token验证失败')));
                            ws.close();
                        }
                    };
                }
            }

            // 判断连接类型
            const url = new URL(c.req.url, `http://${c.req.header('host') || 'localhost'}`);
            const path = url.pathname;
            const isApiConnect = path === '/api' || path === '/api/';

            return {
                onOpen: (_evt, ws) => {
                    this.clients.add(ws);

                    // 仅对非API连接添加到事件客户端列表
                    if (!isApiConnect) {
                        this.eventClients.add(ws);
                        // 发送连接生命周期事件
                        try {
                            ws.send(JSON.stringify(new OB11LifeCycleEvent(this.core, LifeCycleSubType.CONNECT)));
                        } catch (e) {
                            this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 发送生命周期事件失败: ${e}`);
                        }
                    }

                    this.core.context.logger.log(`[OneBot] [Websocket Server Adapter] 客户端已连接，类型: ${isApiConnect ? 'API' : '事件'}，当前连接数: ${this.clients.size}`);
                },
                onMessage: (evt, ws) => {
                    this.actionHandler(c, evt, ws);
                },
                onClose: (_evt, ws) => {
                    this.clients.delete(ws);
                    this.eventClients.delete(ws);
                    this.core.context.logger.log(`[OneBot] [Websocket Server Adapter] 客户端已断开，当前连接数: ${this.clients.size}`);
                },
                onError: (error) => {
                    this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] WebSocket错误: ${error}`);
                }
            };
        }));

        // 启动服务器
        this.server = serve({
            fetch: this.app.fetch.bind(this.app),
            port: this.config.port,
            hostname: this.config.host === '0.0.0.0' ? undefined : this.config.host,
        });

        injectWebSocket(this.server);
        this.core.context.logger.log(`[OneBot] [Websocket Server Adapter] 服务器已启动于 ${this.config.host}:${this.config.port}`);
    }

    async actionHandler<T>(_c: Context, evt: MessageEvent<WSMessageReceive>, ws: WSContext<T>) {
        const { data } = evt;
        if (typeof data !== 'string') {
            this.core.context.logger.logError('[OneBot] [Websocket Server Adapter] 收到非字符串消息');
            return;
        }
        let receiveData: { action: typeof ActionName[keyof typeof ActionName], params?: any, echo?: any } = { action: ActionName.Unknown, params: {} };
        let echo = undefined;
        try {
            receiveData = JSON.parse(data);
            echo = receiveData.echo;
        } catch {
            return ws.send(JSON.stringify(OB11Response.error('json解析失败,请检查数据格式', 1400, echo)));
        }
        receiveData.params = (receiveData?.params) ? receiveData.params : {}; // 兼容类型验证
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const action = this.actions.get(receiveData.action as any);
        if (!action) {
            this.logger.logError('[OneBot] [WebSocket Client] 发生错误', '不支持的API ' + receiveData.action);
            return ws.send(JSON.stringify(OB11Response.error('不支持的API ' + receiveData.action, 1404, echo)));
        }
        const retdata = await action.websocketHandle(receiveData.params, echo ?? '', this.name, this.config);
        ws.send(JSON.stringify({ ...retdata }));
    }

    async reload(newConfig: WebsocketServerConfig) {
        const wasEnabled = this.isEnable;
        const oldPort = this.config.port;
        const oldHost = this.config.host;
        const oldHeartInterval = this.config.heartInterval;
        this.config = newConfig;

        if (newConfig.enable && !wasEnabled) {
            this.open();
            return OB11NetworkReloadType.NetWorkOpen;
        } else if (!newConfig.enable && wasEnabled) {
            this.close();
            return OB11NetworkReloadType.NetWorkClose;
        }

        // 端口或主机变更需要重启服务器
        if (oldPort !== newConfig.port || oldHost !== newConfig.host) {
            this.close();
            if (newConfig.enable) {
                this.open();
            }
            return OB11NetworkReloadType.NetWorkReload;
        }

        // 心跳间隔变更需要重新设置心跳
        if (oldHeartInterval !== newConfig.heartInterval) {
            if (this.heartbeatIntervalId) {
                clearInterval(this.heartbeatIntervalId);
                this.heartbeatIntervalId = null;
            }
            if (newConfig.heartInterval > 0 && this.isEnable) {
                this.registerHeartBeat();
            }
            return OB11NetworkReloadType.NetWorkReload;
        }

        return OB11NetworkReloadType.Normal;
    }
}