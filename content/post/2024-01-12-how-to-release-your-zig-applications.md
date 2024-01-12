---
title: 如何发布 Zig 应用程序
author: Rui Chen
date: "2024-01-12T12:04:50-0500"
---

> - 原文链接： https://zig.news/kristoff/how-to-release-your-zig-applications-2h90
> - API 适配到 Zig 0.11.0 版本

你刚用 Zig 写了一个应用程序，并希望其他人使用它。
让用户方便使用的一种方式是为他们提供应用程序的预构建可执行文件。
接下来，我将讨论一个好的发版所需要正确处理的两个主要事项。

# 为什么提供预构建的可执行文件？

鉴于 C/C++ 依赖系统如何工作（或者说 _不工作_），对于某些 C/C++ 项目来说，
提供预构建的可执行文件几乎是强制性的，
否则，普通人将陷入构建系统和配置系统的泥潭，
而这些系统的数量还要乘以项目的依赖数量。
使用 Zig 的话就不应该这样，因为 Zig 构建系统（加上即将推出的 Zig 包管理器）将能够处理一切，这意味着大多数编写良好的应用程序应该只需运行 `zig build` 即可成功构建。

话虽如此，你的应用程序越受欢迎，用户就越不关心它是用哪种语言编写的。
你的用户不想安装 Zig 并运行构建过程就能轻松使用应用程序（99%的情况下，稍后会讲到剩下的 1%），
因此最好还是预先构建你的应用程序。

# `zig build` vs `zig build-exe`

在本文中，我们将看到如何为 Zig 项目制作、发布构建，
因此值得花一点时间来完全理解 Zig 构建系统和命令行之间的关系。

如果你有一个非常简单的 Zig 应用程序（例如，单个文件，无任何依赖），
构建项目最简单的方式是使用 `zig build-exe myapp.zig`，
这会在当前路径下创建一个可执行文件。

随着项目的增长，特别是开始有依赖之后，你可能想添加一个 `build.zig` 文件，
并开始用到 Zig 构建系统。一旦你开始这么做，你就可以完全控制命令行参数来影响构建过程。

你可以使用 `zig init-exe` 来了解基线 `build.zig` 文件的样子。
请注意，文件中的每一行代码都是显示定义，从而影响 `zig build` 子命令的行为。

最后一点需要注意的是，尽管使用 `zig build` 和 `zig build-exe` 时命令行参数会有所不同，
但在构建 Zig 代码方面，两者是等价的。更具体地说，尽管 Zig 构建可以调用任意命令，
并做其他可能根本与 Zig 代码无关的事情，但在构建 Zig 代码方面，
`zig build` 所做的一切就是为 `build-exe` 准备命令行参数。
这意味着，在编译 Zig 代码方面，`zig build`（假定 `build.zig` 中的代码是正确的）
和 `zig build-exe` 之间是一一对应关系。唯一的区别只是便利性。

# 构建模式

使用 `zig build` 或 `zig build-exe myapp.zig` 构建一个 Zig 项目时，
默认得到是一个调试构建的可执行文件。调试构建主要是为了开发方便，因而，通常被认为不适合发版。
调试构建旨在牺牲运行性能（运行更慢）来提高构建速度（编译更快），
不久， Zig 编译器将通过引入增量编译和就地二进制补丁（in-place binary patching）
来让这种权衡变得更加明显。

Zig 目前有三种主要的发版构建模式：`ReleaseSafe`、`ReleaseFast` 和 `ReleaseSmall`。

`ReleaseSafe` 应被视为发版时使用的主要模式：尽管使用了优化，
但仍保留了某些安全检查（例如，溢出和数组越界），
这些检查绝对值得额外开销，特别是处理棘手的输入源时（例如，互联网）。

`ReleaseFast` 旨在用于性能是主要关注点的软件，
例如视频游戏。这种构建模式不仅禁用了上述安全检查，
而且为了进行更激进的优化，它还假设代码中不存在这类编程错误。

`ReleaseSmall` 类似于 `ReleaseFast`（即，没有安全检查），
但它不是优先考虑性能，而是尝试最小化可执行文件大小。
例如，这是一种对于 WebAssembly 来说非常有意义的构建模式，
因为你希望可执行文件尽可能小，而沙箱运行环境已经提供了很多安全保障。

# 如何设置构建模式

使用 `zig build-exe` 时，你可以添加 `-O ReleaseSafe`
（或 `ReleaseFast`，或 `ReleaseSmall`）以获得相应的构建模式。

使用 `zig build` 时，取决于构建脚本的配置。默认构建脚本将包含以下代码行：

```zig
// Standard release options allow the person running `zig build` to select
// between Debug, ReleaseSafe, ReleaseFast, and ReleaseSmall.
const mode = b.standardReleaseOptions();

// ...
exe.setBuildMode(mode);
```

这是你在命令行中指定发布模式的方式：`zig build -Drelease-safe`（或
`-Drelease-fast`，或 `-Drelease-small`）。

# 选择正确的构建目标

现在，我们已经选择了正确的发版模式，是时候考虑构建目标了。
显而易见，如果使用的平台和构建平台不相同时，需要指定相应的构建目标，
但即使只打算为同一平台发版，也还是需要注意。

为了方便起见，假定你用的是 Windows 10，并试图为使用 Windows 10 的朋友构建可执行文件。
最想当然的方式是直接调用 `zig build` 或 `zig build-exe`（参见前文关于两个命令之间的差异与相似之处），然后将生成的可执行文件发送给你的朋友。

如果这样做，有时它会工作，但有时它会因`非法指令`（或类似错误）而崩溃。这到底发生了什么？

# CPU 特性

在构建时如果不指定构建目标，Zig 将面向当前的机器进行构建优化，
这意味着将利用当前 CPU 支持的所有指令集。如果 CPU 支持 AVX 扩展，
那么 Zig 将使用它来执行 SIMD 操作。但不幸的是，
这也意味着，如果你朋友的 CPU 没有 AVX 扩展，那么应用程序将崩溃，
因为这个可执行文件确实包含非法指令。

解决这个问题最简单的方法是：始终在进行发布时指定一个构建目标。
没错，如果你指定你想要为 `x86-64-linux` 构建，
Zig 将假设一个与家族中所有 CPU 完全兼容的基线 CPU。

如果你想微调指令集的选择，你可以查看 `zig build` 的 `-Dcpu` 和 `zig build-exe` 的
`-mcpu`。我不会在这篇文章中更多地涉及这些细节。

实操中，下面的命令行将是你为 Arm macOS 发版时会用到的构建命令：

```zig
$ zig build -Dtarget=aarch64-macos
$ zig build-exe myapp.zig -target aarch64-macos
```

请注意，目前在使用 `zig build` 时 `=` 是必需的，
而在使用 `build-exe` 时它不起作用（即你必须在 `-target` 及其值之间放一个空格）。
希望这些怪异的地方在不久将来会得到清理。

其它一些相关的构建目标：

```zig
x86-64-linux // uses musl libc
x86-64-linux-gnu // uses glibc
x86-64-windows // uses MingW headers
x86-64-windows-msvc // uses MSVC headers but they need to be present in your system
wasm32-freestanding // you will have to use build-obj since wasm modules are not full exes
```

你可以通过调用 `zig targets` 看到 Zig 支持的目标 CPU 和
操作系统（以及 libc 和指令集）的完整列表。温馨提示：这是一个很长的列表。

最后，别忘了 `build.zig` 里的一切都必须明确定义，因此目标选项能以以下行的方式工作：

```zig
// Standard target options allows the person running `zig build` to choose
// what target to build for. Here we do not override the defaults, which
// means any target is allowed, and the default is native. Other options
// for restricting supported target set are available.
const target = b.standardTargetOptions(.{});

// ...
exe.setTarget(target);
```

这也意味着如果你想添加其他限制或以某种方式改变构建时应该如何指定目标，
你可以通过添加自己的代码来实现。

# 结束语

现在你已经了解了在进行发布构建时需要确保正确的事项：选择一个发布优化模式并选择正确的构建目标，
包括为你正在构建的同一系统进行发版构建。

这最后一点的一个有趣含义是，对于你的一些用户（通常情况下为 1%，乐观估计），
从头开始构建程序实际上更为可取，以确保他们充分利用其 CPU 的能力。
