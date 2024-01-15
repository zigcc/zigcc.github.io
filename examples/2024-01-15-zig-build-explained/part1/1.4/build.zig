const std = @import("std");
pub fn build(b: *std.build.Builder) void {
    const exe = b.addExecutable(.{
        .name = "fresh",
        .root_source_file = .{ .path = "src/main.zig" },
        .optimize = .ReleaseSafe,
    });
    const compile_step = b.step("compile", "Compiles src/main.zig");
    compile_step.dependOn(&exe.step);
}
