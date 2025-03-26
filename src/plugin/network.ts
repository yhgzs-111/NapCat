import { createCanvas, loadImage } from "@napi-rs/canvas";

interface NetworkNode {
    id: string;
    label: string;
    value: number;
}

interface NetworkEdge {
    from: string;
    to: string;
    value: number;
}

interface NetworkData {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
    title: string;
}

export async function drawWordNetwork(data: NetworkData): Promise<string> {
    // 根据节点数量动态调整画布尺寸
    const nodeCount = data.nodes.length;
    const baseWidth = 1000;
    const baseHeight = 800;

    // 根据节点数量计算合适的尺寸
    const width = Math.max(baseWidth, Math.min(2000, baseWidth + (nodeCount - 10) * 30));
    const height = Math.max(baseHeight, Math.min(1500, baseHeight + (nodeCount - 10) * 25));

    // 根据画布大小调整边距
    const padding = Math.max(60, Math.min(100, 60 + nodeCount / 20));
    const centerX = width / 2;
    const centerY = height / 2;

    // 创建画布
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制背景
    try {
        const backgroundImage = await loadImage('C:\\fonts\\post.jpg');
        const pattern = ctx.createPattern(backgroundImage, 'repeat');
        if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, width, height);

            // 添加模糊效果
            ctx.filter = 'blur(5px)';
            ctx.drawImage(canvas, 0, 0);
            ctx.filter = 'none';
        }
    } catch (e) {
        // 如果背景图加载失败，使用纯色背景
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);
    }

    // 绘制半透明卡片背景
    const cardWidth = width - padding * 2;
    const cardHeight = height - padding * 2;
    const cardX = padding;
    const cardY = padding;
    const radius = 20;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
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

    // 绘制标题
    ctx.fillStyle = '#333';
    ctx.font = '28px "Aa偷吃可爱长大的"';
    ctx.textAlign = 'center';
    ctx.fillText(data.title, centerX, cardY + 40);

    // 计算节点位置 (使用简化版力导向算法)
    const nodePositions = new Map<string, { x: number, y: number }>();
    const radiusScale = 15; // 基础节点半径
    const maxRadius = 40;   // 最大节点半径

    // 找出最大频率值用于缩放
    const maxValue = Math.max(...data.nodes.map(n => n.value));

    // 计算每个节点的实际半径
    const nodeRadiusMap = new Map<string, number>();
    for (const node of data.nodes) {
        const radius = Math.min(maxRadius, radiusScale + (node.value / maxValue) * 25);
        nodeRadiusMap.set(node.id, radius);
    }

    // 节点重叠标记系统 - 跟踪哪些节点存在重叠
    const overlapTracker = new Map<string, Set<string>>();
    for (const node of data.nodes) {
        overlapTracker.set(node.id, new Set<string>());
    }

    // 根据画布尺寸调整初始分布范围 - 增加分布范围
    const initialRadius = Math.min(cardWidth, cardHeight) * 0.4;

    // 对节点按大小排序，确保大节点先放置
    const sortedNodes = [...data.nodes].sort((a, b) => b.value - a.value);

    // 初始化随机位置 - 改进的空间分配策略
    for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        if (!node) continue; // 防止空节点
        const nodeRadius = nodeRadiusMap.get(node.id)!;

        // 使用黄金角度法进行更均匀的分布
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // 黄金角
        const angle = i * goldenAngle;

        // 根据节点大小调整距离
        const sizeFactor = 1 + (nodeRadius / maxRadius) * 0.5; // 大节点获得更远的初始距离
        const distance = initialRadius * (0.4 + 0.6 * Math.random()) * sizeFactor;

        nodePositions.set(node.id, {
            x: centerX + Math.cos(angle) * distance,
            y: centerY + Math.sin(angle) * distance
        });
    }

    // 根据节点数量调整迭代次数 - 增加迭代次数确保充分布局
    const iterations = Math.max(40, Math.min(80, 40 + nodeCount));

    // 模拟物理力学
    for (let iteration = 0; iteration < iterations; iteration++) {
        // 冷却因子 - 调整冷却曲线以减缓冷却速度
        const temperatureFactor = 1 - Math.pow(iteration / iterations, 1.5) * 0.8;

        // 清除重叠标记
        for (const nodeId of overlapTracker.keys()) {
            overlapTracker.get(nodeId)!.clear();
        }

        // 斥力 (所有节点相互排斥)
        for (let i = 0; i < data.nodes.length; i++) {
            const node1 = data.nodes[i];
            if (!node1) continue; // 防止空节点
            const pos1 = nodePositions.get(node1.id)!;
            const radius1 = nodeRadiusMap.get(node1.id)!;

            for (let j = i + 1; j < data.nodes.length; j++) {
                const node2 = data.nodes[j];
                if (!node2) continue; // 防止空节点
                const pos2 = nodePositions.get(node2.id)!;
                const radius2 = nodeRadiusMap.get(node2.id)!;

                const dx = pos2.x - pos1.x;
                const dy = pos2.y - pos1.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                // 根据节点实际大小计算最小距离
                const minDistance = radius1 + radius2 + 40; // 增加最小间隙

                // 检测并标记重叠
                if (distance < minDistance) {
                    overlapTracker.get(node1.id)!.add(node2.id);
                    overlapTracker.get(node2.id)!.add(node1.id);
                }

                // 对所有节点应用基础斥力
                const repulsionStrength = 1200 * temperatureFactor; // 增强基础斥力

                if (distance > 0) {
                    // 使用反比平方斥力，但对近距离节点增加额外斥力
                    const proximityFactor = Math.pow(Math.max(0, 1 - distance / (minDistance * 2)), 2) * 3 + 1;
                    const force = Math.min(8, repulsionStrength / (distance * distance)) * proximityFactor;

                    // 根据节点大小调整斥力
                    const sizeFactor = (radius1 + radius2) / (radiusScale * 2);
                    const adjustedForce = force * Math.sqrt(sizeFactor);

                    const moveX = (dx / distance) * adjustedForce;
                    const moveY = (dy / distance) * adjustedForce;

                    pos1.x -= moveX;
                    pos1.y -= moveY;
                    pos2.x += moveX;
                    pos2.y += moveY;
                }

                // 如果距离小于最小距离，增加强制分离力
                if (distance < minDistance) {
                    // 计算重叠度
                    const overlapRatio = (minDistance - distance) / minDistance;

                    // 计算分离力 - 重叠程度越高，力越大
                    // 在迭代后期增加分离力
                    const lateStageFactor = 1 + Math.max(0, (iteration - iterations * 0.6) / (iterations * 0.4)) * 2;
                    const separationForce = overlapRatio * 0.8 * temperatureFactor * lateStageFactor;

                    pos1.x -= dx * separationForce;
                    pos1.y -= dy * separationForce;
                    pos2.x += dx * separationForce;
                    pos2.y += dy * separationForce;

                    // 额外的扭矩力，帮助节点绕过彼此
                    if (overlapRatio > 0.5 && iteration > iterations * 0.3) {
                        // 计算垂直于连线的方向
                        const perpX = -dy / distance;
                        const perpY = dx / distance;

                        // 随机选择扭矩方向
                        const sign = Math.random() > 0.5 ? 1 : -1;
                        const torqueFactor = 0.2 * overlapRatio * temperatureFactor;

                        pos1.x += perpX * torqueFactor * sign;
                        pos1.y += perpY * torqueFactor * sign;
                        pos2.x -= perpX * torqueFactor * sign;
                        pos2.y -= perpY * torqueFactor * sign;
                    }
                }
            }
        }

        // 引力 (有连接的节点相互吸引) - 优化以避免过度聚集
        for (const edge of data.edges) {
            const pos1 = nodePositions.get(edge.from)!;
            const pos2 = nodePositions.get(edge.to)!;
            const radius1 = nodeRadiusMap.get(edge.from)!;
            const radius2 = nodeRadiusMap.get(edge.to)!;

            const dx = pos2.x - pos1.x;
            const dy = pos2.y - pos1.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            // 根据边权值和节点大小调整引力
            const baseStrength = Math.min(0.015, edge.value / 200);
            const strength = baseStrength * temperatureFactor;

            // 根据节点大小动态调整最佳距离
            const minNodeDistance = radius1 + radius2 + 40;
            const optimalDistance = minNodeDistance + 60 + edge.value * 0.5;

            if (distance > optimalDistance) {
                // 如果节点距离过远，应用引力
                const attractionForce = strength * Math.min(1, (distance - optimalDistance) / optimalDistance);
                pos1.x += dx * attractionForce;
                pos1.y += dy * attractionForce;
                pos2.x -= dx * attractionForce;
                pos2.y -= dy * attractionForce;
            } else if (distance < minNodeDistance) {
                // 如果节点距离过近，应用斥力
                const repulsionForce = 0.05 * temperatureFactor * (minNodeDistance - distance) / minNodeDistance;
                pos1.x -= dx * repulsionForce;
                pos1.y -= dy * repulsionForce;
                pos2.x += dx * repulsionForce;
                pos2.y += dy * repulsionForce;
            }
        }

        // 中心引力 - 防止节点飞得太远
        const availableArea = Math.min(cardWidth, cardHeight) * 0.45; // 增加有效区域

        for (const node of data.nodes) {
            const pos = nodePositions.get(node.id)!;
            const dx = centerX - pos.x;
            const dy = centerY - pos.y;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

            // 根据与中心距离施加引力
            if (distanceFromCenter > availableArea) {
                const centerForce = 0.01 * temperatureFactor *
                    Math.pow((distanceFromCenter - availableArea) / availableArea, 1.2);
                pos.x += dx * centerForce;
                pos.y += dy * centerForce;
            }
        }

        // 确保节点不会超出边界
        for (const node of data.nodes) {
            const pos = nodePositions.get(node.id)!;
            const radius = nodeRadiusMap.get(node.id)!;
            const margin = radius + 20; // 考虑节点实际大小的边距

            pos.x = Math.max(cardX + margin, Math.min(cardX + cardWidth - margin, pos.x));
            pos.y = Math.max(cardY + margin, Math.min(cardY + cardHeight - margin, pos.y));
        }

        // 重叠度计算 - 统计当前总重叠数量
        let totalOverlaps = 0;
        for (const overlaps of overlapTracker.values()) {
            totalOverlaps += overlaps.size;
        }

        // 如果迭代已进行了3/4以上且没有重叠，可以提前结束
        if (iteration > iterations * 0.75 && totalOverlaps === 0) {
            break;
        }
    }

    // 最终重叠消除阶段 - 专门解决残余重叠问题
    for (let i = 0; i < 15; i++) {
        let overlapsFixed = 0;

        for (let j = 0; j < data.nodes.length; j++) {
            const node1 = data.nodes[j];
            if (!node1) continue; // 防止空节点
            const pos1 = nodePositions.get(node1.id)!;
            const radius1 = nodeRadiusMap.get(node1.id)!;

            for (let k = j + 1; k < data.nodes.length; k++) {
                const node2 = data.nodes[k];
                if (!node2) continue; // 防止空节点
                const pos2 = nodePositions.get(node2.id)!;
                const radius2 = nodeRadiusMap.get(node2.id)!;

                const dx = pos2.x - pos1.x;
                const dy = pos2.y - pos1.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const minDistance = radius1 + radius2 + 40;

                if (distance < minDistance) {
                    // 计算需要移动的距离
                    const moveDistance = (minDistance - distance) / 2 + 1;
                    const moveX = (dx / distance) * moveDistance;
                    const moveY = (dy / distance) * moveDistance;

                    // 应用移动
                    pos1.x -= moveX;
                    pos1.y -= moveY;
                    pos2.x += moveX;
                    pos2.y += moveY;

                    // 施加小的随机扰动以打破对称性
                    const jitter = 1;
                    pos1.x += (Math.random() - 0.5) * jitter;
                    pos1.y += (Math.random() - 0.5) * jitter;
                    pos2.x += (Math.random() - 0.5) * jitter;
                    pos2.y += (Math.random() - 0.5) * jitter;

                    overlapsFixed++;
                }
            }

            // 确保节点不会超出边界
            const radius = nodeRadiusMap.get(node1.id)!;
            const margin = radius + 20;
            pos1.x = Math.max(cardX + margin, Math.min(cardX + cardWidth - margin, pos1.x));
            pos1.y = Math.max(cardY + margin, Math.min(cardY + cardHeight - margin, pos1.y));
        }

        // 如果没有重叠了，提前退出
        if (overlapsFixed === 0) break;
    }

    // 绘制边 - 改进边的视觉效果
    for (const edge of data.edges) {
        const pos1 = nodePositions.get(edge.from)!;
        const pos2 = nodePositions.get(edge.to)!;
        const radius1 = nodeRadiusMap.get(edge.from)!;
        const radius2 = nodeRadiusMap.get(edge.to)!;

        // 计算边的实际起止点，从节点边缘开始而不是中心
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // 计算实际的起点和终点，从节点边缘开始
        const startX = pos1.x + (dx / distance) * radius1;
        const startY = pos1.y + (dy / distance) * radius1;
        const endX = pos2.x - (dx / distance) * radius2;
        const endY = pos2.y - (dy / distance) * radius2;

        // 根据权重确定线宽
        const lineWidth = Math.max(1, Math.min(5, edge.value / 10));

        // 计算透明度 (权重越高透明度越低)
        const alpha = Math.min(0.7, 0.2 + edge.value / 20);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = `rgba(100, 100, 255, ${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    // 绘制节点
    for (const node of data.nodes) {
        const pos = nodePositions.get(node.id)!;

        // 使用预计算的节点半径
        const radius = nodeRadiusMap.get(node.id)!;

        // 绘制节点圆形
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 100, 100, 0.8)`;
        ctx.fill();

        // 绘制边框
        ctx.strokeStyle = '#800000';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 根据节点大小调整字体大小
        const fontSize = Math.max(14, Math.min(18, 14 + (node.value / maxValue) * 6));

        // 绘制文本
        ctx.fillStyle = '#000';
        ctx.font = `${fontSize}px "Aa偷吃可爱长大的"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, pos.x, pos.y);
    }

    // 绘制图例
    ctx.fillStyle = '#333';
    ctx.font = '18px "Aa偷吃可爱长大的"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('词频越高，节点越大', cardX + 20, cardY + 20);
    ctx.fillText('关联越强，连线越粗', cardX + 20, cardY + 50);

    // 保存图像
    const buffer = canvas.toBuffer('image/png');
    return "base64://" + buffer.toString('base64');
}