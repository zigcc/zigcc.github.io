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
    // const cmd = b.addSystemCommand(&.{
    //     "flex",
    //     "-outfile=lines.c",
    //     "lines.l",
    // });
    b.installArtifact(exe);
    // exe.step.dependOn(&cmd.step);
}
