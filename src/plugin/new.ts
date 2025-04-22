import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { GameUserDetail } from './api';

// 字体注册工具
function getFontFamily() {
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
    return { fontFamily, fontFamilyBold };
}

// 背景绘制工具
async function drawBackground(ctx: any, width: number, height: number) {
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
    ctx.fillStyle = 'rgba(15, 15, 25, 0.65)';
    ctx.fillRect(0, 0, width, height);
}

// 标题美化工具
function drawTitle(ctx: any, text: string, width: number, y: number, fontFamilyBold: string) {
    // 小标题条
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#c5a8ff';
    ctx.fillRect(width / 2 - 220, y - 38, 440, 54);
    ctx.restore();
    // 标题
    ctx.font = `bold 44px ${fontFamilyBold}`;
    ctx.fillStyle = '#f0e8ff';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y);
    // 下划线
    ctx.save();
    ctx.strokeStyle = '#c5a8ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 80, y + 18);
    ctx.lineTo(width / 2 + 80, y + 18);
    ctx.stroke();
    ctx.restore();
}

// 信息行绘制
function drawInfoLine(ctx: any, text: string, x: number, y: number, font: string, color: string | CanvasGradient | CanvasPattern) {
    ctx.font = font;
    // 兼容 CanvasGradient/CanvasPattern 和 string
    if (typeof color === 'string' || color instanceof CanvasGradient || color instanceof CanvasPattern) {
        ctx.fillStyle = color;
    } else {
        ctx.fillStyle = '#c5a8ff';
    }
    ctx.textAlign = 'left';
    ctx.fillText(text, x, y);
}

// 卡片小块绘制
function drawMiniCard(ctx: any, x: number, y: number, w: number, h: number, radius: number, shadow = true, color?: string, shadowColor?: string) {
    ctx.save();
    if (shadow) {
        ctx.shadowColor = shadowColor ?? 'rgba(60, 40, 120, 0.13)';
        ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.closePath();
    ctx.fillStyle = color ?? 'rgba(45, 45, 65, 0.89)';
    ctx.fill();
    ctx.restore();
}

// 底部标识
function drawFooter(ctx: any, width: number, height: number, fontFamily: string) {
    ctx.font = `22px ${fontFamily}`;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('NapCat & Plugin', width / 2, height - 24);
}

/**
 * 生成REVERSE.1999 信息图片
 */
export async function generate1999InfoImage(userInfo: any): Promise<string> {
    const { fontFamily, fontFamilyBold } = getFontFamily();
    const width = 2560, height = 1440;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await drawBackground(ctx, width, height);

    // 标题
    drawTitle(ctx, '账号信息', width, 120, fontFamilyBold);

    // 信息内容
    const startX = width / 2 - 350, startY = 220, lineH = 62;
    const infoList = [
        `昵称: ${userInfo.data.list[0]?.basic_module?.name ?? '-'}`,
        `角色ID: ${userInfo.data.list[0]?.basic_module?.role_id ?? '-'}`,
        `角色数量: ${userInfo.data.list[0]?.basic_module?.custom_items[0]?.value ?? '-'}`,
        `登录天数: ${userInfo.data.list[0]?.basic_module?.custom_items[1]?.value ?? '-'}`,
        `雨滴数量: ${userInfo.data.list[0]?.basic_module?.custom_items[2]?.value ?? '-'}`,
        `你何时睁眼看这个世界: ${userInfo.data.list[1]?.episode_module?.custom_items[0]?.value ?? '-'}`,
        `你在哪一幕: ${userInfo.data.list[1]?.episode_module?.custom_items[1]?.value ?? '-'}`,
        `人工梦游: ${userInfo.data.list[1]?.episode_module?.custom_items[2]?.value ?? '-'}`,
    ];
    ctx.font = `bold 36px ${fontFamilyBold}`;
    ctx.fillStyle = '#c5a8ff';
    infoList.forEach((txt, i) => {
        drawInfoLine(ctx, txt, startX, startY + i * lineH, ctx.font, ctx.fillStyle);
    });

    drawFooter(ctx, width, height, fontFamily);
    const buffer = canvas.toBuffer('image/png');
    return `base64://${buffer.toString('base64')}`;
}

/**
 * 生成REVERSE.1999 心相图片
 */
export async function generate1999WeaponImage(userInfo: GameUserDetail): Promise<string> {
    const { fontFamily, fontFamilyBold } = getFontFamily();
    const width = 2560, height = 1440;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await drawBackground(ctx, width, height);

    drawTitle(ctx, '心相', width, 120, fontFamilyBold);

    ctx.font = `bold 34px ${fontFamilyBold}`;
    ctx.fillStyle = '#c5a8ff';
    drawInfoLine(ctx, `昵称: ${userInfo.data.list[0]?.basic_module?.name ?? '-'}`, width / 2 - 350, 180, ctx.font, ctx.fillStyle);
    drawInfoLine(ctx, `角色ID: ${userInfo.data.list[0]?.basic_module?.role_id ?? '-'}`, width / 2 - 350, 230, ctx.font, ctx.fillStyle);

    const weaponList = userInfo.data.list[3]?.weapon_module?.list ?? [];
    const cardW = 420, cardH = 110, gapX = 38, gapY = 32;
    const imgSize = 90;
    const textLeft = 36 + imgSize + 18; // 缩略图+间隔
    const cols = Math.min(5, Math.floor((width - 2 * gapX) / (cardW + gapX)));
    const areaW = cols * cardW + (cols - 1) * gapX;
    const startX = (width - areaW) / 2;
    let y = 280;
    ctx.font = `bold 32px ${fontFamilyBold}`;
    for (let idx = 0; idx < weaponList.length; idx++) {
        const item = weaponList[idx];
        const col = idx % cols, row = Math.floor(idx / cols);
        const x = startX + col * (cardW + gapX);
        const cy = y + row * (cardH + gapY);
        drawMiniCard(ctx, x, cy, cardW, cardH, 22);

        if (!item) continue; // 跳过空值
        // 绘制缩略图
        if (item.image?.small_url) {
            try {
                const img = await loadImage(item.image.small_url);
                const imgX = x + 18;
                const imgY = cy + (cardH - imgSize) / 2;
                ctx.save();
                ctx.beginPath();
                ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
                ctx.restore();
            } catch { }
        }

        ctx.fillStyle = '#f0e8ff';
        ctx.font = `bold 32px ${fontFamilyBold}`;
        ctx.fillText(item.name ?? '-', x + textLeft, cy + cardH / 2 - 12);
        ctx.font = `28px ${fontFamily}`;
        ctx.fillStyle = '#c5a8ff';
        ctx.fillText(`LV.${item.level ?? '-'}`, x + textLeft, cy + cardH / 2 + 32);
    }

    drawFooter(ctx, width, height, fontFamily);
    const buffer = canvas.toBuffer('image/png');
    return `base64://${buffer.toString('base64')}`;
}

/**
 * 生成REVERSE.1999 角色图片
 */
export async function generate1999CharacterImage(userInfo: GameUserDetail): Promise<string> {
    const { fontFamily, fontFamilyBold } = getFontFamily();
    const width = 2560, height = 1440;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await drawBackground(ctx, width, height);

    drawTitle(ctx, '角色', width, 120, fontFamilyBold);

    ctx.font = `bold 34px ${fontFamilyBold}`;
    ctx.fillStyle = '#c5a8ff';
    drawInfoLine(ctx, `昵称: ${userInfo.data.list[0]?.basic_module?.name ?? '-'}`, width / 2 - 350, 180, ctx.font, ctx.fillStyle);
    drawInfoLine(ctx, `角色ID: ${userInfo.data.list[0]?.basic_module?.role_id ?? '-'}`, width / 2 - 350, 230, ctx.font, ctx.fillStyle);

    const charList = userInfo.data.list[2]?.character_module?.list ?? [];
    const cardW = 420, cardH = 110, gapX = 38, gapY = 32;
    const imgSize = 90;
    const textLeft = 36 + imgSize + 18;
    const cols = Math.min(5, Math.floor((width - 2 * gapX) / (cardW + gapX)));
    const areaW = cols * cardW + (cols - 1) * gapX;
    const startX = (width - areaW) / 2;
    let y = 280;
    ctx.font = `bold 32px ${fontFamilyBold}`;
    for (let idx = 0; idx < charList.length; idx++) {
        const item = charList[idx];
        const col = idx % cols, row = Math.floor(idx / cols);
        const x = startX + col * (cardW + gapX);
        const cy = y + row * (cardH + gapY);
        drawMiniCard(ctx, x, cy, cardW, cardH, 22);

        // 绘制缩略图
        if (!item) continue; // 跳过空值
        if (item.image?.small_url) {
            try {
                const img = await loadImage(item.image.small_url);
                const imgX = x + 18;
                const imgY = cy + (cardH - imgSize) / 2;
                ctx.save();
                ctx.beginPath();
                ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
                ctx.restore();
            } catch { }
        }

        ctx.fillStyle = '#f0e8ff';
        ctx.font = `bold 32px ${fontFamilyBold}`;
        ctx.fillText(item.name ?? '-', x + textLeft, cy + cardH / 2 - 12);
        ctx.font = `28px ${fontFamily}`;
        ctx.fillStyle = '#c5a8ff';
        ctx.fillText(`LV.${item.level ?? '-'}`, x + textLeft, cy + cardH / 2 + 32);
    }

    drawFooter(ctx, width, height, fontFamily);
    const buffer = canvas.toBuffer('image/png');
    return `base64://${buffer.toString('base64')}`;
}

/**
 * 生成REVERSE.1999 绑定/切换结果图片
 */
async function generateSimpleResultImage(title: string, tapId: string, characterName: string): Promise<string> {
    const { fontFamily, fontFamilyBold } = getFontFamily();
    const width = 900, height = 340;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await drawBackground(ctx, width, height);

    // 标题
    drawTitle(ctx, title, width, 80, fontFamilyBold);

    // 内容卡片
    const cardW = 700, cardH = 120, cardX = (width - cardW) / 2, cardY = 120;
    drawMiniCard(
        ctx,
        cardX,
        cardY,
        cardW,
        cardH,
        20,
        true,
        'rgba(197,168,255,0.18)',
        'rgba(197,168,255,0.13)'
    );

    // TapTap ID
    ctx.font = `bold 28px ${fontFamilyBold}`;
    ctx.fillStyle = '#c5a8ff';
    ctx.textAlign = 'left';
    ctx.fillText(`TapTap ID:`, cardX + 36, cardY + 48);
    ctx.font = `bold 28px ${fontFamilyBold}`;
    ctx.fillStyle = '#fffbe6';
    ctx.fillText(tapId, cardX + 180, cardY + 48);

    // 角色名称
    ctx.font = `bold 28px ${fontFamilyBold}`;
    ctx.fillStyle = '#c5a8ff';
    ctx.fillText(`角色名称:`, cardX + 36, cardY + 88);
    ctx.font = `bold 28px ${fontFamilyBold}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText(characterName, cardX + 180, cardY + 88);

    drawFooter(ctx, width, height, fontFamily);
    const buffer = canvas.toBuffer('image/png');
    return `base64://${buffer.toString('base64')}`;
}

export async function generate1999BindImage(tapId: string, characterName: string): Promise<string> {
    return generateSimpleResultImage('绑定成功', tapId, characterName);
}

export async function generate1999SwitchImage(tapId: string, characterName: string): Promise<string> {
    return generateSimpleResultImage('切换成功', tapId, characterName);
}

/**
 * 生成REVERSE.1999 账号列表图片
 */
export async function generate1999AccountListImage(accountList: { id: string, name: string, isDefault?: boolean }[]): Promise<string> {
    const { fontFamily, fontFamilyBold } = getFontFamily();
    const width = 900;
    const cardW = 700, cardH = 56, gapY = 18;
    const listH = accountList.length * cardH + (accountList.length - 1) * gapY;
    const height = Math.max(340, 120 + listH + 60);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await drawBackground(ctx, width, height);

    // 标题
    drawTitle(ctx, '已绑定账号列表', width, 80, fontFamilyBold);

    // 列表区域起始Y，垂直居中
    const startY = Math.max(140, (height - listH) / 2);

    for (let i = 0; i < accountList.length; i++) {
        const item = accountList[i];
        if (!item) continue; // 跳过空值
        const x = (width - cardW) / 2;
        const y = startY + i * (cardH + gapY);

        // 卡片颜色
        const cardColor = item.isDefault ? 'rgba(255, 224, 102, 0.22)' : 'rgba(197, 168, 255, 0.18)';
        const shadowColor = item.isDefault ? 'rgba(255, 224, 102, 0.18)' : 'rgba(197, 168, 255, 0.13)';
        drawMiniCard(ctx, x, y, cardW, cardH, 16, true, cardColor, shadowColor);

        // 账号ID（小号，灰色）
        ctx.font = `22px ${fontFamily}`;
        ctx.fillStyle = '#b0b0c8';
        ctx.textAlign = 'left';
        ctx.fillText(`ID: ${item.id}`, x + 28, y + 26);

        // 账号名（大号，主色）
        ctx.font = `bold 26px ${fontFamilyBold}`;
        ctx.fillStyle = item.isDefault ? '#ffe066' : '#c5a8ff';
        ctx.fillText(item.name, x + 28, y + 48);

        // 当前使用标识
        if (item.isDefault) {
            ctx.font = `bold 18px ${fontFamilyBold}`;
            ctx.fillStyle = '#fffbe6';
            ctx.fillText('（当前使用）', x + 28 + ctx.measureText(item.name).width + 12, y + 48);
        }
    }

    drawFooter(ctx, width, height, fontFamily);
    const buffer = canvas.toBuffer('image/png');
    return `base64://${buffer.toString('base64')}`;
}