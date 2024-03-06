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
