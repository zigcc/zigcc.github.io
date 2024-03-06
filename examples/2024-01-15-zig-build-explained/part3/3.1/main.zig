const std = @import("std"); // imports the "std" package
const ihex = @import("ihex"); // imports the "ihex" package
const tools = @import("tools.zig"); // imports the file "tools.zig"

pub fn main() !void {
    const data = try tools.loadFile("foo.ihex");
    const hex_file = try ihex.parse(data);
    std.debug.print("foo.ihex = {}\n", .{hex_file});
}
