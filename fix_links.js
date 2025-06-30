#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 配置
const config = {
    sourceDir: './content/learn'
};

// 修复链接格式
function fixLinks(content) {
    // 修复 [filename.md](filename.md) 格式到 $link.sub('filename') 格式
    // 这个正则表达式匹配 [filename.md](filename.md) 格式
    content = content.replace(/\[([^.\]]+)\.md\]\(([^.\]]+)\.md\)/g, (match, filename, linkFilename) => {
        // 如果文件名和链接文件名相同，转换为 $link.sub 格式
        if (filename === linkFilename) {
            return `$link.sub('${filename}')`;
        }
        // 如果不同，保持原格式（这种情况应该很少见）
        return match;
    });
    
    // 修复 [filename](filename.md) 格式到 $link.sub('filename') 格式
    content = content.replace(/\[([^.\]]+)\]\(([^.\]]+)\.md\)/g, (match, displayText, linkFilename) => {
        // 如果显示文本和链接文件名相同，转换为 $link.sub 格式
        if (displayText === linkFilename) {
            return `$link.sub('${linkFilename}')`;
        }
        // 如果不同，保持原格式
        return match;
    });
    
    // 修复 [filename.md](filename.md) 格式（文件名包含点的情况）
    content = content.replace(/\[([^]]+\.md)\]\(([^)]+\.md)\)/g, (match, displayText, linkFilename) => {
        // 提取文件名（去掉.md扩展名）
        const filename = displayText.replace('.md', '');
        const linkFile = linkFilename.replace('.md', '');
        
        if (filename === linkFile) {
            return `$link.sub('${filename}')`;
        }
        return match;
    });
    
    return content;
}

// 处理单个文件
function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fixedContent = fixLinks(content);
        
        // 如果内容有变化，写回文件
        if (content !== fixedContent) {
            fs.writeFileSync(filePath, fixedContent, 'utf8');
            console.log(`✓ Fixed links in: ${filePath}`);
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
        let fixedCount = 0;
        let totalCount = 0;

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // 递归处理子目录
                const result = processDirectory(fullPath);
                fixedCount += result.fixed;
                totalCount += result.total;
            } else if (item.endsWith('.smd')) {
                // 处理smd文件
                const fixed = processFile(fullPath);
                if (fixed) fixedCount++;
                totalCount++;
            }
        }

        return { fixed: fixedCount, total: totalCount };
    } catch (error) {
        console.error(`✗ Error processing directory ${dirPath}:`, error.message);
        return { fixed: 0, total: 0 };
    }
}

// 主函数
function main() {
    console.log('🔗 Starting link format fix...');
    console.log(`📁 Source directory: ${config.sourceDir}`);
    console.log('');

    if (!fs.existsSync(config.sourceDir)) {
        console.error(`✗ Source directory does not exist: ${config.sourceDir}`);
        process.exit(1);
    }

    const result = processDirectory(config.sourceDir);
    
    console.log('');
    console.log('📊 Fix Summary:');
    console.log(`✓ Fixed links in: ${result.fixed}/${result.total} files`);
    
    if (result.fixed > 0) {
        console.log('🎉 Link fixes completed!');
    } else {
        console.log('ℹ️  No link fixes needed');
    }
}

// 运行脚本
if (require.main === module) {
    main();
}

module.exports = {
    fixLinks,
    processFile,
    processDirectory
}; 