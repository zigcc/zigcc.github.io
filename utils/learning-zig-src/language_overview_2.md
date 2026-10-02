 

Learning Zig - Language Overview - Part 2 

[](/learning%5Fzig/language%5Foverview%5F1)Language Overview - Part 1 [](/learning%5Fzig)Intro [](/learning%5Fzig/style%5Fguide)Style Guide 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Language Overview - Part 2](#language%5Foverview)

This part continues where the previous left off: familiarizing ourselves with the language. We'll explore Zig's control flow and types beyond structures. Together with the first part, we'll have covered most of the language's syntax allowing us to tackle more of the language and the standard library.

## [Control Flow](#control%5Fflow)

Zig's control flow is likely familiar, but with additional synergies with aspects of the language we've yet to explore. We'll start with a quick overview of control flow and come back when discussing features that elicit special control flow behavior.

You will notice that instead of the logical operators `&&` and `||`, we use `and` and `or`. Like in most languages, `and` and `or` control the flow of execution: they short-circuit. The right side of an `and` isn't evaluated if the left side is `false`, and the right side of an `or` isn't evaluated if the left side is `true`. In Zig, control flow is done with keywords, and thus `and` and `or` are used.

Also, the comparison operator, `==`, does not work between slices, such as `[]const u8`, i.e. strings. In most cases, you'll use `std.mem.eql(u8, str1, str2)` which will compare the length and then bytes of the two slices.

Zig's `if`, `else if` and `else` are commonplace:

```zig
// std.mem.eql does a byte-by-byte comparison
// for a string it'll be case sensitive
if (std.mem.eql(u8, method, "GET") or std.mem.eql(u8, method, "HEAD")) {
	// handle a GET request
} else if (std.mem.eql(u8, method, "POST")) {
	// handle a POST request
} else {
	// ...
}
```

The first argument to `std.mem.eql` is a type, in this case, `u8`. This is the first generic function we've seen. We'll explore this more in a later part.

The above example is comparing ASCII strings and should likely be case insensitive. `std.ascii.eqlIgnoreCase(str1, str2)` is probably a better option.

There is no ternary operator, but you can use an `if/else` like so:

```zig
const super = if (power > 9000) true else false;
```

`switch` is similar to an if/else if/else, but has the advantage of being exhaustive. That is, it's a compile-time error if not all cases are covered. This code will not compile:

```zig
fn anniversaryName(years_married: u16) []const u8 {
	switch (years_married) {
		1 => return "paper",
		2 => return "cotton",
		3 => return "leather",
		4 => return "flower",
		5 => return "wood",
		6 => return "sugar",
	}
}
```

We're told: _switch must handle all possibilities_. Since our `years_married` is a 16-bit integer, does that mean we need to handle all 64K cases? Yes, but thankfully there's an `else`:

```zig
// ...
6 => return "sugar",
else => return "no more gifts for you",
```

We can combine multiple cases or use ranges, and use blocks for complex cases:

```zig
fn arrivalTimeDesc(minutes: u16, is_late: bool) []const u8 {
	switch (minutes) {
		0 => return "arrived",
		1, 2 => return "soon",
		3...5 => return "no more than 5 minutes",
		else => {
			if (!is_late) {
				return "sorry, it'll be a while";
			}
			// todo, something is very wrong
			return "never";
		},
	}
}
```

While a `switch` is useful in a number of cases, its exhaustive nature really shines when dealing with enums, which we'll talk about shortly.

Zig's `for` loop is used to iterate over arrays, slices and ranges. For example, to check if an array contains a value, we might write:

```zig
fn contains(haystack: []const u32, needle: u32) bool {
	for (haystack) |value| {
		if (needle == value) {
			return true;
		}
	}
	return false;
}
```

`for` loops can work on multiple sequences at once, as long as those sequences are the same length. Above we used the `std.mem.eql` function. Here's what it (almost) looks like:

```zig
pub fn eql(comptime T: type, a: []const T, b: []const T) bool {
	// if they aren't the same length, they can't be equal
	if (a.len != b.len) return false;

	for (a, b) |a_elem, b_elem| {
		if (a_elem != b_elem) return false;
	}

	return true;
}
```

The initial `if` check isn't just a nice performance optimization, it's a necessary guard. If we take it out and pass arguments of different lengths, we'll get a runtime panic: _for loop over objects with non-equal lengths_.

`for` loops can also iterate over ranges, such as:

```zig
for (0..10) |i| {
	std.debug.print("{d}\n", .{i});
}
```

Our `switch` range used three dots, `3...6`, while this range uses two, `0..10`. That's because `switch` cases are inclusive of both numbers, while `for` is exclusive of the upper bound.

This really shines in combination with one (or more!) sequence:

```zig
fn indexOf(haystack: []const u32, needle: u32) ?usize {
	for (haystack, 0..) |value, i| {
		if (needle == value) {
			return i;
		}
	}
	return null;
}
```

This is a sneak peek at nullable types.

The end of the range is inferred from the length of `haystack`, though we could punish ourselves and write: `0..hastack.len`. `for` loops don't support the more generic `init; compare; step` idiom. For this, we rely on `while`.

Because `while` is simpler, taking the form of `while (condition) { }`, we have greater control over the iteration. For example, when counting the number of escape sequences in a string, we need to increment our iterator by 2 to avoid double counting a `\`:

```zig
var escape_count: usize = 0;
{
	var i: usize = 0;
	while (i < src.len) {
		// backslash is used as an escape character, thus we need to escape it...
		// with a backslash.
		if (src[i] == '\\') {
			i += 2;
			escape_count += 1;
		} else {
			i += 1;
		}
	}
}
```

We added an explicit block around our temporary `i` variable and `while` loop. This narrows the scope of `i`. Blocks like this can be useful, though in this case it's probably overkill. Still, the above example is as close to a traditional `for(init; compare; step)` loop that Zig has.

A `while` can have an `else` clause, which is executed when the condition is false. It also accepts a statement to execute after each iteration. There can be multiple statements seperated with `;`. This feature was commonly used prior to `for` supporting multiple sequences. The above can be written as:

```zig
var i: usize = 0;
var escape_count: usize = 0;

//                  this part
while (i < src.len) : (i += 1) {
	if (src[i] == '\\') {
		// +1 here, and +1 above == +2
		i += 1;
		escape_count += 1;
	}
}
```

`break` and `continue` are supported for either breaking out of the inner-most loop or jumping to the next iteration.

Blocks can be labeled and `break` and `continue` can target a specific label. A contrived example:

```zig
outer: for (1..10) |i| {
	for (i..10) |j| {
		if (i * j > (i+i + j+j)) continue :outer;
		std.debug.print("{d} + {d} >= {d} * {d}\n", .{i+i, j+j, i, j});
	}
}
```

`break` has another interesting behavior, returning a value from a block: 

```zig
const personality_analysis = blk: {
	if (tea_vote > coffee_vote) break :blk "sane";
	if (tea_vote == coffee_vote) break :blk "whatever";
	if (tea_vote < coffee_vote) break :blk "dangerous";
};
```

Blocks like this must be semi-colon terminated.

Later, when we explore tagged unions, error unions and optional types, we'll see what else these control flow structures have to offer.

## [Enums](#enums)

Enums are integer constants that are given a label. They are defined much like a struct:

```zig
// could be "pub"
const Status = enum {
	ok,
	bad,
	unknown,
};
```

And, like a struct, can contain other definitions, including functions which may or may not take the enum as a parameter:

```zig
const Stage = enum {
	validate,
	awaiting_confirmation,
	confirmed,
	err,

	fn isComplete(self: Stage) bool {
		return self == .confirmed or self == .err;
	}
};
```

If you want the string representation of an enum, you can use the builtin `@tagName(enum)` function.

Recall struct types can be inferred based on their assigned or return type using the `.{...}` notation. Above, we see the enum type being inferred based on its comparison to `self`, which is of type `Stage`. We could have been explicit and written: `return self == Stage.confirmed or self == Stage.err;`. But, when dealing with enums you'll often see the enum type omitted via the `.$value` notation. This is called an _enum literal_.

The exhaustive nature of `switch` makes it pair nicely with enums as it ensures you've handled all possible cases. Be careful when using the `else` clause of a `switch` though, as it'll match any newly added enum values, which may or may not be the behavior that you want.

## [Tagged Unions](#unions)

An union defines a set of types that a value can have. For example, this `Number` union can either be an `integer`, a `float` or a `nan` (not a number):

```zig
const std = @import("std");

pub fn main() void {
	const n = Number{.int = 32};
	std.debug.print("{d}\n", .{n.int});
}

const Number = union {
	int: i64,
	float: f64,
	nan: void,
};
```

A union can only have one field set at a time; it's an error to try to access an unset field. Since we've set the `int` field, if we then tried to access `n.float`, we'd get an error. One of our fields, `nan`, has a `void` type. How would we set its value? Use `{}`: 

```zig
const n = Number{.nan = {}};
```

A challenge with unions is knowing which field is set. This is where tagged unions come into play. A tagged union merges an enum with an union, which can be used in a switch statement. Consider this example:

```zig
pub fn main() void {
	const ts = Timestamp{.unix = 1693278411};
	std.debug.print("{d}\n", .{ts.seconds()});
}

const TimestampType = enum {
	unix,
	datetime,
};

const Timestamp = union(TimestampType) {
	unix: i32,
	datetime: DateTime,

	const DateTime = struct {
		year: u16,
		month: u8,
		day: u8,
		hour: u8,
		minute: u8,
		second: u8,
	};

	fn seconds(self: Timestamp) u16 {
		switch (self) {
			.datetime => |dt| return dt.second,
			.unix => |ts| {
				const seconds_since_midnight: i32 = @rem(ts, 86400);
				return @intCast(@rem(seconds_since_midnight, 60));
			},
		}
	}
};
```

Notice that each case in our `switch` captures the typed value of the field. That is `dt` is a `Timestamp.DateTime` and `ts` is an `i32`. This is also the first time we've seen a structure nested within another type. `DateTime` could have been defined outside of the union. We're also seeing two new builtin functions: `@rem` to get the remainder and `@intCast` to convert the result to an `u16` (`@intCast` infers that we want an `u16` from our return type since the value is being returned).

As we can see from the above example, tagged unions can be used somewhat like interfaces, as long as all possible implementations are known ahead of time and can be baked into the tagged union.

Finally, the enum type of a tagged union can be inferred. Instead of defining a `TimestampType`, we could have done:

```zig
const Timestamp = union(enum) {
	unix: i32,
	datetime: DateTime,

	...
```

and Zig would have created an implicit enum based on our union's fields.

## [Optional](#optionals)

Any value can be declared as optional by prepending a question mark, `?`, to the type. Optional types can either be `null` or a value of the defined type:

```zig
var home: ?[]const u8 = null;
var name: ?[]const u8 = "Leto";
```

The need to have an explicit type should be clear: if we had just done `const name = "Leto";`, then the inferred type would be the non-optional `[]const u8`.

`.?` is used to access the value behind the optional type:

```zig
std.debug.print("{s}\n", .{name.?});
```

But we'll get a runtime panic if we use `.?` on a null. An `if` statement can safely unwrap an optional:

```zig
if (home) |h| {
	// h is a []const u8
	// we have a home value
} else {
	// we don't have a home value
}
```

`orelse` can be used to unwrap the optional or execute code. This is commonly used to specify a default, or return from the function:

```zig
const h = home orelse "unknown"
// or maybe

// exit our function
const h = home orelse return;
```

However, `orelse` can also be given a block and execute more complex logic. Optional types also integrate with `while`, and are frequently used for creating iterators. We won't implement an iterator, but hopefully this dummy code makes sense:

```zig
while (rows.next()) |row| {
	// do something with our row
}
```

## [Undefined](#undefined)

So far, every single variable that we've seen has been initialized to a sensible value. But sometimes we don't know the value of a variable when it's declared. Optionals are one option, but don't always make sense. In such cases we can set variables to `undefined` to leave them uninitialized.

One place where this is commonly done is when creating an array to be filled by some function:

```zig
var buf: [20]u8 = undefined;
const msg = try std.fmt.bufPrint(&buf, "over: {d}!\n", .{power_level});
std.debug.print("{s}\n" , .{msg});
```

The above still creates an array of 20 bytes, but leaves the memory uninitialized.

## [Errors](#errors)

Zig has simple and pragmatic error handling capabilities. It all starts with error sets, which look and behave like enums:

```zig
// Like our struct in Part 1, OpenError can be marked as "pub"
// to make it accessible outside of the file it is defined in
const OpenError = error {
	AccessDenied,
	NotFound,
};
```

A function, including `main`, can now return this error:

```zig
pub fn main() void {
	return OpenError.AccessDenied;
}

const OpenError = error {
	AccessDenied,
	NotFound,
};
```

If you try to run this, you'll get an error: _expected type 'void', found 'error{AccessDenied,NotFound}'_. This makes sense: we defined `main` with a `void` return type, yet we return something (an error, sure, but that's still not `void`). To solve this, we need to change our function's return type.

```zig
pub fn main() OpenError!void {
	return OpenError.AccessDenied;
}
```

This is called an error union type and it indicates that our function can return either an `OpenError` error or a `void` (aka, nothing). So far we've been quite explicit: we created an error set for the possible errors our function can return, and used that error set in the error union return type of our function. But, when it comes to errors, Zig has few neat tricks up its sleeve. First, rather than specifying an error union as `error set!return type` we can let Zig infer the error set by using: `!return type`. So we could, and probably would, define our `main` as:

```zig
pub fn main() !void
```

Second, Zig is capable of implicitly creating error sets for us. Instead of creating our error set, we could have done:

```zig
pub fn main() !void {
	return error.AccessDenied;
}
```

Our completely explicit and implicit approaches aren't exactly equivalents. For example, references to functions with implicit error sets require using the special `anyerror` type. Library developers might see advantages to being more explicit, such as self-documenting code. Still, I think both the implicit error sets and the inferred error union are pragmatic; I make heavy use of both.

The real value of error unions is the built-in language support in the shape of `catch` and `try`. A function call that returns an error union can include a `catch` clause. For example, an http server library might have code that looks like:

```zig
action(req, res) catch |err| {
	if (err == error.BrokenPipe or err == error.ConnectionResetByPeer) {
		return;
	} else if (err == error.BodyTooBig) {
		res.status = 431;
		res.body = "Request body is too big";
	} else {
		res.status = 500;
		res.body = "Internal Server Error";
		// todo: log err
	}
};
```

The `switch` version is more idiomatic:

```zig
action(req, res) catch |err| switch (err) {
	error.BrokenPipe, error.ConnectionResetByPeer => return,
	error.BodyTooBig => {
		res.status = 431;
		res.body = "Request body is too big";
	},
	else => {
		res.status = 500;
		res.body = "Internal Server Error";
	}
};
```

That's all quite fancy, but let's be honest, the most likely thing you're going to do in `catch` is bubble the error to the caller:

```zig
action(req, res) catch |err| return err;
```

This is so common that it's what `try` does. Rather than the above, we do:

```zig
try action(req, res);
```

This is particularly useful given that **error must be handled**. Most likely you'll do so with a `try` or `catch`.

Go developers will notice that `try` takes fewer keystrokes than `if err != nil { return err }`.

Most of the time you'll be using `try` and `catch`, but error unions are also supported by `if` and `while`, much like optional types. In the case of `while`, if the condition returns an error, the `else` clause is executed.

There is a special `anyerror` type which can hold any error. While we could define a function as returning `anyerror!TYPE` rather than `!TYPE`, the two are not equivalent. The inferred error set is created based on what the function can return. `anyerror` is the global error set, a superset of all error sets in the program. Therefore, using `anyerror` in a function signature is likely to signal that your function can return errors that, in reality, it cannot. `anyerror` is used for function parameters or struct fields that can work with any error (imagine a logging library).

It's not uncommon for a function to return an error union optional type. With an inferred error set, this looks like:

```zig
// load the last saved game
pub fn loadLast() !?Save {
	// TODO
	return null;
}
```

There are different ways to consume such functions, but the most compact is by using `try` to unwrap our error and then `orelse` to unwrap the optional. Here's a working skeleton:

```zig
const std = @import("std");

pub fn main() !void {
	// This is the line you want to focus on
	const save = (try Save.loadLast()) orelse Save.blank();
	std.debug.print("{any}\n", .{save});
}

pub const Save = struct {
	lives: u8,
	level: u16,

	pub fn loadLast() !?Save {
		//todo
		return null;
	}

	pub fn blank() Save {
		return .{
			.lives = 3,
			.level = 1,
		};
	}
};
```

While Zig has more depth, and some of the language features have greater capabilities, what we've seen in these first two parts is a significant part of the language. It will serve as a foundation, allowing us to explore more complex topics without getting too distracted by syntax.

[](/learning%5Fzig/language%5Foverview%5F1)Language Overview - Part 1 [](/learning%5Fzig)Intro [](/learning%5Fzig/style%5Fguide)Style Guide