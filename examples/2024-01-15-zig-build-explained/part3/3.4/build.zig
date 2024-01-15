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
    exe.addIncludePath(.{ .path = "/usr/local/Cellar/curl/8.5.0/include" });
    exe.addLibraryPath(.{ .path = "/usr/local/Cellar/curl/8.5.0/lib" });
    exe.addObjectFile(.{ .path = "/usr/local/Cellar/curl/8.5.0/lib/libcurl.a" });
}
