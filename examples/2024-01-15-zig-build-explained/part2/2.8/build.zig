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
