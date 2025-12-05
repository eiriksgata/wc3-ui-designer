// TGA 解码工具函数
export async function decodeTgaToDataUrl(file: File | Blob): Promise<string> {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // TGA 头部（18 字节）
    const idLength = view.getUint8(0);
    const colorMapType = view.getUint8(1);
    const imageType = view.getUint8(2);
    const colorMapOffset = view.getUint16(5, true);
    const colorMapLength = view.getUint16(7, true);
    const colorMapEntrySize = view.getUint8(8);
    const xOrigin = view.getUint16(8, true);
    const yOrigin = view.getUint16(10, true);
    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const pixelDepth = view.getUint8(16);
    const imageDescriptor = view.getUint8(17);

    // 只支持未压缩的 true color（24/32 位）
    if (imageType !== 2) {
        throw new Error('只支持未压缩的 true color TGA');
    }
    if (pixelDepth !== 24 && pixelDepth !== 32) {
        throw new Error('只支持 24/32 位 TGA');
    }

    const hasAlpha = pixelDepth === 32;
    const bytesPerPixel = pixelDepth / 8;
    const originTop = (imageDescriptor & 0x20) === 0;
    const originLeft = (imageDescriptor & 0x10) === 0;

    // 跳过 ID 字段和颜色映射表
    let offset = 18;
    if (idLength > 0) {
        offset += idLength;
    }
    if (colorMapType === 1 && colorMapLength > 0) {
        offset += colorMapLength * (colorMapEntrySize / 8);
    }

    const imageSize = width * height * bytesPerPixel;
    if (offset + imageSize > buffer.byteLength) {
        throw new Error('TGA 数据长度不正确');
    }
    const data = new Uint8Array(buffer, offset, imageSize);

    const rgba = new Uint8ClampedArray(width * height * 4);
    let src = 0;
    // TGA 格式说明：
    // - originTop = true (第5位为0): 数据从顶部到底部存储，第一行是顶部
    // - originTop = false (第5位为1): 数据从底部到顶部存储，第一行是底部
    // - originLeft = true (第4位为0): 数据从左到右存储，第一列是左边
    // - originLeft = false (第4位为1): 数据从右到左存储，第一列是右边
    // 
    // 我们需要将 TGA 数据转换为标准显示顺序（顶部到底部，左到右）
    for (let y = 0; y < height; y++) {
        // 计算输出行索引：如果原点在底部，TGA 的第一行是底部，需要翻转
        // 注意：如果图片显示时垂直翻转，可能需要反转这个逻辑
        const outputRow = originTop ? height - 1 - y : y;
        for (let x = 0; x < width; x++) {
            // 计算输出列索引：如果原点在右侧，TGA 的第一列是右边，需要翻转
            const outputCol = originLeft ? x : width - 1 - x;
            const dst = (outputRow * width + outputCol) * 4;
            const b = data[src];
            const g = data[src + 1];
            const r = data[src + 2];
            const a = hasAlpha ? data[src + 3] : 255;
            rgba[dst] = r;
            rgba[dst + 1] = g;
            rgba[dst + 2] = b;
            rgba[dst + 3] = a;
            src += bytesPerPixel;
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('无法获取 canvas 上下文');
    }
    const imageData = new ImageData(rgba, width, height);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

