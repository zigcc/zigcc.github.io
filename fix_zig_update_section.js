const fs = require('fs');
const path = require('path');

const MONTHLY_DIR = path.join(__dirname, 'content', 'monthly');

// 更宽松地匹配 Zig 语言更新 section 标题（允许不同空格、section id、大小写）
const zigUpdateSectionRegex = /^(#+) \[Zig[ 　]*语言更新\]\(\$section\.id\(['"]?[^'")]+['"]?\)\)[\s\S]*?(?=^#|\n{2,}|\n*$)/gim;
// 匹配 github 链接和日期区间
const githubLinkRegex = /(https:\/\/github\.com\/ziglang\/zig\/pulls\?[^)]*closed%3A(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2}))/i;

function fixZigUpdateSection(content) {
  // 找到所有 Zig 语言更新 section
  return content.replace(zigUpdateSectionRegex, (sectionBlock, hashes) => {
    // 在 sectionBlock 内查找 github 链接
    const linkMatch = sectionBlock.match(githubLinkRegex);
    if (!linkMatch) return sectionBlock; // 没有链接则不处理
    const url = linkMatch[1];
    const date1 = linkMatch[2];
    const date2 = linkMatch[3];
    // 构造新格式
    return `${hashes} [Zig 语言更新]($section.id('zig-update'))\n[${date1}..${date2}](${url})`;
  });
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const newContent = fixZigUpdateSection(content);
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed Zig 语言更新 in:', path.basename(filePath));
  }
}

function main() {
  const files = fs.readdirSync(MONTHLY_DIR).filter(f => f.endsWith('.smd'));
  for (const file of files) {
    processFile(path.join(MONTHLY_DIR, file));
  }
}

if (require.main === module) {
  main();
} 