const std = @import("std");

pub fn main() !void {
    std.debug.print("All your {s} are belong to us.\n", .{"codebase"});
    const stdout_file = std.io.getStdOut().writer();
    var bw = std.io.bufferedWriter(stdout_file);
    const stdout = bw.writer();
    try stdout.print("Run `zig build test` to run the tests.\n", .{});
    std.debug.print("args from builds:", .{});
    for (std.os.argv) |arg| {
        std.debug.print("{s},", .{arg});
    }
    std.debug.print("\n", .{});
    try bw.flush(); // don't forget to flush!
}
