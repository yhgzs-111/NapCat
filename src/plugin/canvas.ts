import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

interface MenuCommand {
    command: string;
    description: string;
    highlight?: boolean;
}

/**
 * 生成REVERSE.1999帮助菜单图片 (自适应美化版)
 * @returns 生成的图片的base64编码
 */
export async function generate1999HelpMenu(): Promise<string> {
    try {
        // 字体注册
        const fontsToTry = [
            { path: 'C:\\Windows\\Fonts\\msyh.ttc', name: 'Microsoft YaHei' },
            { path: 'C:\\Windows\\Fonts\\msyhbd.ttc', name: 'Microsoft YaHei Bold' },
            { path: 'C:\\Windows\\Fonts\\simhei.ttf', name: 'SimHei' }
        ];
        let fontFamily = 'sans-serif';
        let fontFamilyBold = 'sans-serif';
        for (const font of fontsToTry) {
            try {
                if (!GlobalFonts.has(font.name)) {
                    GlobalFonts.registerFromPath(font.path, font.name);
                }
                if (font.name.includes('Bold')) {
                    fontFamilyBold = font.name;
                } else if (fontFamily === 'sans-serif') {
                    fontFamily = font.name;
                }
            } catch { }
        }
        if (fontFamilyBold === 'sans-serif') fontFamilyBold = fontFamily;

        // 画布设置
        const width = 2560;
        const height = 1440;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 背景处理
        const backgroundPath = "E:\\NewDevelop\\NapCatQQ\\src\\canvas\\image\\normal\\01.jpg";
        try {
            const backgroundImage = await loadImage(backgroundPath);
            const scale = Math.max(width / backgroundImage.width, height / backgroundImage.height);
            const scaledWidth = backgroundImage.width * scale;
            const scaledHeight = backgroundImage.height * scale;
            const x = (width - scaledWidth) / 2;
            const y = (height - scaledHeight) / 2;
            ctx.drawImage(backgroundImage, x, y, scaledWidth, scaledHeight);
            ctx.save();
            ctx.filter = 'blur(20px) brightness(0.75)';
            ctx.drawImage(backgroundImage, x, y, scaledWidth, scaledHeight);
            ctx.restore();
        } catch {
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#2a2a40');
            gradient.addColorStop(1, '#4a3a60');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }
        // 半透明叠加层
        ctx.fillStyle = 'rgba(15, 15, 25, 0.65)';
        ctx.fillRect(0, 0, width, height);

        // 命令列表
        const commands: MenuCommand[] = [
            { command: '#1999 绑定 <TapTap ID>', description: '将您的 TapTap ID 与机器人绑定', highlight: true },
            { command: '#1999 切换 <TapTap ID>', description: '切换当前操作的 TapTap ID' },
            { command: '#1999 删除 <TapTap ID>', description: '解除指定的 TapTap ID 绑定' },
            { command: '#1999 账号', description: '查看所有已绑定的 TapTap 账号', highlight: true },
            { command: '#1999 信息', description: '查询当前选中账号的游戏信息', highlight: true },
            { command: '#1999 心相', description: '浏览当前账号拥有的心相详情' },
            { command: '#1999 角色', description: '浏览当前账号拥有的角色详情' },
            { command: '#1999 帮助', description: '显示此帮助菜单' }
        ];

        // 动态计算卡片宽度
        ctx.font = `bold 40px ${fontFamilyBold}`;
        let maxCommandWidth = 0;
        let maxDescWidth = 0;
        for (const cmd of commands) {
            maxCommandWidth = Math.max(maxCommandWidth, ctx.measureText(cmd.command).width);
            ctx.font = `32px ${fontFamily}`;
            maxDescWidth = Math.max(maxDescWidth, ctx.measureText(cmd.description).width);
            ctx.font = `bold 40px ${fontFamilyBold}`;
        }
        const baseCardWidth = Math.max(maxCommandWidth, maxDescWidth) + 120;
        const minCardWidth = 420;
        const maxCardWidth = Math.min(baseCardWidth, width * 0.38);
        const cardWidth = Math.max(minCardWidth, Math.min(maxCardWidth, baseCardWidth));

        // 卡片参数
        const cardHeight = Math.floor(height * 0.07) + 44;
        const cardBorderRadius = 24;
        const cardShadow = 'rgba(60, 40, 120, 0.18)';
        const textPaddingLeft = 38;
        // 自适应间距，最大不超过指定值
        const maxColGap = 44;
        const maxRowGap = 32;
        const minColGap = 24;
        const minRowGap = 18;

        // 动态计算列数，保证整体不空旷且不挤
        let cols = Math.min(commands.length, Math.floor((width - 160) / (cardWidth + minColGap)));
        cols = Math.max(1, cols);
        let colGap = Math.floor((width - cols * cardWidth) / (cols + 1));
        colGap = Math.max(minColGap, Math.min(colGap, maxColGap));
        const rows = Math.ceil(commands.length / cols);
        let rowGap = Math.floor((height - rows * cardHeight - 120) / (rows + 1));
        rowGap = Math.max(minRowGap, Math.min(rowGap, maxRowGap));

        // 计算整体卡片区尺寸，实现居中
        const cardsAreaWidth = cols * cardWidth + (cols - 1) * colGap;
        const cardsAreaHeight = rows * cardHeight + (rows - 1) * rowGap;
        const cardsStartX = Math.floor((width - cardsAreaWidth) / 2);
        const cardsStartY = Math.floor((height - cardsAreaHeight) / 2);

        // 绘制命令卡片
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            if (!cmd) continue;
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = cardsStartX + col * (cardWidth + colGap);
            const y = cardsStartY + row * (cardHeight + rowGap);

            // 卡片阴影
            ctx.save();
            ctx.shadowColor = cardShadow;
            ctx.shadowBlur = 16;
            ctx.shadowOffsetY = 6;

            // 卡片背景
            ctx.beginPath();
            ctx.roundRect(x, y, cardWidth, cardHeight, cardBorderRadius);
            ctx.closePath();
            if (cmd.highlight) {
                const cardGradient = ctx.createLinearGradient(x, y, x + cardWidth, y);
                cardGradient.addColorStop(0, 'rgba(110, 80, 250, 0.60)');
                cardGradient.addColorStop(1, 'rgba(150, 110, 255, 0.72)');
                ctx.fillStyle = cardGradient;
            } else {
                ctx.fillStyle = 'rgba(45, 45, 65, 0.89)';
            }
            ctx.fill();
            ctx.restore();

            // 左侧高亮条
            if (cmd.highlight) {
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, cardWidth, cardHeight, cardBorderRadius);
                ctx.clip();
                ctx.fillStyle = '#c5a8ff';
                ctx.fillRect(x, y, 12, cardHeight);
                ctx.restore();
            }

            // 文本
            const commandTextX = x + textPaddingLeft;
            const commandTextY = y + cardHeight * 0.38;
            const descriptionTextY = y + cardHeight * 0.74;

            ctx.fillStyle = cmd.highlight ? '#f0e8ff' : '#c0d4ff';
            ctx.font = `bold 40px ${fontFamilyBold}`;
            ctx.fillText(cmd.command, commandTextX, commandTextY);

            ctx.fillStyle = cmd.highlight ? 'rgba(255,255,255,1)' : 'rgba(225,230,245,0.92)';
            ctx.font = `32px ${fontFamily}`;
            ctx.fillText(cmd.description, commandTextX, descriptionTextY);
        }

        // 底部 NapCat & Plugin
        const bottomTextY = height - 36;
        ctx.font = `23px ${fontFamily}`;
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('NapCat & Plugin', width / 2, bottomTextY);

        // 转换为base64
        const buffer = canvas.toBuffer('image/png');
        const base64Image = `base64://${buffer.toString('base64')}`;
        return base64Image;
    } catch (error) {
        console.error('生成菜单时发生错误:', error);
        throw error;
    }
}