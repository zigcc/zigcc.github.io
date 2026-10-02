 

Learning Zig - Coding in Zig 

[](/learning%5Fzig/generics)Generics [](/learning%5Fzig)Intro [](/learning%5Fzig/conclusion)Conclusion 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Coding In Zig](#coding)

With much of the language now covered, we're going to wrap things up by revisiting a few topics and looking at a few more practical aspects of using Zig. In doing so, we're going to introduce more of the standard library and present less trivial code snippets. 

## [Dangling Pointers](#danling%5Fpointers)

We begin by looking at more examples of dangling pointers. This might seem like an odd thing to focus on, but if you're coming from a garbage collected language, this is likely the biggest challenge you'll face.

Can you figure out what the following outputs?

```zig
const std = @import("std");

pub fn main() !void {
	var gpa = std.heap.DebugAllocator(.{}){};
	const allocator = gpa.allocator();

	var lookup = std.StringHashMap(User).init(allocator);
	defer lookup.deinit();

	const goku = User{.power = 9001};

	try lookup.put("Goku", goku);

	// returns an optional, .? would panic if "Goku"
	// wasn't in our hashmap
	const entry = lookup.getPtr("Goku").?;

	std.debug.print("Goku's power is: {d}\n", .{entry.power});

	// returns true/false depending on if the item was removed
	_ = lookup.remove("Goku");

	std.debug.print("Goku's power is: {d}\n", .{entry.power});
}

const User = struct {
	power: i32,
};
```

When I ran this, I got:

```text
Goku's power is: 9001
Goku's power is: -1431655766
```

This code introduces Zig's generic `std.StringHashMap` which is a specialized version of `std.AutoHashMap` with the key type set to `[]const u8`. Even if you aren't 100% sure what's going on, it's a good guess that my output relates to the fact that our second `print` happens after we `remove` the entry from `lookup`. Comment out the call to `remove`, and the output is normal.

The key to understanding the above code is to be aware of where data/memory exists, or, put differently, who _owns_ it. Remember that Zig arguments are passed-by-value, that is, we pass a \[shallow\] copy of the value. The `User` in our `lookup` is not the same memory referenced by `goku`. Our above code has **two** users, each with their own owner. `goku` is owned by `main`, and its copy is owned by `lookup`.

The `getPtr` method returns a pointer to the value in the map, in our case, it returns a `*User`. Herein lies the problem, `remove` makes our `entry` pointer invalid. In this example, the proximity of `getPtr` and `remove` makes the issue somewhat obvious. But it isn't hard to imagine code calling `remove` without knowing that a reference to the entry is being held somewhere else.

When I wrote this example, I wasn't sure what would happen. It was possible for `remove` to be implemented by setting an internal flag, delaying actual removal until a later event. If that had been the case, the above might have "worked" in our simple cases, but would have failed with more complicated usage. That sounds terrifyingly difficult to debug.

Besides not calling `remove`, we can fix this a few different ways. The first is that we could use `get` instead of `getPtr`. This would return a `User` instead of a `*User` and thus would return copy of the value in `lookup`. We'd then have three `Users`.

1. Our original `goku`, tied to the function.
2. The copy in `lookup`, owned by the lookup.
3. And a copy of our copy, `entry`, also tied to the function.

Because `entry` would now be its own independent copy of the user, removing it from `lookup` would not invalidate it.

Another option is to change `lookup`'s type from `StringHashMap(User)` to `StringHashMap(*const User)`. This code works:

```zig
const std = @import("std");

pub fn main() !void {
	var gpa = std.heap.DebugAllocator(.{}){};
	const allocator = gpa.allocator();

	// User -> *const User
	var lookup = std.StringHashMap(*const User).init(allocator);
	defer lookup.deinit();

	const goku = User{.power = 9001};

	// goku -> &goku
	try lookup.put("Goku", &goku);

	// getPtr -> get
	const entry = lookup.get("Goku").?;

	std.debug.print("Goku's power is: {d}\n", .{entry.power});
	_ = lookup.remove("Goku");
	std.debug.print("Goku's power is: {d}\n", .{entry.power});
}

const User = struct {
	power: i32,
};
```

There are a number of subtleties in the above code. First of all, we now have a single `User`, `goku`. The value in `lookup` and `entry` are both references to `goku`. Our call to `remove` still removes the value from our `lookup`, but that value is just the address of `user`, it isn't `user` itself. If we had stuck with `getPtr`, we'd get an invalid `**User`, invalid because of `remove`. In both solutions, we had to use `get` instead of `getPtr`, but in this case, we're just copying the address, not the full `User`. For large objects, that can be a significant difference.

With everything in a single function and a small value like `User`, this still feels like an artificially created problem. We need an example that legitimately makes data ownership an immediate concern.

## [Ownership](#ownership)

I love hash maps because they're something everyone knows and everyone uses. They also have a lot of different use cases, most of which you've probably experienced first hand. While they can be used as short lived lookups, they're often long-lived and thus require equally long-lived values.

This code populates our `lookup` with names you enter in the terminal. An empty name stops the prompt loop. Finally, it detects whether "Leto" was one of the supplied names.

```zig
const std = @import("std");
const builtin = @import("builtin");

pub fn main(init: std.process.Init) !void {
  // This `std.process.Init` parameter is something we haven't seen before. It's
  // called "juicy main" and was added in Zig 0.16. It's completely opt-in, but
  // it removes some setup boilerplate that most programs need. I'm using it
  // here to get a default `io` instance (and, while we're at it, an allocator).
  // `Io` is outside the scope of this tutorial.
  const io = init.io;
  const allocator = init.gpa;

  var lookup = std.StringHashMap(User).init(allocator);
  defer lookup.deinit();

  var buf: [30]u8 = undefined;
  var stdin = std.Io.File.stdin().reader(io, &buf);

  var stdout = std.Io.File.stdout().writer(io, &.{});

  var i: i32 = 0;
  while (true) : (i += 1) {
    try stdout.interface.print("Please enter a name: ", .{});
    var name = try stdin.interface.takeDelimiter('\n') orelse break;
    if (builtin.os.tag == .windows) {
      // In Windows lines are terminated by \r\n.
      // We need to strip out the \r
      name = @constCast(std.mem.trimEnd(u8, name, "\r"));
    }
    if (name.len == 0) {
      break;
    }
    try lookup.put(name, .{.power = i});
  }

  const has_leto = lookup.contains("Leto");
  std.debug.print("{any}\n", .{has_leto});
}

const User = struct {
  power: i32,
};
```

The initial version of this code wouldn't compile on Windows. The `@constCast` that you now see needed to be added. We've seen other builtin functions, but this one is more advanced. I debated removing the entire line, but I wanted people to be able to follow along on Windows and thus needed the trim. There were simpler solutions specific to this case, but instead I decided to stick with the unsafe `@constCast`. I've written [a blog post](/Zigs-ConstCast/) based on this example which explains why its necessary - but it's considerably more advanced. It's the type of thing you might want to come back to after spending more time with Zig

The code is case sensitive, but no matter how perfectly we type "Leto", `contains` always returns `false`. Let's debug this by iterating through `lookup` and dumping the keys and values:

```zig
// Place this code after the while loop

var it = lookup.iterator();
while (it.next()) |kv| {
	std.debug.print("{s} == {any}\n", .{kv.key_ptr.*, kv.value_ptr.*});
}
```

This iterator pattern is common in Zig, and relies on the synergy between `while` and optional types. Our iterator item returns pointers to our key and value, hence we dereference them with `.*` to access the actual value rather than the address. The output will depend on what you enter, but I got:

```text
Please enter a name: Paul
Please enter a name: Teg
Please enter a name: Leto
Please enter a name:

�� == learning.User{ .power = 1 }

��� == learning.User{ .power = 0 }

��� == learning.User{ .power = 2 }
false
```

The values look ok, but not the keys. If you're not sure what's happening, it's probably my fault. Earlier, I intentionally misdirected your attention. I said that hash maps are often long-lived and thus require long-lived _values_. The truth is that they require long-lived values **as well as** long-lived keys! Notice that `name` is defined inside our `while` loop. When we call `put`, we're giving our hash map a key that has a far shorter lifetime than the hash map itself. Moving `name` _outside_ the `while` loop solves our lifetime issue, but that buffer is reused in each iteration. It still won't work because we're mutating the underlying key data.

For our above code, there's really only one solution: our `lookup` must take ownership of the keys. We need to add one line and change another:

```zig
// replace the existing lookup.put with these two lines
const owned_name = try allocator.dupe(u8, name);

// name -> owned_name
try lookup.put(owned_name, .{.power = i});
```

`dupe` is a method of `std.mem.Allocator` that we haven't seen before. It allocates a duplicate of the given value. The code now works because our keys, now on the heap, outlive `lookup`. In fact, we've done too good a job of extending the lifetime of those strings: we've introduced memory leaks.

You might have thought that when we called `lookup.deinit`, our keys and values would be freed for us. But there's no one-size-fits-all solution that `StringHashMap` could use. First, the keys could be string literals, which cannot be freed. Second, they could have been created with a different allocator. Finally, while more advanced, there are legitimate cases where keys might not be owned by the hash map.

The only solution is to free the keys ourselves. At this point, it would probably make sense to create our own `UserLookup` type and encapsulate this cleanup logic in our `deinit` function. We'll keep things messy:

```zig
// replace the existing:
//   defer lookup.deinit();
// with:
defer {
	var it = lookup.keyIterator();
	while (it.next()) |key| {
		allocator.free(key.*);
	}
	lookup.deinit();
}
```

Our `defer` logic, the first we've seen with a block, frees each key and then deinitializes `lookup`. We're using `keyIterator` to only iterate the keys. The iterator value is a pointer to the key entry in the hash map, a `*[]const u8`. We want to free the actual value, since that's what we allocated via `dupe`, so we dereference the value using `.*`.

I promise, we're done talking about dangling pointers and memory management. What we've discussed might still be unclear or too abstract. It's fine to revisit this when you have a more hands on problem to solve. That said, if you plan on writing anything non-trivial, this is something you'll almost certainly need to master. When you're feeling up to it, I urge you to take the prompt loop example and play with it on your own. Introduce a `UserLookup` type that encapsulates all of the memory management we had to do. Try having `*User` values instead of `User`, creating the users on the heap and freeing them like we did the keys. Write tests that covers your new structure, using the `std.testing.allocator` to make sure you aren't leaking any memory.

## [ArrayList](#arraylist)

You'll be glad to know that you can forget about our `IntList` and the generic alternative we created. Zig has a proper dynamic array implementation: `std.ArrayList(T)`.

It's pretty standard stuff, but it's such a commonly needed and used data structure that it's worth seeing it in action:

```zig
const std = @import("std");
const builtin = @import("builtin");
const Allocator = std.mem.Allocator;

pub fn main(init: std.process.Init) !void {
  const io = init.io;
  const allocator = init.gpa;

  var arr: std.ArrayList(User) = .empty;
  defer {
    for (arr.items) |user| {
      user.deinit(allocator);
    }
    arr.deinit(allocator);
  }

  var buf: [30]u8 = undefined;
  var stdin = std.Io.File.stdin().reader(io, &buf);
  var stdout = std.Io.File.stdout().writer(io, &.{});

  var i: i32 = 0;
  while (true) : (i += 1) {
    try stdout.interface.print("Please enter a name: ", .{});
    var name = try stdin.interface.takeDelimiter('\n') orelse break;

    if (builtin.os.tag == .windows) {
      // In Windows lines are terminated by \r\n.
      // We need to strip out the \r
      name = @constCast(std.mem.trimEnd(u8, name, "\r"));
    }
    if (name.len == 0) {
      break;
    }
    const owned_name = try allocator.dupe(u8, name);
    try arr.append(allocator, .{.name = owned_name, .power = i});
  }

  var has_leto = false;
  for (arr.items) |user| {
    if (std.mem.eql(u8, "Leto", user.name)) {
      has_leto = true;
      break;
    }
  }

  std.debug.print("{any}\n", .{has_leto});
}

const User = struct {
  name: []const u8,
  power: i32,

  fn deinit(self: User, allocator: Allocator) void {
    allocator.free(self.name);
  }
};
```

Above is a reproduction of our hash map code, but using an `ArrayList(User)`. All of the same lifetime and memory management rules apply. Notice that we're still creating a `dupe` of the name, and we're still freeing each name before we `deinit` the `ArrayList`.

This is a good time to point out that Zig doesn't have properties or private fields. You can see this when we access `arr.items` to iterate through the values. The reason for not having properties is to eliminate a source of surprises. In Zig, if it looks like a field access, it **is** a field access. Personally, I think the lack of private fields is a mistake, but it's certainly something we can work around. I've taken to prefixing fields with underscore to signal "internal use only".

Because the string "type" is a `[]u8` or `[]const u8`, an `ArrayList(u8)` is the appropriate type for a string builder, like .NET's `StringBuilder` or Go's `strings.Builder`.

## [Anytype](#anytype)

In part 1, we briefly talked about `anytype`. It's a pretty useful form of compile-time duck-typing. Here's a simple logger:

```zig
pub const Logger = struct {
	level: Level,

	// "error" is reserved, names inside an @"..." are always
	// treated as identifiers
	const Level = enum {
		debug,
		info,
		@"error",
		fatal,
	};

	fn info(logger: Logger, msg: []const u8, out: anytype) !void {
		if (@intFromEnum(logger.level) <= @intFromEnum(Level.info)) {
			try out.writeAll(msg);
		}
	}
};
```

The `out` parameter of our `info` function has the type `anytype`. This means that our `Logger` can log messages to any structure that has a `writeAll` method accepting a `[]const u8` and returning a `!void`. This isn't a runtime feature. Type checking happens at compile-time and for each type used, a correctly typed function is created. If we try to call `info` with a type that doesn't have all of the necessary functions (in this case just `writeAll`), we'll get a compile time error:

```zig
var l = Logger{.level = .info};
try l.info("server started", true);
```

Giving us: _no field or member function named 'writeAll' in 'bool'_. But if we pass it an \`\*std.Io.Writer\`, which _does_ implement `writeAll`, the code will work:

```zig
pub fn main() !void {
    var l = Logger{.level = .info};

    const w = LineLimiter{.max = 80};
    try l.info("a" ** 85, &w);
}

const LineLimiter = struct {
    max: usize,

    pub fn writeAll(self: *const LineLimiter, data: []const u8) !void {
        var remaining = data;
        while (remaining.len > 0) {
            const len = @min(self.max, remaining.len);
            std.debug.print("{s}\n", .{remaining[0..len]});
            remaining = remaining[len..];
        }
    }
};
```

Note that, in this case, LineLimiter should probably implement the `*std.Io.Writer` interface to be more generally usable. But, prior to Zig 0.15 - which redesigned the Writer and Reader interfaces - the use of anytype for a generic writer was common. And while this specific usage will likely be phased out, you'll no doubt see and use `anytype` in much the same way; maybe just not to capture different writers.

## [@TypeOf](#typeof)

In previous parts, we used `@TypeOf` to help us examine the type of various variables. From our usage, you'd be forgiven for thinking that it returns the name of the type as a string. However, given that it's a PascalCase function, you should know better: it returns a `type`.

One of my favorite usages of `anytype` is to pair it with the `@TypeOf` and `@hasField` builtin functions for writing test helpers. Although every `User` type that we've seen has been very simple, I'll ask you to imagine a more complex structure with many fields. In many of our tests, we need a `User`, but we only want to specify the fields relevant to the test. Let's create a `userFactory`:

```zig
fn userFactory(data: anytype) User {
	const T = @TypeOf(data);
	return .{
		.id = if (@hasField(T, "id")) data.id else 0,
		.power = if (@hasField(T, "power")) data.power else 0,
		.active  = if (@hasField(T, "active")) data.active else true,
		.name  = if (@hasField(T, "name")) data.name else "",
	};
}

pub const User = struct {
	id: u64,
	power: u64,
	active: bool,
	name: [] const u8,
};
```

A default user can be created by calling `userFactory(.{})`, or we can override specific fields with `userFactory(.{.id = 100, .active = false})`. It's a small pattern, but I really like it. It's also a nice baby step into the world of metaprogramming.

More commonly `@TypeOf` is paired with `@typeInfo`, which returns an `std.builtin.Type`. This is a powerful tagged union that fully describes a type. The `std.json.Stringify.value` function recursively uses this on the provided `value` to figure out how to serialize it.

## [Zig Build](#build)

If you've read through this entire guide waiting for insight into setting up more complex projects, with multiple dependencies and various targets, you're about to be disappointed. Zig has a powerful build system, so much so that an increasing number of non-Zig projects are making use of it, such as libsodium. Unfortunately, all of that power means that, for simpler needs, it isn't the easiest to use, or understand.

The truth is, I don't understand Zig's build system well enough to explain it.

Still, we can at least get a brief overview. To run our Zig code, we've used `zig run learning.zig`. Once, we also used `zig test learning.zig` to run a test. The `run` and `test` commands are fine for playing around, but it's the `build` command you'll need for anything more complex. The `build` command relies on a `build.zig` file with the special `build` entrypoint. Here's a skeleton:

```zig
// build.zig

const std = @import("std");

pub fn build(b: *std.Build) !void {
	_ = b;
}
```

Every build has a default "install" step, which you can now run with `zig build install`, but since our file is mostly empty, you won't get any meaningful artifacts. We need to tell our build about our program's entry point, which is in `learning.zig`:

```zig
const std = @import("std");

pub fn build(b: *std.Build) !void {
	const target = b.standardTargetOptions(.{});
	const optimize = b.standardOptimizeOption(.{});

	// setup executable
	const exe = b.addExecutable(.{
		.name = "learning",
		.root_module = b.createModule(.{
			.target = target,
			.optimize = optimize,
			.root_source_file = b.path("learning.zig"),
		}),
	});
	b.installArtifact(exe);
}
```

Now if you run `zig build install`, you'll get a binary at `./zig-out/bin/learning`. Using the standard targets and optimizations allows us to override the default as command line arguments. For example to build a size-optimized version of our program for Windows, we'd do:

```zig
zig build install -Doptimize=ReleaseSmall -Dtarget=x86_64-windows-gnu
```

An executable will often have two additional steps, beyond the default "install": "run" and "test". A library might have a single "test" step. For a basic argument-less `run`, we need to add four lines to the end of our build:

```zig
// add after: b.installArtifact(exe);

const run_cmd = b.addRunArtifact(exe);
run_cmd.step.dependOn(b.getInstallStep());

const run_step = b.step("run", "Start learning!");
run_step.dependOn(&run_cmd.step);
```

This creates two dependencies via the two calls to `dependOn`. The first ties our new run command to the built-in install step. The second ties the "run" step to our newly created "run" command. You might be wondering why you need a run command as well as a run step. I believe this separation exists to support more complicated setups: steps that depend on multiple commands, or commands that are used across multiple steps. If you run `zig build --help` and scroll to the top, you'll see our new "run" step. You can now run the program by executing `zig build run`.

To add a "test" step, you'll duplicate most of the run code we just added, but rather than `b.addExecutable`, you'll kick things off with `b.addTest`:

```zig
const mod = b.createModule(.{
	.target = target,
	.optimize = optimize,
	.root_source_file = b.path("learning.zig"),
});

{
	// setup exe
	const exe = b.addExecutable(.{
			.name = "learning",
			.root_module = mod,
	});
	b.installArtifact(exe);

	const run_cmd = b.addRunArtifact(exe);
	run_cmd.step.dependOn(b.getInstallStep());
	const run_step = b.step("run", "Start learning!");
	run_step.dependOn(&run_cmd.step);
}

{
	// setup tests
	const tests = b.addTest(.{
		.root_module = mod,
	});

	const test_cmd = b.addRunArtifact(tests);
	test_cmd.step.dependOn(b.getInstallStep());
	const test_step = b.step("test", "Run the tests");
	test_step.dependOn(&test_cmd.step);
}
```

We gave this step the name of "test". Running `zig build --help` should now show another available step, "test". Since we don't have any tests, it's hard to tell whether this is working or not. Within `learning.zig`, add:

```zig
test "dummy build test" {
	try std.testing.expectEqual(false, true);
}
```

Now when you run `zig build test`, you should get a test failure. If you fix the test and run `zig build test` again, you won't get any output. By default, Zig's test runner only outputs on failure. Use `zig build test --summary all` if, like me, pass or fail, you always want a summary.

This is the minimal configuration you'll need to get up and running. But rest easy knowing that if you need to build it, Zig can probably handle it. Finally, you can, and probably should, use `zig init` within your project root to have Zig create a well-documented build.zig file for you.

## [Third Party Dependencies](#dependencies)

Zig's built-in package manager is relatively new and, as a consequence, has a number of rough edges. While there is room for improvements, it's usable as is. There are two parts we need to look at: creating a package and using packages. We'll go through this in full.

First, create a new folder named `calc` and create three files. The first is `add.zig`, with the following content:

```zig
// Oh, a hidden lesson, look at the type of b
// and the return type!!

pub fn add(a: anytype, b: @TypeOf(a)) @TypeOf(a) {
	return a + b;
}

const testing = @import("std").testing;
test "add" {
	try testing.expectEqual(32, add(30, 2));
}
```

It's a bit silly, a whole package just to add two values, but it will let us focus on the packaging aspect. Next we'll add an equally silly: `calc.zig`:

```zig
pub const add = @import("add.zig").add;

test {
	// By default, only tests in the specified file
	// are included. This magic line of code will
	// cause a reference to all nested containers
	// to be tested.
	@import("std").testing.refAllDecls(@This());
}
```

We're splitting this up between `calc.zig` and `add.zig` to prove that `zig build` will automatically build and package all of our project files. Finally, we can add a `build.zig`:

```zig
const std = @import("std");

pub fn build(b: *std.Build) !void {
	const target = b.standardTargetOptions(.{});
	const optimize = b.standardOptimizeOption(.{});

	const tests = b.addTest(.{
		.root_module = b.addModule(.{
			.target = target,
			.optimize = optimize,
			.root_source_file = b.path("calc.zig"),
		});
	});

	const test_cmd = b.addRunArtifact(tests);
	test_cmd.step.dependOn(b.getInstallStep());
	const test_step = b.step("test", "Run the tests");
	test_step.dependOn(&test_cmd.step);
}
```

This is all a repetition of what we saw in the previous section. With this, you can run `zig build test --summary all`.

Back to our `learning` project and our previously created `build.zig`. We'll begin by adding our local `calc` as a dependency. We need to make three additions. First, we'll create a module pointing to our `calc.zig`:

```zig
// You can put this near the top of the build
// function, before the call to addExecutable.

const calc_module = b.createModule("calc", .{
	.root_source_file = b.path("PATH_TO_CALC_PROJECT/calc.zig"),
});
```

You'll need to adjust the path to `calc.zig`. We now need to add this module to both our existing `exe` and `tests` variables. Since our `build.zig` is getting busier, we'll try to organize things a little:

```zig
const std = @import("std");

pub fn build(b: *std.Build) !void {
	const target = b.standardTargetOptions(.{});
	const optimize = b.standardOptimizeOption(.{});

	const calc_module = b.createModule("calc", .{
		.root_source_file = b.path("PATH_TO_CALC_PROJECT/calc.zig"),
	});

	const mod = b.createModule(.{
		.target = target,
		.optimize = optimize,
		.root_source_file = b.path("learning.zig"),
		.imports = &.{
			.{.name = "calc", .module = calc_module},
		}
	});

	// setup our exe and test like before
}
```

From within your project, you're now able to `@import("calc")`:

```zig
const calc = @import("calc");
...
calc.add(1, 2);
```

Adding a remote dependency takes a bit more effort. First, we need to go back to the `calc` project and define a module. You might think that the project itself is a module, but a project can expose multiple modules, so we need to explicitly create it. We use the same `addModule`, but discard the return value. Simply calling `addModule` is enough to define the module which other projects will then be able to import.

```zig
_ = b.addModule("calc", .{
	.root_source_file =  b.path("calc.zig"),
});
```

This is the only change we need to make to our library. Because this is an exercise in having a remote dependency, I've pushed this `calc` project to Github so that we can import it into our learning project. It's available at <https://github.com/karlseguin/calc.zig>.

Back in our learning project, we need a new file, `build.zig.zon`. "ZON" stands for Zig Object Notation and it allows Zig data to be expressed in a human readable format, and for that human readable format to be turned into Zig code. The contents of the `build.zig.zon` will be:

```zig
.{
  .name = .learning,
  .paths = .{""},
  .version = "0.0.0",
  .dependencies = .{
    .calc = .{
      .url = "https://github.com/karlseguin/calc.zig/archive/d1881b689817264a5644b4d6928c73df8cf2b193.tar.gz",
      .hash = "12ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    },
  },
}
```

There are two questionable values in this file, the first is `d1881b689817264a5644b4d6928c73df8cf2b193` within the `url`. This is simply the git commit hash. The second is the value of `hash`. As far as I know, there's currently no great way to tell what this value should be, so we use a dummy value for the time being.

To use this dependency, we need to make one change to our `build.zig`:

```zig
// replace this:
const calc_module = b.createModule("calc", .{
	.root_source_file = b.path("PATH_TO_CALC_PROJECT/calc.zig"),
});

// with this:
const calc_dep = b.dependency("calc", .{.target = target, .optimize = optimize});
const calc_module = calc_dep.module("calc");
```

In `build.zig.zon` we named the dependency `calc`, and that's the dependency that we're loading here. From within this dependency, we're grabbing the `calc` module, which is what we named the module in `calc`'s `build.zig`.

If you try to run `zig build test`, you should see an error:

```text
hash mismatch: manifest declares
122053da05e0c9348d91218ef015c8307749ef39f8e90c208a186e5f444e818672da

but the fetched package has
122036b1948caa15c2c9054286b3057877f7b152a5102c9262511bf89554dc836ee5
```

Copy and paste the correct hash back into the `build.zig.zon` and try running `zig build test` again. Everything should now be working.

It sounds like a lot, and I hope things get streamlined. But it's mostly something you can copy and paste from other projects and, once setup, you can move on.

We've covered a lot of ground, exploring a few core data structures and bringing large chunks of previous parts together. Our code has become a little more complex, focusing less on specific syntax and looking more like real code. I'm excited by the possibility that, despite this complexity, the code mostly made sense. If it didn't, don't give up. Pick an example and break it, add print statements, write some tests for it. Get hands on with the code, making your own, and then come back and read over those parts that didn't make sense.

[](/learning%5Fzig/generics)Generics [](/learning%5Fzig)Intro [](/learning%5Fzig/conclusion)Conclusion