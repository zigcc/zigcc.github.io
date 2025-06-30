#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 配置
const config = {
    sourceDir: './content/learn'
};

// 修复链接格式
function fixLinks(content) {
    let changes = 0;
    
    // 1. 修复 [filename.md](filename.md) 格式到 $link.page('filename') 格式
    content = content.replace(/\[([^.\]]+)\.md\]\(([^.\]]+)\.md\)/g, (match, filename, linkFilename) => {
        if (filename === linkFilename) {
            changes++;
            return `$link.page('${filename}')`;
        }
        return match;
    });
    
    // 2. 修复 [filename](filename.md) 格式到 $link.page('filename') 格式
    content = content.replace(/\[([^.\]]+)\]\(([^.\]]+)\.md\)/g, (match, displayText, linkFilename) => {
        if (displayText === linkFilename) {
            changes++;
            return `$link.page('${linkFilename}')`;
        }
        return match;
    });
    
    // 3. 修复 [filename.md](filename.md) 格式（文件名包含点的情况）
    content = content.replace(/\[([^]]+\.md)\]\(([^)]+\.md)\)/g, (match, displayText, linkFilename) => {
        const filename = displayText.replace('.md', '');
        const linkFile = linkFilename.replace('.md', '');
        
        if (filename === linkFile) {
            changes++;
            return `$link.page('${filename}')`;
        }
        return match;
    });
    
    // 4. 修复 [显示文本](filename.md) 格式到 [显示文本]($link.page('filename')) 格式
    content = content.replace(/\[([^]]+)\]\(([^.\]]+)\.md\)/g, (match, displayText, linkFilename) => {
        if (displayText !== linkFilename) {
            changes++;
            return `[${displayText}]($link.page('${linkFilename}'))`;
        }
        return match;
    });
    
    // 5. 修复 [显示文本](filename.md) 格式（文件名包含点的情况）
    content = content.replace(/\[([^]]+)\]\(([^)]+\.md)\)/g, (match, displayText, linkFilename) => {
        const linkFile = linkFilename.replace('.md', '');
        if (displayText !== linkFile) {
            changes++;
            return `[${displayText}]($link.page('${linkFile}'))`;
        }
        return match;
    });
    
    return { content, changes };
}

// 处理单个文件
function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const { content: fixedContent, changes } = fixLinks(content);
        
        if (changes > 0) {
            fs.writeFileSync(filePath, fixedContent, 'utf8');
            console.log(`✓ Fixed ${changes} links in: ${filePath}`);
            return { fixed: true, changes };
        } else {
            console.log(`- No changes needed: ${filePath}`);
            return { fixed: false, changes: 0 };
        }
    } catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
        return { fixed: false, changes: 0 };
    }
}

// 递归处理目录
function processDirectory(dirPath) {
    try {
        const items = fs.readdirSync(dirPath);
        let fixedCount = 0;
        let totalCount = 0;
        let totalChanges = 0;

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // 递归处理子目录
                const result = processDirectory(fullPath);
                fixedCount += result.fixed;
                totalCount += result.total;
                totalChanges += result.totalChanges;
            } else if (item.endsWith('.smd')) {
                // 处理smd文件
                const result = processFile(fullPath);
                if (result.fixed) fixedCount++;
                totalCount++;
                totalChanges += result.changes;
            }
        }

        return { fixed: fixedCount, total: totalCount, totalChanges };
    } catch (error) {
        console.error(`✗ Error processing directory ${dirPath}:`, error.message);
        return { fixed: 0, total: 0, totalChanges: 0 };
    }
}

// 主函数
function main() {
    console.log('🔗 Starting advanced link format fix...');
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
    console.log(`🔗 Total link changes: ${result.totalChanges}`);
    
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