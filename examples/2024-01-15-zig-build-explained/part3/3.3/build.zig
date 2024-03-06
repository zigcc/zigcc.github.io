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
