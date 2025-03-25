import { createCanvas } from '@napi-rs/canvas';
interface WordFrequency {
    word: string;
    frequency: number;
}

interface Position {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    fontSize: number;
}

/**
 * 根据词频生成词云图片
 * @param wordFrequencies 词频数组，包含单词和对应的频率
 * @param initialWidth 初始画布宽度(最终会自动调整)
 * @param initialHeight 初始画布高度(最终会自动调整)
 * @param options 词云配置选项
 * @returns 图片的base64编码字符串
 */
export async function generateWordCloud(
    wordFrequencies: WordFrequency[],
    initialWidth = 1000,
    initialHeight = 800,
    options = {
        backgroundColor: 'white',
        enableRotation: true,
        maxAttempts: 60,         // 每个词的最大尝试次数
        minFontSize: 20,         // 最小字体大小
        maxFontSize: 100,        // 最大字体大小
        padding: 20,             // 降低内边距提高紧凑度
        horizontalWeight: 0.6,   // 提高横排权重增强可读性
        rotationVariance: 10,    // 减少旋转角度变化
        safetyMargin: 6,         // 减小安全距离以提高密度
        fontSizeRatio: 2.0,      // 字体大小差异
        overlapThreshold: 0.10,   // 允许10%的重叠
        maxExpansionAttempts: 10, // 最大画布扩展次数
        expansionRatio: 1.15     // 降低每次扩展比例
    }
): Promise<string> {
    // 空数组检查
    if (wordFrequencies.length === 0) {
        const emptyCanvas = createCanvas(initialWidth, initialHeight);
        const ctx = emptyCanvas.getContext('2d');
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, initialWidth, initialHeight);
        return "base64://" + emptyCanvas.toBuffer('image/png').toString('base64');
    }

    // 过滤不可渲染字符 - 增强过滤能力
    const filteredWordFrequencies = wordFrequencies.map(item => ({
        ...item,
        word: filterUnrenderableChars(item.word)
    })).filter(item => item.word.length > 0);

    // 再次检查过滤后是否为空
    if (filteredWordFrequencies.length === 0) {
        const emptyCanvas = createCanvas(initialWidth, initialHeight);
        const ctx = emptyCanvas.getContext('2d');
        ctx.fillStyle = options.backgroundColor;
        ctx.fillRect(0, 0, initialWidth, initialHeight);
        return "base64://" + emptyCanvas.toBuffer('image/png').toString('base64');
    }

    // 对词频进行排序，频率高的先绘制
    const sortedWords = [...filteredWordFrequencies].sort((a, b) => b.frequency - a.frequency);

    // 计算最小和最大频率，用于字体大小缩放
    const maxFreq = sortedWords[0]?.frequency || 1;
    const minFreq = sortedWords[sortedWords.length - 1]?.frequency || 1;
    const freqRange = Math.max(1, maxFreq - minFreq); // 避免除以零

    // 检查字符类型
    const isChineseChar = (char: string): boolean => /[\u4e00-\u9fa5]/.test(char);
    const isEnglishChar = (char: string): boolean => /[a-zA-Z0-9]/.test(char);

    // 判断单词类型（中文、英文或混合）
    const getWordType = (word: string): 'chinese' | 'english' | 'mixed' => {
        let hasChinese = false;
        let hasEnglish = false;

        for (const char of word) {
            if (isChineseChar(char)) hasChinese = true;
            else if (isEnglishChar(char)) hasEnglish = true;

            if (hasChinese && hasEnglish) return 'mixed';
        }

        return hasChinese ? 'chinese' : 'english';
    };

    // 获取适合单词的字体
    const getFontFamily = (word: string): string => {
        const wordType = getWordType(word);

        if (wordType === 'chinese') return '"Aa偷吃可爱长大的", sans-serif';
        if (wordType === 'english') return '"JetBrains Mono", monospace';
        return '"Aa偷吃可爱长大的", "JetBrains Mono", sans-serif'; // 混合类型
    };

    // 增强的字体大小计算函数，保持高频词更大但减小差距
    const calculateFontSize = (frequency: number, index: number): number => {
        // 基本的频率比例
        const frequencyRatio = (frequency - minFreq) / freqRange;

        // 根据词云大小调整差异系数
        const smallCloudFactor = sortedWords.length < 15 ? 1.5 : 1.0; // 小词云时增大差异

        // 应用非线性映射，使高频词更大但差距不过大
        let sizeRatio;

        if (index === 0) {
            // 最高频词
            sizeRatio = Math.pow(frequencyRatio, 0.3) * 2.2 * smallCloudFactor;
        } else if (index < sortedWords.length * 0.05) {
            // 前5%的高频词
            sizeRatio = Math.pow(frequencyRatio, 0.4) * 1.8 * smallCloudFactor;
        } else if (index < sortedWords.length * 0.15) {
            // 前15%的高频词
            sizeRatio = Math.pow(frequencyRatio, 0.5) * 1.5 * smallCloudFactor;
        } else if (index < sortedWords.length * 0.3) {
            // 前30%的高频词
            sizeRatio = Math.pow(frequencyRatio, 0.6) * 1.3 * smallCloudFactor;
        } else {
            // 其余的词
            sizeRatio = Math.pow(frequencyRatio, 0.7) * 1.0 * smallCloudFactor;
        }

        // 应用配置的字体大小比例系数
        sizeRatio *= options.fontSizeRatio;

        // 计算最终字体大小
        return Math.max(
            options.minFontSize,
            Math.min(
                options.maxFontSize,
                Math.floor(options.minFontSize + sizeRatio * (options.maxFontSize - options.minFontSize))
            )
        );
    };

    // 获取基于词频的颜色
    const getColorFromFrequency = (frequency: number, index: number): string => {
        // 使用词频和索引生成不同的色相值
        const hue = (index * 137.5) % 360; // 黄金角分布

        // 重要词使用更醒目的颜色
        let saturation, lightness;

        if (index === 0) {
            // 最高频词
            saturation = 95;
            lightness = 45;
        } else if (index < sortedWords.length * 0.1) {
            // 前10%的高频词
            saturation = 90;
            lightness = 45;
        } else {
            // 降低其他词的饱和度，增加整体和谐性
            saturation = 75 + (Math.max(0.3, frequency / maxFreq) * 15);
            lightness = 40 + (Math.max(0.3, frequency / maxFreq) * 15);
        }

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };

    // 临时画布用于测量文本
    let tempCanvas = createCanvas(initialWidth, initialHeight);
    let tempCtx = tempCanvas.getContext('2d');

    // 已确定位置的单词数组
    const placedWords: Position[] = [];

    // 根据旋转角度计算包围盒（用于碰撞检测）
    const getRotatedBoundingBox = (x: number, y: number, width: number, height: number, rotation: number) => {
        // 转换角度为弧度
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // 计算四个角的坐标
        const corners = [
            { x: -width / 2, y: -height / 2 },
            { x: width / 2, y: -height / 2 },
            { x: width / 2, y: height / 2 },
            { x: -width / 2, y: height / 2 }
        ].map(pt => {
            return {
                x: x + width / 2 + (pt.x * cos - pt.y * sin),
                y: y + height / 2 + (pt.x * sin + pt.y * cos)
            };
        });

        // 计算包围盒
        const boxMinX = Math.min(...corners.map(c => c.x));
        const boxMaxX = Math.max(...corners.map(c => c.x));
        const boxMinY = Math.min(...corners.map(c => c.y));
        const boxMaxY = Math.max(...corners.map(c => c.y));

        return { minX: boxMinX, maxX: boxMaxX, minY: boxMinY, maxY: boxMaxY };
    };

    // 精确重叠检测 - 允许适度重叠，并考虑词的重要性
    const isOverlapping = (x: number, y: number, width: number, height: number, rotation: number, index: number): boolean => {
        // 获取当前词的包围盒
        const currentBox = getRotatedBoundingBox(x, y, width, height, rotation);

        // 为边缘增加安全距离，根据重要性调整
        const safetyMargin = index < sortedWords.length * 0.05 ?
            options.safetyMargin * 1.2 : options.safetyMargin * 0.9;

        const safetyBox = {
            minX: currentBox.minX - safetyMargin,
            maxX: currentBox.maxX + safetyMargin,
            minY: currentBox.minY - safetyMargin,
            maxY: currentBox.maxY + safetyMargin
        };

        // 计算当前单词的面积
        const currentArea = (safetyBox.maxX - safetyBox.minX) * (safetyBox.maxY - safetyBox.minY);

        // 为高频词设置更严格的重叠阈值
        const overlapThreshold = index < sortedWords.length * 0.1 ?
            options.overlapThreshold * 0.6 : options.overlapThreshold;

        // 检查是否与已放置的词重叠超过阈值
        for (const pos of placedWords) {
            const posBox = getRotatedBoundingBox(
                pos.x, pos.y, pos.width, pos.height, pos.rotation
            );

            // 计算重叠区域
            const overlapX = Math.max(0, Math.min(safetyBox.maxX, posBox.maxX) - Math.max(safetyBox.minX, posBox.minX));
            const overlapY = Math.max(0, Math.min(safetyBox.maxY, posBox.maxY) - Math.max(safetyBox.minY, posBox.minY));
            const overlapArea = overlapX * overlapY;

            // 计算重叠率
            const overlapRatio = overlapArea / currentArea;

            // 如果重叠率超过阈值，则认为重叠
            if (overlapRatio > overlapThreshold) {
                return true;
            }
        }

        return false;
    };

    // 获取当前词云形状信息 - 改进密度计算
    const getCloudShape = () => {
        if (placedWords.length === 0) {
            return {
                width: initialWidth,
                height: initialHeight,
                ratio: initialWidth / initialHeight,
                density: 0
            };
        }

        // 计算已放置区域的边界
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let totalArea = 0;

        placedWords.forEach(pos => {
            const box = getRotatedBoundingBox(pos.x, pos.y, pos.width, pos.height, pos.rotation);
            minX = Math.min(minX, box.minX);
            maxX = Math.max(maxX, box.maxX);
            minY = Math.min(minY, box.minY);
            maxY = Math.max(maxY, box.maxY);

            // 累计词的面积
            totalArea += pos.width * pos.height;
        });

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const area = width * height;

        // 计算密度 (已用面积 / 总面积)
        const density = totalArea / area;

        return {
            width,
            height,
            ratio: width / height,
            density
        };
    };

    // 自适应旋转角度决策 - 基于可用空间和单词特性
    const getOptimalRotation = (word: string, textWidth: number, textHeight: number, index: number) => {
        if (!options.enableRotation) return 0;

        const wordType = getWordType(word);
        const isHighFrequencyWord = index < sortedWords.length * 0.15; // 前15%的高频词

        // 单字或短词偏好水平排列
        if (word.length === 1 || (wordType === 'english' && word.length <= 3)) {
            return 0;
        }

        // 中文单字不旋转
        if (wordType === 'chinese' && word.length === 1) {
            return 0;
        }

        // 高频词优先水平排列
        if (isHighFrequencyWord) {
            // 最高频词不旋转
            if (index === 0) return 0;
            // 其他高频词轻微旋转
            return (Math.random() * 2 - 1) * 3;
        }

        // 获取当前词云形状与密度
        const cloudShape = getCloudShape();

        // 特别定制：根据词的宽高比决定旋转
        // 细长的词在排版上更灵活
        const isLongWord = textWidth / textHeight > 3;

        // 宽高比例调整旋转策略
        if (cloudShape.ratio > 1.3) {
            // 宽大于高，优先考虑竖排
            if (isLongWord) {
                // 细长词适合90度旋转
                return 90;
            } else {
                // 其他词随机选择，但偏向竖排
                return Math.random() < 0.7 ?
                    90 + (Math.random() * 2 - 1) * 5 : // 竖排
                    (Math.random() * 2 - 1) * 5;       // 横排
            }
        } else if (cloudShape.ratio < 0.7) {
            // 高大于宽，优先考虑横排
            return (Math.random() * 2 - 1) * 5;
        }

        // 根据词的类型进一步决定倾向
        let horizontalBias = options.horizontalWeight;

        if (wordType === 'chinese' && word.length > 1) {
            // 中文词组更适合横排
            horizontalBias += 0.2;
        } else if (wordType === 'english' && word.length > 5) {
            // 长英文单词可增加竖排几率
            horizontalBias -= 0.1;
        }

        // 根据词的长宽比进一步微调
        const aspectRatio = textWidth / textHeight;
        if (aspectRatio > 4) {
            // 极细长的词更适合竖排
            horizontalBias -= 0.25;
        } else if (aspectRatio < 1.5) {
            // 近方形的词更适合横排
            horizontalBias += 0.15;
        }

        // 最终决定旋转
        return Math.random() < horizontalBias ?
            (Math.random() * 2 - 1) * options.rotationVariance / 3 : // 横排，减小角度变化
            90 + (Math.random() * 2 - 1) * options.rotationVariance / 3; // 竖排，减小角度变化
    };

    // 增强的过滤不可渲染字符函数
    function filterUnrenderableChars(text: string): string {
        // 过滤掉控制字符、特殊Unicode和一些可能导致渲染问题的字符
        return text
            .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD\uFFFE\uFFFF]/g, '')  // 控制字符和特殊字符
            .replace(/[\u2000-\u200F\u2028-\u202F]/g, '')                   // 一些特殊空白和控制字符
            .replace(/[\u0080-\u00A0]/g, '')                               // 一些Latin-1补充字符
            .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '')                      // 只保留字母、数字、标点和空格
            .trim();
    }

    // ===== 优化: 添加新的位置策略函数 =====

    // 改进的螺旋布局 - 更紧凑的布局策略
    const getSpiralPosition = (
        textWidth: number,
        textHeight: number,
        attempt: number,
        canvasShape: { width: number, height: number, ratio: number, density: number }
    ) => {
        // 根据词数量调整螺旋参数 - 词少时更紧凑
        const wordCountFactor = Math.min(1, placedWords.length / 20); // 少于20个词时更紧凑

        // 使用已放置词的中心点，而非固定画布中心
        let centerX = initialWidth / 2;
        let centerY = initialHeight / 2;

        // 如果已经有足够的词，使用它们的质心作为新的中心点
        if (placedWords.length >= 3) {
            let sumX = 0, sumY = 0, weightSum = 0;
            for (const pos of placedWords) {
                // 较大的词有更大的权重影响中心点
                const weight = Math.sqrt(pos.width * pos.height);
                sumX += (pos.x + pos.width / 2) * weight;
                sumY += (pos.y + pos.height / 2) * weight;
                weightSum += weight;
            }
            centerX = sumX / weightSum;
            centerY = sumY / weightSum;
        }

        // 动态调整螺旋参数，词数少时更紧凑
        const baseA = Math.min(initialWidth, initialHeight) / (35 + (1 - wordCountFactor) * 15);
        const densityFactor = Math.max(0.7, Math.min(1.4, 0.7 + canvasShape.density * 1.2));
        const a = baseA / densityFactor; // 反比例，密度高时参数更小，螺旋更紧凑

        // 词数量少时使用更小的角度增量，产生更紧凑的螺旋
        const angleIncrement = 0.1 + wordCountFactor * 0.25;
        const angle = angleIncrement * attempt;

        // 非线性距离增长，词数少时增长更慢
        const distanceMultiplier = wordCountFactor * (
            attempt < 8 ?
                0.2 + Math.pow(attempt / 8, 1.5) : // 前几次更靠近中心，呈幂次增长
                0.7 + Math.pow((attempt - 8) / 25, 0.7) // 之后缓慢增长
        ) + (1 - wordCountFactor) * (0.1 + Math.pow(attempt / 20, 1.2)); // 词少时增长更慢

        // 根据画布形状自适应调整螺旋方向
        let dx, dy;
        if (canvasShape.ratio > 1.2) { // 宽大于高
            // 水平方向拉伸，但减少拉伸强度
            dx = a * angle * Math.cos(angle) * distanceMultiplier * 1.1;
            dy = a * angle * Math.sin(angle) * distanceMultiplier * 0.9;
        } else if (canvasShape.ratio < 0.8) { // 高大于宽
            // 垂直方向拉伸，但减少拉伸强度
            dx = a * angle * Math.cos(angle) * distanceMultiplier * 0.9;
            dy = a * angle * Math.sin(angle) * distanceMultiplier * 1.1;
        } else {
            // 更均衡的螺旋
            dx = a * angle * Math.cos(angle) * distanceMultiplier;
            dy = a * angle * Math.sin(angle) * distanceMultiplier;
        }

        // 添加少量随机抖动以打破规则性
        dx += (Math.random() - 0.5) * a * 0.5;
        dy += (Math.random() - 0.5) * a * 0.5;

        const x = centerX + dx - textWidth / 2;
        const y = centerY + dy - textHeight / 2;

        return {
            x: Math.max(options.safetyMargin, Math.min(initialWidth - textWidth - options.safetyMargin, x)),
            y: Math.max(textHeight / 2 + options.safetyMargin, Math.min(initialHeight - textHeight / 2 - options.safetyMargin, y))
        };
    };


    // 新增: 空白区域填充策略
    const findGapPosition = (
        textWidth: number,
        textHeight: number,
        canvasShape: { width: number, height: number, ratio: number, density: number }
    ) => {
        // 如果词太少，直接返回螺旋位置
        if (placedWords.length < 5) {
            return getSpiralPosition(textWidth, textHeight, Math.floor(Math.random() * 10), canvasShape);
        }

        // 计算当前词云的边界
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (const pos of placedWords) {
            const box = getRotatedBoundingBox(pos.x, pos.y, pos.width, pos.height, pos.rotation);
            minX = Math.min(minX, box.minX);
            maxX = Math.max(maxX, box.maxX);
            minY = Math.min(minY, box.minY);
            maxY = Math.max(maxY, box.maxY);
        }

        // 定义搜索区域，适当扩大范围
        const searchMargin = Math.max(textWidth, textHeight) * 0.5;
        const searchMinX = Math.max(0, minX - searchMargin);
        const searchMaxX = Math.min(initialWidth, maxX + searchMargin);
        const searchMinY = Math.max(0, minY - searchMargin);
        const searchMaxY = Math.min(initialHeight, maxY + searchMargin);

        // 搜索区域宽高
        const searchWidth = searchMaxX - searchMinX;
        const searchHeight = searchMaxY - searchMinY;

        // 网格尺寸，较小的网格可以更精确地找到空白区域
        const gridSize = Math.min(textWidth, textHeight) / 2;
        const gridRows = Math.max(3, Math.ceil(searchHeight / gridSize));
        const gridCols = Math.max(3, Math.ceil(searchWidth / gridSize));

        // 初始化网格密度
        const gridDensity = Array(gridRows).fill(0).map(() => Array(gridCols).fill(0));

        // 计算每个网格的密度
        for (const pos of placedWords) {
            const box = getRotatedBoundingBox(pos.x, pos.y, pos.width, pos.height, pos.rotation);

            // 计算此词覆盖的网格范围
            const startRow = Math.max(0, Math.floor((box.minY - searchMinY) / gridSize));
            const endRow = Math.min(gridRows - 1, Math.floor((box.maxY - searchMinY) / gridSize));
            const startCol = Math.max(0, Math.floor((box.minX - searchMinX) / gridSize));
            const endCol = Math.min(gridCols - 1, Math.floor((box.maxX - searchMinX) / gridSize));

            // 增加网格密度值
            for (let r = startRow; r <= endRow; r++) {
                for (let c = startCol; c <= endCol; c++) {
                    if (r >= 0 && r < gridRows && c >= 0 && c < gridCols) {
                        gridDensity[r]![c] += 1;
                    }
                }
            }
        }

        // 找出能容纳当前词的最低密度区域
        let bestDensity = Infinity;
        let bestRow = 0, bestCol = 0;

        // 需要的网格数量
        const needRows = Math.ceil(textHeight / gridSize);
        const needCols = Math.ceil(textWidth / gridSize);

        // 搜索最优位置
        for (let r = 0; r <= gridRows - needRows; r++) {
            for (let c = 0; c <= gridCols - needCols; c++) {
                let totalDensity = 0;
                let isValid = true;

                // 计算区域总密度
                for (let nr = 0; nr < needRows && isValid; nr++) {
                    for (let nc = 0; nc < needCols && isValid; nc++) {
                        if (r + nr < gridRows && c + nc < gridCols) {
                            totalDensity += gridDensity[r + nr]![c + nc];

                            // 如果单个网格密度过高，直接判定无效
                            if (gridDensity[r + nr]![c + nc] > 3) {
                                isValid = false;
                            }
                        }
                    }
                }

                // 更新最佳位置
                if (isValid && totalDensity < bestDensity) {
                    bestDensity = totalDensity;
                    bestRow = r;
                    bestCol = c;
                }
            }
        }

        // 添加随机抖动避免太规则
        const jitterX = (Math.random() - 0.5) * gridSize * 0.6;
        const jitterY = (Math.random() - 0.5) * gridSize * 0.6;

        // 计算最终位置
        const x = searchMinX + bestCol * gridSize + jitterX;
        const y = searchMinY + bestRow * gridSize + jitterY;

        return {
            x: Math.max(options.safetyMargin, Math.min(initialWidth - textWidth - options.safetyMargin, x)),
            y: Math.max(textHeight + options.safetyMargin, Math.min(initialHeight - options.safetyMargin, y))
        };
    };

    // 新增: 边缘扩展策略
    const getEdgeExtendPosition = (
        textWidth: number,
        textHeight: number,
        attempt: number,
        canvasShape: { width: number, height: number, ratio: number, density: number }
    ) => {
        // 如果无已放置词，回退到螺旋
        if (placedWords.length === 0) {
            return getSpiralPosition(textWidth, textHeight, attempt, canvasShape);
        }

        // 随机选择一个已放置的词作为参考点
        const referenceIndex = Math.floor(Math.random() * placedWords.length);
        const reference = placedWords[referenceIndex];

        // 随机选择方向 (0=右, 1=下, 2=左, 3=上，4-7=对角线)
        const direction = Math.floor(Math.random() * 8);

        // 基础位置
        let baseX = reference!.x;
        let baseY = reference!.y;

        // 获取参考词的旋转后边界框
        const refBox = getRotatedBoundingBox(
            reference!.x, reference!.y, reference!.width, reference!.height, reference!.rotation
        );

        // 根据方向计算新位置
        const margin = options.safetyMargin * 0.5; // 减小边距，增加紧凑度

        switch (direction) {
            case 0: // 右
                baseX = refBox.maxX + margin;
                baseY = refBox.minY + (refBox.maxY - refBox.minY) / 2 - textHeight / 2;
                break;
            case 1: // 下
                baseX = refBox.minX + (refBox.maxX - refBox.minX) / 2 - textWidth / 2;
                baseY = refBox.maxY + margin;
                break;
            case 2: // 左
                baseX = refBox.minX - textWidth - margin;
                baseY = refBox.minY + (refBox.maxY - refBox.minY) / 2 - textHeight / 2;
                break;
            case 3: // 上
                baseX = refBox.minX + (refBox.maxX - refBox.minX) / 2 - textWidth / 2;
                baseY = refBox.minY - textHeight - margin;
                break;
            case 4: // 右上
                baseX = refBox.maxX + margin;
                baseY = refBox.minY - textHeight - margin;
                break;
            case 5: // 右下
                baseX = refBox.maxX + margin;
                baseY = refBox.maxY + margin;
                break;
            case 6: // 左下
                baseX = refBox.minX - textWidth - margin;
                baseY = refBox.maxY + margin;
                break;
            case 7: // 左上
                baseX = refBox.minX - textWidth - margin;
                baseY = refBox.minY - textHeight - margin;
                break;
        }

        // 添加少量随机抖动
        baseX += (Math.random() - 0.5) * margin * 2;
        baseY += (Math.random() - 0.5) * margin * 2;

        return {
            x: Math.max(options.safetyMargin, Math.min(initialWidth - textWidth - options.safetyMargin, baseX)),
            y: Math.max(textHeight + options.safetyMargin, Math.min(initialHeight - options.safetyMargin, baseY))
        };
    };

    // 新增: 多策略选择函数，根据情况选择最佳策略
    const getPositionWithStrategy = (
        textWidth: number,
        textHeight: number,
        attempt: number,
        canvasShape: { width: number, height: number, ratio: number, density: number },
        index: number
    ) => {
        // 检测是否为小词云
        const isSmallWordCloud = sortedWords.length < 15;

        // 第一个词或前几个高频词仍然放在中心，小词云时范围更大
        if (placedWords.length === 0 || (index < 3 && attempt < 5) || (isSmallWordCloud && index < Math.min(5, sortedWords.length / 2))) {
            // 添加小偏移以避免完全重叠
            const offset = isSmallWordCloud ? index * 8 : 0;
            return {
                x: initialWidth / 2 - textWidth / 2 + (Math.random() - 0.5) * offset,
                y: initialHeight / 2 - textHeight / 2 + (Math.random() - 0.5) * offset
            };
        }

        // 根据尝试次数选择不同策略
        const attemptProgress = attempt / options.maxAttempts; // 0到1的进度值

        // 小词云优先使用紧凑布局策略
        if (isSmallWordCloud) {
            if (attemptProgress < 0.6) {
                return getSpiralPosition(textWidth, textHeight, attempt / 2, canvasShape); // 减少螺旋步长，更紧凑
            } else {
                return Math.random() < 0.7 ?
                    findGapPosition(textWidth, textHeight, canvasShape) :
                    getEdgeExtendPosition(textWidth, textHeight, attempt / 2, canvasShape);
            }
        }

        // 高频词优先使用螺旋或中心布局
        if (index < sortedWords.length * 0.1) {
            if (attemptProgress < 0.5) {
                return getSpiralPosition(textWidth, textHeight, attempt, canvasShape);
            } else {
                return Math.random() < 0.7 ?
                    findGapPosition(textWidth, textHeight, canvasShape) :
                    getEdgeExtendPosition(textWidth, textHeight, attempt, canvasShape);
            }
        }

        // 不同阶段使用不同策略
        if (attemptProgress < 0.3) {
            // 前30%尝试: 主要使用改进的螺旋
            return getSpiralPosition(textWidth, textHeight, attempt, canvasShape);
        } else if (attemptProgress < 0.7) {
            // 中间40%尝试: 主要寻找空白区域
            return Math.random() < 0.8 ?
                findGapPosition(textWidth, textHeight, canvasShape) :
                getSpiralPosition(textWidth, textHeight, attempt, canvasShape);
        } else {
            // 后30%尝试: 主要使用边缘扩展和随机策略
            const r = Math.random();
            if (r < 0.6) {
                return getEdgeExtendPosition(textWidth, textHeight, attempt, canvasShape);
            } else if (r < 0.8) {
                return findGapPosition(textWidth, textHeight, canvasShape);
            } else {
                return getSpiralPosition(textWidth, textHeight, attempt * 2, canvasShape); // 双倍螺旋步进，迅速扩展
            }
        }
    };

    // 记录所有单词的边界以自动调整画布大小
    let minX = initialWidth;
    let maxX = 0;
    let minY = initialHeight;
    let maxY = 0;

    // 记录原始中心点，用于居中重定位
    let originalCenterX = initialWidth / 2;
    let originalCenterY = initialHeight / 2;

    // 动态画布扩展计数
    let canvasExpansionCount = 0;

    // 第一轮：计算每个单词的位置并追踪边界
    for (let i = 0; i < sortedWords.length; i++) {
        const { word, frequency } = sortedWords[i]!;

        // 安全检查 - 过滤不可渲染字符
        const safeWord = filterUnrenderableChars(word);
        if (!safeWord) continue;

        // 使用增强的字体大小计算函数
        const fontSize = calculateFontSize(frequency, i);

        // 获取合适的字体
        const fontFamily = getFontFamily(safeWord);

        // 设置字体和测量文本
        tempCtx.font = `bold ${fontSize}px ${fontFamily}`;
        const metrics = tempCtx.measureText(safeWord);

        // 更精确地计算文本高度
        const textHeight = fontSize;
        const textWidth = metrics.width;

        // 获取当前云形状与密度
        const cloudShape = getCloudShape();

        // 获取最佳旋转角度
        const rotation = getOptimalRotation(safeWord, textWidth, textHeight, i);

        // 尝试定位
        let positioned = false;
        let finalX = 0, finalY = 0;

        // 尝试放置单词，如果失败可能会扩展画布
        for (let attempt = 0; attempt < options.maxAttempts && !positioned; attempt++) {
            // 使用多策略获取位置，而不是仅用螺旋布局
            const { x, y } = getPositionWithStrategy(textWidth, textHeight, attempt, cloudShape, i);

            if (!isOverlapping(x, y, textWidth, textHeight, rotation, i)) {
                finalX = x;
                finalY = y;
                positioned = true;

                // 获取此单词旋转后的包围盒
                const box = getRotatedBoundingBox(x, y, textWidth, textHeight, rotation);

                // 更新整体边界
                minX = Math.min(minX, box.minX);
                maxX = Math.max(maxX, box.maxX);
                minY = Math.min(minY, box.minY);
                maxY = Math.max(maxY, box.maxY);

                // 记录位置，保存字体大小
                placedWords.push({
                    x: finalX,
                    y: finalY,
                    width: textWidth,
                    height: textHeight,
                    rotation,
                    fontSize
                });
            } else if (attempt === options.maxAttempts - 1 && canvasExpansionCount < options.maxExpansionAttempts) {
                // 如果所有尝试都失败，并且还有扩展余量，则扩展画布
                canvasExpansionCount++;

                // 计算当前中心点
                const currentCenterX = (maxX + minX) / 2;
                const currentCenterY = (maxY + minY) / 2;

                // 保存原始画布尺寸
                const oldWidth = initialWidth;
                const oldHeight = initialHeight;

                // 扩展画布尺寸 - 使用更小的扩展比例
                initialWidth = Math.ceil(initialWidth * options.expansionRatio);
                initialHeight = Math.ceil(initialHeight * options.expansionRatio);

                // 计算扩展量
                const widthIncrease = initialWidth - oldWidth;
                const heightIncrease = initialHeight - oldHeight;

                // 调整所有已放置单词的位置，使它们保持居中
                placedWords.forEach(pos => {
                    // 相对于原中心的偏移
                    const offsetX = pos.x - originalCenterX;
                    const offsetY = pos.y - originalCenterY;

                    // 计算新位置，保持相对于中心的偏移不变
                    pos.x = originalCenterX + widthIncrease / 2 + offsetX;
                    pos.y = originalCenterY + heightIncrease / 2 + offsetY;
                });

                // 更新坐标系中心点
                originalCenterX = originalCenterX + widthIncrease / 2;
                originalCenterY = originalCenterY + heightIncrease / 2;

                // 更新边界信息
                minX += widthIncrease / 2;
                maxX += widthIncrease / 2;
                minY += heightIncrease / 2;
                maxY += heightIncrease / 2;

                // 重新创建临时画布
                tempCanvas = createCanvas(initialWidth, initialHeight);
                tempCtx = tempCanvas.getContext('2d');

                // 重置尝试计数，在新的扩展画布上再次尝试
                attempt = -1; // 会在循环中+1变成0
            }
        }

        // 如果仍然无法放置，尝试增加重叠容忍度
        if (!positioned) {
            const maxOverlapThreshold = options.overlapThreshold * 2.0; // 允许更多重叠

            for (let attempt = 0; attempt < options.maxAttempts && !positioned; attempt++) {
                // 再次使用多策略获取位置
                const { x, y } = getPositionWithStrategy(textWidth, textHeight, attempt, cloudShape, i);

                // 获取当前词的包围盒
                const currentBox = getRotatedBoundingBox(x, y, textWidth, textHeight, rotation);

                // 计算当前单词的面积
                const currentArea = (currentBox.maxX - currentBox.minX) * (currentBox.maxY - currentBox.minY);

                // 计算最大重叠面积
                let maxOverlapArea = 0;

                for (const pos of placedWords) {
                    const posBox = getRotatedBoundingBox(
                        pos.x, pos.y, pos.width, pos.height, pos.rotation
                    );

                    // 计算重叠区域
                    const overlapX = Math.max(0, Math.min(currentBox.maxX, posBox.maxX) - Math.max(currentBox.minX, posBox.minX));
                    const overlapY = Math.max(0, Math.min(currentBox.maxY, posBox.maxY) - Math.max(currentBox.minY, posBox.minY));
                    const overlapArea = overlapX * overlapY;

                    maxOverlapArea = Math.max(maxOverlapArea, overlapArea);
                }

                // 计算重叠率
                const overlapRatio = maxOverlapArea / currentArea;

                // 如果重叠率在允许范围内，则放置
                if (overlapRatio <= maxOverlapThreshold) {
                    finalX = x;
                    finalY = y;
                    positioned = true;

                    // 获取此单词旋转后的包围盒
                    const box = getRotatedBoundingBox(x, y, textWidth, textHeight, rotation);

                    // 更新整体边界（即使是增加重叠度放置的单词也计入边界）
                    minX = Math.min(minX, box.minX);
                    maxX = Math.max(maxX, box.maxX);
                    minY = Math.min(minY, box.minY);
                    maxY = Math.max(maxY, box.maxY);

                    // 记录位置
                    placedWords.push({
                        x: finalX,
                        y: finalY,
                        width: textWidth,
                        height: textHeight,
                        rotation,
                        fontSize
                    });
                }
            }

            // 如果仍然无法放置，则跳过该词
            if (!positioned) {
                console.log(`无法放置单词: ${safeWord}`);
                continue;
            }
        }
    }

    // 第二阶段：确定最终画布大小并绘制
    // 添加内边距
    minX = Math.max(0, minX - options.padding);
    minY = Math.max(0, minY - options.padding);
    maxX = maxX + options.padding;
    maxY = maxY + options.padding;

    // 计算最终画布尺寸
    const finalWidth = Math.ceil(maxX - minX);
    const finalHeight = Math.ceil(maxY - minY);

    // 创建最终画布
    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    // 设置背景
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, finalWidth, finalHeight);

    for (let i = 0; i < sortedWords.length; i++) {
        if (i >= placedWords.length) continue;

        const { word, frequency } = sortedWords[i]!;
        const position = placedWords[i];
        if (!position) continue;

        const safeWord = filterUnrenderableChars(word);
        if (!safeWord) continue;

        const fontFamily = getFontFamily(safeWord);

        ctx.font = `bold ${position.fontSize}px ${fontFamily}`;
        ctx.fillStyle = getColorFromFrequency(frequency, i);

        const adjustedX = position.x - minX;
        const adjustedY = position.y - minY;

        ctx.save();
        ctx.translate(
            adjustedX + position.width / 2,
            adjustedY + position.height / 2
        );
        ctx.rotate(position.rotation * Math.PI / 180);
        ctx.fillText(safeWord, -position.width / 2, position.height / 2);
        ctx.restore();
    }

    const buffer = canvas.toBuffer('image/png');
    return "base64://" + buffer.toString('base64');
}