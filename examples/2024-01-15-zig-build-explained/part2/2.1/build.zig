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
        run_cmd.addArgs(args); //
    }
    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);
}
