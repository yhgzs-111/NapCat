import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "path";
import { current_path } from "./data";

/**
 * 绘制时间模式匹配的可视化图表
 * @param data 需要绘制的数据和配置
 * @returns Base64编码的图片
 */
export async function drawTimePattern(data: {
    targetUser: string,
    matchedUsers: Array<{
        username: string,
        similarity: number,
        pattern: Map<string, number>
    }>,
    targetPattern: Map<string, number>,
    timeRange: string
}) {
    // 计算需要的画布高度，根据匹配用户数量可能需要更多空间
    const legendRowHeight = 30; // 每行图例的高度，增加一点空间
    const legendRows = Math.ceil(data.matchedUsers.length / 2) + 1; // 目标用户一行，其他匹配用户每两个一行

    // 画布基础配置
    const padding = 50;
    const titleHeight = 80;
    const hourChartHeight = 250;
    const weekdayChartHeight = 180;
    const legendTitleHeight = 40;

    // 计算图例总高度，确保足够空间
    const legendHeight = legendRows * legendRowHeight + legendTitleHeight;

    // 计算所需的总高度
    const requiredHeight = titleHeight + hourChartHeight + 60 + weekdayChartHeight + 40 + legendHeight + padding;

    // 设置画布尺寸，确保足够显示所有内容
    const width = 1000;
    const height = requiredHeight + padding; // 确保底部有足够的padding

    // 创建画布
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 加载背景图
    const backgroundImage = await loadImage(path.join(current_path,'.\\fonts\\post.jpg'));
    const pattern = ctx.createPattern(backgroundImage, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);

    // 应用模糊效果
    ctx.filter = 'blur(5px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';

    // 绘制半透明白色背景卡片
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const radius = 20;
    const cardWidth = width - padding * 2;
    const cardHeight = height - padding * 2;
    const cardX = padding;
    const cardY = padding;

    // 绘制圆角矩形
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardWidth - radius, cardY);
    ctx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radius);
    ctx.lineTo(cardX + cardWidth, cardY + cardHeight - radius);
    ctx.quadraticCurveTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - radius, cardY + cardHeight);
    ctx.lineTo(cardX + radius, cardY + cardHeight);
    ctx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - radius);
    ctx.lineTo(cardX, cardY + radius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    ctx.closePath();
    ctx.fill();

    // 设置标题
    ctx.fillStyle = '#333';
    ctx.font = 'bold 24px "Aa偷吃可爱长大的"';
    ctx.textAlign = 'center';
    ctx.fillText(`${data.targetUser} ${data.timeRange}聊天时间匹配分析`, width / 2, cardY + 35);

    // 绘制小时分布图表
    const hourChartTop = cardY + titleHeight;
    const hourChartBottom = hourChartTop + hourChartHeight;
    const hourChartLeft = cardX + 40;
    const hourChartRight = cardX + cardWidth - 40;
    const hourChartWidth = hourChartRight - hourChartLeft;

    // 绘制小时图表标题
    ctx.font = 'bold 18px "Aa偷吃可爱长大的"';
    ctx.fillText('每日小时活跃度分布', width / 2, hourChartTop - 10);

    // 绘制小时图表横坐标
    ctx.fillStyle = '#666';
    ctx.font = '14px "JetBrains Mono"';
    ctx.textAlign = 'center';
    for (let hour = 0; hour < 24; hour += 2) {
        const x = hourChartLeft + (hour / 24) * hourChartWidth;
        ctx.fillText(`${hour}`, x, hourChartBottom + 20);
    }
    ctx.textAlign = 'left';
    ctx.font = '14px "Aa偷吃可爱长大的"';
    ctx.fillText('时间(小时)', hourChartLeft, hourChartBottom + 40);
    ctx.font = '14px "JetBrains Mono"';

    // 绘制小时图表网格线
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    for (let hour = 0; hour < 24; hour += 2) {
        const x = hourChartLeft + (hour / 24) * hourChartWidth;
        ctx.beginPath();
        ctx.moveTo(x, hourChartTop);
        ctx.lineTo(x, hourChartBottom);
        ctx.stroke();
    }

    // 确定最大活跃度值，用于缩放
    let maxHourValue = 0;
    for (let hour = 0; hour < 24; hour++) {
        const targetValue = data.targetPattern.get(`hour_${hour}`) || 0;
        if (targetValue > maxHourValue) maxHourValue = targetValue;

        for (const match of data.matchedUsers) {
            const matchValue = match.pattern.get(`hour_${hour}`) || 0;
            if (matchValue > maxHourValue) maxHourValue = matchValue;
        }
    }
    // 为了美观，确保最大值不会让图表太扁
    maxHourValue = Math.max(maxHourValue, 0.15);

    // 绘制目标用户小时分布曲线
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let hour = 0; hour < 24; hour++) {
        const x = hourChartLeft + (hour / 24) * hourChartWidth;
        const value = data.targetPattern.get(`hour_${hour}`) || 0;
        const y = hourChartBottom - (value / maxHourValue) * (hourChartHeight - 30);
        if (hour === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    // 绘制匹配用户小时分布曲线
    const colors = ['#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c'];
    data.matchedUsers.forEach((match, index) => {
        const colorIndex = index % colors.length;
        ctx.strokeStyle = colors[colorIndex]!;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let hour = 0; hour < 24; hour++) {
            const x = hourChartLeft + (hour / 24) * hourChartWidth;
            const value = match.pattern.get(`hour_${hour}`) || 0;
            const y = hourChartBottom - (value / maxHourValue) * (hourChartHeight - 30);
            if (hour === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    });

    // 绘制星期分布图表
    const weekChartTop = hourChartBottom + 60;
    const weekChartBottom = weekChartTop + weekdayChartHeight;
    const weekChartLeft = hourChartLeft;
    const weekChartRight = hourChartRight;
    const weekChartWidth = weekChartRight - weekChartLeft;

    // 绘制星期图表标题
    ctx.fillStyle = '#333';
    ctx.font = 'bold 18px "Aa偷吃可爱长大的"';
    ctx.textAlign = 'center';
    ctx.fillText('星期活跃度分布', width / 2, weekChartTop - 10);

    // 绘制星期图表横坐标
    ctx.fillStyle = '#666';
    ctx.font = '14px "Aa偷吃可爱长大的"';
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    for (let day = 0; day < 7; day++) {
        const x = weekChartLeft + (day / 7) * weekChartWidth + (weekChartWidth / 14);
        ctx.fillText(weekdays[day]!, x, weekChartBottom + 20);
    }

    // 绘制星期图表网格线
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    for (let day = 0; day <= 7; day++) {
        const x = weekChartLeft + (day / 7) * weekChartWidth;
        ctx.beginPath();
        ctx.moveTo(x, weekChartTop);
        ctx.lineTo(x, weekChartBottom);
        ctx.stroke();
    }

    // 确定最大活跃度值，用于缩放
    let maxDayValue = 0;
    for (let day = 0; day < 7; day++) {
        const targetValue = data.targetPattern.get(`day_${day}`) || 0;
        if (targetValue > maxDayValue) maxDayValue = targetValue;

        for (const match of data.matchedUsers) {
            const matchValue = match.pattern.get(`day_${day}`) || 0;
            if (matchValue > maxDayValue) maxDayValue = matchValue;
        }
    }
    // 为了美观，确保最大值不会让图表太扁
    maxDayValue = Math.max(maxDayValue, 0.3);

    // 改进柱状图绘制逻辑，避免重叠
    const totalUsers = data.matchedUsers.length + 1; // 包括目标用户
    const dayWidth = weekChartWidth / 7; // 每天的总宽度

    // 计算单个柱状图宽度，确保有足够间距
    const barWidth = dayWidth * 0.7 / totalUsers; // 每个柱子的宽度
    const groupPadding = dayWidth * 0.15; // 不同天之间的组间距
    const barPadding = dayWidth * 0.15 / (totalUsers + 1); // 同一天内柱子之间的间距

    // 绘制所有用户的星期分布（包括目标用户和匹配用户）
    const allUsers = [
        { username: data.targetUser, pattern: data.targetPattern, color: '#e74c3c', isTarget: true }
    ];

    data.matchedUsers.forEach((match, idx) => {
        allUsers.push({
            username: match.username,
            pattern: match.pattern,
            color: colors[idx % colors.length] || '#3498db',
            isTarget: false
        });
    });

    // 统一绘制所有用户的柱状图
    allUsers.forEach((user, userIndex) => {
        ctx.fillStyle = user.color;

        for (let day = 0; day < 7; day++) {
            const value = user.pattern.get(`day_${day}`) || 0;
            const barHeight = (value / maxDayValue) * (weekdayChartHeight - 30);

            // 计算柱子的位置，确保均匀分布
            const startX = weekChartLeft + day * dayWidth + groupPadding / 2;
            const x = startX + barPadding * (userIndex + 1) + barWidth * userIndex;
            const y = weekChartBottom - barHeight;

            // 绘制柱子
            ctx.fillRect(x, y, barWidth, barHeight);
        }
    });


    // 绘制图例
    let legendTop = weekChartBottom + 50; // 增加与上方图表的间距
    ctx.textAlign = 'left';
    ctx.font = '14px "Aa偷吃可爱长大的"';

    // 绘制图例标题
    ctx.fillStyle = '#333';
    ctx.font = 'bold 18px "Aa偷吃可爱长大的"';
    ctx.textAlign = 'center';
    ctx.fillText('图例说明', width / 2, legendTop);
    ctx.font = '14px "Aa偷吃可爱长大的"';
    ctx.textAlign = 'left';

    // 计算图例开始位置和每列宽度
    const legendStartX = hourChartLeft;
    const legendColumnWidth = Math.min(450, (cardWidth - 80) / 2); // 确保在宽度有限时也能正常显示
    const legendsPerRow = 2; // 每行最多2个图例

    // 目标用户图例 - 单独一行
    legendTop += 25; // 图例标题与第一个图例的间距
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(legendStartX, legendTop, 20, 10);
    ctx.fillStyle = '#333';
    ctx.fillText(data.targetUser + " (目标用户)", legendStartX + 30, legendTop + 10);

    // 匹配用户图例 - 每行最多2个用户
    legendTop += legendRowHeight; // 进入下一行

    data.matchedUsers.forEach((match, index) => {
        const colorIndex = index % colors.length;
        const row = Math.floor(index / legendsPerRow);
        const col = index % legendsPerRow;

        const x = legendStartX + col * legendColumnWidth;
        const y = legendTop + row * legendRowHeight;

        // 确保没有超出画布范围
        if (y + 20 <= cardY + cardHeight - padding / 2) {
            ctx.fillStyle = colors[colorIndex]!;
            ctx.fillRect(x, y, 20, 10);
            ctx.fillStyle = '#333';
            const similarity = (match.similarity * 100).toFixed(1);

            // 测量文本长度，确保不超出列宽
            const text = `${match.username} (${similarity}% 匹配)`;
            const metrics = ctx.measureText(text);
            if (metrics.width > legendColumnWidth - 40) {
                // 如果文本过长，缩短显示
                const shortUsername = match.username.length > 10 ?
                    match.username.substring(0, 10) + "..." :
                    match.username;
                ctx.fillText(`${shortUsername} (${similarity}% 匹配)`, x + 30, y + 10);
            } else {
                ctx.fillText(text, x + 30, y + 10);
            }
        }
    });

    // 保存图像
    const buffer = canvas.toBuffer('image/png');
    return "base64://" + buffer.toString('base64');
}