#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 递归遍历目录，处理所有 .smd 文件
function processDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (item.endsWith('.smd')) {
            processFile(fullPath);
        }
    }
}

// 处理单个文件
function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const newContent = replaceFigure(content);
    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`✓ Converted figure in: ${filePath}`);
    }
}

// 替换 figure 块为图片链接
function replaceFigure(content) {
    // 支持 figure 块跨多行，捕获 src 路径和 caption
    return content.replace(/\{\{\\<\s*figure\s+src="([^"]+)"[^>]*caption="([^"]*)"[^>]*\\>\}\}/g,
        (match, src, caption) => {
            // 去掉 src 开头的 /
            const cleanSrc = src.replace(/^\//, '');
            return `[${caption}]($image.siteAsset('${cleanSrc}'))\n`;
        }
    );
}

// 主程序
function main() {
    const rootDir = path.join(__dirname, 'content');
    processDirectory(rootDir);
}

if (require.main === module) {
    main();
} 