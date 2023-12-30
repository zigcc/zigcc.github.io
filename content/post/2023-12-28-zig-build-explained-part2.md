---
title: zig 构建系统解析 - 第二部分
author: Reco
date: "2023-12-24T19:15:02+0800"
---

# zig build explained - part2

原文链接： https://zig.news/xq/zig-build-explained-part-2-1850

## 注释

从现在起，我将只提供一个最小的 build.zig，说明解决一个问题所需的文件。如果你想了解如何将所有这些文件粘合到一个漂亮舒适的构建文件中，请阅读第一篇文章。

## 注意事项

你可以在这个 [Git 仓库](https://github.com/MasterQ32/zig-build-chapter-2)中找到构建脚本中引用的所有源文件。因此，如果你想尝试构建这些示例，请继续！

## 在命令行上编译 C 代码

Zig 有两种编译 C 代码的方法，使用哪种很容易混淆。

### 使用 zig cc

Zig 提供了 LLVM c 编译器 clang。第一种是 zig cc 或 zig c++，它是与 clang 接近 1:1 的前端。由于我们无法直接从 build.zig 访问这些功能（而且我们也不需要！），所以我将在快速的介绍这个主题。

如前所述，zig cc 是暴露的 clang 前端。您可以直接将 CC 变量设置为 zig cc，并使用 zig cc 代替 gcc 或 clang 来使用 Makefiles、CMake 或其他编译系统，这样您就可以在已有的项目中使用 Zig 的完整交叉编译体验。请注意，这只是理论上的说法，因为很多编译系统无法处理编译器名称中的空格。解决这一问题的办法是使用一个简单的封装脚本或工具，将所有参数转发给 zig cc。

假设我们有一个由 main.c 和 buffer.c 生成的项目，我们可以用下面的命令行来构建它：

    zig cc -o example buffer.c main.c

这将为我们创建一个名为 example 的可执行文件（在 Windows 系统中，应使用 example.exe 代替 example）。与普通的 clang 不同，Zig 默认会插入一个 -fsanitize=undefined，它将捕捉你使用的未定义行为。

如果不想使用，则必须通过 -fno-sanitize=undefined 或使用优化的发布模式（如 -O2）。

使用 zig cc 进行交叉编译与使用 Zig 本身一样简单：

    zig cc -o example.exe -target x86_64-windows-gnu buffer.c main.c

如你所见，只需向 -target 传递目标三元组，就能调用交叉编译。只需确保所有外部库都已准备好进行交叉编译即可！

## 使用 zig build-exe 和其他工具

使用 Zig 工具链构建 C 项目的另一种方法与构建 Zig 项目的方法相同：

    zig build-exe -lc main.c buffer.c

这里的主要区别在于，必须明确传递 -lc 才能链接到 libc，而且可执行文件的名称将从传递的第一个文件中导出。如果想使用不同的可执行文件名，可通过 --name example 再次获取示例文件。

交叉编译也是如此，只需通过 -target x86_64-windows-gnu 或其他目标三元组即可：

    zig build-exe -lc -target x86_64-windows-gnu main.c buffer.c

你会发现，使用这条编译命令，Zig 会自动在输出文件中附加 .exe 扩展名，并生成 .pdb 调试数据库。如果你在此处传递 --name example，输出文件也会有正确的 .exe 扩展名，所以你不必考虑这个问题。

## 用 build.zig 创建 C 代码

那么，我们如何用 build.zig 构建我们的双文件小范例呢？

首先，我们需要创建一个新的编译目标：

    // demo2.1
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            // 这块调试了很久。最后的结论是根本不要写
            // .root_source_file = .{ .path = undefined },
            .target = target,
            .optimize = optimize,
        });
        // 这块调试了很久。API变了不会写，着了很久的文档和看了很久的代码
        exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("main.c"), .flags = &.{} });
        exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("buffer.c"), .flags = &.{} });
        //exe.linkLibC();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

然后，我们通过 addCSourceFile 添加两个 C 语言文件：

    exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("main.c"), .flags = &.{} });
    exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("buffer.c"), .flags = &.{} });

第一个参数 addCSourceFile 是要添加的 C 或 C++ 文件的名称，第二个参数是该文件要使用的命令行选项列表。

请注意，我们向 addExecutable 传递的是空值，因为我们没有要编译的 Zig 源文件。

现在，调用 zig build 可以正常运行，并在 zig-out/bin 中生成一个漂亮的小可执行文件。很好，我们用 Zig 构建了第一个小 C 项目！

如果你想跳过检查 C 代码中的未定义行为，就必须在调用时添加选项：

        exe.addCSourceFile(.{.file = std.build.LazyPath.relative("buffer.c"), .flags = &.{"-fno-sanitize=undefined"}});

## 使用外部库

通常情况下，C 项目依赖于其他库，这些库通常预装在 Unix 系统中，或通过软件包管理器提供。

为了演示这一点，我们创建一个小工具，通过 curl 库下载文件，并将文件内容打印到标准输出：

    #include <stdio.h>
    #include <curl/curl.h>

    static size_t writeData(void *ptr, size_t size, size_t nmemb, FILE *stream) {
        size_t written;
        written = fwrite(ptr, size, nmemb, stream);
        return written;
    }

    int main(int argc, char ** argv)
    {
        if(argc != 2)
            return 1;

        char const * url = argv[1];
        CURL * curl = curl_easy_init();
        if (curl == NULL)
            return 1;

        curl_easy_setopt(curl, CURLOPT_URL, url);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeData);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, stdout);
        CURLcode res = curl_easy_perform(curl);
        curl_easy_cleanup(curl);

        if(res != CURLE_OK)
            return 1;

        return 0;
    }

要编译这个程序，我们需要向编译器提供正确的参数，包括包含路径、库和其他参数。幸运的是，我们可以使用 Zig 内置的 pkg-config 集成：

     // demo2.2
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "downloader",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("download.c"), .flags = &.{} });
        exe.linkSystemLibrary("curl");
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

让我们创建程序，并通过 URL 调用它

    zig build
    ./zig-out/bin/downloader  https://mq32.de/public/ziggy.txt

## 配置路径

由于我们不能在交叉编译项目中使用 pkg-config，或者我们想使用预编译的专用库（如 BASS 音频库），因此我们需要配置包含路径和库路径。

这可以通过函数 addIncludePath 和 addLibraryPath 来完成：

    //demo 2.3
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("bass-player.c"),
            .flags = &.{}
            });
        exe.linkLibC();
        // 还是一步步看源代码，找新的函数，addIncludeDir,addLibDir ->new function
        exe.addIncludePath(std.build.LazyPath.relative("bass/linux"));
        exe.addLibraryPath(std.build.LazyPath.relative("bass/linux/x64"));
        exe.linkSystemLibraryName("bass");
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

addIncludePath 和 addLibraryPath 都可以被多次调用，以向编译器添加多个路径。这些函数不仅会影响 C 代码，还会影响 Zig 代码，因此 @cImport 可以访问包含路径中的所有头文件。

## 每个文件的包含路径

因此，如果我们需要为每个 C 文件设置不同的包含路径，我们就需要用不同的方法来解决这个问题：
由于我们仍然可以通过 addCSourceFile 传递任何 C 编译器标志，因此我们也可以在这里手动设置包含目录。

        //demo2.4
        const std = @import("std");
        pub fn build(b: *std.Build) void {
            const target = b.standardTargetOptions(.{});
            const optimize = b.standardOptimizeOption(.{});
            const exe = b.addExecutable(.{
                .name = "example",
                .target = target,
                .optimize = optimize,
            });
            exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("multi-main.c"), .flags = &.{} });
            exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("multi.c"), .flags = &.{ "-I", "inc1" } });
            exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("multi.c"), .flags = &.{ "-I", "inc2" } });
            b.installArtifact(exe);
            const run_cmd = b.addRunArtifact(exe);
            run_cmd.step.dependOn(b.getInstallStep());
            if (b.args) |args| {
                run_cmd.addArgs(args);
            }
            const run_step = b.step("run", "Run the app");
            run_step.dependOn(&run_cmd.step);
        }

上面的示例非常简单，所以你可能会想为什么需要这样的东西。答案是，有些库的头文件名称非常通用，如 api.h 或 buffer.h，而您希望使用两个共享头文件名称的不同库。

## 构建 C++ 项目

到目前为止，我们只介绍了 C 文件，但构建 C++ 项目并不难。你仍然可以使用 addCSourceFile，但只需传递一个具有典型 C++ 文件扩展名的文件，如 cpp、cxx、c++ 或 cc：

    //demo2.5
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("main.c"), .flags = &.{} });
        exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("buffer.cc"), .flags = &.{} });
        exe.linkLibC();
        exe.linkLibCpp();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

如你所见，我们还需要调用 linkLibCpp，它将链接 Zig 附带的 c++ 标准库。

这就是构建 C++ 文件所需的全部知识，没有什么更神奇的了。

## 指定语言版本

试想一下，如果你创建了一个庞大的项目，其中的 C 或 C++ 文件有新有旧，而且可能是用不同的语言标准编写的。为此，我们可以使用编译器标志来传递 -std=c90 或 -std=c++98：

    //demo2.6
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("main.c"),
            .flags = &.{"-std=c90"}
            });
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("buffer.cc"),
            .flags = &.{"-std=c++17"}
            });
        exe.linkLibC();
        exe.linkLibCpp();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

## 条件编译

与 Zig 相比，C 和 C++ 的条件编译方式非常繁琐。由于缺乏 "懒评估"，有时必须根据目标文件来包含/排除文件。你还必须提供宏定义来启用/禁用某些项目功能。

Zig 编译系统可以轻松处理这两种变体：

    //demo2.7
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
         const use_platform_io = b.option(bool, "platform-io", "Uses the native api instead of the C wrapper") orelse true;
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("print-main.c"),
            .flags = &.{}
            });
        if (use_platform_io) {
            exe.defineCMacro("USE_PLATFORM_IO", null);
            if (exe.target.isWindows()) {
                exe.addCSourceFile(.{
                .file = std.build.LazyPath.relative("print-windows.c"),
                .flags = &.{}
                });

            } else {
                exe.addCSourceFile(.{
                .file = std.build.LazyPath.relative("print-unix.c"),
                .flags = &.{}
                });
            }
        }
        exe.linkLibC();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

通过 defineCMacro，我们可以定义自己的宏，就像使用 -D 编译器标志传递宏一样。第一个参数是宏名，第二个值是一个可选项，如果不为空，将设置宏的值。

有条件地包含文件就像使用 if 一样简单，你可以这样做。只要不根据你想在构建脚本中定义的任何约束条件调用 addCSourceFile 即可。只包含特定平台的文件？看看上面的脚本就知道了。根据系统时间包含文件？也许这不是个好主意，但还是有可能的！

## 编译大型项目

由于大多数 C（更糟糕的是 C++）项目都有大量文件（SDL2 有 411 个 C 文件和 40 个 C++ 文件），我们必须找到一种更简单的方法来编译它们。调用 addCSourceFile 400 次并不能很好地扩展。

因此，我们可以做的第一个优化就是将 c 和 c++ 标志放入各自的变量中：

    //demo2.8
    const std = @import("std");
    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        const flags = .{
            "-Wall",
            "-Wextra",
            "-Werror=return-type",
        };
        const cflags = flags ++ .{"-std=c99"};
        const cppflags = cflags ++ .{
            "-std=c++17",
            "-stdlib=libc++",
            "-fno-exceptions",
        };
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("main.c"),
            .flags = &cflags,
        });
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("buffer.cc"),
            .flags = &cppflags,
        });
        exe.linkLibC();
        exe.linkLibCpp();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

这样就可以在项目的不同组件和不同语言之间轻松共享标志。

addCSourceFile 还有一个变种，叫做 addCSourceFiles。它使用的不是文件名，而是可编译的所有源文件的文件名片段。这样，我们就可以收集某个文件夹中的所有文件：

    //demo2.9
    const std = @import("std");
    pub fn build(b: *std.build.Builder) !void {
        var sources = std.ArrayList([]const u8).init(b.allocator);
        // Search for all C/C++ files in `src` and add them
        {
            var dir = try std.fs.cwd().openIterableDir(".", .{ .access_sub_paths = true });

            var walker = try dir.walk(b.allocator);
            defer walker.deinit();

            const allowed_exts = [_][]const u8{ ".c", ".cpp", ".cxx", ".c++", ".cc" };
            while (try walker.next()) |entry| {
                const ext = std.fs.path.extension(entry.basename);
                const include_file = for (allowed_exts) |e| {
                    if (std.mem.eql(u8, ext, e))
                        break true;
                } else false;
                if (include_file) {
                    // we have to clone the path as walker.next() or walker.deinit() will override/kill it
                    try sources.append(b.dupe(entry.path));
                }
            }
        }
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFiles(sources.items, &.{});
        exe.linkLibC();
        exe.linkLibCpp();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

正如您所看到的，我们可以轻松搜索某个文件夹中的所有文件，匹配文件名并将它们添加到源代码集合中。然后，我们只需为每个文件集调用一次 addCSourceFiles，就可以大展身手了。

你可以制定很好的规则来匹配 exe.target 和文件夹名称，以便只包含通用文件和适合你的平台的文件。不过，这项工作留给读者自己去完成。

注意：其他构建系统会考虑文件名，而 Zig 系统不会！例如，在一个 qmake 项目中不能有两个名为 data.c 的文件！Zig 并不在乎，你可以添加任意多的同名文件，只要确保它们在不同的文件夹中就可以了 😏。

## 编译 Objective C

我完全忘了！Zig 不仅支持编译 C 和 C++，还支持通过 clang 编译 Objective C！

虽然不支持 C 或 C++，但至少在 macOS 上，你已经可以编译 Objective C 程序并添加框架了：

    //demo2.10
    const std = @import("std");

    pub fn build(b: *std.Build) void {
        const target = b.standardTargetOptions(.{});
        const optimize = b.standardOptimizeOption(.{});
        const exe = b.addExecutable(.{
            .name = "example",
            .target = target,
            .optimize = optimize,
        });
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("main.m"),
            .flags = &.{},
        });
        exe.linkFramework("Foundation");
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

在这里，链接 libc 是隐式的，因为添加框架会自动强制链接 libc。是不是很酷？

## 混合使用 C 和 Zig 源代码

现在，是最后一章： 混合 C 代码和 Zig 代码！

为此，我们只需将 addExecutable 中的第二个参数设置为文件名，然后点击编译！

    //demo2.11
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
        exe.addCSourceFile(.{
            .file = std.build.LazyPath.relative("buffer.c"),
            .flags = &.{},
        });
        exe.linkLibC();
        b.installArtifact(exe);
        const run_cmd = b.addRunArtifact(exe);
        run_cmd.step.dependOn(b.getInstallStep());
        if (b.args) |args| {
            run_cmd.addArgs(args);
        }
        const run_step = b.step("run", "Run the app");
        run_step.dependOn(&run_cmd.step);
    }

这就是需要做的一切！是这样吗？

实际上，有一种情况现在还没有得到很好的支持：
您应用程序的入口点现在必须在 Zig 代码中，因为根文件必须导出一个 pub fn main(...) ....。
因此，如果你想将 C 项目中的代码移植到 Zig 中，你必须将 argc 和 argv 转发到你的 C 代码中，并将 C 代码中的 main 重命名为其他函数（例如 oldMain），然后在 Zig 中调用它。如果需要 argc 和 argv，可以通过 std.process.argsAlloc 获取。或者更好： 在 Zig 中重写你的入口点，然后从你的项目中移除一些 C 语言！

## 结论

假设你只编译一个输出文件，那么现在你应该可以将几乎所有的 C/C++ 项目移植到 build.zig。

如果你需要一个以上的构建工件，例如共享库和可执行文件，你应该阅读下一篇文章，它将介绍如何在一个 build.zig 中组合多个项目，以创建便捷的构建体验。

敬请期待！
