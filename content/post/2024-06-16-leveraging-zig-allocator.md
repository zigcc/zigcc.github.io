---
title: "Zig 分配器的应用"
date: 2024-06-16T12:11:44+0800
---

> 原文地址： <https://www.openmymind.net/Leveraging-Zigs-Allocators/>

假设我们想为Zig编写一个 [HTTP服务器库](https://github.com/karlseguin/http.zig)。这个库的核心可能是线程池，用于处理请求。以简化的方式来看，它可能类似于：

```zig
fn run(worker: *Worker) void {
    while (queue.pop()) |conn| {
        const action = worker.route(conn.req.url);
        action(conn.req, conn.res) catch { // TODO: 500 };
        worker.write(conn.res);
    }
}
```

作为这个库的用户，您可能会编写一些动态内容的操作。如果假设在启动时为服务器提供分配器（Allocator），则可以将此分配器传递给动作：

```zig
fn run(worker: *Worker) void {
    const allocator = worker.server.allocator;
    while (queue.pop()) |conn| {
        const action = worker.route(conn.req.url);
        action(allocator, conn.req, conn.res) catch { // TODO: 500 };
        worker.write(conn.res);
    }
}
```

这允许用户编写如下的操作：

```zig
fn greet(allocator: Allocator, req: *http.Request, res: *http.Response) !void {
    const name = req.query("name") orelse "guest";
    res.status = 200;
    res.body = try std.fmt.allocPrint(allocator, "Hello {s}", .{name});
}
```

虽然这是一个正确的方向，但存在明显的问题：分配的问候语从未被释放。我们的`run`函数不能在写回应后就调用`allocator.free(conn.res.body)`，因为在某些情况下，主体可能不需要被释放。我们可以通过使动作必须 `write()` 回应并因此能够`free`它所做的任何分配来结构化API，但这将使得添加一些功能变得不可能，比如支持中间件。

最佳和最简单的方法是使用 `ArenaAllocator` 。其工作原理很简单：当我们`deinit`时，所有分配都被释放。

```zig
fn run(worker: *Worker) void {
    const allocator = worker.server.allocator;
    while (queue.pop()) |conn| {
        var arena = std.heap.ArenaAllocator.init(allocator);
        defer arena.deinit();
        const action = worker.route(conn.req.url);
        action(arena.allocator(), conn.req, conn.res) catch { // TODO: 500 };
        worker.write(conn.res);
    }
}
```

`std.mem.Allocator` 是一个 "[接口](https://www.openmymind.net/Zig-Interfaces/)" ，我们的动作无需更改。 `ArenaAllocator` 对HTTP服务器来说是一个很好的选择，因为它们与请求绑定，具有明确/可理解的生命周期，并且相对短暂。虽然有可能滥用它们，但可以说：使用更多！

我们可以更进一步并重用相同的Arena。这可能看起来不太有用，但是请看：

```zig
fn run(worker: *Worker) void {
    const allocator = worker.server.allocator;
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    while (queue.pop()) |conn| {
        // 魔法在此处！
        defer _ = arena.reset(.{.retain_with_limit = 8192});
        const action = worker.route(conn.req.url);
        action(arena.allocator(), conn.req, conn.res) catch { // TODO: 500 };
        worker.write(conn.res);
    }
}
```

我们将Arena移出了循环，但重要的部分在内部：每个请求后，我们重置了Arena并保留最多8K内存。这意味着对于许多请求，我们无需访问底层分配器（`worker.server.allocator`）。这种方法简化了内存管理。

现在想象一下，如果我们不能用 `retain_with_limit` 重置 Arena，我们还能进行同样的优化吗？可以，我们可以创建自己的分配器，首先尝试使用固定缓冲区分配器（FixedBufferAllocator），如果分配适配，回退到 Arena 分配器。

这里是 `FallbackAllocator` 的完整示例：

```zig
const FallbackAllocator = struct {
  primary: Allocator,
  fallback: Allocator,
  fba: *std.heap.FixedBufferAllocator,

  pub fn allocator(self: *FallbackAllocator) Allocator {
    return .{
      .ptr = self,
      .vtable = &.{.alloc = alloc, .resize = resize, .free = free},
    };
  }

  fn alloc(ctx: *anyopaque, len: usize, ptr_align: u8, ra: usize) ?[*]u8 {
    const self: *FallbackAllocator = @ptrCast(@alignCast(ctx));
    return self.primary.rawAlloc(len, ptr_align, ra)
           orelse self.fallback.rawAlloc(len, ptr_align, ra);
  }

  fn resize(ctx: *anyopaque, buf: []u8, buf_align: u8, new_len: usize, ra: usize) bool {
    const self: *FallbackAllocator = @ptrCast(@alignCast(ctx));
    if (self.fba.ownsPtr(buf.ptr)) {
      if (self.primary.rawResize(buf, buf_align, new_len, ra)) {
        return true;
      }
    }
    return self.fallback.rawResize(buf, buf_align, new_len, ra);
  }

  fn free(_: *anyopaque, _: []u8, _: u8, _: usize) void {
    // we noop this since, in our specific case, we know
    // the fallback is an arena, which won't free individual items
  }
};
```

我们的`alloc`实现首先尝试使用我们定义的"主"分配器进行分配。如果失败，我们会使用"备用"分配器。作为`std.mem.Allocator`接口的一部分，我们需要实现的`resize`方法会确定正在尝试扩展内存的所有者，并然后调用其`rawResize`方法。为了保持代码简单，我在这里省略了`free`方法的具体实现——在这种特定情况下是可以接受的，因为我们计划使用"主"分配器作为`FixedBufferAllocator`，而"备用"分配器则会是`ArenaAllocator`（因此所有释放操作会在arena的`deinit`或`reset`时进行）。

接下来我们需要改变我们的`run`方法以利用这个新的分配器：

```zig
fn run(worker: *Worker) void {
    const allocator = worker.server.allocator; // 这是FixedBufferAllocator底层的内存
    const buf = try allocator.alloc(u8, 8192); // 分配8K字节的内存用于存储数据
    defer allocator.free(buf); // 完成后释放内存

    var fba = std.heap.FixedBufferAllocator.init(buf); // 初始化FixedBufferAllocator

    while (queue.pop()) |conn| {
        defer fba.reset(); // 重置FixedBufferAllocator，准备处理下一个请求

        var arena = std.heap.ArenaAllocator.init(allocator); // 初始化ArenaAllocator用于分配额外内存
        defer arena.deinit();

        var fallback = FallbackAllocator{
            .fba = &fba,
            .primary = fba.allocator(),
            .fallback = arena.allocator(),
        }; // 创建FallbackAllocator，包含FixedBufferAllocator和ArenaAllocator

        const action = worker.route(conn.req.url); // 路由请求到对应的动作处理函数
        action(fallback.allocator(), conn.req, conn.res) catch { // 处理动作执行中的错误 };

        worker.write(conn.res); // 写回响应信息给客户端
    }
}
```

这种方法实现了类似于在`retain_with_limit`中重置arena的功能。我们创建了一个可以重复使用的`FixedBufferAllocator`，用于处理每个请求的8K字节内存需求。由于一个动作可能需要更多的内存，我们仍然需要`ArenaAllocator`来提供额外的空间。通过将`FixedBufferAllocator`和`ArenaAllocator`包裹在我们的`FallbackAllocator`中，我们可以确保任何分配都首先尝试使用（非常快的）`FixedBufferAllocator`，当其空间用尽时，则会切换到`ArenaAllocator`。

我们通过暴露`std.mem.Allocator`接口，可以调整如何工作而不破坏`greet`。这不仅简化了资源管理（例如通过`ArenaAllocator`），而且通过重复使用分配来提高了性能（类似于我们做的`retain_with_limit`或`FixedBufferAllocator`的操作）。

这个示例应该能突出显示我认为明确的分配器提供的两个实际优势：
1. 简化资源管理（通过类似`ArenaAllocator`的方式）
2. 通过重用分配来提高性能
