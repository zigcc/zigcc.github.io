#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 配置
const config = {
    sourceDir: './content/learn'
};

// 转换链接格式
function convertLinkFormat(content) {
    // 将 $link.page('filename') 转换为 $link.sub('filename')
    content = content.replace(/\$link\.page\('([^']+)'\)/g, (match, filename) => {
        return `$link.sub('${filename}')`;
    });
    
    return content;
}

// 处理单个文件
function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const convertedContent = convertLinkFormat(content);
        
        // 如果内容有变化，写回文件
        if (content !== convertedContent) {
            fs.writeFileSync(filePath, convertedContent, 'utf8');
            console.log(`✓ Converted links in: ${filePath}`);
            return true;
        } else {
            console.log(`- No changes needed: ${filePath}`);
            return false;
        }
    } catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
        return false;
    }
}

// 递归处理目录
function processDirectory(dirPath) {
    try {
        const items = fs.readdirSync(dirPath);
        let convertedCount = 0;
        let totalCount = 0;

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // 递归处理子目录
                const result = processDirectory(fullPath);
                convertedCount += result.converted;
                totalCount += result.total;
            } else if (item.endsWith('.smd')) {
                // 处理smd文件
                const converted = processFile(fullPath);
                if (converted) convertedCount++;
                totalCount++;
            }
        }

        return { converted: convertedCount, total: totalCount };
    } catch (error) {
        console.error(`✗ Error processing directory ${dirPath}:`, error.message);
        return { converted: 0, total: 0 };
    }
}

// 主函数
function main() {
    console.log('🔄 Starting link format conversion...');
    console.log(`📁 Source directory: ${config.sourceDir}`);
    console.log('🔄 Converting $link.page to $link.sub');
    console.log('');

    if (!fs.existsSync(config.sourceDir)) {
        console.error(`✗ Source directory does not exist: ${config.sourceDir}`);
        process.exit(1);
    }

    const result = processDirectory(config.sourceDir);
    
    console.log('');
    console.log('📊 Conversion Summary:');
    console.log(`✓ Converted links in: ${result.converted}/${result.total} files`);
    
    if (result.converted > 0) {
        console.log('🎉 Link format conversion completed!');
    } else {
        console.log('ℹ️  No link format conversion needed');
    }
}

// 运行脚本
if (require.main === module) {
    main();
}

module.exports = {
    convertLinkFormat,
    processFile,
    processDirectory
}; 