 

Learning Zig - Heap Memory & Allocators 

[](/learning%5Fzig/stack%5Fmemory)Stack Memory [](/learning%5Fzig)Intro [](/learning%5Fzig/generics)Generics 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Heap Memory and Allocators](#heap%5Fmemory)

Everything we've seen so far has been constrained by requiring an upfront size. Arrays always have a compile-time known length (in fact, the length is part of the type). All of our strings have been string literals, which have a compile-time known length.

Furthermore, the two types of memory management strategies we've seen, global data and the call stack, while simple and efficient, are limiting. Neither can deal with dynamically sized data and both are rigid with respect to data lifetimes.

This part is divided into two themes. The first is a general overview of our third memory area, the heap. The other is Zig's straightforward but unique approach to managing heap memory. Even if you're familiar with heap memory, say from using C's `malloc`, you'll want to read the first part as it is quite specific to Zig.

## [The Heap](#heap)

The heap is the third and final memory area at our disposal. Compared to both global data and the call stack, the heap is a bit of a wild west: anything goes. Specifically, within the heap, we can create memory at runtime with a runtime known size and have complete control over its lifetime.

The call stack is amazing because of the simple and predictable way it manages data (by pushing and popping stack frames). This benefit is also a drawback: data has a lifetime tied to its place on the call stack. The heap is the exact opposite. It has no built-in life cycle, so our data can live for as long or as short as necessary. And that benefit is its drawback: it has no built-in life cycle, so if we don't free data no one will.

Let's look at an example:

```zig
const std = @import("std");

pub fn main() !void {
	// we'll be talking about allocators shortly
	var gpa = std.heap.DebugAllocator(.{}){};
	const allocator = gpa.allocator();

	// ** The next two lines are the important ones **
	var arr = try allocator.alloc(usize, try getRandomCount());
	defer allocator.free(arr);

	for (0..arr.len) |i| {
		arr[i] = i;
	}
	std.debug.print("{any}\n", .{arr});
}

fn getRandomCount() !u8 {
	// TODO: use a proper seed, not 0.
	var prng = std.Random.DefaultPrng.init(0);
	const random = prng.random();
	return random.uintAtMost(u8, 5) + 5;
}
```

We'll cover Zig allocators shortly, for now know that the `allocator` is a `std.mem.Allocator`. We're using two of its methods: `alloc` and `free`. Because we're calling `allocator.alloc` with a `try`, we know that it can fail. Currently, the only possible error is `OutOfMemory`. Its parameters mostly tell us how it works: it wants a type (`T`) as well as a count and, on success, returns a slice of `[]T`. This allocation happens at runtime - it has to, our count is only known at runtime.

As a general rule, every `alloc` will have a corresponding `free`. Where `alloc` allocates memory, `free` releases it. Don't let this simple code limit your imagination. This `try alloc` \+ `defer free` pattern _is_ common, and for good reason: freeing close to where we allocate is relatively foolproof. But equally common is allocating in one place while freeing in another. As we said before, the heap has no builtin life cycle management. You can allocate memory in an HTTP handler and free it in a background thread, two completely separate parts of the code.

## [defer & errdefer](#defer)

As a small detour, the above code introduced a new language feature: `defer` which executes the given code, or block, on scope exit. "Scope exit" includes reaching the end of the scope or returning from the scope. `defer` isn't strictly related to allocators or memory management; you can use it to execute any code. But the above usage is common.

Zig's defer is similar to Go's, with one major difference. In Zig, the defer will be run at the end of its containing scope. In Go, defer is run at the end of the containing function. Zig's approach is probably less surprising, unless you're a Go developer.

A relative of `defer` is `errdefer` which similarly executes the given code or block on scope exit, but only when an error is returned. This is useful when doing more complex setup and having to undo a previous allocation because of an error.

The following example is a jump in complexity. It showcases both `errdefer` and a common pattern that sees `init` allocating and `deinit` freeing:

```zig
const std = @import("std");
const Allocator = std.mem.Allocator;

pub const Game = struct {
	players: []Player,
	history: []Move,
	allocator: Allocator,

	fn init(allocator: Allocator, player_count: usize) !Game {
		var players = try allocator.alloc(Player, player_count);
		errdefer allocator.free(players);

		// store 10 most recent moves per player
		var history = try allocator.alloc(Move, player_count * 10);

		// This isn't strickly necessary. Nothing following the above alloc
		// can fail, so this errdefer will never be executed. HOWEVER, if the
		// function changes and fallible code is added, it could be easy to forget
		// adding this.
		errdefer allocator.free(history);

		return .{
			.players = players,
			.history = history,
			.allocator = allocator,
		};
	}

	fn deinit(game: Game) void {
		const allocator = game.allocator;
		allocator.free(game.players);
		allocator.free(game.history);
	}
};
```

Hopefully this highlights two things. First, the usefulness of `errdefer`. Under normal conditions, `players` is allocated in `init` and released in `deinit`. But there's an edge case when the initialization of `history` fails. In this case and only this case we need to undo the allocation of `players`.

The second noteworthy aspect of this code is that the life cycle of our two dynamically allocated slices, `players` and `history`, is based on our application logic. There's no rule that dictates when `deinit` has to be called or who has to call it. This is good, because it gives us arbitrary lifetimes, but bad because we can mess it up by never calling `deinit` or calling it more than once.

The names `init` and `deinit` aren't special. They're just what the Zig standard library uses and what the community has adopted. In some cases, including in the standard library, `open` and `close`, or other more appropriate names, are used.

## [Double Free & Memory Leaks](#memory%5Fleaks)

Just above, I mentioned that there were no rules that govern when something has to be freed. But that's not entirely true, there are a few important rules, they're just not enforced except by your own meticulousness.

The first rule is that you can't free the same memory twice.

```zig
const std = @import("std");

pub fn main() !void {
	var gpa = std.heap.DebugAllocator(.{}){};
	const allocator = gpa.allocator();

	var arr = try allocator.alloc(usize, 4);
	allocator.free(arr);
	allocator.free(arr);

	std.debug.print("This won't get printed\n", .{});
}
```

The last line of this code is prophetic, it _won't_ be printed. This is because we `free` the same memory twice. This is known as a double-free and is not valid. This might seem simple enough to avoid, but in large projects with complex lifetimes, it can be hard to track down.

The second rule is that you can't free memory you don't have a reference to. That might sound obvious, but it isn't always clear who is responsible for freeing it. The following creates a new lowercase string:

```zig
const std = @import("std");
const Allocator = std.mem.Allocator;

fn allocLower(allocator: Allocator, str: []const u8) ![]const u8 {
	var dest = try allocator.alloc(u8, str.len);

	for (str, 0..) |c, i| {
		dest[i] = switch (c) {
			'A'...'Z' => c + 32,
			else => c,
		};
	}

	return dest;
}
```

The above code is fine. But the following usage isn't:

```zig
// For this specific code, we should have used std.ascii.eqlIgnoreCase
fn isSpecial(allocator: Allocator, name: [] const u8) !bool {
	const lower = try allocLower(allocator, name);
	return std.mem.eql(u8, lower, "admin");
}
```

This is a memory leak. The memory created in `allocLower` is never freed. Not only that, but once `isSpecial` returns, it can never be freed. In languages with garbage collectors, when data becomes unreachable, it'll eventually be freed by the garbage collector. But in the above code, once `isSpecial` returns, we lose our only reference to the allocated memory, the `lower` variable. The memory is gone until our process exits. Our function might only leak a few bytes, but if it's a long running process and this function is called repeatedly, it _will_ add up and we'll eventually run out of memory.

At least in the case of double free, we'll get a hard crash. Memory leaks can be insidious. It isn't just that the root cause can be difficult to identify. Really small leaks or leaks in infrequently executed code, can be even harder to detect. This is such a common problem that Zig does provide help, which we'll see when talking about allocators.

## [create & destroy](#create)

The `alloc` method of `std.mem.Allocator` returns a slice with the length that was passed as the 2nd parameter. If you want a single value, you'll use `create` and `destroy` instead of `alloc` and `free`. A few parts back, when learning about pointers, we created a `User` and tried to increment its power. Here's the working heap-based version of that code using `create:`

```zig
const std = @import("std");

pub fn main() !void {
	// again, we'll talk about allocators soon!
	var gpa = std.heap.DebugAllocator(.{}){};
	const allocator = gpa.allocator();

	// create a User on the heap
	var user = try allocator.create(User);

	// free the memory allocated for the user at the end of this scope
	defer allocator.destroy(user);

	user.id = 1;
	user.power = 100;

	// this line has been added
	levelUp(user);
	std.debug.print("User {d} has power of {d}\n", .{user.id, user.power});
}

fn levelUp(user: *User) void {
	user.power += 1;
}

pub const User = struct {
	id: u64,
	power: i32,
};
```

The `create` method takes a single parameter, the type (`T`). It returns a pointer to that type or an error, i.e. `!*T`. Maybe you're wondering what would happen if we created our `user` but didn't set the `id` and/or `power`. This is like setting those fields to `undefined` and the behavior is, well, undefined.

In chapter 5 we talked about dangling pointers. The original example, which has since been removed, looked like:

```zig
pub const User = struct {
	fn init(id: u64, power: i32) *User{
		var user = User{
			.id = id,
			.power = power,
		};
		// this is a dangling pointer
		return &user;
	}
};
```

This was replaced because, as-of Zig 0.16, the compiler catches the mistake. Now, in this case, it probably made sense to return a `User` as opposed to a pointer to `User` (i.e. `*User`). But sometimes you _will_ want a function to return a pointer to something it creates. You'll do this when you want a lifetime to be free from the call stack's rigidity. To solve our dangling pointer above, we could have used `create`:

```zig
// our return type changed, since init can now fail
// *User -> !*User
fn init(allocator: std.mem.Allocator, id: u64, power: i32) !*User{
	const user = try allocator.create(User);
	user.* = .{
		.id = id,
		.power = power,
	};
	return user;
}
```

I've introduced new syntax, `user.* = .{...}`. It's a bit weird, and I don't love it, but you will see it. The right side is something you've already seen: it's a structure initializer with an inferred type. We could have been explicit and used: `user.* = User{...}`. The left side, `user.*`, is how we dereference a pointer. `&` takes a `T` and gives us `*T`. `.*` is the opposite, applied to a value of type `*T` it gives us `T`. Remember that `create` returns a `!*User`, so our `user` is of type `*User`.

## [Allocators](#allocators)

One of Zig's core principle is _no hidden memory allocations_. Depending on your background, that might not sound too special. But it's a sharp contrast to what you'll find in C where memory is allocated with the standard library's `malloc` function. In C, if you want to know whether or not a function allocates memory, you need to read the source and look for calls to `malloc`.

Zig doesn't have a default allocator. In all of the above examples, functions that allocated memory took an `std.mem.Allocator` parameter. By convention, this is usually the first parameter. All of Zig's standard library, and most third party libraries, require the caller to provide an allocator if they intend to allocate memory.

This explicitness can take one of two forms. In simple cases, the allocator is provided on each function call. There are many examples of this, but `std.fmt.allocPrint` is one you'll likely need sooner or later. It's similar to the `std.debug.print` we've been using, but allocates and returns a string instead of writing it to stderr:

```zig
const say = std.fmt.allocPrint(allocator, "It's over {d}!!!", .{user.power});
defer allocator.free(say);
```

The other form is when an allocator is passed to `init`, and then used internally by the object. We saw this above with our `Game` structure. This is less explicit, since you've given the object an allocator to use, but you don't know which method calls will actually allocate. This approach is more practical for long-lived objects.

The advantage of injecting the allocator isn't just explicitness, it's also flexibility. `std.mem.Allocator` is an interface which provides the `alloc`, `free`, `create` and `destroy` functions, along with a few others. So far we've only seen the `std.heap.DebugAllocator`, but other implementations are available in the standard library or as third party libraries.

Zig doesn't have nice syntactical sugar for creating interfaces. One pattern for interface-like behaviour are tagged unions, though that's relatively constrained compared to true interfaces. Other patterns have emerged and are used throughout the standard library, such as with `std.mem.Allocator`. If you're interested, I've written [](/Zig-Interfaces)a separate blog post explaining interfaces.

If you're building a library, then it's best to accept an `std.mem.Allocator` and let users of your library decide which allocator implementation to use. Otherwise, you'll need to chose the right allocator, and, as we'll see, these are not mutually exclusive. There can be good reasons to create different allocators within your program.

## [DebugAllocator](#gpa)

As the name implies, the `std.heap.DebugAllocator` is a thread-safe allocator meant to be used during development. For many programs, this will be the only allocator needed. On program start, an allocator is created and passed to functions that need it. The sample code from my HTTP server library is a good example:

```zig
const std = @import("std");
const httpz = @import("httpz");

pub fn main() !void {
	// create our general purpose allocator
	var gpa = std.heap.DebugAllocator(.{}){};

	// get an std.mem.Allocator from it
	const allocator = gpa.allocator();

	// pass our allocator to functions and libraries that require it
	var server = try httpz.Server().init(allocator, .{.port = 5882});

	var router = server.router();
	router.get("/api/user/:id", getUser);

	// blocks the current thread
	try server.listen();
}
```

We create the `DebugAllocator`, get an `std.mem.Allocator` from it and pass it to the `init` function of the HTTP server. In a more complex project, `allocator` would get passed to multiple parts of the code, each of those possibly passing it to their own functions, objects and dependencies.

The `DebugAllocator` used to be called `GeneralPurposeAllocator`. You might still see that name in use and it's the reason the variable is named `gpa`. Call me nostalgic.

You might notice that the syntax around the creation of `gpa` is a little strange. What is this: `DebugAllocator(.{}){}`? It's all things we've seen before, just smashed together. `std.heap.DebugAllocator` is a function, and since it's using PascalCase, we know that it returns a type. (We'll talk more about generics in the next part). Knowing that it returns a type, maybe this more explicit version will be easier to decipher:

```zig
const T = std.heap.DebugAllocator(.{});
var gpa = T{};

// is the same as:

var gpa = std.heap.DebugAllocator(.{}){};
```

Maybe you're still unsure about the meaning of `.{}`. This is also something we've seen before: it's a struct initializer with an implicit type. What's the type and where are the fields? The type is an `std.heap.DebugAllocatorConfig`. No fields are set because the `DebugAllocatorConfig` struct defines defaults, which we'll be using. This is a common pattern with configuration / options. In fact, we see it again a few lines down when we pass `.{.port = 5882}` to `init`. In this case, we're using the default value for all but one field, the `port`.

If it's still not clear, you'll be glad to know that Zig more recently introduced something called declaration literals. While the feature isn't that complicated, we're not going to show how it actually works, but this is how it can be used to improve the readability of initializing the allocator:

```zig
var gpa: std.heap.DebugAllocator(.{}) = .init;
```

Note that `init` is specific to the `DebugAllocator`. Other types that use declaration literals might have a different (or many different) names. For example, an empty hash map is initialized using the `.empty` declaration literal.

## [std.testing.allocator](#testing)

Hopefully you were sufficiently troubled when we talked about memory leaks and then eager to learn more when I mentioned that Zig could help. This help comes from the `std.testing.allocator`, which is an `std.mem.Allocator`. Currently it's implemented using the `DebugAllocator` with added integration in Zig's test runner, but that's an implementation detail. The important thing is that if we use `std.testing.allocator` in our tests, we can catch most memory leaks.

You're likely already familiar with dynamic arrays, often called ArrayLists. In many dynamic programming languages all arrays are dynamic arrays. Dynamic arrays support a variable number of elements. Zig has a proper generic ArrayList, but we'll create one specifically to hold integers and to demonstrate leak detection:

```zig
pub const IntList = struct {
	pos: usize,
	items: []i64,
	allocator: Allocator,

	fn init(allocator: Allocator) !IntList {
		return .{
			.pos = 0,
			.allocator = allocator,
			.items = try allocator.alloc(i64, 4),
		};
	}

	fn deinit(self: IntList) void {
		self.allocator.free(self.items);
	}

	fn add(self: *IntList, value: i64) !void {
		const pos = self.pos;
		const len = self.items.len;

		if (pos == len) {
			// we've run out of space
			// create a new slice that's twice as large
			var larger = try self.allocator.alloc(i64, len * 2);

			// copy the items we previously added to our new space
			@memcpy(larger[0..len], self.items);

			self.items = larger;
		}

		self.items[pos] = value;
		self.pos = pos + 1;
	}
};
```

The interesting part happens in `add` when `pos == len` indicating that we've filled our current array and need to create a larger one. We can use `IntList` like so:

```zig
const std = @import("std");
const Allocator = std.mem.Allocator;

pub fn main() !void {
	var gpa = std.heap.DebugAllocator(.{}){};
	const allocator = gpa.allocator();

	var list = try IntList.init(allocator);
	defer list.deinit();

	for (0..10) |i| {
		try list.add(@intCast(i));
	}

	std.debug.print("{any}\n", .{list.items[0..list.pos]});
}
```

The code runs and prints the correct result. However, even though we _did_ call `deinit` on `list`, there's a memory leak. It's ok if you didn't catch it because we're going to write a test and use `std.testing.allocator`:

```zig
const testing = std.testing;
test "IntList: add" {
	// We're using testing.allocator here!
	var list = try IntList.init(testing.allocator);
	defer list.deinit();

	for (0..5) |i| {
		try list.add(@intCast(i+10));
	}

	try testing.expectEqual(5, list.pos);
	try testing.expectEqual(10, list.items[0]);
	try testing.expectEqual(11, list.items[1]);
	try testing.expectEqual(12, list.items[2]);
	try testing.expectEqual(13, list.items[3]);
	try testing.expectEqual(14, list.items[4]);
}
```

If you're following along, place the test in the same file as `IntList` and `main`. Zig tests are normally written in the same file, often near the code, they're testing. When we use `zig test learning.zig` to run our test, we get an amazing failure:

```text
Test [1/1] test.IntList: add... [gpa] (err): memory address 0x101154000 leaked:
/code/zig/learning.zig:26:32: 0x100f707b7 in init (test)
	 .items = try allocator.alloc(i64, 2),
															 ^
/code/zig/learning.zig:55:29: 0x100f711df in test.IntList: add (test)
 var list = try IntList.init(testing.allocator);

... MORE STACK INFO ...

[gpa] (err): memory address 0x101184000 leaked:
/code/test/learning.zig:40:41: 0x100f70c73 in add (test)
	 var larger = try self.allocator.alloc(i64, len * 2);
																				^
/code/test/learning.zig:59:15: 0x100f7130f in test.IntList: add (test)
	try list.add(@intCast(i+10));
```

We have multiple memory leaks. Thankfully the testing allocator tells us exactly where the leaking memory was allocated. Are you able to spot the leak now? If not, remember that, in general, every `alloc` should have a corresponding `free`. Our code calls `free` once, in `deinit`. However, `alloc` is called once in `init` and then every time `add` is called and we need more space. Every time we `alloc` more space, we need to `free` the previous `self.items`:

```zig
// existing code
var larger = try self.allocator.alloc(i64, len * 2);
@memcpy(larger[0..len], self.items);

// Added code
// free the previous allocation
self.allocator.free(self.items);
```

Adding this last line, after copying the items to our `larger` slice, solves the problem. If you run `zig test learning.zig`, there should be no error.

## [ArenaAllocator](#arena)

The DebugAllocator is a reasonable default because it works well in all possible cases. But within a program, you might run into allocation patterns which can benefit from more specialized allocators. One example is the need for short-lived state which can be discarded when processing is completed. Parsers often have such a requirement. A skeleton `parse` function might look like:

```zig
fn parse(allocator: Allocator, input: []const u8) !Something {
	const buf = try allocator.alloc(u8, 512);
	defer allocator.free(buf);

	const nesting = try allocator.alloc(NestType, 10)
	defer allocator.free(nesting);

	const state = State{
		.buf = buf,
		.nesting = nesting,
	};

	return parseInternal(allocator, state, input);
}
```

While this isn't too hard to manage, `parseInternal` might need other short lived allocations which will need to be freed. As an alternative, we could create an ArenaAllocator which allows us to free all allocations in one shot:

```zig
fn parse(allocator: Allocator, input: []const u8) !Something {
	// create an ArenaAllocator from the supplied allocator
	var arena = std.heap.ArenaAllocator.init(allocator);

	// this will free anything created from this arena
	defer arena.deinit();

	// create an std.mem.Allocator from the arena, this will be
	// the allocator we'll use internally
	const aa = arena.allocator();

	const state = State{
		// we're using aa here!
		.buf = try aa.alloc(u8, 512),

		// we're using aa here!
		.nesting = try aa.alloc(NestType, 10),
	};

	// we're passing aa here, so we're guaranteed that
	// any other allocation will be in our arena
	return parseInternal(aa, state, input);
}
```

The `ArenaAllocator` takes a child allocator, in this case the allocator that was passed into `init`, and creates a new `std.mem.Allocator`. When this new allocator is used to allocate or create memory, we don't need to call `free` or `destroy`. Everything will be released when we call `deinit` on the `arena`. In fact, the `free` and `destroy` of an ArenaAllocator do nothing.

The `ArenaAllocator` has to be used carefully. Since there's no way to free individual allocations, you need to be sure that the arena's `deinit` will be called within a reasonable memory growth. Interestingly, that knowledge can either be internal or external. For example, in our above skeleton, leveraging an ArenaAllocator makes sense from within the Parser since the details of the state's lifetime is an internal matter.

Allocators like the ArenaAllocator that have a mechanism for freeing all previous allocations can break the rule that every `alloc` should have a corresponding `free`. However, if you receive an `std.mem.Allocator` you should not make any assumptions about the underlying implementation.

The same can't be said for our `IntList`. It can be used to store 10 or 10 million values. It can have a lifetime measured in milliseconds or weeks. It's in no position to decide the type of allocator to use. It's the code making use of `IntList` that has this knowledge. Originally, we managed our `IntList` like so:

```zig
var gpa = std.heap.DebugAllocator(.{}){};
const allocator = gpa.allocator();

var list = try IntList.init(allocator);
defer list.deinit();
```

We could have opted to supply an ArenaAllocator instead:

```zig
var gpa = std.heap.DebugAllocator(.{}){};
const allocator = gpa.allocator();

var arena = std.heap.ArenaAllocator.init(allocator);
defer arena.deinit();
const aa = arena.allocator();

var list = try IntList.init(aa);

// I'm honestly torn on whether or not we should call list.deinit.
// Technically, we don't have to since we call defer arena.deinit() above.
defer list.deinit();

...
```

We don't need to change `IntList` since it only deals with an `std.mem.Allocator`. And if `IntList` _did_ internally create its own arena, that would work too. There's no reason you can't create an arena within an arena.

As a last quick example, the HTTP server I mentioned above exposes an arena allocator on the `Response`. Once the response is sent, the arena is cleared. The predictable lifetime of the arena (from request start to request end), makes it an efficient option. Efficient in terms of performance and ease of use.

## [FixedBufferAllocator](#fixedbuffer)

The last allocator that we'll look at is the `std.heap.FixedBufferAllocator` which allocates memory from a buffer (i.e. `[]u8`) that we provide. This allocator has two major benefits. First, since all the memory it could possibly use is created upfront, it's fast. Second, it naturally limits how much memory can be allocated. This hard limit can also be seen as a drawback. Another drawbacks is that `free` and `destroy` will only work on the last allocated/created item (think of a stack). Freeing the non-last allocation is safe to call, but won't do anything.

```zig
const std = @import("std");

pub fn main() !void {
	var buf: [150]u8 = undefined;
	var fa = std.heap.FixedBufferAllocator.init(&buf);

	// this will free all memory allocate with this allocator
	defer fa.reset();

	const allocator = fa.allocator();

	const json = try std.json.Stringify.valueAlloc(allocator, .{
		.this_is = "an anonymous struct",
		.above = true,
		.last_param = "are options",
	}, .{.whitespace = .indent_2});

	// We can free this allocation, but since we know that our allocator is
	// a FixedBufferAllocator, we can rely on the above `defer fa.reset()`
	defer allocator.free(json);

	std.debug.print("{s}\n", .{json});
}
```

The above prints:

```text
{
	"this_is": "an anonymous struct",
	"above": true,
	"last_param": "are options"
}
```

But change our `buf` to be a `[120]u8` and you'll get an `OutOfMemory` error.

A common pattern with FixedBufferAllocators, and to a lesser degree ArenaAllocators, is to `reset` them and reuse them. This frees all previous allocations and allows the allocator to be reused.

## [Non-Debug Allocator](#c%5Fallocator)

It's possible that ever since I mentioned the `DebugAllocator`, you've been wondering what non-"debug" alternative exists? There's no reason you can't use the `DebugAllocator` in a release build, it's just doesn't have the most cutting-edge performance some systems need from an allocator. Still, because I think it's a reasonable thing to be curious about, here's a common pattern you'll find in Zig applications:

```zig
const std = @import("std");
const builtin = @import("builtin");

pub fn main() !void {
	var gpa: std.heap.DebugAllocator(.{}) = .empty;
	const allocator = if (builtin.mode == .Debug) gpa.allocator()
	                  else std.heap.c_allocator;

	defer if (builtin.mode == .Debug) {
		if (gpa.detectLeaks()) {
			std.posix.exit(1);
		}
	};

	// ...
}
```

We won't go over this in detail, but the gist is that we use `DebugAllocator` in `Debug` builds and `std.heap.c_allocator` in `Release` builds. `std.heap.c_allocator` is a wrapper around malloc. The other interesting addition is that in `Debug` mode, on program exit, we leverage the `DebugAllocator`'s ability to detect and report memory leaks.

By not having a default allocator, Zig is both transparent and flexible with respect to allocations. The `std.mem.Allocator` interface is powerful, allowing specialized allocators to wrap more general ones, as we saw with the `ArenaAllocator`.

More generally, the power and associated responsibilities of heap allocations are hopefully apparent. The ability to allocate arbitrary sized memory with an arbitrary lifetime is essential to most programs.

However, because of the complexity that comes with dynamic memory, you should keep an eye open for alternatives. For example, above we used `std.fmt.allocPrint` but the standard library also has an `std.fmt.bufPrint`. The latter takes a buffer instead of an allocator:

```zig
const std = @import("std");

pub fn main() !void {
	const name = "Leto";

	var buf: [100]u8 = undefined;
	const greeting = try std.fmt.bufPrint(&buf, "Hello {s}", .{name});

	std.debug.print("{s}\n", .{greeting});
}
```

This API moves the memory management burden to the caller. If we had a longer `name`, or a smaller `buf`, our `bufPrint` could return an `NoSpaceLeft` error. But there are plenty of scenarios where an application has known limits, such as a maximum name length. In those cases `bufPrint` is safer and faster.

Another possible alternative to dynamic allocations is streaming data to an `*std.Io.Writer`. Like our `Allocator`, `Writer` is an interface implemented by many types, such as files. Above, we used `Stringify.valueAlloc` to serialize JSON into a dynamically allocated string. We could have used `value` and provided a `Writer`:

```zig
const std = @import("std");
pub fn main() !void {
    // Zig implementation of Write (and Reader) started to change drastically in
    // 0.15 and even more in 0.16.
    // The new approach has a number of benefits, but simplicity isn't one of them.

    var gpa = std.heap.DebugAllocator(.{}){};
    const allocator = gpa.allocator();

    var buf = std.Io.Writer.Allocating.init(allocator);
    defer buf.deinit();

    try dump(&buf.writer);
    std.debug.print("{s}\n", .{buf.written()});
}

fn dump(writer: *std.Io.Writer) !void {
    try std.json.Stringify.value(.{
        .this_is = "an anonymous struct",
        .above = true,
        .last_param = "are options",
    }, .{.whitespace = .indent_2}, writer);
}
```

While allocators are often given as the first parameter of a function, writers are normally the last. ಠ\_ಠ

This example still uses an `Allocator`, but that's just so you can copy+paste+run and get immediately feedback. The `writer` parameter to `dump` could be backed by a file or something else.

The goal isn't to eliminate all dynamic allocations. It wouldn't work, as these alternatives only make sense in specific cases. But now you have many options at your disposal. From stack frames to a general purpose allocator, and all the things in between, like static buffers, streaming writers and specialized allocators.

[](/learning%5Fzig/stack%5Fmemory)Stack Memory [](/learning%5Fzig)Intro [](/learning%5Fzig/generics)Generics