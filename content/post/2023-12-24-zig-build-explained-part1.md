---
title: zig 构建系统解析 - 第一部分
author: Reco
date: "2023-12-24T19:15:02+0800"
---
原文链接： https://zig.news/xq/zig-build-explained-part-1-59lf
# zig 构建系统解析 - 第一部分

Zig 构建系统仍然缺少文档，对很多人来说，这是不使用它的致命理由。还有一些人经常寻找构建项目的秘诀，但也在与构建系统作斗争。

本系列试图深入介绍构建系统及其使用方法。

我们将从一个刚刚初始化的 Zig 项目开始，逐步深入到更复杂的项目。在此过程中，我们将学习如何使用库和软件包、添加 C 代码，甚至如何创建自己的构建步骤。

## 免责声明

由于我不会解释 Zig 语言的语法或语义，因此我希望你至少已经有了一些使用 Zig 的基本经验。我还将链接到标准库源代码中的几个要点，以便您了解所有这些内容的来源。我建议你阅读编译系统的源代码，因为如果你开始挖掘编译脚本中的函数，大部分内容都不言自明。所有功能都是在标准库中实现的，不存在隐藏的构建魔法。

## 开始

我们通过新建一个文件夹来创建一个新项目，并在该文件夹中调用 zig init-exe。

这将生成如下 build.zig 文件（我去掉了注释）

    // -代码块编号@1.1

    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "test",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
        const unit_tests = b.addTest(.{
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });

        const run_unit_tests = b.addRunArtifact(unit_tests);
        const test_step = b.step("test", "Run unit tests");
        test_step.dependOn(&run_unit_tests.step);
    }

## 基础知识

构建系统的核心理念是，Zig 工具链将编译一个 Zig 程序 (build.zig)，该程序将导出一个特殊的入口点（`pub fn build(b: *std.build.Builder) void`），当我们调用 zig build 时，该入口点将被调用。

然后，该函数将创建一个由 std.build.Step 节点组成的有向无环图，其中每个步骤都将执行构建过程的一部分。

每个步骤都有一组依赖关系，这些依赖关系需要在步骤本身完成之前完成。作为用户，我们可以通过调用 zig build step-name 来调用某些已命名的步骤，或者使用其中一个预定义的步骤（例如 install）。

要创建这样一个步骤，我们需要调用 Builder.step

    // -代码块编号@1.2：
    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const named_step = b.step("step-name", "This is what is shown in help");
        _ = named_step;
    }

这将为我们创建一个新的步骤 step-name，当我们调用 zig build --help 时将显示该步骤：

    $ zig build --help
    使用方法： zig build [steps] [options］

    Steps:
    install (default)           Copy build artifacts to prefix path
    uninstall                   Remove build artifacts from prefix path
    step-name                   This is what is shown in help

    General Options:
    ...

请注意，除了在 zig build --help 中添加一个小条目并允许我们调用 zig build step-name 之外，这个步骤仍然没有任何作用。

Step 遵循与 std.mem.Allocator 相同的接口模式，需要实现一个 make 函数。步骤创建时将调用该函数。对于我们在这里创建的步骤，该函数什么也不做。

现在，我们需要创建一个漂亮的 Zig 程序：

## 编译 Zig 源代码

要使用编译系统编译可执行文件，编译器需要使用函数 Builder.addExecutable，它将为我们创建一个新的 LibExeObjStep。这个步骤实现是 zig build-exe、zig build-lib、zig build-obj 或 zig test 的便捷封装，具体取决于初始化方式。本文稍后将对此进行详细介绍。

现在，让我们创建一个步骤来编译我们的 src/main.zig 文件（之前由 zig init-exe 创建）

    // 。代码块编号1.3：

    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const exe = b.addExecutable(.{.name = "fresh",.root_source_file = .{ .path = "src/main.zig" },});
        const compile_step = b.step("compile", "Compiles src/main.zig");
        compile_step.dependOn(&exe.step);
    }

我们在这里添加了几行。首先，const exe = b.addExecutable 将创建一个新的 LibExeObjStep，将 src/main.zig 编译成一个名为 fresh 的文件（或 Windows 上的 fresh.exe）。

第二个添加的内容是 compile_step.dependOn(&exe.step);。这就是我们构建依赖关系图的方法，并声明当编译\_step 生成时，exe 也需要生成。

你可以调用 zig build，然后再调用 zig build compile 来验证这一点。第一次调用不会做任何事情，但第二次调用会输出一些编译信息。

这将始终在当前机器的调试模式下编译，因此对于初学者来说，这可能就足够了。但如果你想开始发布你的项目，你可能需要启用交叉编译：

## 交叉编译

交叉编译是通过设置程序的目标和编译模式来实现的

    // 。代码块编号1.4：

    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const exe = b.addExecutable(.{
            .name = "fresh",
            .root_source_file = .{ .path = "src/main.zig" },
            .optimize = .ReleaseSafe,
        });
        const compile_step = b.step("compile", "Compiles src/main.zig");
        compile_step.dependOn(&exe.step);
    }

在这里，`.optimize = .ReleaseSafe`, 将向编译调用传递 -O ReleaseSafe。但是！LibExeObjStep.setTarget 需要一个 std.zig.CrossTarget 作为参数，而你通常希望这个参数是可配置的。

幸运的是，构建系统为此提供了两个方便的函数：

    Builder.standardReleaseOptions
    Builder.standardTargetOptions

使用这些函数，可以将编译模式和目标作为命令行选项：

    const std = @import("std");

    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "fresh",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        const compile_step = b.step("compile", "Compiles src/main.zig");
        compile_step.dependOn(&exe.step);
    }

现在，如果你调用 zig build --help 命令，就会在输出中看到以下部分，而之前这部分是空的：

    Project-Specific Options:
    -Dtarget=[string]            The CPU architecture, OS, and ABI to build for
    -Dcpu=[string]               Target CPU features to add or subtract
    -Doptimize=[enum]            Prioritize performance, safety, or binary size (-O flag)
                                    Supported Values:
                                    Debug
                                    ReleaseSafe
                                    ReleaseFast
                                    ReleaseSmall

前两个选项由 standardTargetOptions 添加，其他选项由 standardOptimizeOption 添加。现在，我们可以在调用构建脚本时使用这些选项：

    zig build -Dtarget=x86_64-windows-gnu -Dcpu=athlon_fx
    zig build -Doptimize=ReleaseSafe
    zig build -Doptimize=ReleaseSmall

可以看到，对于布尔选项，我们可以省略 =true，直接设置选项本身。

但我们仍然必须调用 zig build 编译，因为默认调用仍然没有任何作用。让我们改变一下！

## 安装工件

要安装任何东西，我们必须让它依赖于构建器的安装步骤。该步骤是已创建的，可通过 Builder.getInstallStep() 访问。我们还需要创建一个新的 InstallArtifactStep，将我们的 exe 工件复制到安装目录（通常是 zig-out）

    // 。代码块编号1.5：

    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "fresh",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        const install_exe = b.addInstallArtifact(exe, .{});
        b.getInstallStep().dependOn(&install_exe.step);
    }

这将做几件事：

1. 创建一个新的 InstallArtifactStep，将 exe 的编译结果复制到 $prefix/bin 中。
2. 由于 InstallArtifactStep（隐含地）依赖于 exe，因此它也将编译 exe
3. 当我们调用 zig build install（或简称 zig build）时，它将创建 InstallArtifactStep。
4. InstallArtifactStep 会将 exe 的输出文件注册到一个列表中，以便再次卸载它

现在，当你调用 zig build 时，你会看到一个新的目录 zig-out 被创建了.看起来有点像这样：

    zig-out
    └── bin
        └── fresh

现在运行 ./zig-out/bin/fresh，就能看到这条漂亮的信息：

    info: All your codebase are belong to us.

或者，你也可以通过调用 zig build uninstall 再次卸载。这将删除 zig build install 创建的所有文件，但不会删除目录！

由于安装过程是一个非常普通的操作，它有快捷方法，以缩短代码。

    // 。代码块编号1.6：

    const std = @import("std");

    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "fresh",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(exe);
    }

如果你在项目中内置了多个应用程序，你可能会想创建几个单独的安装步骤，并手动依赖它们，而不是直接调用 b.installArtifact(exe);，但通常这样做是正确的。

请注意，我们还可以使用 Builder.installFile（或其他，有很多变体）和 Builder.installDirectory 安装任何其他文件。

现在，从理解初始构建脚本到完全扩展，还缺少一个部分：

## 运行已构建的应用程序

为了开发用户体验和一般便利性，从构建脚本中直接运行程序是非常实用的。这通常是通过运行步骤实现的，可以通过 zig build run 调用。

为此，我们需要一个 RunStep，它将执行我们能在系统上运行的任何可执行文件

    // 代码块编号1.7

    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "fresh",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

RunStep 有几个函数可以为执行进程的 argv 添加值：

addArg 将向 argv 添加一个字符串参数。
addArgs 将同时添加多个字符串参数
addArtifactArg 将向 argv 添加 LibExeObjStep 的结果文件
addFileSourceArg 会将其他步骤生成的任何文件添加到 argv。

请注意，第一个参数必须是我们要运行的可执行文件的路径。在本例中，我们要运行 exe 的编译输出。

现在，当我们调用 zig build run 时，我们将看到与自己运行已安装的 exe 相同的输出：

    info: All your codebase are belong to us.

请注意，这里有一个重要的区别： 使用 RunStep 时，我们从 ./zig-cache/.../fresh 而不是 zig-out/bin/fresh 运行可执行文件！如果你加载的文件相对于可执行路径，这一点可能很重要。

RunStep 的配置非常灵活，可以通过 stdin 向进程传递数据，也可以通过 stdout 和 stderr 验证输出。你还可以更改工作目录或环境变量。

对了，还有一件事：

如果你想从 zig 编译命令行向进程传递参数，可以通过访问 Builder.args 来实现

    // 。代码块编号1.8：

    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
         const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "fresh",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

这样就可以在 cli 上的 -- 后面传递参数：

    zig build run -- -o foo.bin foo.asm

## 结论

本系列的第一章应该能让你完全理解本文开头的构建脚本，并能创建自己的构建脚本。

大多数项目甚至只需要编译、安装和运行一些 Zig 可执行文件，所以你就可以开始了！

下一部分我将介绍如何构建 C 和 C++ 项目。
