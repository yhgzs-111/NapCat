import { OB11EmitEventContent, OB11NetworkReloadType } from './index';
import { NapCatCore } from '@/core';
import { ActionMap } from '@/onebot/action';
import { WebsocketServerConfig } from '@/onebot/config/config';
import { NapCatOneBot11Adapter } from '@/onebot';
import { IOB11NetworkAdapter } from '@/onebot/network/adapter';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { WSContext, WSMessageReceive } from 'hono/ws';
export class OB11WebsocketServerAdapter extends IOB11NetworkAdapter<WebsocketServerConfig> {
    private app: Hono | undefined;
    private server: ReturnType<typeof serve> | undefined;

    constructor(name: string, config: WebsocketServerConfig, core: NapCatCore, obContext: NapCatOneBot11Adapter, actions: ActionMap) {
        super(name, config, core, obContext, actions);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override onEvent<T extends OB11EmitEventContent>(_event: T) {
        // Websocket server is passive, no need to emit event
    }

    open() {
        try {
            if (this.isEnable) {
                this.core.context.logger.logError('[OneBot] [Websocket Server Adapter] 无法打开已经启动的Websocket服务器');
                return;
            }
            this.initializeServer();
            this.isEnable = true;
        } catch (e) {
            this.core.context.logger.logError(`[OneBot] [Websocket Server Adapter] 启动错误: ${e}`);
        }
    }

    async close() {
        this.isEnable = false;
        this.server?.close();
        this.app = undefined;
    }

    private initializeServer() {
        this.app = new Hono();
        const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: this.app })
        this.app.all('/*', upgradeWebSocket(c => {
            return {
                onMessage: (evt, ws) => {
                    this.actionHandler(evt, ws)
                },
            }
        }));

        // 启动服务器
        this.server = serve({
            fetch: this.app.fetch.bind(this.app),
            port: this.config.port,
        });
        injectWebSocket(this.server);
        this.core.context.logger.log(`[OneBot] [Websocket Server Adapter] 服务器已启动于端口 ${this.config.port}`);
    }


    /**
     * API动作处理器
     */
    async actionHandler<T>(evt: MessageEvent<WSMessageReceive>, ws: WSContext<T>) {
        const { data } = evt;
        if (typeof data !== 'string') {
            this.core.context.logger.logError('[OneBot] [Websocket Server Adapter] 收到非字符串消息');
            return;
        }
        const { action, params } = JSON.parse(data);
    }

    async reload(newConfig: WebsocketServerConfig) {
        const wasEnabled = this.isEnable;
        const oldPort = this.config.port;
        this.config = newConfig;

        if (newConfig.enable && !wasEnabled) {
            this.open();
            return OB11NetworkReloadType.NetWorkOpen;
        } else if (!newConfig.enable && wasEnabled) {
            this.close();
            return OB11NetworkReloadType.NetWorkClose;
        }

        if (oldPort !== newConfig.port) {
            this.close();
            if (newConfig.enable) {
                this.open();
            }
            return OB11NetworkReloadType.NetWorkReload;
        }

        return OB11NetworkReloadType.Normal;
    }
}