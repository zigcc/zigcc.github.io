---
title: "build.zig.zon 中的依赖项哈希值"
author: Wenxuan Feng
date: 2024-05-07T02:45:10.692Z
---

> 原文地址：[build.zig.zon dependency hashes](https://zig.news/michalsieron/buildzigzon-dependency-hashes-47kj)

# 引言

作者 Michał Sieroń 最近在思考 `build.zig.zon` 中的依赖项哈希值的问题。这些哈希值都有相同的前缀，而这对加密哈希函数来说极其不同寻常。习惯性使用 Conda 和 Yocto 对下载的压缩包运行 sha256sum，但生成的摘要与 `build.zig.zon` 中的哈希值完全不同。

```bash
.dependencies = .{
    .mach_freetype = .{
        .url = "https://pkg.machengine.org/mach-freetype/309be0cf11a2f617d06ee5c5bb1a88d5197d8b46.tar.gz",
        .hash = "1220fcebb0b1a4561f9d116182e30d0a91d2a556dad8564c8f425fd729556dedc7cf",
        .lazy = true,
    },
    .font_assets = .{
        .url = "https://github.com/hexops/font-assets/archive/7977df057e855140a207de49039114f1ab8e6c2d.tar.gz",
        .hash = "12208106eef051bc730bac17c2d10f7e42ea63b579b919480fec86b7c75a620c75d4",
        .lazy = true,
    },
    .mach_gpu_dawn = .{
        .url = "https://pkg.machengine.org/mach-gpu-dawn/cce4d19945ca6102162b0cbbc546648edb38dc41.tar.gz",
        .hash = "1220a6e3f4772fed665bb5b1792cf5cff8ac51af42a57ad8d276e394ae19f310a92e",
}
```

以上摘录取自 [hexops/mach](https://github.com/hexops/mach/blob/bffc66800584123e2844c4bc4b577940806f9088/build.zig.zon#L13-L26) 项目。

# 初步探索

经过一番探索，我找到了一个文档：[doc/build.zig.zon.md](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/doc/build.zig.zon.md)，似乎没有任何线索指向它。而文档中对哈希有段简短的描述。

> - **哈希**
> - 类型为字符串。
> - **[多重哈希](https://multiformats.io/multihash/)**
> 该哈希值是基于一系列文件内容计算得出的，这些文件是在获取URL后并应用了路径规则后得到的。
这个字段是最重要的；一个包是的唯一性是由它的哈希值确定的，不同的 URL 可能对应同一个包。

## 多重哈希
在他们的网站上有一个很好的可视化展示，说明了这一过程: [多重哈希](https://multiformats.io/multihash/)。

![multihash 示意图](/images/zon-multihash.webp)

因此 `build.zig.zon` 中的哈希字段不仅包含了摘要(digest)，还包含了一些元数据(metadata)。但即使我们丢弃了头部信息，得到的结果仍与下载的 `tar` 包的 `sha256` 摘要不相符。而这就涉及到了包含规则的问题。

## 包含规则(inclusion rules)

回到 [doc/build.zig.zon.md](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/doc/build.zig.zon.md) 文件，我们看到：

> 这个计算的 hash 结果是在获取 URL 后，根据应用路径给出的包含规则，然后通过获得的文件目录内容计算出来。

那神秘的包含规则是什么呢？不幸的是，我又没找到这些内容的具体描述。唯一提到这些的地方是在 [ziglang/src/Package/Fetch.zig](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Fetch.zig#L1-L28) 文件的开头，但只能了解到无关文件被过滤后，哈希值是在剩余文件的基础上计算出来的结果。

幸好在代码中快速搜索后，我们找到了负责计算哈希的 `fetch` 任务的 [主函数](https://github.com/ziglang/zig/blob/9d64332a5959b4955fe1a1eac793b48932b4a8a8/src/main.zig#L6865)。

我们看到它调用了 [`runResource`](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Fetch.zig#L478-L485) 函数。路径字段从依赖的 `build.zig.zon` 中读取，并稍后用于创建某种过滤器。

这是我们一直在寻找的过滤器 `filter`。在这个结构的命名空间内定义了一个 `includePath` 函数，而它处理了所有那些包含规则。

```zig
/// sub_path is relative to the package root.
pub fn includePath(self: Filter, sub_path: []const u8) bool {
    if (self.include_paths.count() == 0) return true;
    if (self.include_paths.contains("")) return true;
    if (self.include_paths.contains(".")) return true;
    if (self.include_paths.contains(sub_path)) return true;

    // Check if any included paths are parent directories of sub_path.
    var dirname = sub_path;
    while (std.fs.path.dirname(dirname)) |next_dirname| {
        if (self.include_paths.contains(next_dirname)) return true;
        dirname = next_dirname;
    }

    return false;
}
```

这个函数用于判断 `sub_path` 下的文件是否属于包的一部分。我们可以看到有三种特殊情况，文件会被认为是包的一部分：

1. `include_paths` 为空
2. `include_paths` 中含有空字符串 ""
3. `include_paths` 包含包的根目录 "."

除此之外，这个函数会检查 `sub_path` 是否被明确列出，或者是已明确列出的目录的子目录。

## 计算哈希

现在我们知道了 `build.zig.zon` 的包含规则，也知道使用了 `SHA256` 算法。但我们仍然不知道实际的哈希结果是如何得到的。例如，它可能是通过将所有包含的文件内容输入哈希器来计算的。所以让我们再仔细看看，也许我们可以找到答案。

回到 `runResource` 函数，我们看到它调用了 [`computeHash`](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Fetch.zig#L1324) 函数，这看起来应该是我们感兴趣的主要内容（它顶部的注释已经无人维护，因为这里面会进行[文件删除](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Fetch.zig#L1383-L1385)）。

在其中，我们偶然发现了这段[代码](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Fetch.zig#L1404-L1416)：

```zig
const hashed_file = try arena.create(HashedFile);
hashed_file.* = .{
    .fs_path = fs_path,
    .normalized_path = try normalizePathAlloc(arena, entry_pkg_path),
    .kind = kind,
    .hash = undefined, // to be populated by the worker
    .failure = undefined, // to be populated by the worker
};
wait_group.start();
try thread_pool.spawn(workerHashFile, .{
    root_dir, hashed_file, &wait_group,
});
try all_files.append(hashed_file);
```

这里没有传递任何哈希对象，只传递了项目的根目录和一个指向 `HashedFile` 结构的指针。它有一个专门的 `hash` 字段。先前的猜想似乎不成立，因为哈希值是为单个文件存储的。为了更好地理解这个计算过程，顺着这条新线索看看后续。

跟踪 `workerHashFile`，我们看到它是 `hashFileFallible` 的一个简单包装，而后者看起来相当复杂。让我们来分解一下。

## 单个文件的哈希计算

首先，会进行一些初始化设置，其中创建并用规整后的文件路径初始化了一个新的哈希器实例：

```zig
var buf: [8000]u8 = undefined;
var hasher = Manifest.Hash.init(.{});
hasher.update(hashed_file.normalized_path);
```

然后我们根据我们正在哈希的文件类型进行切换。有两个分支：
- 一个用于常规文件
- 一个用于符号链接

首先来看看常规文件的情况：

```zig
var file = try dir.openFile(hashed_file.fs_path, .{});
defer file.close();
// Hard-coded false executable bit: https://github.com/ziglang/zig/issues/17463
hasher.update(&.{ 0, 0 });
var file_header: FileHeader = .{};
while (true) {
    const bytes_read = try file.read(&buf);
    if (bytes_read == 0) break;
    hasher.update(buf[0..bytes_read]);
    file_header.update(buf[0..bytes_read]);
}
```

首先，打开对应文件文件以便稍后读取其内容，这个符合预期，但紧接着我们放入了两个 null 字节。从阅读 [#17463](https://github.com/ziglang/zig/issues/17463) 来看，这似乎历史原因，为了进行历史兼容。无论如何，之后我们简单地循环读取文件数据的块，并将它们作为数据来计算哈希值。

现在来看看符号链接分支，这个更简单：

```zig
const link_name = try dir.readLink(hashed_file.fs_path, &buf);
if (fs.path.sep != canonical_sep) {
    // Package hashes are intended to be consistent across
    // platforms which means we must normalize path separators
    // inside symlinks.
    normalizePath(link_name);
}
hasher.update(link_name);
```

首先进行路径分隔符的规整，保证不同平台一致，之后将符号链接的目标路径输入 `hasher`。在 `hashFileFallible` 函数最后，把计算出的哈希值赋值给 `HashedFile` 对象的 `hash` 字段。

## 组合哈希
尽管有了单个文件的哈希值，但我们仍不知道如何得到最终的哈希。幸运的是，曙光就在眼前。

下一步是确保我们有可复现的结果。 `HashedFile` 对象被存储在一个数组中，但文件系统遍历算法可能会改变，所以我们需要对那个数组进行排序。

```zig
std.mem.sortUnstable(*HashedFile, all_files.items, {}, HashedFile.lessThan);
```

最后，我们到达了将所有这些哈希[组合成一个的地方](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Fetch.zig#L1452-L1464)：

```zig
var hasher = Manifest.Hash.init(.{});
var any_failures = false;
for (all_files.items) |hashed_file| {
    hashed_file.failure catch |err| {
        any_failures = true;
        try eb.addRootErrorMessage(.{
            .msg = try eb.printString("unable to hash '{s}': {s}", .{
                hashed_file.fs_path, @errorName(err),
            }),
        });
    };
    hasher.update(&hashed_file.hash);
}
```

在这里我们看到所有计算出的哈希被一个接一个地输入到一个新的哈希器中。在 `computeHash` 的最后，我们返回 `hasher.finalResult()`，现在我们明白哈希值是如何获得的了。

## 最终多哈希值

现在我们有了一个 `SHA256` 摘要，可以最终返回到 `main.zig`，在那里我们调用 [`Package.Manifest.hexDigest(fetch.actual_hash)`](https://github.com/ziglang/zig/blob/9d64332a5959b4955fe1a1eac793b48932b4a8a8/src/Package/Manifest.zig#L174)。在那里，我们将多哈希头写入缓冲区，之后是我们的组合摘要。

顺便说一下，我们看到所有哈希头都是 `1220` 并非巧合。这是因为 `Zig` [硬编码了 SHA256](https://github.com/ziglang/zig/blob/1a6485d111d270014f57c46c53597a516a24dc47/src/Package/Manifest.zig#L3) - 0x12，它有 32 字节的摘要 - 0x20。

# 总结

总结一下：最终哈希值是一个多哈希头 + `SHA256` 摘要。

这些摘要是包文件里的部分文件的 `SHA256` 摘要。这些摘要根据文件路径排序，并且对于普通文件和符号链接的计算方式不同。

这整个调查实际上是我尝试编写一个输出与 Zig 相同哈希的 shell 脚本的结果。如果你感兴趣，可以在这里阅读它：https://gist.github.com/michalsieron/a07da4216d6c5e69b32f2993c61af1b7。

在实验这个之后，我有一个想法，我很惊讶 Zig 没有检查 `build.zig.zon` 中列出的所有文件是否存在。但这可能是另一天的话题了。

# 译者注

在使用本地包时，可以使用下面的命令进行 hash 问题的排查：
```bash
 (main)$ zig fetch --debug-hash .
file: 001f530a93f06d8ad8339ec2f60f17ff9ff0ae29ceaed36942a8bc96ba9d7e26: LICENSE
file: ba267af6281ec7b52f90357cdf280e2bf974a0b493314705f18983d4fb818e90: build.zig
file: b2f7c2d2571a10f289112dbb16599ff88cc9709a7492fe42b76da92b9420ab18: build.zig.zon
file: 614020c9dc5abae8a2a0943030a4e1ddd1ab74a5b40e78896a9db24a353338e1: libs/.DS_Store
file: 673fd9dc257504fab812c8a7e79ec0cc90f83d426392dc8f1b990149db06e95f: libs/curl.zig
file: ebdf40a5c1308661cbaf1d69c3caf439f848e9a506029474f4e4f361e36fc836: libs/mbedtls.zig
file: e4e3a40d8e9670984f387936fcdeb9a2cbe86ee70ab898ba3837d922e5c14125: libs/zlib.zig
file: 6ba4206baa82168198e7c869ce01f002ee7e3cd67c200f5c603fa9c17201333f: src/Easy.zig
file: aabb5cedf021c6c7720103dd5e5a2088eeff36823a0ac3303fb965ca16012a8c: src/Multi.zig
file: 5f254a82524e9d625f7cf2ee80a601da642466d9e7ff764afad480529f51222a: src/errors.zig
file: a77c3ca16664533409c4618f54a43f9039427431894d09b03490a91a10864a4c: src/root.zig
file: 7b398ebd7ddb3ae30ff1ff1010445b3ed1f252db46608b6a6bd9aace233bc1a4: src/util.zig
1220110dc58ece4168ae3b2a0863c8676f8842bbbac763ad30e6ed1e2b68d973d615
```

此外，社区已经有人把 multihash 的算法实现独立成一个单独的包，便于计算一个包的 hash 值：
- https://github.com/Calder-Ty/multihash
