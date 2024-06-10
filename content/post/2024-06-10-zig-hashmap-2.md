---
title: "Zig HashMap - 2"
author: Wenxuan Feng
date: 2024-06-10T07:57:05.138Z
---

> 原文地址: https://www.openmymind.net/Zigs-HashMap-Part-2/

# 正文

在[第一部分](https://www.openmymind.net/Zigs-HashMap-Part-1/)中，我们探讨了六种 `HashMap` 变体之间的关系以及每种变体为开发人员提供了什么。我们主要关注为各种数据类型定义和初始化 `HashMap`，并为 `StringHashMap` 或 `AutoHashMap` 不支持的类型使用自定义 `hash` 和 `eql` 函数。在这一部分中，我们将重点关注键和值，它们是如何存储、暴露的以及我们对它们生命周期的责任。

大致而言，Zig 的哈希表是使用两个切片实现的：一个用于键，一个用于值。从哈希函数返回的哈希码用于在这些数组中找到条目的理想索引。简单开始，如果我们有以下代码：

```zig
var lookup = std.StringHashMap(i32).init(allocator);
defer lookup.deinit();

try lookup.put("Goku", 9001);
try lookup.put("Paul", 1234);
```

我们可以这样可视化我们的哈希表：

```
keys:               values:
       --------          --------
       | Paul  |         | 1234 |     @mod(hash("Paul"), 5) == 0
       --------          --------
       |      |          |      |
       --------          --------
       |      |          |      |
       --------          --------
       | Goku |          | 9001 |    @mod(hash("Goku"), 5) == 3
       --------          --------
       |      |          |      |
       --------          --------
```

当我们对键进行哈希并使用数组长度（上例中为 5）进行取模操作时，我们得到了条目的理想索引。我说“理想”，因为我们的哈希函数可以为两个不同的键返回相同的哈希码；当我们通过 `@mod` 将哈希码映射到 5 个可用槽位之一时，这种碰撞的可能性显著增加。但如果我们忽略可能的碰撞，这是我们哈希表的合理视图。

一旦我们的哈希表填满到一定程度（在第一部分中，我们简要谈到了填充因子，并提到 Zig 的默认填充因子是 80%），它需要增长以容纳新值，并保持查找的常数时间性能。扩展哈希表就像扩展动态数组一样，我们分配一个新数组，并将值从原始数组复制到新数组（一个简单的算法是将其大小增加两倍）。然而，对于哈希表来说，我们不能简单地将键和值复制到新切片的相同索引。我们需要重新计算它们的索引。为什么？因为条目的位置必须是一致且可预测的。我们不能使用一种算法插入键值对，例如 `@mod(hash("Goku"), 5)`，并期望使用不同的算法找到它，例如 `@mod(hash("Goku"), 10)`（注意，由于我们的数组增大了，5 变为 10）。

这个基本的可视化将作为本文大部分内容的基础。此外，条目可以从一个底层数组移动到另一个（即当哈希表填满并需要增长时）这一事实也是我们将不断回顾的内容。

## Values

如果我们扩展上面的代码片段并调用 `lookup.get("Paul")`，返回值将是 1234。`get` 的返回类型是 `?i32`，或者更通用地说，`?V`。可选的返回类型允许 `get` 告诉我们键未找到。如果你浏览过 Zig 的文档，你可能会注意到另一个类似的方法：`getPtr(key)`，它有一个稍微不同的返回类型：`?*V`。

由于在谈论像我们 `i32` 这样的原始类型时，很难理解这两种方法之间的区别，请考虑这个版本，它将我们的 `i32` 值替换为一个 `User`：

```zig
const std = @import("std");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();

    var lookup = std.StringHashMap(User).init(allocator);
    defer lookup.deinit();

    try lookup.put("Goku", .{
        .id = 9000,
        .name = "Goku",
        .super = false,
    });

    var user = lookup.get("Goku").?;

    user.super = true;
    std.debug.print("{any}\n", .{lookup.get("Goku").?.super});
}

const User = struct {
    id: i32,
    name: []const u8,
    super: bool,
};
```

即使我们设置了 `user.super = true`，在 `lookup` 中的 `User` 的值仍然是 `false`。这是因为在 Zig 中，赋值是通过复制完成的。如果我们保持代码不变，但将 `lookup.get` 改为 `lookup.getPtr`，它将起作用。我们仍然在做赋值，因此仍然在复制一个值，但我们复制的值是哈希表中 `User` 的地址，而不是 `user` 本身。

`getPtr` 允许我们获取哈希表中值的引用。如上所示，这具有行为意义；我们可以直接修改存储在哈希表中的值。这也具有性能意义，因为复制大值可能会很昂贵。但是考虑我们上面的可视化，并记住，随着哈希表的填满，值可能会重新定位。考虑到这一点，你能解释为什么这段代码会崩溃吗？：

```zig
const std = @import("std");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();

    // 改变类型只是为了更容易编写这个片段
    // 上面的 StringHashMap(User) 也会发生同样的情况
    var lookup = std.AutoHashMap(usize, usize).init(allocator);
    defer lookup.deinit();

    try lookup.put(100, 100);
    const first = lookup.getPtr(100).?;

    for (0..50) |i| {
        try lookup.put(i, i);
    }
    first.* = 200;
}
```

如果 `first.* = 200;` 语法令人困惑，我们正在解引用指针并向其写入一个值。我们的指针是我们值数组中某个索引的地址，所以这种语法实际上是在我们的数组中直接写入一个值。它崩溃的原因是我们的插入循环迫使哈希表增长，导致底层键和值被重新分配并移动。`getPtr` 返回的指针不再有效。在撰写本文时，默认的哈希表大小是 8，填充因子是 80%。如果我们循环 `0..5`，代码会工作，但再多一次迭代（`0..6`）会导致增长，从而导致崩溃。在典型使用中，这个问题通常不是问题；你不会在修改哈希表时持有对某个条目的引用。但理解它可能发生并理解为什么它发生将帮助我们更好地利用其他返回值和键指针的哈希表功能。

回到我们的 `User` 示例，如果我们将 `lookup` 的类型从 `std.StringHashMap(User)` 改为 `std.StringHashMap(*User)` 会怎样？最大的影响将是值的生命周期。使用原来的 `std.StringHashMap(User)`，我们可以说 `lookup` 拥有这些值——我们插入的用户嵌入在哈希表的值数组中。这使得生命周期管理变得容易，当我们 `deinit` 我们的 `lookup` 时，底层的键和值数组会被释放。

我们的 `User` 有一个 `name: []const u8` 字段。我们的示例使用字符串字面量，它在程序的生命周期中静态存在。然而，如果我们的 `name` 是动态分配的，我们必须显式地释放它。我们将在更详细地探讨指针值时涵盖这一点。

使用 `*User` 打破了这种所有权。我们的哈希表存储指针，但它不拥有指针所指向的内容。尽管调用了 `lookup.deinit`，这段代码会导致用户泄漏：

```zig
const std = @import("std");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();

    var lookup = std.StringHashMap(*User).init(allocator);
    defer lookup.deinit();

    const goku = try allocator.create(User);
    goku.* = .{
        .id = 9000,
        .name = "Goku",
        .super = false,
    };
    try lookup.put("Goku", goku);
}

const User = struct {
    id: i32,
    name: []const u8,
    super: bool,
};
```

让我们将其可视化：

```
lookup
 ===============================
 ║  keys:       values:        ║
 ║  --------    -------------  ║
 ║  | Goku* |   | 1024d4000 | ----> -------------
 ║  --------    -------------  ║    |   9000    |
 ║  |       |   |           |  ║    -------------
 ║  --------    -------------  ║    | 1047300e4 |---> -----------------
 ===============================    -------------     | G | o | k | u |
                                    |    4      |     -----------------
                                    -------------
                                    |   false   |
                                    -------------
```

我们将会在下一节讨论键，现在为了简单起见我们使用“Goku”。

双线框是我们的 `lookup`，表示它拥有并负责的内存。我们放入哈希表的引用将指向框外的值。这有许多含义。最重要的是，这意味着值的生命周期与哈希表的生命周期分离，调用 `lookup.deinit` 不会释放它们。

有一种常见情况是我们想使用指针并将值的生命周期与哈希表相关联。回想我们崩溃的程序，当对哈希表值的指针变得无效时。正如我所说，这通常不是问题，但在更高级的场景中，你可能希望不同部分的代码引用也存在于哈希表中的值。让我们重新审视上面的可视化，并思考如果我们的哈希表增长并重新定位键和值数组会发生什么：

```zig
lookup
 ===============================
 ║  keys:       values:        ║
 ║  --------    -------------  ║
 ║  |       |   |           |  ║
 ║  --------    -------------  ║
 ║  --------    -------------  ║
 ║  |       |   |           |  ║
 ║  --------    -------------  ║
 ║  --------    -------------  ║
 ║  | Goku* |   | 1024d4000 | ----> -------------
 ║  --------    -------------  ║    |   9000    |
 ║  |       |   |           |  ║    -------------
 ║  --------    -------------  ║    | 1047300e4 |---> -----------------
 ===============================    -------------     | G | o | k | u |
                                    |    4      |     -----------------
                                    -------------
                                    |   false   |
                                    -------------
```

这两个数组已经增长、重新分配，并且我们的条目索引已重新计算，但我们实际的 `User` 仍然驻留在堆中的同一位置（内存位置 1047300e4）。就像 `deinit` 不会改变双线框外的任何内容一样，其他变化（如增长）也不会改变它们。

一般来说，你是否应该存储值或指向值的指针将是显而易见的。这主要是因为像 `getPtr` 这样的方法使我们能够直接从哈希表中高效地检索和修改值。无论哪种方式，我们都可以获得性能上的好处，所以性能不是主要考虑因素。重要的是值是否需要比哈希表存活更久和/或在哈希表发生变化时对值的引用是否需要存在（并因此保持有效）。

在哈希表和引用的值应该链接的情况下，我们需要在调用 `lookup.deinit` 之前遍历这些值并清理它们：

```zig
defer {
    var it = lookup.valueIterator();
    while (it.next()) |value_ptr| {
        allocator.destroy(value_ptr.*);
    }
    lookup.deinit();
}
```

如果解引用 (`value_ptr.*`) 看起来不对劲，请回到可视化。我们的 `valueIterator` 给我们数组中值的指针，而数组中的值是 `*User`。因此，`value_ptr` 是 `**User`。

无论我们是存储 `User` 还是 `*User`，值中任何已分配的字段始终是我们的责任。在一个真实的应用程序中，你的用户名称不会是字符串字面量，它们会是动态分配的。在这种情况下，我们上面的 while 循环需要改为：

```zig
while (it.next()) |value_ptr| {
    const user = value_ptr.*;
    allocator.free(user.name);
    allocator.destroy(user);
}
```

即使我们的值是 `User`，其字段也是我们的责任（认为 `lookup.deinit` 会知道如何/需要释放什么有点荒谬）：

```zig
while (it.next()) |value_ptr| {
    allocator.free(value_ptr.name);
}
```

在最后一种情况下，由于我们存储的是 `User`，我们的 `value_ptr` 是 `*User`（指向 `User` 的指针，不像之前那样是指向指针的指针）。

## Keys

我们可以开始和结束这一节：我们关于值的所有内容同样适用于键。这是100%正确的，但这在某种程度上不太直观。大多数开发人员很快就能理解，存储在哈希表中的堆分配的 `User` 有其自身的生命周期，需要显式管理/释放。但由于某些原因，这对于键来说并不那么明显。

像值一样，如果我们的键是原始类型，我们不必做任何特别的事情。像整数这样的键直接存储在哈希表的键数组中，因此其生命周期和内存与哈希表绑定。这是一种非常常见的情况。但另一种常见的情况是使用 `std.StringHashMap` 的字符串键。这常常让刚接触 Zig 的开发人员感到困惑，但你需要保证字符串键在哈希表使用它们期间是有效的。而且，如果它们是动态分配的，你需要确保在不再使用时释放它们。这意味着对键进行与值相同的处理。

让我们再次可视化我们的哈希表，但这次正确表示一个字符串键：

```
lookup
 ===================================
 ║  keys:       values:            ║
 ║  -------------    ------------  ║
 ║  | 1047300e4 |   | 1024d4000 | ----> -------------
 ║  -------------   -------------  ║    |   9000    |
 ║  |           |   |           |  ║    -------------
 ║  -------------   -------------  ║    | 1047300e4 |---> -----------------
 ===================================    -------------     | G | o | k | u |
                                        |    4      |     -----------------
                                        -------------
                                        |   false   |
                                        -------------
```

在这个例子中，我们的键实际上是 `user.name`。将键作为值的一部分是非常常见的。这里是它可能的样子：

```zig
const user = try allocator.create(User);
user.* = .{
    .id = 9000,
    .super = false,
    // 模拟来自动态源（如数据库）的名称
    .name = try allocator.dupe(u8, "Goku"),
};
try lookup.put(user.name, user);
```

在这种情况下，我们之前的清理代码是足够的，因为我们已经在释放作为我们键的 `user.name`：

```zig
defer {
    var it = lookup.iterator();
    while (it.next()) |value_ptr| {
        const user = value_ptr.*;
        allocator.free(user.name);
        allocator.destroy(user);
    }
    lookup.deinit();
}
```

但在键不是值的一部分的情况下，我们需要迭代并释放这些键。在许多情况下，你需要同时迭代键和值并释放它们。我们可以通过释放键引用的名称而不是用户来模拟这一点：

```zig
defer {
    var it = lookup.iterator();
    while (it.next()) |kv| {
        // 这个..
        allocator.free(kv.key_ptr.*);

        // 和下面的是一样的，但仅仅因为 user.name 是我们的键
        // allocator.free(user.name);

        allocator.destroy(kv.value_ptr.*);
    }
    lookup.deinit();
}
```

我们使用 `iterator()` 而不是 `iteratorValue()` 来访问 `key_ptr` 和 `value_ptr`。

最后要考虑的是如何从我们的 `lookup` 中移除值。尽管使用了改进的清理逻辑，这段代码仍会导致键和堆分配的 `User` 泄漏：

```zig
var lookup = std.StringHashMap(*User).init(allocator);

defer {
    var it = lookup.iterator();
    while (it.next()) |kv| {
        allocator.free(kv.key_ptr.*);
        allocator.destroy(kv.value_ptr.*);
    }
    lookup.deinit();
}

const user = try allocator.create(User);
user.* = .{
    .id = 9000,
    .super = false,
    // 模拟来自动态源（如数据库）的名称
    .name = try allocator.dupe(u8, "Goku"),
};
try lookup.put(user.name, user);

// 我们加上了这行！
_ = lookup.remove(user.name);
```

最后一行从我们的哈希表中移除了条目，所以我们的清理例程不再迭代它，也不会释放名称或用户。我们需要使用 `fetchRemove` 而不是 `remove` 来获取被移除的键和值：

```zig
if (lookup.fetchRemove(user.name)) |kv| {
    allocator.free(kv.key);
    allocator.destroy(kv.value);
}
```

`fetchRemove` 不返回键和值的指针，而是返回实际的键和值。这并不会改变我们的使用方式，但显然为什么返回键和值而不是指针是很明显的。因为从哈希表中移除的条目，不再有指向哈希表中键和值的有效指针——它们已经被移除了。

所有这些都假设你的值和键在从哈希表中移除时需要被释放/失效。有些情况下，你的值（更少见的是键）的生命周期与它们在哈希表中的存在完全无关。在这些情况下，你需要在适合你的应用程序的情况下释放内存。没有通用的模式/指导适用。

对于大多数情况，在处理非原始键或值时，关键是当你调用哈希表的 `deinit` 时，你为键(keys) 和(或) 值(values) 分配的任何内存不会被自动释放；你需要自己处理。

## getOrPut

虽然我们已经讨论过的内容有很多含义，但对我来说，直接暴露键和值指针的最大好处之一是 `getOrPut` 方法。

如果我让你在 Go 或大多数语言中存储带名称的计数器，你会写出类似这样的代码：

```go
count, exists := counters[name]
if exists == false {
    counters[name] = 1
} else {
    counters[name] = count + 1;
}
```

这段代码需要两次查找。虽然我们已经被训练成不看超过哈希表访问是 O(1) 这一事实，但现实是，操作越少越快，计算哈希码不是最便宜的操作（其性能取决于键的类型和长度），碰撞给整个过程增加了开销。`getOrPut` 方法通过返回一个值指针和一个指示是否找到该值的布尔值解决了这个问题。

换句话说，使用 `getOrPut` 我们要么得到一个指向找到的值的指针，要么得到一个指向该项应放置位置的指针。我们还会得到一个布尔值，指示是哪种情况。这使得上面那种插入或更新操作可以用一次查找来完成：

```zig
const gop = try counters.getOrPut(name);
if (gop.found_existing) {
    gop.value_ptr.* += 1;
} else {
    gop.value_ptr.* = 1;
}
```

当然，像任何其他值或键指针一样，只要不对哈希表进行更改，`value_ptr` 就应被视为有效。顺便说一下，这也适用于我们从 `iterator()`、`valueIterator` 和 `keyIterator` 获取的迭代键和值，原因相同。

## 结论

希望你现在对使用 `std.HashMap`、`std.AutoHashMap` 和 `std.StringHashMap` 以及它们的 `unmanaged` 变体感到更加舒适。虽然你可能永远不需要提供自己的上下文（ `hash` 和 `eql` 函数），但知道这是一个选项是很好的。在日常编程中，我发现可视化数据特别有用，尤其是在使用指针和添加间接层次时。每当我处理 `value_ptr` 或 `key_ptr` 时，我都会想到这两个切片以及值或键与这些切片中值或键的地址之间的区别。

