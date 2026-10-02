 

Learning Zig - Style Guide 

[Language Overview - Part 2](/learning%5Fzig/language%5Foverview%5F2/) [](/learning%5Fzig)Intro [Pointers](/learning%5Fzig/pointers/) 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Style Guide](#styleguide)

In this short part, we'll cover two coding rules enforced by the compiler as well as the standard library's naming convention.

## [Unused Variables](#unused%5Fvariables)

Zig does not allow variables to go unused. The following gives two compile-time errors:

```zig
const std = @import("std");

pub fn main() void {
	const sum = add(8999, 2);
}

fn add(a: i64, b: i64) i64 {
	// notice this is a + a, not a + b
	return a + a;
}
```

The first error is because `sum` is an _unused local constant_. The second error is because `b` is an _unused function parameter_. For this code, these are obvious bugs. But you might have legitimate reasons for having unused variables and function parameters. In such cases, you can assign the variables to underscore (`_`):

```zig
const std = @import("std");

pub fn main() void {
	_ = add(8999, 2);

	// or

	const sum = add(8999, 2);
	_ = sum;
}

fn add(a: i64, b: i64) i64 {
	_ = b;
	return a + a;
}
```

As an alternative to doing `_ = b;`, we could have named the function parameter `_`, though, in my opinion, this leaves a reader guessing what the unused parameter is:

```zig
fn add(a: i64, _: i64) i64 {
```

Notice that `std` is also unused but does not generate an error. At some point in the future, expect Zig to also treat this as a compile-time error.

## [Shadowing](#shadowing)

Zig doesn't allow one identifier to "hide" another by using the same name. This code, to read from a `Reader`, isn't valid:

```zig
fn read(r: *std.Io.Reader) !void {
	var buf: [512]u8 = undefined;
	const read = try r.readSliceShort(&buf);
	const data = buf[0..read];
	// ....
}
```

Our `read` variable shadows our function name. I am not a fan of this rule as it generally leads developers to use short meaningless names. For example, to get this code to compile, I'd change `read` to `n`. This is a case where, in my opinion, developers are in a much better position to pick the most readable option.

## [Naming Convention](#naming)

Besides rules enforced by the compiler, you are, of course, free to follow whatever naming convention you prefer. But it does help to understand Zig's own naming convention since much of the code you'll interact with, from the standard library to third party libraries, makes use of it.

Zig source code is indented with 4 spaces.

Function names are camelCase and variables are snake\_case. Types are PascalCase. There is an interesting intersection between these three rules. Variables which reference a type, or functions which return a type, follow the type rule and are PascalCase. We already saw this, though you might have missed it.

```zig
std.debug.print("{any}\n", .{@TypeOf(.{.year = 2023, .month = 8})});
```

We've seen other builtin functions: `@import`, `@rem` and `@intCast`. Since these are functions they are camelCase. `@TypeOf` is also a builtin function, but it's PascalCase, why? Because it returns a type and thus the type naming convention is used. Were we to assign the result of `@TypeOf` to a variable, using Zig's naming convention, that variable should be PascalCase also:

```zig
const T = @TypeOf(3)
std.debug.print("{any}\n", .{T});
```

The `zig` executable does have a `fmt` command which, given a file or a directory, will format the file based on Zig's own style guide. It doesn't cover everything though, for example it will adjust indentation and brace positions, but won't change identifier casing.

[Language Overview - Part 2](/learning%5Fzig/language%5Foverview%5F2/) [](/learning%5Fzig)Intro [Pointers](/learning%5Fzig/pointers/)