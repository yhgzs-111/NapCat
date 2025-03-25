import { createCanvas, loadImage } from "@napi-rs/canvas";

export async function drawJsonContent(jsonContent: string) {
    const lines = jsonContent.split('\n');

    const padding = 40;
    const lineHeight = 30;
    const canvas = createCanvas(1, 1);
    const ctx = canvas.getContext('2d');

    let maxLineWidth = 0;
    for (const line of lines) {
        let lineWidth = 0;
        for (const char of line) {
            const isChinese = /[\u4e00-\u9fa5]/.test(char);
            ctx.font = isChinese ? '20px "Aa偷吃可爱长大的"' : '20px "JetBrains Mono"';
            lineWidth += ctx.measureText(char).width;
        }
        if (lineWidth > maxLineWidth) {
            maxLineWidth = lineWidth;
        }
    }

    const width = maxLineWidth + padding * 2;
    const height = lines.length * lineHeight + padding * 2;

    const finalCanvas = createCanvas(width, height);
    const finalCtx = finalCanvas.getContext('2d');

    const backgroundImage = await loadImage('C:\\fonts\\post.jpg');
    const pattern = finalCtx.createPattern(backgroundImage, 'repeat');
    finalCtx.fillStyle = pattern;
    finalCtx.fillRect(0, 0, width, height);

    finalCtx.filter = 'blur(5px)';
    finalCtx.drawImage(finalCanvas, 0, 0);

    finalCtx.filter = 'none';
    const cardWidth = width - padding;
    const cardHeight = height - padding;
    const cardX = padding / 2;
    const cardY = padding / 2;
    const radius = 20;

    finalCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    finalCtx.beginPath();
    finalCtx.moveTo(cardX + radius, cardY);
    finalCtx.lineTo(cardX + cardWidth - radius, cardY);
    finalCtx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radius);
    finalCtx.lineTo(cardX + cardWidth, cardY + cardHeight - radius);
    finalCtx.quadraticCurveTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - radius, cardY + cardHeight);
    finalCtx.lineTo(cardX + radius, cardY + cardHeight);
    finalCtx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - radius);
    finalCtx.lineTo(cardX, cardY + radius);
    finalCtx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    finalCtx.closePath();
    finalCtx.fill();

    // 绘制 JSON 内容
    finalCtx.fillStyle = 'black';
    let textY = cardY + 40;

    for (const line of lines) {
        let x = cardX + 20;
        for (const char of line) {
            const isChinese = /[\u4e00-\u9fa5]/.test(char);
            finalCtx.font = isChinese ? '20px "Aa偷吃可爱长大的"' : '20px "JetBrains Mono"';
            finalCtx.fillText(char, x, textY);
            x += finalCtx.measureText(char).width;
        }
        textY += 30;
    }

    // 保存图像
    const buffer = finalCanvas.toBuffer('image/png');
    return "base64://" + buffer.toString('base64');
}