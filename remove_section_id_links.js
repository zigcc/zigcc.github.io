#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 配置
const config = {
    sourceDir: './content/monthly'
};

// 转换链接格式：去掉 $section.id 只保留 Markdown 链接
function removeSectionIdLinks(content) {
    return content.replace(/\[\[(.+?)\]\((.+?)\)\]\(\$section\.id\((.+?)\)\)/g, '[$1]($2)');
}

// 处理单个文件
function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const convertedContent = removeSectionIdLinks(content);
        
        // 如果内容有变化，写回文件
        if (content !== convertedContent) {
            fs.writeFileSync(filePath, convertedContent, 'utf8');
            console.log(`✓ Removed section.id links in: ${filePath}`);
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
                // 处理 smd 文件
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
    console.log('🔄 Starting section.id link removal...');
    console.log(`📁 Source directory: ${config.sourceDir}`);
    console.log('🔄 Removing section.id links');
    console.log('');

    if (!fs.existsSync(config.sourceDir)) {
        console.error(`✗ Source directory does not exist: ${config.sourceDir}`);
        process.exit(1);
    }

    const result = processDirectory(config.sourceDir);
    
    console.log('');
    console.log('📊 Removal Summary:');
    console.log(`✓ Removed section.id links in: ${result.converted}/${result.total} files`);
    
    if (result.converted > 0) {
        console.log('🎉 Section.id link removal completed!');
    } else {
        console.log('ℹ️  No section.id links found');
    }
}

// 运行脚本
if (require.main === module) {
    main();
}

module.exports = {
    removeSectionIdLinks,
    processFile,
    processDirectory
}; 