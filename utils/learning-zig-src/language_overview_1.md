 

Learning Zig - Language Overview - Part 1 

[](/learning%5Fzig)Intro [](/learning%5Fzig/language%5Foverview%5F2)Language Overview - Part 2 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Language Overview - Part 1](#language%5Foverview)

Zig is a strongly typed compiled language. It supports generics, has powerful compile-time metaprogramming capabilities and **does not** include a garbage collector. Many people consider Zig a modern alternative to C. As such, the language's syntax is C-like. We're talking semicolon terminated statements and curly brace delimited blocks.

Here's what Zig code looks like:

```zig
const std = @import("std");

// This code won't compile if `main` isn't `pub` (public)
pub fn main() void {
	const user = User{
		.power = 9001,
		.name = "Goku",
	};

	std.debug.print("{s}'s power is {d}\n", .{user.name, user.power});
}

pub const User = struct {
	power: u64,
	name: []const u8,
};
```

If you save the above as _learning.zig_ and run `zig run learning.zig`, you should see: `Goku's power is 9001`.

This is a simple example, something you might be able to follow even if it's your first time seeing Zig. Still, we're going to go over it line by line.

See the [installing zig](/learning%5Fzig/#install) section to quickly get up and running.

## [Importing](#importing)

Very few programs are written as a single file without a standard library or external libraries. Our first program is no exception and uses Zig's standard library to print our output. Zig's import system is straightforward and relies on the `@import` function and `pub` keyword (to make code accessible outside the current file).

Functions that begin with `@` are builtin functions. They are provided by the compiler as opposed to the standard library.

We import a module by specifying the module name. Zig's standard library is available using the "std" name. To import a specific file, we use its path relative to the file doing the importing. For example if we moved the `User` struct into its own file, say _models/user.zig_:

```zig
// models/user.zig
pub const User = struct {
	power: u64,
	name: []const u8,
};
```

We'd then import it via:

```zig
// main.zig
const User = @import("models/user.zig").User;
```

If our `User` struct wasn't marked as `pub` we'd get the following error: _'User' is not marked 'pub'_.

_models/user.zig_ can export more than one thing. For example, we could also export a constant:

```zig
// models/user.zig
pub const MAX_POWER = 100_000;

pub const User = struct {
	power: u64,
	name: []const u8,
};
```

In which case, we could import both:

```zig
const user = @import("models/user.zig");
const User = user.User;
const MAX_POWER = user.MAX_POWER;
```

At this point, you might have more questions than answers. In the above snippet, what's `user`? We haven't seen it yet, but what if we use `var` instead of `const`? Or maybe you're wondering how to use third party libraries. These are all good questions, but to answer them, we first need to learn more about Zig. For now we'll have to be satisfied with what we've learned: how to import Zig's standard library, how to import other files and how to export definitions.

## [Comments](#comments)

The next line our Zig example is a comment:

```zig
// This code won't compile if `main` isn't `pub` (public)
```

Zig doesn't have multi-line comments, like C's `/* ... */`.

There is experimental support for automated document generation based on comments. If you've seen Zig's [standard library documentation](https://ziglang.org/documentation/master/std), then you've seen this in action. `//!` is known as a top-level document comment and can be placed at the top of the file. A triple-slash comment (`///`), known as a document comment, can go in specific places such as before a declaration. You'll get a compiler error if you try to use either type of document comment in the wrong place.

## [Functions](#functions)

Our next line of code is the start of our `main` function:

```zig
pub fn main() void
```

Every executable needs a function named `main`: it's the entry point into the program. If we renamed `main` to something else, like `doIt`, and tried to run `zig run learning.zig`, we'd get an error saying that _'learning' has no member named 'main'_.

Ignoring `main`'s special role as our program's entry point, it's a really basic function: it takes no parameters and returns nothing, aka `void`. The following is _slightly_ more interesting:

```zig
const std = @import("std");

pub fn main() void {
	const sum = add(8999, 2);
	std.debug.print("8999 + 2 = {d}\n", .{sum});
}

fn add(a: i64, b: i64) i64 {
	return a + b;
}
```

C and C++ programmers will notice that Zig doesn't require forward declarations, i.e. `add` is called _before_ it's defined.

The next thing to note is the `i64` type: a 64-bit signed integer. Some other numeric types are: `u8`, `i8`, `u16`, `i16`, `u32`, `i32`, `u47`, `i47`, `u64`, `i64`, `f32` and `f64`. The inclusion of `u47` and `i47` isn't a test to make sure you're still awake; Zig supports arbitrary bit-width integers. Though you probably won't use these often, they can come in handy. One type you _will_ use often is `usize` which is an unsigned pointer sized integer and generally the type that represents the length/size of something.

In addition to `f32` and `f64`, Zig also supports `f16`, `f80` and `f128` floating point types. 

While there's no good reason to do so, if we change the implementation of `add` to:

```zig
fn add(a: i64, b: i64) i64 {
	a += b;
	return a;
}
```

We'll get an error on `a += b;`: _cannot assign to constant_. This is an important lesson that we'll revisit in greater detail later: function parameters are constants.

For the sake of improved readability, there is no function overloading (the same function named defined with different parameter types and/or number of parameters). For now, that's all we need to know about functions.

## [Structures](#structures)

The next line of code is the creation of a `User`, a type which is defined at the end of our snippet. The definition of `User` is:

```zig
pub const User = struct {
	power: u64,
	name: []const u8,
};
```

Since our program is a single file and therefore `User` is only used in the file where it's defined, we didn't need to make it `pub`. But then we wouldn't have seen how to expose a declaration to other files.

Struct fields are terminated with a comma and can be given a default value:

```zig
pub const User = struct {
	power: u64 = 0,
	name: []const u8,
};
```

When we create a struct, **every** field has to be set. For example, in the original definition, where `power` had no default value, the following would give an error: _missing struct field: power_

```zig
const user = User{.name = "Goku"};
```

However, with our default value, the above compiles fine.

Structs can have methods, they can contain declarations (including other structs) and they might even contain zero fields, at which point they act more like a namespace.

```zig
pub const User = struct {
	power: u64 = 0,
	name: []const u8,

	pub const SUPER_POWER = 9000;

	pub fn diagnose(user: User) void {
		if (user.power >= SUPER_POWER) {
			std.debug.print("it's over {d}!!!", .{SUPER_POWER});
		}
	}
};
```

Methods are just normal functions that can be called with a dot syntax. Both of these work:

```zig
// call diagnose on user
user.diagnose();

// The above is syntactical sugar for:
User.diagnose(user);
```

Most of the time you'll use the dot syntax, but methods as syntactical sugar over normal functions can come in handy.

The `if` statement is the first control flow we've seen. It's pretty straightforward, right? We'll explore this in more detail in the next part.

`diagnose` is defined within our `User` type and accepts a `User` as its first parameter. As such, we can call it with the dot syntax. But functions within a structure don't _have_ to follow this pattern. One common example is having an `init` function to initiate our structure:

```zig
pub const User = struct {
	power: u64 = 0,
	name: []const u8,

	pub fn init(name: []const u8, power: u64) User {
		return User{
			.name = name,
			.power = power,
		};
	}
}
```

The use of `init` is merely a convention and in some cases `open` or some other name might make more sense. If you're like me and not a C++ programmer, the syntax to initalize fields, `.$field = $value,` might be a little odd, but you'll get used to it in no time.

When we created "Goku" we declared the `user` variable as `const`:

```zig
const user = User{
	.power = 9001,
	.name = "Goku",
};
```

This means we can't modify `user`. To modify a variable, it should be declared using `var`. Also, you might have noticed that `user`'s type is inferred based on what's assigned to it. We could be explicit:

```zig
const user: User = User{
	.power = 9001,
	.name = "Goku",
};
```

We'll see cases where we have to be explicit about a variable's type, but most of the time, code is more readable without the explicit type. The type inference works the other way too. This is equivalent to both of the above snippets:

```zig
const user: User = .{
	.power = 9001,
	.name = "Goku",
};
```

This usage is pretty unusual though. One place where it's more common is when returning a structure from a function. Here the type can be inferred from the function's return type. Our `init` function would more likely be written like so:

```zig
pub fn init(name: []const u8, power: u64) User {
	// instead of return User{...}
	return .{
		.name = name,
		.power = power,
	};
}
```

Like most things we've explored so far, we'll revisit structs in the future when talking about other parts of the language. But, for the most part, they're straightforward.

## [Arrays and Slices](#arrays)

We could gloss over the last line of our code, but given that our little snippet contains two strings, "Goku" and "{s}'s power is {d}\\n", you're likely curious about strings in Zig. To better understand strings, let's first explore arrays and slices.

Arrays are fixed sized with a length known at compile time. The length is part of the type, thus an array of 4 signed integers, `[4]i32`, is a different type than an array of 5 signed integers, `[5]i32`.

The array length can be inferred from the initialization. In the following code, all three variables are of type `[5]i32`:

```zig
const a = [5]i32{1, 2, 3, 4, 5};

// we already saw this .{...} syntax with structs
// it works with arrays too
const b: [5]i32 = .{1, 2, 3, 4, 5};

// use _ to let the compiler infer the length
const c = [_]i32{1, 2, 3, 4, 5};
```

A slice on the other hand is a pointer to an array with a length. The length is known at runtime. We'll go over pointers in a later part, but you can think of a slice as a view into the array.

If you're familiar with Go, you might have noticed that slices in Zig are a bit different: they **don't** have a capacity, only a pointer and a length.

Given the following,

```zig
const a = [_]i32{1, 2, 3, 4, 5};
const b = a[1..4];
```

I'd love to be able to tell you that `b` is a slice with a length of 3 and a pointer to `a`. But because we "sliced" our array using values that are known at compile time, i.e. `1` and `4`, our length, `3`, is also known at compile time. Zig figures all this out and thus `b` isn't a slice, but rather a pointer to an array of integers with a length of 3\. Specifically, its type is `*const [3]i32`. So this demonstration of a slice is foiled by Zig's cleverness.

In real code, you'll likely use slices more than arrays. For better or worse, programs tend to have more runtime information than compile time information. There's an easy way and a hard way to get an actual slice from this specific example. The easy way is to give `b` an explicit slice-type:

```zig
const a = [_]i32{1, 2, 3, 4, 5};
const b: []const i32 = a[1..4];
```

The hard way (at least in a micro-example) is to make one of the range values runtime-known:

```zig
const a = [_]i32{1, 2, 3, 4, 5};

// because `end` is declared var, it isn't compiled-time known
var end: usize = 3;

// but because it's a `var` we need to mutate it, else the compiler
// will insist we make it `const`.
end += 1;

const b = a[1..end];
```

`b` is now a proper slice, specifically its type is `[]const i32`. You can see that the length of the slice isn't part of the type, because the length is a runtime property, and types are always fully known at compile time. When creating a slice, we can omit the upper bound to create a slice to the end of whatever we're slicing (either an array or a slice), e.g. `const c = b[2..];`.

If we had done `const end: usize = 4` without the increment, then `1..end` would have become a compile-time known length for `b` and thus created a pointer to an array, not a slice. I find this a little confusing, but it isn't something that comes up too often and it isn't too hard to master. I would have loved to skip over it at this point, but couldn't figure out an honest way to avoid this detail.

Learning Zig has taught me that types are very descriptive. It isn't just an integer or a boolean, or even an array of signed 32 bit integers. Types also contain other important pieces of information. We've talked about the length being part of an array's type, and many of the examples have shown how the const-ness is also part of it. For example, in our last example, `b`'s type is `[]const i32`. You can see this for yourself with the following code:

```zig
const std = @import("std");

pub fn main() void {
	const a = [_]i32{1, 2, 3, 4, 5};
	var end: usize = 4;
	end += 1;
	const b = a[1..end];
	std.debug.print("{any}", .{@TypeOf(b)});
}
```

If we tried to write into `b`, such as `b[2] = 5;` we'd get a compile time error: _cannot assign to constant_. This is because of `b`'s type.

To solve this, you might be tempted to make this change:

```zig
// replace const with var
var b = a[1..end];
```

but you'll get the same error, why? As a hint, what's `b`'s type, or more generically, what is `b`? A slice is a length and pointer to \[part of\] an array. A slice's type is always derived from what it is slicing. Whether `b` is declared `const` or not, it is a slice of a `[5]const i32` and so b must be of type `[]const i32`. If we want to be able to write into `b`, we need to change `a` from a `const` to a `var`.

```zig
const std = @import("std");

pub fn main() void {
	var a = [_]i32{1, 2, 3, 4, 5};
	var end: usize = 3;
	end += 1;
	const b = a[1..end];
	b[2] = 99;
}
```

This works because our slice is no longer `[]const i32` but rather `[]i32`. You might reasonably be wondering why this works when `b` is still a `const`. But the const-ness of `b` relates to `b` itself, not the data that `b` points to. Well, I'm not sure that's a great explanation, but for me, this code highlights the difference:

```zig
const std = @import("std");

pub fn main() void {
	var a = [_]i32{1, 2, 3, 4, 5};
	var end: usize = 3;
	end += 1;
	const b = a[1..end];
	b = b[1..];
}
```

This won't compile; as the compiler tells us, we _cannot assign to constant_. But if we had done `var b = a[1..end];`, then the code would have worked because `b` itself is no longer a constant.

We'll discover more about arrays and slices while looking at other aspects of the language, not the least of which are strings.

## [Strings](#strings)

I wish I could say that Zig has a `string` type and it's awesome. Unfortunately it does not, and they are not. At its simplest, Zig strings are sequences (i.e. arrays or slices) of bytes (`u8`). We actually saw this with the definition of the `name` field: `name: []const u8,`.

By convention, and by convention only, such strings should only contain UTF-8 values, since Zig source code is itself UTF-8 encoded. But this is not enforced and there's really no difference between a `[]const u8` that represents an ASCII or UTF-8 string, and a `[]const u8` which represents arbitrary binary data. How could there be, they are the same type.

From what we learned about arrays and slices, you'd be correct in guessing that `[]const u8` is a slice to a constant array of bytes (where a byte is an unsigned 8-bit integer). But nowhere in our code did we slice an array, or even have an array, right? All we did was assign "Goku" to `user.name`. How did that work?

String literals, those you see in the source code, have a compile-time known length. The compiler knows that "Goku" has a length of 4\. So you'd be close in thinking that "Goku" is best represented by an array, something like `[4]const u8`. But string literals have a couple special properties. They are stored in a special place within the binary and deduplicated. Thus, a variable to a string literal is going to be a pointer to this special location. That means that "Goku"'s type is closer to `*const [4]u8`, a pointer to a constant array of 4 bytes.

There's more. String literals are null terminated. That is to say, they always have a `\0` at the end. Null-terminated strings are important when interacting with C. In memory, "Goku" would actually look like: `{'G', 'o', 'k', 'u', 0}`, so you might think the type is `*const [5]u8`. But this would be ambiguous at best, and dangerous at worse (you could overwrite the null terminator). Instead, Zig has a distinct syntax to represent null terminated arrays. "Goku" has the type: `*const [4:0]u8`, pointer to a null-terminated array of 4 bytes. While talking about strings we're focusing on null-terminated arrays of bytes (since that's how strings are typically represented in C), the syntax is more generic: `[LENGTH:SENTINEL]` where "SENTINEL" is the special value found at the end of the array. So, while I can't think of why you'd need it, the following is completely valid:

```zig
const std = @import("std");

pub fn main() void {
	// an array of 3 booleans with false as the sentinel value
	const a = [3:false]bool{false, true, false};

	// This line is more advanced, and is not going to get explained!
	std.debug.print("{any}\n", .{std.mem.asBytes(&a).*});
}
```

Which outputs: `{ 0, 1, 0, 0}`.

I hesitate to include this example, since the last line is pretty advanced and I don't intend to explain it. On the flip side, it's a working example that you can run and play with to better examine some of what we've discussed so far, if you're so inclined.

If I've done an acceptable job of explaining this, there's likely still one thing you're unsure about. If "Goku" is a `*const [4:0]u8`, how come we were able to assign it to a `name`, a `[]const u8`? The answer is simple: Zig will coerce the type for you. It'll do this between a few different types, but it's most obvious with strings. It means that if a function has a `[]const u8` parameter, or a structure has a `[]const u8` field, string literals can be used. Because null terminated strings are arrays, and arrays have a known length, this coercion is cheap, i.e. it **does not** require iterating through the string to find the null terminator.

So, when talking about strings, we usually mean a `[]const u8`. When necessary we explicitly state a null terminated string, which can be automatically coerced into a `[]const u8`. But do remember that a `[]const u8` is also used to represent arbitrary binary data, and as such, Zig doesn't have the notion of a string that higher level programming languages do. Furthermore, Zig's standard library only has a very basic unicode module.

Of course, in a real program, most strings (and more generically, arrays) aren't known at compile time. The classic example being user input, which isn't known when the program is being compiled. This is something that we'll have to revisit when talking about memory. But the short answer is that, for such data, which is of an unknown value at compile time, and thus an unknown length, we'll be dynamically allocating memory at runtime. Our string variables, still of type `[]const u8` will be slices that point to this dynamically allocated memory.

## [comptime and anytype](#comptime)

There's a lot more than meets the eye going on in our last unexplored line of code:

```zig
std.debug.print("{s}'s power is {d}\n", .{user.name, user.power});
```

We're only going to skim over it, but it does provide an opportunity to highlight some of Zig's more powerful features. These are things you should at least be aware of, even if you haven't mastered them.

The first is Zig's concept of compile-time execution, or `comptime`. This is the core to Zig's metaprogramming capabilities and, as the name implies, revolves around running code at compile time, rather than runtime. Throughout this guide, we'll only scratch the surface of what's possible with `comptime`, but it is something that's constantly there.

You might be wondering what it is about the above line that requires compile-time execution. The definition of the `print` function requires our first parameter, the string format, to be comptime-known:

```zig
// notice the "comptime" before the "fmt" variable
pub fn print(comptime fmt: []const u8, args: anytype) void {
```

And the reason for this is that `print` does extra compile-time checks that you wouldn't get in most other languages. What kind of checks? Well, say you changed the format to `"it's over {d}\n"`, but kept the two arguments. You'd get a compile time error: _unused argument in 'it's over {d}'_. It'll also do type checks: change the format string to `"{s}'s power is {s}\n"` and you'll get an _invalid format string 's' for type 'u64'_. These checks would not be possible to do at compile time if the string format wasn't known at compile time. Thus the requirement for a comptime-known value.

The one place where `comptime` will immediately impact your coding is the default types for integer and float literals, the special `comptime_int` and `comptime_float`. This line of code isn't valid: `var i = 0;`. You'll get a compile-time error:   _variable of type 'comptime\_int' must be const or comptime_. `comptime` code can only work with data that is known at compile time and, for integers and floats, such data is identified by the special `comptime_int` and `comptime_float` types. A value of this type can be used in compile time execution. But you're likely not going to spend the majority of your time writing code for compile time execution, so it isn't a particularly useful default. What you'll need to do is give your variables an explicit type:

```zig
var i: usize = 0;
var j: f64 = 0;
```

Note, this error only happened because we used `var`. Had we used `const`, we wouldn't have had the error since the entire point of the error is that a `comptime_int` _must_ be const.

In a future part, we'll examine comptime a bit more when exploring generics.

The other special thing about our line of code is the strange `.{user.name, user.power}`, which, from the above definition of `print`, we know maps to a variable of type `anytype`. This type should not be confused with something like Java's `Object` or Go's `any` (aka `interface{}`). Rather, at compile time, Zig will create a version of the `print` function specifically for all types that was pass to it.

This begs the question: what _are_ we passing to it? We've seen the `.{...}` notation before, when letting the compiler infer the type of our structure. This is similar: it creates an anonymous structure literal. Consider this code:

```zig
pub fn main() void {
	std.debug.print("{}\n", .{.{.year = 2023, .month = 8}});
}
```

which prints:

```text
{ .year = 2023, .month = 8 }
```

Here we gave our anonymous struct field names, `year` and `month`. In our original code, we didn't. In that case, the field names are automatically generated as "0", "1", "2", etc. While they're both examples of anonymous structure literal, the one without fields names is often called a _tuple_. The `print` function expects a tuple and uses the ordinal position in the string format to get the appropriate argument.

Zig doesn't have function overloading, and it doesn't have variadic functions (functions with an arbitrary number of arguments). But it does have a compiler capable of creating specialized functions based on the types passed, including types inferred and created by the compiler itself.

[](/learning%5Fzig)Intro [](/learning%5Fzig/language%5Foverview%5F2)Language Overview - Part 2