---
title: "Zig HashMap - 1"
author: Wenxuan Feng
date: 2024-06-10T07:57:05.138Z
---

> 原文地址: https://www.openmymind.net/Zigs-HashMap-Part-1/

# 前言

> 本文的前提是您认同 [Zig 的范型实现](https://www.openmymind.net/learning_zig/generics/)

如大多数哈希映射实现一样，Zig 的 `std.HashMap` 依赖于两个函数，`hash(key: K) u64` 和 `eql(key_a: K, key_b: K) bool`。哈希函数接受一个键并返回一个无符号的 64 位整数，称为哈希码。相同的键总是返回相同的哈希码。但哈希函数可以为两个不同的键生成相同的哈希码，这就是我们还需要 `eql` 函数的一个原因：用来确定两个键是否相同。

这些都是标准的操作，但是 Zig 的实现有一些具体的细节值得探讨。鉴于标准库中哈希映射类型的数量以及文档似乎不完整且令人困惑，这一点尤其正确。具体来说，有六种哈希映射变体：`std.HashMap`、`std.HashMapUnmanaged`、`std.AutoHashMap`、`std.AutoHashMapUnmanaged`、`std.StringHashMap`、`std.StringHashMapUnmanaged`。另外五种是简单的封装：它们都是基于 `std.HashMapUnmanaged` 来构建的。由于这种构成方式，这五种变体的文档编写相对较为复杂，我认为文档生成器在处理这种情况时做得并不好，所以阅读起来具有挑战性。

> 还有一个完全不同的 `ArrayHashMap`，它具有不同的属性（例如保留插入顺序），我们在这里不会涉及。

如果我们查看 `std.HashMap` 的 `put` 方法，我们会看到一个经常重复的模式：

```Zig
pub fn put(self: *Self, key: K, value: V) Allocator.Error!void {
  return self.unmanaged.putContext(self.allocator, key, value, self.ctx);
}
```

正如我所说，大部分繁重的工作都由 `std.HashMapUnmanaged` 完成，其他变体通过一个名为 `unmanaged` 的字段对其进行封装。

## Unmanaged
`unmanaged` 类型在整个标准库中随处可见。这是一种命名约定，表明所涉及的类型不维护 `allocator`。任何需要分配的方法都会显式地将 `allocator` 作为参数。要在实践中看到这一点，可以考虑下面这个链表：

```Zig
pub fn LinkedList(comptime T: type) type {
  return struct {
    head: ?*Node = null,
    allocator: Allocator,

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
      return .{
        .allocator = allocator,
      };
    }

    pub fn deinit(self: Self) void {
      var node = self.head;
      while (node) |n| {
        node = n.next;
        self.allocator.destroy(n);
      }
    }

    pub fn append(self: *Self, value: T) !void {
      const node = try self.allocator.create(Node);
      node.value = value;
      const h = self.head orelse {
        node.next = null;
        self.head = node;
        return;
      };
      node.next = h;
      self.head = node;
    }

    pub const Node = struct {
      value: T,
      next: ?*Node,
    };
  };
}
```

我们的初始化函数接受并存储一个 `std.mem.Allocator`。这个分配器随后将在 append 和 deinit 操作中根据需要使用。这在 Zig 中是一个常见的模式。上述 `unmanaged` 版本只有细微的差别：

```zig
pub fn LinkedListUnmanaged(comptime T: type) type {
  return struct {
    head: ?*Node = null,

    const Self = @This();

    pub fn deinit(self: Self, allocator: Allocator) void {
      var node = self.head;
      while (node) |n| {
        node = n.next;
        allocator.destroy(n);
      }
    }

    pub fn append(self: *Self, allocator: Allocator, value: T) !void {
      const node = try allocator.create(Node);
      // .. same as above
    }

    // Node is the same as above
    pub const Node = struct {...}
  };
}
```

我们不再有一个 allocator 字段。append 和 deinit 函数都多了一个额外的参数：allocator。因为我们不再需要存储 allocator，我们能够仅用默认值初始化 `LinkedListUnmanaged(T)（即 head: ?*Node = null）`，并且能够完全移除 `init` 函数。这不是未管理类型的要求，但这是常见的做法。要创建一个 `LinkedListUnmanaged(i32)`，你可以这样做：

```zig
var ll = LinkedListUnmanaged(i32){};
```

这看起来有点神秘，但这是标准的 Zig。LinkedListUnmanaged(i32) 返回一个类型，所以上面的做法和执行 `var user = User{}` 并依赖 User 的默认字段值没有区别。

你可能会好奇 `unmanaged` 类型有什么用？但在我们回答这个问题之前，让我们考虑一下提供我们的 LinkedList 的 `managed` 和 `unmanaged` 版本有多容易。我们保持我们的 `LinkedListUnmanaged` 如原样，并改变我们的 `LinkedList` 来包装它：

```zig
pub fn LinkedList(comptime T: type) type {
  return struct {
    allocator: Allocator,
    unmanaged: LinkedListUnmanaged(T),

    const Self = @This();

    pub fn init(allocator: Allocator) Self {
      return .{
        .unmanaged = .{},
        .allocator = allocator,
      };
    }

    pub fn deinit(self: Self) void {
      self.unmanaged.deinit(self.allocator);
    }

    pub fn append(self: *Self, value: T) !void {
      return self.unmanaged.append(self.allocator, value);
    }

    pub const Node = LinkedListUnmanaged(T).Node;
  };
}
```

这种简单的组合方式，正如我们上面所见，与各种哈希映射类型包装 std.HashMapUnmanaged 的方式相同。

`unmanaged` 类型有几个好处。最重要的是它们更加明确。与知道像 LinkList(T) 这样的类型可能在某个时刻需要分配内存不同，未管理变体的明确 API 标识了进行分配/释放的特定方法。这可以帮助减少意外并为调用者提供更大的控制权。未管理类型的次要好处是它们通过不引用分配器节省了一些内存。一些应用可能需要存储成千上万甚至更多这样的结构，在这种情况下，这种节省可以累积起来。

为了简化，本文的其余部分不会再提到 `unmanaged`。我们看到关于 StringHashMap 或 AutoHashMap 或 HashMap 的任何内容同样适用于它们的 *Unmanaged 变体。

## HashMap 与 AutoHashMap

std.HashMap 是一个泛型类型，它接受两个类型参数：键的类型和值的类型。正如我们所见，哈希映射需要两个函数：hash 和 eql。这两个函数合起来被称为“上下文(context)”。这两个函数都作用于键，并且没有一个单一的 hash 或 eql 函数适用于所有类型。例如，对于整数键，eql 将是 `a_key == b_key`；而对于 `[]const u8` 键，我们希望使用 `std.mem.eql(u8, a_key, b_key)`。

当我们使用 std.HashMap 时，我们需要提供上下文（这两个函数）。我们不久后将讨论这一点，但现在我们可以依赖 std.AutoHashMap，它为我们自动生成这些函数。可能会让你惊讶的是，AutoHashMap 甚至可以为更复杂的键生成上下文。以下操作是有效的：

```zig
const std = @import("std");

pub fn main() !void {
  var gpa = std.heap.GeneralPurposeAllocator(.{}){};
  const allocator = gpa.allocator();

  var h = std.AutoHashMap(User, i32).init(allocator);
  try h.put(User{.id = 3, .state = .active}, 9001);
  defer h.deinit();
}

const User = struct{
  id: i32,
  state: State,

  const State = enum {
    active,
    pending,
  };
};
```

但是 AutoHashMap 的容量是有限的。将我们的 User 结构体修改为：

```zig
const User = struct{
  id: i32,
  state: State,
  login_ids: []i32,
  ...
};
```

我们得到以下编译错误：

> `std.hash.autoHash` 不允许使用切片以及包含切片的联合和结构体（User），因为意图不明确。考虑使用 `std.hash.autoHashStrat` 或提供自己的哈希函数。

事实是，有些类型的相等规则是模糊的。像我们上面的 `login_ids` 这样的切片就是一个很好的例子。应该将指向不同内存但长度相同且内容相同的两个切片视为相等吗？这是特定于应用的。同样，我惊讶地发现 `AutoHashMap` 不允许使用浮点数（直接使用或作为结构体的一部分）：

```zig
var h = std.AutoHashMap(f32, i32).init(allocator);
defer h.deinit();
try h.put(1.1, 9001);
```

上述代码会导致编译错误：无法对类型 f32 进行哈希处理。原来，[哈希浮点数](https://readafterwrite.wordpress.com/2017/03/23/how-to-hash-floating-point-numbers/)并不简单。并不是说浮点数和切片不能被哈希或比较。而是 Zig 选择的任何实现很可能会让一些开发者感到惊讶，这种意外可能会导致误用，进而可能导致错误。最终，如果 AutoHashMap 能处理你的键类型，那么就使用它。如果不能，就使用 HashMap 并提供自己的上下文（我们很快就会看到）。

## AutoHashMap 与 StringHashMap

你会被原谅，如果你认为 StringHashMap(V) 是 AutoHashMap([]const u8, V) 的别名。但正如我们刚看到的，AutoHashMap 不支持切片键。我们可以确认这一点。尝试运行：

```zig
const std = @import("std");

pub fn main() !void {
  var gpa = std.heap.GeneralPurposeAllocator(.{}){};
  const allocator = gpa.allocator();

  var h = std.AutoHashMap([]const u8, i32).init(allocator);
  try h.put("over", 9000);
  defer h.deinit();
}
```

得到下面的错误:

> error: std.auto_hash.autoHash does not allow slices here ([]const u8) because the intent is unclear. Consider using std.StringHashMap for hashing the contents of []const u8. Alternatively, consider using std.auto_hash.hash or providing your own hash function instead.

正如我之前所说，问题不是切片不能被哈希或比较，而是有些情况下，切片只有在引用相同内存时才会被认为是相等的，而另一些情况下，两个切片如果它们的元素相同就会被认为是相等的。但是，对于字符串，大多数人期望“teg”无论存储在哪里都应该等于“teg”。

```zig
const std = @import("std");

pub fn main() !void {
  var gpa = std.heap.GeneralPurposeAllocator(.{}){};
  const allocator = gpa.allocator();

  const name1: []const u8 = &.{'T', 'e', 'g'};
  const name2 = try allocator.dupe(u8, name1);

  const eql1 = std.meta.eql(name1, name2);
  const eql2 = std.mem.eql(u8, name1, name2);
  std.debug.print("{any}\n{any}", .{eql1, eql2});
}
```

上述程序打印“false”，然后打印“true”。`std.meta.eql`使用 `a.ptr == b.ptr` 和 `a.len == b.len` 来比较指针。但具体到字符串，大多数程序员可能期望 `std.mem.eql` 的行为，它比较字符串内部的字节。

因此，就像 `AutoHashMap` 包装了带有自动生成上下文的 `HashMap` 一样，`StringHashMap` 也包装了带有字符串特定上下文的 `HashMap`。我们将更仔细地看上下文，但这里是 `StringHashMap` 使用的上下文：

```zig
pub const StringContext = struct {
  pub fn hash(self: @This(), s: []const u8) u64 {
    _ = self;
    return std.hash.Wyhash.hash(0, s);
  }
  pub fn eql(self: @This(), a: []const u8, b: []const u8) bool {
    _ = self;
    return std.mem.eql(u8, a, b);
  }
};
```

## 自定义上下文

我们将在第一部分结束时，直接使用 `HashMap`，这意味着提供我们自己的上下文。我们将从一个简单的例子开始：为不区分大小写的 ASCII 字符串创建一个 `HashMap`。我们希望以下内容输出：`Goku = 9000`。注意，虽然我们使用键 `GOKU` 进行插入，但我们使用“goku”进行获取：

```zig
const std = @import("std");

pub fn main() !void {
  var gpa = std.heap.GeneralPurposeAllocator(.{}){};
  const allocator = gpa.allocator();

  var h = std.HashMap([]const u8, i32, CaseInsensitiveContext, std.hash_map.default_max_load_percentage).init(allocator);
  defer h.deinit();
  try h.put("Goku", 9000);
  std.debug.print("Goku = {d}\n", .{h.get("goku").?});
}
```

与只需要值类型的 `StringHashMap` 泛型或需要键和值类型的 `AutoHashMap` 不同，`HashMap` 需要键类型、值类型、上下文类型和填充因子。我不会涉及填充因子；在上面我们使用 Zig 的默认填充因子（80）。我们感兴趣的部分是 `CaseInsensitiveContext`。让我们看看它的实现：

```zig
const CaseInsensitiveContext = struct {
  pub fn hash(_: CaseInsensitiveContext, s: []const u8) u64 {
    var key = s;
    var buf: [64]u8 = undefined;
    var h = std.hash.Wyhash.init(0);
    while (key.len >= 64) {
      const lower = std.ascii.lowerString(buf[0..], key[0..64]);
      h.update(lower);
      key = key[64..];
    }

    if (key.len > 0) {
      const lower = std.ascii.lowerString(buf[0..key.len], key);
      h.update(lower);
    }
    return h.final();
  }

  pub fn eql(_: CaseInsensitiveContext, a: []const u8, b: []const u8) bool {
    return std.ascii.eqlIgnoreCase(a, b);
  }
};
```

这两个函数的第一个参数是上下文本身的实例。这允许更高级的模式，其中上下文可能有状态。但在许多情况下，它并未使用。

我们的 `eql` 函数使用现有的 `std.ascii.eqlIgnoreCase` 函数以不区分大小写的方式比较两个键。很直观。

我们的 `hash` 函数可以分为两部分。第一部分是将键转换为小写。如果我们希望“goku”和“GOKU”被视为相等，我们的哈希函数必须为两者返回相同的哈希码。我们通过批量处理64字节来避免分配缓冲区以保存小写值。这是可能的，因为我们的哈希函数可以用新字节进行更新（这是相当常见的）。

这引出了第二部分，什么是 `std.hash.Wyhash`？当谈到哈希表的哈希算法时（不同于加密哈希算法），我们需要考虑一些属性，例如性能（每次操作哈希表都需要哈希键），均匀分布（如果我们的哈希函数返回 `u64`，那么一组随机输入应该在该范围内均匀分布）和碰撞抗性（不同的值可能会产生相同的哈希码，但发生的次数越少越好）。有许多算法，一些专门用于特定输入（例如短字符串），一些专为特定硬件设计。`WyHash` 是一种流行的选择，适用于许多输入和特征。你基本上将字节输入，一旦完成，就会得到一个 `u64`（或取决于版本的 `u32`）。

```zig
const std = @import("std");

pub fn main() !void {
  {
    const name = "Teg";

    var h = std.hash.Wyhash.init(0);
    h.update(name);
    std.debug.print("{d}\n", .{h.final()});
  }

  {
    const name = "Teg";
    const err = @intFromError(error.OutOfMemory);

    var h = std.hash.Wyhash.init(0);
    h.update(name);
    h.update(std.mem.asBytes(&err));
    std.debug.print("{d}\n", .{h.final()});
  }
}
```

这段代码输出： `17623169834704516898`，接着是 `7758855794693669122`。这些数字不应该有任何意义。目标只是展示如何将数据输入我们的哈希函数以生成哈希码。

让我们看另一个例子。假设我们有一个 `User`，我们希望用它作为哈希表中的键：

```zig
const User = struct {
  id: u32,
  name: []const u8,
};
```

我们不能使用 `AutoHashMap`，因为 `name` 不支持切片。让我们从一个骨架开始：

```zig
const std = @import("std");

pub fn main() !void {
  var gpa = std.heap.GeneralPurposeAllocator(.{}){};
  const allocator = gpa.allocator();

  var h = std.HashMap(User, i32, User.HashContext, std.hash_map.default_max_load_percentage).init(allocator);
  defer h.deinit();
  try h.put(.{.id = 1, .name = "Teg"}, 100);
  try h.put(.{.id = 2, .name = "Duncan"}, 200);

  std.debug.print("{d}\n", .{h.get(.{.id = 1, .name = "Teg"}).?});
  std.debug.print("{d}\n", .{h.get(.{.id = 2, .name = "Duncan"}).?});
}

const User = struct {
  id: u32,
  name: []const u8,

  pub const HashContext = struct {
    pub fn hash(_: HashContext, u: User) u64 {
      // TODO
    }

    pub fn eql(_: HashContext, a: User, b: User) bool {
      // TODO
    }
  };
};
```

我们需要实现 `hash` 和 `eql` 函数。`eql`，通常很直观：

```zig
pub fn eql(_: HashContext, a: User, b: User) bool {
  if (a.id != b.id) return false;
  return std.mem.eql(u8, a.name, b.name);
}
```

如果你看过我们的其他哈希示例，你可能会想到它的实现：

```zig
pub fn hash(_: HashContext, u: User) u64 {
  var h = std.hash.Wyhash.init(0);
  h.update(u.name);
  h.update(std.mem.asBytes(&u.id));
  return h.final();
}
```

插入这两个函数，以上示例应该可以工作。

## 结论
希望你现在对 Zig 的哈希表的实现以及如何在代码中利用它们有了更好的理解。在大多数情况下，`std.StringHashMap` 或 `std.AutoHashMap` 就足够了。但知道 `*Unmanaged` 变体的存在和目的，以及更通用的 `std.HashMap`，可能会派上用场。如果没有其他用途，现在文档和它们的实现应该更容易理解了。

在下一部分，我们将深入探讨哈希表的键和值，它们是如何存储和管理的。

