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
    exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("print-main.c"), .flags = &.{} });
    if (use_platform_io) {
        exe.defineCMacro("USE_PLATFORM_IO", null);
        if (exe.target.isWindows()) {
            exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("print-windows.c"), .flags = &.{} });
        } else {
            exe.addCSourceFile(.{ .file = std.build.LazyPath.relative("print-unix.c"), .flags = &.{} });
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
