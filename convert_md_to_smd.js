#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// 配置
const config = {
  sourceDir: "./content/monthly",
  author: "ZigCC",
  time: "2024",
  layout: "monthly.shtml",
};

// 转换 markdown frontmatter 到 smd 格式
function convertFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) {
    return content;
  }

  const frontmatter = frontmatterMatch[1];
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");

  // 解析现有的 frontmatter
  const lines = frontmatter.split("\n");
  const metadata = {};

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      metadata[match[1]] = match[2].replace(/^["']|["']$/g, ""); // 移除引号
    }
  }

  let hasCustomFrontmatter = Object.keys(metadata).length > 3;

  // 构建新的 smd frontmatter
  const newFrontmatter = [
    "---",
    `.title = "${metadata.title || "Untitled"}",`,
    `.date = @date("${metadata.date || config.time}"),`,
    `.author = "${metadata.author || config.author}",`,
    `.layout = "${config.layout}",`,
    `.draft = false,`,
    hasCustomFrontmatter?`.custom = {\n${Object.entries(metadata)
      .filter(([k]) => !["title", "date", "author"].includes(k))
      .map(([k, v]) => `  .${k} = "${v}",`)
      .join("\n")}\n},\n---`:"---",
    "",
  ].join("\n");

  return newFrontmatter + body;
}

// 转换 markdown 链接格式
function convertLinks(content) {
  // 转换 {{< ref "filename.md" >}} 格式到相对链接
  content = content.replace(/\{\{<\s*ref\s+"([^"]+\.md)"\s*>\}\}/g, "[$1]($1)");

  // 转换其他可能的 markdown 链接格式
  // 这里可以根据需要添加更多转换规则

  return content;
}

// 处理单个文件
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const convertedContent = convertLinks(convertFrontmatter(content));

    // 创建新的 smd 文件路径
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath, ".md");
    const newPath = path.join(dir, `${basename}.smd`);

    // 写入新文件
    fs.writeFileSync(newPath, convertedContent, "utf8");
    console.log(`✓ Converted: ${filePath} -> ${newPath}`);

    return true;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// 递归处理目录
function processDirectory(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);
    let successCount = 0;
    let totalCount = 0;

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // 递归处理子目录
        const result = processDirectory(fullPath);
        successCount += result.success;
        totalCount += result.total;
      } else if (item.endsWith(".md")) {
        // 处理 markdown 文件
        const success = processFile(fullPath);
        if (success) successCount++;
        totalCount++;
      }
    }

    return { success: successCount, total: totalCount };
  } catch (error) {
    console.error(`✗ Error processing directory ${dirPath}:`, error.message);
    return { success: 0, total: 0 };
  }
}

// 主函数
function main() {
  console.log("🚀 Starting markdown to smd conversion...");
  console.log(`📁 Source directory: ${config.sourceDir}`);
  console.log(`👤 Author: ${config.author}`);
  console.log(`📅 Time: ${config.time}`);
  console.log("");

  if (!fs.existsSync(config.sourceDir)) {
    console.error(`✗ Source directory does not exist: ${config.sourceDir}`);
    process.exit(1);
  }

  const result = processDirectory(config.sourceDir);

  console.log("");
  console.log("📊 Conversion Summary:");
  console.log(
    `✓ Successfully converted: ${result.success}/${result.total} files`
  );

  if (result.success === result.total) {
    console.log("🎉 All files converted successfully!");
  } else {
    console.log("⚠️  Some files failed to convert");
  }
}

// 运行脚本
if (require.main === module) {
  main();
}

module.exports = {
  convertFrontmatter,
  convertLinks,
  processFile,
  processDirectory,
};
