const std = @import("std");

pub extern fn buffer_create(len: usize) ?*anyopaque;
pub extern fn buffer_destroy(ptr: ?*anyopaque) void;
pub extern fn buffer_write(buf: ?*anyopaque, offset: usize, data: ?*const anyopaque, len: usize) void;
pub extern fn buffer_read(buf: ?*anyopaque, offset: usize, data: ?*anyopaque, len: usize) void;

pub fn main() void {
    const buf = buffer_create(8);
    defer buffer_destroy(buf);

    buffer_write(buf, 0, "World", 6);

    {
        var str: [8]u8 = undefined;
        buffer_read(buf, 0, &str, 6);
        std.log.info("Hello, {s}!", .{str[0..6]});
    }
}
