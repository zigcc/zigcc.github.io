---
title: 如何贡献
type: docs
---

Zig 中文社区是一个开放的组织，我们致力于推广 Zig 在中文群体中的使用，有多种方式可以参与进来：

1. 供稿，分享自己使用 Zig 的心得，方式见下文
2. 改进 zigcc 组织下的开源项目，这是 [open issues](https://github.com/search?q=state%3Aopen+org%3Azigcc++NOT+%E6%97%A5%E6%8A%A5&type=issues&ref=advsearch)
3. 参与不定期的[线上会议](/post/news/)

# 供稿方式

1. Fork 仓库 https://github.com/zigcc/zigcc.github.io
2. 在 `content/post` 内添加自己的文章（md 或 org 格式均可），文件命名为： `${YYYY}-${MM}-${DD}-${SLUG}.md`
3. 文件开始需要包含一些描述信息，例如：

```plain
---
title: 欢迎 Zig 爱好者向本网站供稿
author: 刘家财
date: '2023-09-05T16:13:13+0800'
---
```

## 本地预览

在写完文章后，可以使用 [Hugo](https://gohugo.io/) 进行本地预览，只需在项目根目录执行 `hugo server`，这会启动一个 HTTP 服务，默认的访问地址是： http://localhost:1313/

## 发布平台

- [ZigCC 网站](https://ziglang.cc)
- [ZigCC 公众号](https://github.com/zigcc/.github/raw/main/zig_mp.png)
