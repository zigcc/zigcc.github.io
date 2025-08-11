import * as fs from 'fs/promises';
import * as path from 'path';
import * as tencentcloud from 'tencentcloud-sdk-nodejs';

// 腾讯云 TMT 客户端
const TmtClient = tencentcloud.tmt.v20180321.Client;

// 配置腾讯云凭证
const clientConfig = {
  credential: {
    secretId: process.env.TENCENT_SECRET_ID || 'YOUR_SECRET_ID', // 替换为您的 SecretId
    secretKey: process.env.TENCENT_SECRET_KEY || 'YOUR_SECRET_KEY', // 替换为您的 SecretKey
  },
  region: 'ap-guangzhou', // 选择合适的区域，例如广州
  profile: {
    httpProfile: {
      endpoint: 'tmt.tencentcloudapi.com',
    },
  },
};

// 初始化 TMT 客户端
const client = new TmtClient(clientConfig);

// 翻译接口：使用腾讯云 TMT 批量翻译 API
async function translateToEnglish(texts: string[]): Promise<string[]> {
  try {
    const params = {
      SourceTextList: texts,
      Source: 'zh',
      Target: 'en',
      ProjectId: 0, // 替换为您的项目 ID（通常为 0 即可）
    };

    const response = await client.TextTranslateBatch(params);
    return response.TargetTextList || texts; // 翻译失败时返回原文本
  } catch (error) {
    console.error(`Batch translation error for texts:`, error);
    return texts; // 翻译失败时返回原文本
  }
}

// 检查是否为中文
function isChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

// 检查 ID 是否符合规范（只包含小写字母、数字和连字符）
function isValidIdFormat(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

// 格式化 ID：转换为小写，用连字符替换空格，移除特殊字符
function formatId(id: string): string {
  return id
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// 处理单个文件
async function processFile(filePath: string): Promise<void> {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    const headingIdRegex = /heading\.id\(['"](.*?)['"]\)/g;
    const matches = [...content.matchAll(headingIdRegex)];
    const chineseIds: string[] = [];
    const idMap: { [original: string]: string } = {};
    let modified = false;

    // 收集需要翻译的中文 ID 和需要格式化的英文 ID
    for (const match of matches) {
      const id = match[1];
      if (isChinese(id) || !isValidIdFormat(id)) {
        if (isChinese(id)) {
          chineseIds.push(id);
        }
        idMap[id] = match[0]; // 存储原始匹配字符串
      }
    }

    if (Object.keys(idMap).length > 0) {
      // 批量翻译中文 ID
      const translatedIds = chineseIds.length > 0 ? await translateToEnglish(chineseIds) : [];

      // 替换所有不符合规范的 ID
      for (const originalId of Object.keys(idMap)) {
        let formattedId: string;
        if (isChinese(originalId)) {
          // 中文 ID：使用翻译结果
          const index = chineseIds.indexOf(originalId);
          const translated = translatedIds[index] || originalId; // 回退到原文本
          formattedId = formatId(translated);
        } else {
          // 英文 ID：直接格式化
          formattedId = formatId(originalId);
        }
        content = content.replace(idMap[originalId], `heading.id('${formattedId}')`);
        modified = true;
      }

      if (modified) {
        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`Processed: ${filePath}`);
      }
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

// 处理目录
async function processDirectory(dirPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await processDirectory(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.smd'))) {
        await processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

// 主函数
async function main(): Promise<void> {
  const targetPath = process.argv[2];
  
  if (!targetPath) {
    console.error('Please provide a file or directory path');
    process.exit(1);
  }

  try {
    const stats = await fs.stat(targetPath);
    if (stats.isDirectory()) {
      await processDirectory(targetPath);
    } else {
      await processFile(targetPath);
    }
    console.log('Processing completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();