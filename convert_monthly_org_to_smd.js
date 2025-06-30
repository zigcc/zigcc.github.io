#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const MONTHLY_DIR = path.join(__dirname, 'content', 'monthly');

// 匹配 org 标题
const orgHeadingRegex = /^(\*{1,4})\s+(.+)$/gm;
// 匹配 org 头部
const titleRegex = /^#\+TITLE:\s*(.+)$/m;
const dateRegex = /^#\+DATE:\s*(.+)$/m;
const lastmodRegex = /^#\+LASTMOD:\s*(.+)$/m;

// 其他 org->md 转换规则
function orgToSmd(text) {
  // 代码块
  text = text.replace(/#\+begin_src\s+(\w+)/g, '```$1');
  text = text.replace(/#\+end_src/g, '```');
  // 引用块
  text = text.replace(/#\+begin_quote/g, '>');
  text = text.replace(/#\+end_quote/g, '');
  // 行内代码
  text = text.replace(/=([^=\n]+)=/g, '`$1`');
  // 链接 [[url][desc]]
  text = text.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, '[$2]($1)');
  // 链接 [[url]]
  text = text.replace(/\[\[([^\]]+)\]\]/g, '<$1>');
  // 图片 [[file:xxx.png]]
  text = text.replace(/\[\[file:([^\]]+)\]\]/g, '![]($1)');
  // 处理 org 标题为 # [标题]($section.id('标题'))
  text = text.replace(orgHeadingRegex, (match, stars, title) => {
    const level = stars.length;
    // 去除标题前后的空格和特殊符号
    const cleanTitle = title.trim().replace(/'/g, "\\'");
    return `${'#'.repeat(level)} [${title}]($section.id('${cleanTitle}'))`;
  });
  // 去除多余 org 宏
  text = text.replace(/^#\+\w+:.*$/gm, '');
  return text;
}

function updateFrontmatter(content, title, date, lastmod) {
  // 提取 frontmatter
  const fmMatch = content.match(/^---[\s\S]*?---/);
  let fm = fmMatch ? fmMatch[0] : '';
  let rest = content.replace(/^---[\s\S]*?---/, '').trimStart();

  // 更新 .title
  if (title) {
    fm = fm.replace(/(\.title\s*=\s*)"[^"]*"/, `$1"${title}"`);
  }
  // 更新 .date
  if (date) {
    fm = fm.replace(/(\.date\s*=\s*)@date\("[^"]*"\)/, `$1@date("${date}")`);
  }
  // 更新/添加 .custom
  if (lastmod) {
    if (/\.custom\s*=/.test(fm)) {
      fm = fm.replace(/(\.custom\s*=\s*\{)[^}]*\}/, `$1 .lastmod = "${lastmod}" }`);
    } else {
      fm = fm.replace(/---\s*$/, `.custom = { .lastmod = "${lastmod}" },\n---`);
    }
  }
  return fm + '\n\n' + rest;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // 提取 org 头部
  const titleMatch = content.match(titleRegex);
  const dateMatch = content.match(dateRegex);
  const lastmodMatch = content.match(lastmodRegex);
  const orgTitle = titleMatch ? titleMatch[1].trim() : '';
  const orgDate = dateMatch ? dateMatch[1].trim() : '';
  const orgLastmod = lastmodMatch ? lastmodMatch[1].trim() : '';

  // 合并 frontmatter
  let newContent = updateFrontmatter(
    content,
    orgTitle || undefined,
    orgDate || undefined,
    orgLastmod || undefined
  );
  // 转换正文 org->smd
  newContent = orgToSmd(newContent);
  // 清理多余空行
  newContent = newContent.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('Processed:', path.basename(filePath));
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

module.exports = {
  orgToSmd,
  updateFrontmatter,
  processFile
}; 