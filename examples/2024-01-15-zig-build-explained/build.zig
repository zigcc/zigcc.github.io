const std = @import("std");
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const exe = b.addExecutable(.{
        .name = "test",
        .root_source_file = .{ .path = "main.zig" },
        .target = target,
        .optimize = optimize,
    });
    // b.installArtifact(exe);
    const cmd = b.addSystemCommand(&.{
        "./all.sh",
        // "-outfile=lines.c",
        // "lines.l",
    });

    exe.step.dependOn(&cmd.step);
    b.installArtifact(exe);
    // const run_cmd = b.addRunArtifact(exe);
    // run_cmd.step.dependOn(b.getInstallStep());
    // if (b.args) |args| {
    //     run_cmd.addArgs(args);
    // }
    // const run_step = b.step("run", "Run the app");
    // run_step.dependOn(&run_cmd.step);
}
