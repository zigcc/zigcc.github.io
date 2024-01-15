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
        // todo 作为译者我太难了。这个原作者没有提供各种依赖文件，我自己拼太难了，可以build通过但是无法执行通过
        // exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("review-parser.c"), .flags = &.{} });
        // todo 作为译者我太难了。这个原作者没有提供各种依赖文件，我自己拼太难了，可以build通过但是无法执行通过
        // add zig-args to parse arguments

        // const ap = b.createModule(.{
        //     .source_file = .{ .path = "vendor/zig-args/args.zig" },
        //     .dependencies = &.{},
        // });
        // exe.addModule("args-parser", ap);

        // add libcurl for uploading
        exe.addIncludePath(std.build.LazyPath.relative("vendor/libcurl/include"));
        // todo 作为译者我太难了。这个原作者没有提供各种依赖文件，我自己拼太难了，可以build通过但是无法执行通过
        // exe.addObjectFile(std.build.LazyPath.relative("vendor/libcurl/lib/libcurl.a"));

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
    // todo 作为译者我太难了。这个原作者没有提供各种依赖文件，我自己拼太难了，可以build通过但是无法执行通过
    // exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("review-parser.c"), .flags = &.{} });

    // add libcurl for uploading
    exe.addIncludePath(std.build.LazyPath.relative("vendor/libcurl/include"));
    // todo 作为译者我太难了。这个原作者没有提供各种依赖文件，我自己拼太难了，可以build通过但是无法执行通过
    // exe.addObjectFile(std.build.LazyPath.relative("vendor/libcurl/lib/libcurl.a"));

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
