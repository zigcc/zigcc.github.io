 

Learning Zig - Stack Memory 

[](/learning%5Fzig/pointers)Pointers [](/learning%5Fzig)Intro [](/learning%5Fzig/heap%5Fmemory)Heap Memory & Allocators 

While this series was written in 2023, it is still relevant in 2026 and largely kept up to date with Zig 0.16\. If you find an issue, you can report it [on github](https://github.com/karlseguin/blog).

# [Stack Memory](#stack%5Fmemory)

Diving into pointers provided insight into the relationship between variables, data and memory. So we're getting a sense of what the memory looks like, but we've yet to talk about how data and, by extension, memory is managed. For short lived and simple scripts, this likely doesn't matter. In an age of 32GB laptop, you can start your program, use a few hundred megabytes of RAM reading a file and parsing an HTTP response, do something amazing, and exit. On program exit, the OS knows that whatever memory it gave your program can now be used for something else.

But for programs that run for days, months or even years, memory becomes a limited and precious resource, likely sought after by other processes running on the same machine. There's simply no way to wait until the program exits to free memory. This is a garbage collector's primary job: knowing what data is no longer in-use and freeing its memory. In Zig, you're the garbage collector.

Most of the programs you write will make use of three "areas" of memory. The first is global space, which is where program constants, including string literals, are stored. All global data is baked into the binary, fully known at compile time (and thus runtime) and immutable. This data exists throughout the lifetime of the program, never needing more or less memory. Aside from the impact it has on the size of our binary, this isn't something we need to worry about at all.

The second area of memory is the call stack, the topic for this part. The third area is the heap, the topic for our next part.

There isn't a real physical difference between the areas of memory, it's a concept created by the OS and the executable.

## [Stack Frames](#stack%5Fframes)

All of the data we've seen so far have been constants stored in the global data section of our binary or local variables. "Local" indicates that the variable is only valid within the scope where it's declared. In Zig, scopes begin and end with curly braces, `{ ... }`. Most variables are scoped to a function, including function parameters, or a control-flow block, like an `if`. But, as we've seen, you can create arbitrary blocks and thus, arbitrary scopes.

In the previous part, we visualized the memory of our `main` and `levelUp` functions, each with a `User`:

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

There's a reason `levelUp` is immediately after `main`: this is our \[simplified\] call stack. When our program starts, `main`, along with its local variables are pushed onto the call stack. When `levelUp` is called, its parameters and any local variables are pushed onto the call stack. Importantly, when `levelUp` returns, it's popped off the stack. After `levelUp` returns and control is back in `main`, our call stack looks like:

```text
main: user ->    -------------  (id: 1043368d0)
                 |     1     |
                 -------------  (power: 1043368d8)
                 |    100    |
                 -------------  (name.len: 1043368dc)
                 |     4     |
                 -------------  (name.ptr: 1043368e4)
                 | 1182145c0 |-------------------------
                 -------------
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

When a function is called, its entire stack frame is pushed onto the call stack. This is one of the reasons we need to know the size of every type. While we might not know the length of our user's name until that specific line of code is executed (assuming it wasn't a constant string literal), we do know that our function has a `User` and, in addition to the other fields, we'll need 8 bytes for `name.len` and 8 bytes `name.ptr`.

When the function returns, its stack frame, which was the last pushed onto the call stack, is popped off. Something amazing just happened: the memory used by `levelUp` has been automatically freed! While technically that memory could be returned to the OS, as far as I know, no implementation actually shrinks the call stack (they will dynamically grow it when necessary though). Still, the memory used to store `levelUp`'s stack frame is now free to be used within our process for another stack frame.

In a normal program, the call stack can grow quite large. Between all the framework code and libraries that a typical program uses, you end up with deeply nested functions. Normally, that isn't a problem, but now and again, you might have run into some type of stack overflow error. This happens when our call stack has run out of space. More often than not, this happens with recursive functions - a function that calls itself.

Like our global data, the call stack is managed by the OS and the executable. On program start, and for each thread we start thereafter, a call stack is created (the size of which can normally be configured in the OS). The call stack exists for the life of the program or, in the case of a thread, the life of the thread. On program or thread exit, the call stack is freed. But whereas our global data has all of the programs global data, the call stack only has stack frames for the currently executing hierarchy of functions. This is efficient both in terms of memory usage as well as the simplicity of pushing and popping stack frames on and off the stack.

## [Dangling Pointers](#danling%5Fpointers)

The call stack is amazing for both its simplicity and efficiency. But it's also frightening: when a function returns, any of its local data becomes inaccessible. That might sound reasonable, it is _local_ data after all, but it can introduce serious issues. Consider this code:

```zig
const std = @import("std");

pub fn main() !void {
    std.debug.print("{s}\n", .{try classify(9000)});
}

fn classify(power_level: u32) ![]const u8 {
    var buf: [20]u8 = undefined;
    return std.fmt.bufPrint(&buf, "over: {d}\n", .{power_level});
}
```

At quick glance, it would be reasonable to expect this to print `over 9000\n`, but I got: `��������v�`. You'll likely get a different result. The issue is that `bufPrint` prints the string into the supplied buffer (`&buf`) and returns a slice. This slice is returned from `classify` to `main`, but that slice points to `buf` which is local to the function. This is called a dangling pointer, a pointer that references invalid memory. It's the source of many segfaults.

When a stack frame is popped off the call stack, any references we have to that memory are invalid. The result of trying to access that memory is undefined. You'll likely get nonsense data or a segfault. In some cases, it might still work; it isn't like that physical memory is gone and it's possible nothing has changed its value. But that's the point of "undefined", it could be anything.

One challenge with this type of bug is that, in languages with garbage collectors, the above code is perfectly fine. Go for example would detect that the local `user` outlives its scope, the `init` function, and would ensure its validity for as long as it's needed (how Go does this is an implementation detail, but it has a few options, including moving the data to the heap, which is what the next part is about).

The other issue, I'm sorry to say, is that it can be a hard to spot bug. In our above example, once you know how `bufPrint` works (and really, how else could it work?) we're clearly returning the address of a local. But such behavior can hide inside of nested function and complex data types. Do you see any possible issues with the following incomplete code:

```zig
fn read() ![]const u8 {
	const input = try readUserInput();
	return Parser.parse(input);
}
```

Whatever `Parser.parse` returns outlives `input`. If `Parser` holds a reference to `input`, that'll be a dangling pointer just waiting to crash our app. Ideally, if `Parser` needs `input` to live as long as it does, it will make a copy of it and that copy will be tied to its own lifetime (more on this in the next part). But there's nothing here to enforce this contract. `Parser`'s documentation might shed some light on what it expects of `input` or what it does with it. Lacking that, we might need to dig into the code to figure it out.

Zig is getting increasingly good at turning these runtime errors into compiler errors. The snippet that I originally used no longer compiles under Zig 0.16; hence the example was updated (and isn't as good). There are a few ways to solve the actual bug, but the simplest in this case is to have the caller supply the buffer (`[]u8`) to write into. Then it becomes the caller's responsibility to ensure the buffer outlives the formatted value. But that won't always be possible. Data often has to live beyond the rigid boundaries of function scopes. For that we have the third memory area, the heap, the topic of the next part.

Before diving into the heap, know that we'll see one final example of dangling pointers before the end of this guide. At that point, we'll have covered enough of the language to give a sightly less convoluted example. I want to revisit this topic because, for developers coming from garbage collected languages, this is likely to cause bugs and frustration. It is something you **will** get a handle on. It comes down to being aware of where and when data exists.

[](/learning%5Fzig/pointers)Pointers [](/learning%5Fzig)Intro [](/learning%5Fzig/heap%5Fmemory)Heap Memory & Allocators