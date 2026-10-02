 

Learning Zig - Pointers 

[](/learning%5Fzig/style%5Fguide)Style Guide [](/learning%5Fzig)Intro [](/learning%5Fzig/stack%5Fmemory)Stack Memory 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Pointers](#pointers)

Zig doesn't include a garbage collector. The burden of managing memory is on you, the developer. It's a big responsibility as it has a direct impact on the performance, stability and security of your application.

We'll begin by talking about pointers, which is an important topic to discuss in and of itself, but also to start training ourselves to see our program's data from a memory-oriented point of view. If you're already comfortable with pointers, heap allocations and dangling pointers, feel free to skip ahead a couple of parts to [](/learning%5Fzig/heap%5Fmemory)heap memory & allocators, which is more Zig-specific.

The following code creates a user with a `power` of 100, and then calls the `levelUp` function which increments the user's power by 1\. Can you guess the output?

```zig
const std = @import("std");

pub fn main() void {
	var user = User{
		.id = 1,
		.power = 100,
	};

	// this line has been added
	levelUp(user);
	std.debug.print("User {d} has power of {d}\n", .{user.id, user.power});
}

fn levelUp(user: User) void {
	user.power += 1;
}

pub const User = struct {
	id: u64,
	power: i32,
};
```

That was a unkind trick; the code won't compile: _local variable is never mutated_. This is in reference to the `user` variable in `main`. A variable that is never mutated must be declare `const`. You might be thinking: but in `levelUp` we _are_ mutating `user`, what gives? Let's assume the Zig compiler is mistaken and trick it. We'll force the compiler to see that `user` is mutated:

```zig
const std = @import("std");

pub fn main() void {
	var user = User{
		.id = 1,
		.power = 100,
	};
	user.power += 0;

	// rest of the code is the same
```

Now we get an error in `levelUp`: _cannot assign to constant_. We saw in part 1 that function parameters are constants, thus `user.power += 1;` is not valid. To fix the compile-time error, we could change the `levelUp` function to:

```zig
fn levelUp(user: User) void {
	var u = user;
	u.power += 1;
}
```

Which will compile, but our output is _User 1 has power of 100_, even though the intent of our code is clearly for `levelUp` to increase the user's power to `101`. What's happening?

To understand, it helps to think about data with respect to memory, and variables as labels that associate a type with a specific memory location. For example, in `main`, we create a `User`. A simple visualization of this data in memory would be:

```text
user -> ------------ (id)
        |    1     |
        ------------ (power)
        |   100    |
        ------------
```

There are two important things to note. The first is that our `user` variable points to the beginning of our structure. The second is that the fields are laid out sequentially. Remember that our `user` also has a type. That type tells us that `id` is a 64 bit integer and `power` is a 32 bit integer. Armed with a reference to the start of our data and the type, the compiler can translate `user.power` to: _access a 32 bit integer located 64 bits from the beginning._ That's the power of variables, they reference memory and include the type information necessary to understand and manipulate the memory in a meaningful way.

By default, Zig doesn't make guarantees about the memory layout of structures. It could store fields in alphabetical order, by ascending size, or with gaps. It can do what it wants, so long as it's able to translate our code correctly. This freedom can enable certain optimizations. Only if we declare a `packed struct` will we get strong guarantees about the memory layout. We can also create an `extern struct` which guarantees that the memory layout will match the C Application Binary Interface (ABI). Still, our visualization of `user` is reasonable and useful.

Here's a slightly different visualization which includes memory addresses. The memory address of the start of this data is a random address I came up with. This is the memory address referenced by the `user` variable, which is also the value of our first field, `id`. However, given this initial address, all subsequent addresses have a known relative address. Since `id` is a 64 bit integer, it takes 8 bytes of memory. Therefore, `power` has to be at $start\_address + 8:

```text
user ->   ------------  (id: 1043368d0)
          |    1     |
          ------------  (power: 1043368d8)
          |   100    |
          ------------
```

To verify this for yourself, I'd like to introduce the addressof operator: `&`. As the name implies, the addressof operator returns the address of an variable (it can also return the address of a function, isn't that something?!). Keeping the existing `User` definition, try this `main`: 

```zig
pub fn main() void {
	const user = User{
		.id = 1,
		.power = 100,
	};
	std.debug.print("{*}\n{*}\n{*}\n", .{&user, &user.id, &user.power});
}
```

This code prints the address of `user`, `user.id` and `user.power`. You might get different results based on your platform and other factors, but hopefully you'll see that the address of `user` and `user.id` are the same, while `user.power` is at an 8 byte offset. I got: 

```text
learning.User@1043368d0
u64@1043368d0
i32@1043368d8
```

The addressof operator returns a pointer to a value. A pointer to a value is a distinct type. The address of a value of type `T` is a `*T`. We pronounce that _a pointer to T_. Therefore, if we take the address of `user`, we'll get a `*User`, or a pointer to `User`:

```zig
pub fn main() void {
	var user = User{
		.id = 1,
		.power = 100,
	};
	user.power += 0;

	const user_p = &user;
	std.debug.print("{any}\n", .{@TypeOf(user_p)});
}
```

Our original goal was to increase our user's `power` by 1, via the `levelUp` function. We got the code to compile, but when we printed `power` it was still the original value. It's a bit of a leap, but let's change the code to print the address of `user` in `main` and in `levelUp`:

```zig
pub fn main() void {
	var user = User{
		.id = 1,
		.power = 100,
	};
	user.power += 0;

	// added this
	std.debug.print("main: {*}\n", .{&user});

	levelUp(user);
	std.debug.print("User {d} has power of {d}\n", .{user.id, user.power});
}

fn levelUp(user: User) void {
	// add this
	std.debug.print("levelUp: {*}\n", .{&user});
	var u = user;
	u.power += 1;
}
```

If you run this, you'll get two different addresses. This means that the `user` being modified in `levelUp` is different from the `user` in `main`. This happens because Zig passes a copy of the value. That might seem like a strange default, but one of the benefits is that the caller of a function can be sure that the function won't modify the parameter (because it can't). In a lot of cases, that's a good thing to have guaranteed. Of course, sometimes, like with `levelUp`, we _want_ the function to modify a parameter. To achieve this, we need `levelUp` to act on the actual `user` in `main`, not a copy. We can do this by passing the address of our user into the function:

```zig
const std = @import("std");

pub fn main() void {
	var user = User{
		.id = 1,
		.power = 100,
	};

	// no longer needed
	// user.power += 1;

	// user -> &user
	levelUp(&user);
	std.debug.print("User {d} has power of {d}\n", .{user.id, user.power});
}

// User -> *User
fn levelUp(user: *User) void {
	user.power += 1;
}

pub const User = struct {
	id: u64,
	power: i32,
};
```

We had to make two changes. The first is calling `levelUp` with the address of user, i.e. `&user`, instead of `user`. This means that our function no longer receives a `User`. Instead, it receives a `*User`, which was our second change.

We no longer need that ugly hack of forcing user to be mutated via `user.power += 0;`. Initially, we failed to get the code to compile because `user` was a `var`; the compiler told us it was never mutated. We thought maybe the compiler was wrong and "tricked" it by forcing a mutation. But, as we now know, the `user` being mutated in `levelUp` was a different; the compiler was right.

The code now works as intended. There are still many subtleties with function parameters and our memory model in general, but we're making progress. Now might be a good time to mention that, aside from the specific syntax, none of this is unique to Zig. The model that we're exploring here is the most common, some languages might just hide many of the details, and thus flexibility, from developers.

## [Methods](#methods)

More than likely, you'd have written `levelUp` as a method of the `User` structure:

```zig
pub const User = struct {
	id: u64,
	power: i32,

	fn levelUp(user: *User) void {
		user.power += 1;
	}
};
```

This begs the question: how do we call a method with a pointer receiver? Maybe we have to do something like: `&user.levelUp()`? Actually, you just call it normally, i.e. `user.levelUp()`. Zig knows that the method expects a pointer and passes the value correctly (by reference).

I initially chose a function because it's explicit and thus easier to learn from.

## [Constant Function Parameters](#const%5Fparemeters)

I more than implied that, by default, Zig will pass a copy of a value (called "pass by value"). Shortly we'll see that the reality is a bit more subtle (hint: what about complex values with nested objects?)

Even sticking with simple types, the truth is that Zig can pass parameters however it wants, so long as it can guarantee that the intent of the code is preserved. In our original `levelUp`, where the parameter was a `User`, Zig could have passed a copy of the user or a reference to `main.user`, as long as it could guarantee that the function would not mutate it. (I know we ultimately _did_ want it mutated, but by making the type `User`, we were telling the compiler that we didn't).

This freedom allows Zig to use the most optimal strategy based on the parameter type. Small types, like `User`, can be cheaply passed by value (i.e. copied). Larger types might be cheaper to pass by reference. Zig can use any approach, so long as the intent of the code is preserved. To some degree, this is made possible by having constant function parameters.

Now you know one of the reasons function parameters are constants.

Maybe you're wondering how passing by reference could ever be slower, even compared to copying a really small structure. We'll see this more clearly next, but the gist is that doing `user.power` when `user` is a pointer adds a tiny bit of overhead. The compiler has to weigh the cost of copying versus the cost of accessing fields indirectly through a pointer.

## [Pointer to Pointer](#pointer%5Fto%5Fpointer)

We previous looked at what the memory of `user` within our `main` function looked like. Now that we've changed `levelUp` what would its memory look like?:

```text
main:
user -> ------------  (id: 1043368d0)  <---
        |    1     |                      |
        ------------  (power: 1043368d8)  |
        |   100    |                      |
        ------------                      |
                                          |
        .............  empty space        |
        .............  or other data      |
                                          |
levelUp:                                  |
user -> -------------  (*User)            |
        | 1043368d0 |----------------------
        -------------
```

Within `levelUp`, `user` is a pointer to a `User`. Its value is an address. Not just any address, of course, but the address of `main.user`. It's worth being explicit that the `user` variable in `levelUp` represents a concrete value. This value happens to be an address. And, it's not _just_ an address, it's also a type, a `*User`. It's all very consistent, it doesn't matter if we're talking about pointers or not: variables associate type information with an address. The only special thing about pointers is that, when we use the dot syntax, e.g. `user.power`, Zig, knowing that `user` is a pointer, will automatically follow the address.

Some languages require a different symbol when accessing a field through a pointer.

What's important to understand is that the `user` variable in `levelUp` itself exists in memory at some address. Just like we did before, we can see this for ourselves:

```zig
fn levelUp(user: *User) void {
	std.debug.print("{*}\n{*}\n", .{&user, user});
	user.power += 1;
}
```

The above prints the address the `user` variable references as well as its value, which is the address of the `user` in `main`.

If `user` is a `*User`, then what is `&user`? It's a `**User`, or a _pointer to a pointer to a `User`_. I can do this until one of us runs out of memory!

There _are_ use-cases for multiple levels of indirection, but it isn't anything we need right now. The purpose of this section is to show that pointers aren't special, they're just a value, which is an address, and a type.

## [Nested Pointers](#nested%5Fpointers)

Up until now, our `User` has been simple, containing two integers. It's easy to visualize its memory and, when we talk about "copying", there isn't any ambiguity. But what happens when `User` becomes more complex and contains a pointer?

```zig
pub const User = struct {
	id: u64,
	power: i32,
	name: []const u8,
};
```

We've added `name` which is a slice. Recall that a slice is a length and a pointer. If we initialized our `user` with the name of `"Goku"`, what would it look like in memory?

```text
user -> -------------  (id: 1043368d0)
        |     1     |
        -------------  (power: 1043368d8)
        |    100    |
        -------------  (name.len: 1043368dc)
        |     4     |
        -------------  (name.ptr: 1043368e4)
  ------| 1182145c0 |
  |     -------------
  |
  |     .............  empty space
  |     .............  or other data
  |
  --->  -------------  (1182145c0)
        |    'G'    |
        -------------
        |    'o'    |
        -------------
        |    'k'    |
        -------------
        |    'u'    |
        -------------
```

The new `name` field is a slice which is made up of a `len` and `ptr` field. These are laid out in sequence along with all the other fields. On a 64 bit platform both `len` and `ptr` will be 64 bits, or 8 bytes. The interesting part is the value of `name.ptr`: it's an address to some other place in memory.

Since we used a string literal, `user.name.ptr` will point to a specific location within the area where all the constants are stored inside our binary.

Types can get much more complex than this with deep nesting. But simple or complex, they all behave the same. Specifically, if we go back to our original code where `levelUp` took a plain `User` and Zig provided a copy, how would that look now that we have a nested pointer?

The answer is that only a shallow copy of the value is made. Or, as some put it, only the memory immediately addressable by the variable is copied. It might seem like `levelUp` would get a half-baked copy of `user`, possibly with an invalid `name`. But remember that a pointer, like our `user.name.ptr` is a value, and that value is an address. A copy of an address is still the same address:

```text
main: user ->    -------------  (id: 1043368d0)
                 |     1     |
                 -------------  (power: 1043368d8)
                 |    100    |
                 -------------  (name.len: 1043368dc)
                 |     4     |
                 -------------  (name.ptr: 1043368e4)
                 | 1182145c0 |-------------------------
levelUp: user -> -------------  (id: 1043368ec)       |
                 |     1     |                        |
                 -------------  (power: 1043368f4)    |
                 |    100    |                        |
                 -------------  (name.len: 1043368f8) |
                 |     4     |                        |
                 -------------  (name.ptr: 104336900) |
                 | 1182145c0 |-------------------------
                 -------------                        |
                                                      |
                 .............  empty space           |
                 .............  or other data         |
                                                      |
                 -------------  (1182145c0)        <---
                 |    'G'    |
                 -------------
                 |    'o'    |
                 -------------
                 |    'k'    |
                 -------------
                 |    'u'    |
                 -------------
```

From the above, we can see that shallow copying will work. Since a pointer's value is an address, copying the value means we get the same address. This has important implications with respect to mutability. Our function can't mutate the fields directly accessible by `main.user` since it got a copy, but it does have access to the same `name`, so can it mutate that? In this specific case, no, `name` is a `const`. Plus, our value "Goku" is a string literal which are always immutable. But, with a bit of work, we can see the implication of shallow copying:

```zig
const std = @import("std");

pub fn main() void {
	var name = [4]u8{'G', 'o', 'k', 'u'};
	const user = User{
		.id = 1,
		.power = 100,
		// slice it, [4]u8 -> []u8
		.name = name[0..],
	};
	levelUp(user);
	std.debug.print("{s}\n", .{user.name});
}

fn levelUp(user: User) void {
	user.name[2] = '!';
}

pub const User = struct {
	id: u64,
	power: i32,
	// []const u8 -> []u8
	name: []u8
};
```

The above code prints "Go!u". We had to change `name`'s type from `[]const u8` to `[]u8` and instead of a string literal, which are always immutable, create an array and slice it. Some might see inconsistency here. Passing by value prevents a function from mutating immediate fields, but not fields with a value behind a pointer. If we _did_ want `name` to be immutable, we should have declared it as a `[]const u8` instead of a `[]u8`.

Some languages have a different implementation, but many languages work exactly like this (or very close). While all of this might seem esoteric, it's fundamental to day to day programming. The good news is that you can master this using simple examples and snippets; it doesn't get more complicated as other parts of the system grow in complexity.

## [Recursive Structures](#recursive%5Fstructures)

Sometimes you need a structure to be recursive. Keeping our existing code, let's add an optional `manager` of type `?User` to our `User`. While we're at it, we'll create two `Users` and assign one as the manager to another:

```zig
const std = @import("std");

pub fn main() void {
	const leto = User{
		.id = 1,
		.power = 9001,
		.manager = null,
	};

	const duncan = User{
		.id = 1,
		.power = 9001,
		.manager = leto,
	};

	std.debug.print("{any}\n{any}", .{leto, duncan});
}

pub const User = struct {
	id: u64,
	power: i32,
	manager: ?User,
};
```

This code won't compile: _struct 'learning.User' depends on itself_. This fails because every type has to have a known compile-time size.

We didn't run into this problem when we added `name` even though names can be different lengths. The issue isn't with the size of values, it's with the size of the types themselves. Zig needs this knowledge to do everything we talked about above, like accessing a field based on its offset position. `name` was a slice, a `[]const u8`, and that has a known size: 16 bytes. 8 bytes for `len` and 8 bytes for `ptr`.

You might think this is going to be a problem with any optional or union. But for both optionals and unions, the largest possible size is known and Zig can use that. A recursive structure has no such upper-bound, the structure could recurse once, twice or millions of times. That number would vary from `User` to `User` and would not be known at compile time.

We saw the answer with `name`: use a pointer. Pointers always take `usize` bytes. On a 64-bit platform, that's 8 bytes. Just like the actual name "Goku" wasn't stored with/along our `user`, using a pointer means our manager is no longer tied to the `user`'s memory layout.

```zig
const std = @import("std");

pub fn main() void {
	const leto = User{
		.id = 1,
		.power = 9001,
		.manager = null,
	};

	const duncan = User{
		.id = 1,
		.power = 9001,
		// changed from leto -> &leto
		.manager = &leto,
	};

	std.debug.print("{any}\n{any}", .{leto, duncan});
}

pub const User = struct {
	id: u64,
	power: i32,
	// changed from ?User -> ?*const User
	manager: ?*const User,
};
```

You might never need a recursive structure, but this isn't about data modeling. It's about understanding pointers and memory models and better understanding what the compiler is up to.

A lot of developers struggle with pointers, there can be something elusive about them. They don't feel concrete like an integer, or string or `User`. None of this has to be crystal clear for you to move forward. But it is worth mastering, and not just for Zig. These details might be hidden in languages like Ruby, Python and JavaScript, and to a lesser extent C#, Java and Go, but they're still there, impacting how you write code and how that code runs. So take your time, play with examples, add debug print statements to look at variables and their address. The more you explore, the clearer it will get.

[](/learning%5Fzig/style%5Fguide)Style Guide [](/learning%5Fzig)Intro [](/learning%5Fzig/stack%5Fmemory)Stack Memory