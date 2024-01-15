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
