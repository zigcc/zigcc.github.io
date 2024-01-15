const std = @import("std");
pub fn build(b: *std.build.Builder) void {
    const named_step = b.step("step-name", "This is what is shown in help");
    _ = named_step;
}
