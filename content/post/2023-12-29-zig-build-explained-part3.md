---
title: zig 构建系统解析 - 第三部分
author: Reco
date: "2023-12-29T19:15:02+0800"
---
# zig build explained - part3

注释
从现在起，我将只提供一个最小的 build.zig，说明解决一个问题所需的文件。如果你想了解如何将所有这些文件粘合到一个漂亮舒适的构建文件中，请阅读第一篇文章。

复合项目
有很多简单的项目只包含一个可执行文件。但是，一旦开始编写库，就必须对其进行测试，通常会编写一个或多个示例应用程序。当人们开始使用外部软件包、C 语言库、生成代码等时，复杂性也会随之上升。

本文试图涵盖所有这些用例，并将解释如何使用 build.zig 来编写多个程序和库。

## 软件包

译者：此处代码和说明，需要zig build-exe --pkg-begin，但是在0.11已经失效。所以删除。

## 库

但 Zig 也知道库这个词。但我们不是已经讨论过外部库了吗？

在 Zig 的世界里，库是一个预编译的静态或动态库，就像在 C/C++ 的世界里一样。库通常包含头文件（.h 或 .zig）和二进制文件（通常为 .a、.lib、.so 或 .dll）。

这种库的常见例子是 zlib 或 SDL。

与软件包相反，链接库的方式有两种

- (静态库）在命令行中传递文件名
- (动态库）使用 -L 将库的文件夹添加到搜索路径中，然后使用 -l 进行实际链接。

在 Zig 中，我们需要导入库的头文件，如果头文件在 Zig 中，则使用包，如果是 C 语言头文件，则使用 @cImport。

## 工具

如果我们的项目越来越多，那么在构建过程中就需要使用工具。这些工具通常会完成以下任务：

生成一些代码（如解析器生成器、序列化器或库头文件）
捆绑应用程序（例如生成 APK、捆绑应用程序......）。
创建资产包
...
有了 Zig，我们不仅能在构建过程中利用现有工具，还能为当前主机编译我们自己（甚至外部）的工具并运行它们。

但我们如何在 build.zig 中完成这些工作呢？

## 添加软件包

添加软件包通常使用 LibExeObjStep 上的 addPackage 函数。该函数使用一个 std.build.Pkg 结构来描述软件包的外观：

    pub const Module = struct {
        builder: *Build,
        source_file: LazyPath,
        dependencies: std.StringArrayHashMap(*Module),
    };

我们可以看到，它有2个成员：

    source_file 是定义软件包根文件的 FileSource。这通常只是指向文件的路径，如 vendor/zig-args/args.zig
    dependencies 是该软件包所需的可选软件包片段。如果我们使用更复杂的软件包，这通常是必需的。

这是个人建议：我通常会在 build.zig 的顶部创建一个名为 pkgs 的结构/名称空间，看起来有点像这样：

        const args =  b.createModule(.{
            .source_file = .{ .path = "libs/args/args.zig" },
            .dependencies = &.{},
        });

        const interface = b.createModule(.{
            .source_file = .{ .path = "libs/interface.zig/interface.zig" },
            .dependencies = &.{},
        });

        const lola = b.createModule(.{
            .source_file = .{ .path = "src/library/main.zig" },
            .dependencies = &.{},
        });
        const pkgs = .{
            .args = args,

            .interface = interface,

            .lola = lola,
        };

随后通过编译步骤exe，把模块加入进来。函数addModule的第一个参数name 是模块名称

        exe.addModule("lola",pkgs.lola);
        exe.addModule("args",pkgs.args);

## 添加库

添加库相对容易，但我们需要配置更多的路径。

注：在上一篇文章中，我们已经介绍了大部分内容，但现在还是让我们快速复习一遍：

假设我们要将 libcurl 链接到我们的项目，因为我们要下载一些文件。

### 系统库

对于 unixoid 系统，我们通常可以使用系统软件包管理器来链接系统库。方法是调用 linkSystemLibrary，它会使用 pkg-config 自行找出所有路径：

    //demo 3.2
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .root_source_file = .{ .path = "main.zig" },
            .target = target,
            .optimize = optimize,
        });
        exe.linkLibC();
        exe.linkSystemLibrary("curl");
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

对于 Linux 系统，这是链接外部库的首选方式。

### 本地库

不过，您也可以链接您作为二进制文件提供商的库。为此，我们需要调用几个函数。首先，让我们来看看这样一个库是什么样子的：

    ./vendor/libcurl
    include
    │ └── curl
    │ ├── curl.h
    │ ├── curlver.h
    │ ├── easy.h
    │ ├── mprintf.h
    │ ├─── multi.h
    │ ├── options.h
    │ ├── stdcheaders.h
    │ ├── system.h
    │ ├── typecheck-gcc.h
    │ └── urlapi.h
    ├── lib
    │ ├── libcurl.a
    │ ├── libcurl.so
    │ └── ...
    ├─── bin
    │ └── ...
    └──share
        └── ...

我们可以看到，vendor/libcurl/include 路径包含我们的头文件，vendor/libcurl/lib 文件夹包含一个静态库（libcurl.a）和一个共享/动态库（libcurl.so）。

### 动态链接

要链接 libcurl，我们需要先添加 include 路径，然后向 zig 提供库的前缀和库名：(todo代码有待验证,因为curl可能需要自己编译自己生成static lib)

    //demo 3.3
    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "test",
            .root_source_file = .{ .path = "main.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(exe);
        exe.linkLibC();
        exe.addIncludePath(.{ .path = "vendor/libcurl/include" });
        exe.addLibraryPath(.{ .path = "vendor/libcurl/lib" });
        exe.linkSystemLibraryName("curl");
    }

addIncludePath 将文件夹添加到搜索路径中，这样 Zig 就能找到 curl/curl.h 文件。注意，我们也可以在这里传递 "vendor/libcurl/include/curl"，但你通常应该检查一下你的库到底想要什么。

addLibraryPath对库文件也有同样的作用。这意味着 Zig 现在也会搜索 "vendor/libcurl/lib "文件夹中的库。

最后，linkSystemLibraryName 会告诉 Zig 搜索名为 "curl "的库。如果你留心观察，就会发现上面列表中的文件名是 libcurl.so，而不是 curl.so。在unixoid系统中，库文件的前缀通常是lib，这样就不会将其传递给系统。在 Windows 系统中，库文件的名字应该是 curl.lib 或类似的名字。

## 静态链接

当我们要静态链接一个库时，我们必须采取一些不同的方法：

    pub fn build(b: *std.build.Builder) void {
         const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "test",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(exe);
        exe.linkLibC();
        exe.addIncludeDir("vendor/libcurl/include")；
        exe.addObjectFile("vendor/libcurl/lib/libcurl.a")；
        exe.addIncludePath(.{ .path = "vendor/libcurl/include" });
        exe.addLibraryPath(.{ .path = "vendor/libcurl/lib" });
    }

对 addIncludeDir 的调用没有改变，但我们突然不再调用带 link 的函数了？你可能已经知道了： 静态库实际上就是对象文件的集合。在 Windows 上，这一点也很相似，据说 MSVC 也使用了相同的工具集。

因此，静态库就像对象文件一样，通过 addObjectFile 传递给链接器，并由其解包。

注意：大多数静态库都有一些传递依赖关系。在我编译 libcurl 的例子中，就有 nghttp2、zstd、z 和 pthread，我们需要再次手动链接它们：

    // 示例片段
    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "test",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(exe);
        exe.linkLibC();
        exe.addIncludePath(.{ .path = "vendor/libcurl/include" });
        exe.addLibraryPath(.{ .path = "vendor/libcurl/lib" });
        exe.linkSystemLibrary("nghttp2")；
        exe.linkSystemLibrary("zstd")；
        exe.linkSystemLibrary("z")；
        exe.linkSystemLibrary("pthread")；
    }

我们可以继续静态链接越来越多的库，并拉入完整的依赖关系树。

## 通过源代码链接库

不过，我们还有一种与 Zig 工具链截然不同的链接库方式：

我们可以自己编译它们！

这样做的好处是，我们可以更容易地交叉编译我们的程序。为此，我们需要将库的构建文件转换成我们的 build.zig。这通常需要对 build.zig 和你的库所使用的构建系统都有很好的了解。但让我们假设这个库是超级简单的，只是由一堆 C 文件组成：

    // 示例片段
    pub fn build(b: *std.build.Builder) void {
        const cflags = .{}；

        const curl = b.addSharedLibrary("curl", null, .unversioned)；
        exe.addCSourceFile(.{
                .file = std.build.LazyPath.relative("vendor/libcurl/src/tool_main.c"),
                .flags = &cflags,
                });
        exe.addCSourceFile(.{
                .file = std.build.LazyPath.relative("vendor/libcurl/src/tool_msgs.c"),
                .flags = &cflags,
                });
        exe.addCSourceFile(.{
                .file = std.build.LazyPath.relative("vendor/libcurl/src/tool_dirhie.c"),
                .flags = &cflags,
                });
        exe.addCSourceFile(.{
                .file = std.build.LazyPath.relative("vendor/libcurl/src/tool_doswin.c"),
                .flags = &cflags,
                });
        const target = b.standardTargetOptions(.{});
            const optimize = b.standardOptimizeOption(.{});
            const exe = b.addExecutable(.{
                .name = "test",
                .root_source_file = .{ .path = "src/main.zig" },
                .target = target,
                .optimize = optimize,
            });
        exe.linkLibC()；
        exe.addIncludePath(.{ .path = "vendor/libcurl/include" });
        exe.linkLibrary(curl)；
        b.installArtifact(exe);

    }

这样，我们就可以使用 addSharedLibrary 和 addStaticLibrary 向 LibExeObjStep 添加库。

这一点尤其方便，因为我们可以使用 setTarget 和 setBuildMode 从任何地方编译到任何地方。

## 使用工具

在工作流程中使用工具，通常是在需要以 bison、flex、protobuf 或其他形式进行预编译时。工具的其他用例包括将输出文件转换为不同格式（如固件映像）或捆绑最终应用程序。

系统工具
使用预装的系统工具非常简单，只需使用 addSystemCommand 创建一个新步骤即可：

    // demo 3.5
    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "test",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = optimize,
        });
        const cmd = b.addSystemCommand(&.{
            "flex",
            "-outfile=lines.c",
            "lines.l",
        });
        b.installArtifact(exe);
        exe.step.dependOn(&cmd.step);
    }

从这里可以看出，我们只是向 addSystemCommand 传递了一个选项数组，该数组将反映我们的命令行调用。然后，我们按照习惯创建可执行文件，并使用 dependOn 在 cmd 上添加步骤依赖关系。

我们也可以反其道而行之，在编译程序时添加有关程序的小信息:

    //demo3.6
    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "test",
            .root_source_file = .{ .path = "main.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(exe);
        const cmd = b.addSystemCommand(&.{"size"});
        cmd.addArtifactArg(exe);
        b.getInstallStep().dependOn(&cmd.step);
    }

size 是一个很好的工具，它可以输出有关可执行文件代码大小的信息，可能如下所示：

    文本 数据 BSS Dec 十六进制 文件名
    12377 620 104 13101 332d ...

如您所见，我们在这里使用了 addArtifactArg，因为 addSystemCommand 只会返回一个 std.build.RunStep。这样，我们就可以增量构建完整的命令行，包括任何 LibExeObjStep 输出、FileSource 或逐字参数。

## 全新工具

最酷的是 我们还可以从 LibExeObjStep 获取 std.build.RunStep：

    // 示例片段
    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
         const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const game = b.addExecutable(.{
            .name = "game",
            .root_source_file = .{ .path = "src/game.zig" },
            .target = target,
            .optimize = optimize,
        });
        b.installArtifact(game);
        const pack_tool = b.addExecutable(.{
            .name = "pack",
            .root_source_file = .{ .path = "tools/pack.zig" },
            .target = target,
            .optimize = optimize,
        });
        //译者改动：const precompilation = pack_tool.run(); // returns *RunStep
        const precompilation = b.addRunArtifact(pack_tool);
        precompilation.addArtifactArg(game);
        precompilation.addArg("assets.zip");

        const pack_step = b.step("pack", "Packs the game and assets together");
        pack_step.dependOn(&precompilation.step);
    }

此构建脚本将首先编译一个名为 pack 的可执行文件。然后将以我们的游戏和 assets.zig 文件作为命令行参数调用该可执行文件。

调用 zig build pack 时，我们将运行 tools/pack.zig。这很酷，因为我们还可以从头开始编译所需的工具。为了获得最佳的开发体验，你甚至可以从源代码编译像 bison 这样的 "外部 "工具，这样就不会依赖系统了！

## 将所有内容放在一起

一开始，所有这些都会让人望而生畏，但如果我们看一个更大的 build.zig 实例，就会发现一个好的构建文件结构会给我们带来很大帮助。

下面的编译脚本将编译一个虚构的工具，它可以通过 flex 生成的词法器解析输入文件，然后使用 curl 连接到服务器，并在那里传送一些文件。当我们调用 zig build deploy 时，项目将被打包成一个 zip 文件。正常的 zig 编译调用只会准备一个未打包的本地调试安装。

    // 示例片段
    const std = @import("std");
    pub fn build(b: *std.build.Builder) void {
        const mode = b.standardOptimizeOption(.{});
        // const mode = b.standardReleaseOptions();

        const target = b.standardTargetOptions(.{});

        // Generates the lex-based parser
        const parser_gen = b.addSystemCommand(&[_][]const u8{
            "flex",
            "--outfile=review-parser.c",
            "review-parser.l",
        });

        // Our application
        const exe = b.addExecutable(.{
            .name = "upload-review",
            .root_source_file = .{ .path = "src/main.zig" },
            .target = target,
            .optimize = mode,
        });

        {
            exe.step.dependOn(&parser_gen.step);

            exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("review-parser.c"), .flags = &.{} });

            // add zig-args to parse arguments

            const ap = b.createModule(.{
                .source_file = .{ .path = "vendor/zig-args/args.zig" },
                .dependencies = &.{},
            });
            exe.addModule("args-parser", ap);

            // add libcurl for uploading
            exe.addIncludePath(std.build.LazyPath.relative("vendor/libcurl/include"));
            exe.addObjectFile(std.build.LazyPath.relative("vendor/libcurl/lib/libcurl.a"));

            exe.linkLibC();
            b.installArtifact(exe);
            // exe.install();
        }

        // Our test suite
        const test_step = b.step("test", "Runs the test suite");
        const test_suite = b.addTest(.{
            .root_source_file = .{ .path = "src/tests.zig" },
        });

        test_suite.step.dependOn(&parser_gen.step);
        exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("review-parser.c"), .flags = &.{} });

        // add libcurl for uploading
        exe.addIncludePath(std.build.LazyPath.relative("vendor/libcurl/include"));
        exe.addObjectFile(std.build.LazyPath.relative("vendor/libcurl/lib/libcurl.a"));

        test_suite.linkLibC();

        test_step.dependOn(&test_suite.step);

        {
            const deploy_step = b.step("deploy", "Creates an application bundle");

            // compile the app bundler
            const deploy_tool = b.addExecutable(.{
                .name = "deploy",
                .root_source_file = .{ .path = "tools/deploy.zig" },
                .target = target,
                .optimize = mode,
            });

            {
                deploy_tool.linkLibC();
                deploy_tool.linkSystemLibrary("libzip");
            }

            const bundle_app = b.addRunArtifact(deploy_tool);
            bundle_app.addArg("app-bundle.zip");
            bundle_app.addArtifactArg(exe);
            bundle_app.addArg("resources/index.htm");
            bundle_app.addArg("resources/style.css");

            deploy_step.dependOn(&bundle_app.step);
        }
    }

如你所见，代码量很大，但通过使用块，我们可以将构建脚本结构化为逻辑组。

如果你想知道为什么我们不为 deploy_tool 和 test_suite 设置目标：
两者都是为了在主机平台上运行，而不是在目标机器上。
此外，deploy_tool 还设置了固定的编译模式，因为我们希望快速编译，即使我们编译的是应用程序的调试版本。

## 总结

看完这一大堆文字，你现在应该可以构建任何你想要的项目了。我们已经学会了如何编译 Zig 应用程序，如何为其添加任何类型的外部库，甚至如何为发布管理对应用程序进行后处理。

我们还可以通过少量的工作来构建 C 和 C++ 项目，并将它们部署到各个地方。

即使我们混合使用项目、工具和其他一切。一个 build.zig 文件就能满足我们的需求。但很快你就会发现... 编译文件很快就会重复，而且有些软件包或库需要大量代码才能正确设置。

在下一篇文章中，我们将学习如何将 build.zig 文件模块化，如何为 Zig 创建方便的 sdks，甚至如何创建自己的构建步骤！

一如既往，继续黑客之旅！
