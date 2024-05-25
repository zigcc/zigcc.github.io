---
title: "代码探究: Zig 标准库中的接口习语/模式"
author: Rui Chen
date: 2024-05-24T23:21:12-05:00
---

> - 原文链接： https://zig.news/yglcode/code-study-interface-idiomspatterns-in-zig-standard-libraries-4lkj

# 引言

在 Java 和 Go 中，可以使用“接口”（一组方法或方法集）定义基于行为的抽象。通常接口包含所谓的虚表（`vtable`）
以实现动态分派。Zig 允许在结构体、枚举、联合和不透明类型中声明函数和方法，尽管 Zig 尚未支持接口作为一种语言特性。
Zig 标准库应用了一些代码习语或模式以达到类似效果。

类似于其他语言中的接口，Zig 的代码习语和模式实现了：

- 在编译时对实例/对象方法与接口类型进行类型检查，
- 在运行时进行动态分派。

这里有一些显著的不同：

- Go 的接口与它们抽象的类型/实例是独立的。当观察到不同类型之间的公共 API/方法模式时，可以随时添加新接口。
不需要回过头去更改类型以实现新接口，这是 Java 所必需的。
- Go 的接口只包含用于动态分派的 `vtab`，并且偏好小型方法集/`vtable`，例如 `io.Reader` 和 `io.Writer`
只有一个方法。常见的工具函数如`io.Copy`、`CopyN`、`ReadFull`、`ReadAtLeast` 等，作为包函数提供，
使用这些小接口。与之相比，Zig 的接口，如 `std.mem.Allocator`，通常包含 `vtable` 和作为方法的常用工具；
因此它们通常有许多方法。

以下是 Zig 的代码习语/模式在动态分派方面的学习笔记，代码摘自 Zig 标准库
并以简单示例重录。为了专注于 vtab/动态分派，工具方法被移除，
代码稍作修改以适应 Go 的小接口独立于具体类型的模型。

完整代码位于[此仓库](https://github.com/yglcode/zig_interfaces)，你可以使用 `zig test interfaces.zig` 运行它。

# 设置

让我们使用经典的面向对象编程示例，创建一些形状：点（`Point`）、盒子（`Box`）和圆（`Circle`）。

```zig
const Point = struct {
    x: i32 = 0,
    y: i32 = 0,
    pub fn move(self: *Point, dx: i32, dy: i32) void {
        self.x += dx;
        self.y += dy;
    }
    pub fn draw(self: *Point) void {
        print("point@<{d},{d}>\n", .{ self.x, self.y });
    }
};

const Box = struct {
    p1: Point,
    p2: Point,
    pub fn init(p1: Point, p2: Point) Box {
        return .{ .p1 = p1, .p2 = p2 };
    }
    pub fn move(self: *Box, dx: i32, dy: i32) void {
        ......
    }
    pub fn draw(self: *Box) void {
        ......
    }
};

const Circle = struct {
    center: Point,
    radius: i32,
    pub fn init(c: Point, r: i32) Circle {
        return .{ .center = c, .radius = r };
    }
    pub fn move(self: *Circle, dx: i32, dy: i32) void {
        self.center.move(dx, dy);
    }
    pub fn draw(self: *Circle) void {
        ......
    }
};

// 创建一组“形状”用于测试
fn init_data() struct { point: Point, box: Box, circle: Circle } {
    return .{
        .point = Point{},
        .box = Box.init(Point{}, Point{ .x = 2, .y = 3 }),
        .circle = Circle.init(Point{}, 5),
    };
}
```

# 接口1：枚举标签联合

Loris Cro 在[“使用 Zig 0.10.0 轻松实现接口”](https://zig.news/kristoff/easy-interfaces-with-zig-0100-2hc5)
中介绍了使用枚举标签联合作为接口的方法。这是最简单的解决方案，尽管你必须在联合中显式列出所有“实现”接口的变体类型。

```zig
const Shape1 = union(enum) {
    point: *Point,
    box: *Box,
    circle: *Circle,
    pub fn move(self: Shape1, dx: i32, dy: i32) void {
        switch (self) {
            inline else => |s| s.move(dx, dy),
        }
    }
    pub fn draw(self: Shape1) void {
        switch (self) {
            inline else => |s| s.draw(),
        }
    }
};
```

我们可以如下测试：

```zig
test "union_as_intf" {
    var data = init_data();
    var shapes = [_]Shape1{
        .{ .point = &data.point },
        .{ .box = &data.box },
        .{ .circle = &data.circle },
    };
    for (shapes) |s| {
        s.move(11, 22);
        s.draw();
    }
}
```

# 接口2：vtable 和动态分派的第一种实现

Zig 已从最初基于嵌入式 `vtab` 和 `#fieldParentPtr()` 的动态分派切换到基于“胖指针”接口的以下模式；
请查阅此文章了解更多细节[“Allocgate 将在 Zig 0.9 中到来...”](https://pithlessly.github.io/allocgate.html)。

接口 `std.mem.Allocator` 使用了这种模式，所有标准分配器，如 `std.heap.[ArenaAllocator, GeneralPurposeAllocator, ...]` 都有一个方法 `allocator() Allocator` 来暴露这个接口。
以下代码稍作改动，将接口从实现中分离出来。

```zig
const Shape2 = struct {
    // 定义接口字段: ptr,vtab
    ptr: *anyopaque, //ptr to instance
    vtab: *const VTab, //ptr to vtab
    const VTab = struct {
        draw: *const fn (ptr: *anyopaque) void,
        move: *const fn (ptr: *anyopaque, dx: i32, dy: i32) void,
    };

    // 定义封装 vtable 调用的接口方法
    pub fn draw(self: Shape2) void {
        self.vtab.draw(self.ptr);
    }
    pub fn move(self: Shape2, dx: i32, dy: i32) void {
        self.vtab.move(self.ptr, dx, dy);
    }

    // 将具体实现类型/对象转换为接口
    pub fn init(obj: anytype) Shape2 {
        const Ptr = @TypeOf(obj);
        const PtrInfo = @typeInfo(Ptr);
        assert(PtrInfo == .Pointer); // 必须是指针
        assert(PtrInfo.Pointer.size == .One); // 必须是单项指针
        assert(@typeInfo(PtrInfo.Pointer.child) == .Struct); // 必须指向一个结构体
        const alignment = PtrInfo.Pointer.alignment;
        const impl = struct {
            fn draw(ptr: *anyopaque) void {
                const self = @ptrCast(Ptr, @alignCast(alignment, ptr));
                self.draw();
            }
            fn move(ptr: *anyopaque, dx: i32, dy: i32) void {
                const self = @ptrCast(Ptr, @alignCast(alignment, ptr));
                self.move(dx, dy);
            }
        };
        return .{
            .ptr = obj,
            .vtab = &.{
                .draw = impl.draw,
                .move = impl.move,
            },
        };
    }
};
```

我们可以如下测试：

```zig
test "vtab1_as_intf" {
    var data = init_data();
    var shapes = [_]Shape2{
        Shape2.init(&data.point),
        Shape2.init(&data.box),
        Shape2.init(&data.circle),
    };
    for (shapes) |s| {
        s.move(11, 22);
        s.draw();
    }
}
```

# 接口3：vtable 和动态分派的第二种实现

在上述第一种实现中，通过 `Shape2.init()` 将 `Box` “转换”为接口 `Shape2` 时，会对 `box` 实例进行类型检查，
以确保其实现了 `Shape2` 的方法（包括名称的匹配签名）。第二种实现中有两个变化：

- `vtable` 内联在接口结构中（可能的缺点是，接口大小增加）。
- 需要根据接口进行类型检查的方法被显式地作为函数指针传入，这可能允许传入不同的方法，只要它们具有相同的参数/返回类型。
例如，如果 `Box` 有额外的方法，`stopAt(i32,i32)` 或甚至 `scale(i32,i32)`，我们可以将它们替换为 `move()`。
接口 `std.rand.Random` 和所有 `std.rand.[Pcg, Sfc64, ...]` 使用这种模式。

```zig
const Shape3 = struct {
    // 指向实例的 ptr
    ptr: *anyopaque,
    // 内联 vtable
    drawFnPtr: *const fn (ptr: *anyopaque) void,
    moveFnPtr: *const fn (ptr: *anyopaque, dx: i32, dy: i32) void,

    pub fn init(
        obj: anytype,
        comptime drawFn: fn (ptr: @TypeOf(obj)) void,
        comptime moveFn: fn (ptr: @TypeOf(obj), dx: i32, dy: i32) void,
    ) Shape3 {
        const Ptr = @TypeOf(obj);
        assert(@typeInfo(Ptr) == .Pointer); // 必须是指针
        assert(@typeInfo(Ptr).Pointer.size == .One); // 必须是单项指针
        assert(@typeInfo(@typeInfo(Ptr).Pointer.child) == .Struct); // 必须指向一个结构体
        const alignment = @typeInfo(Ptr).Pointer.alignment;
        const impl = struct {
            fn draw(ptr: *anyopaque) void {
                const self = @ptrCast(Ptr, @alignCast(alignment, ptr));
                drawFn(self);
            }
            fn move(ptr: *anyopaque, dx: i32, dy: i32) void {
                const self = @ptrCast(Ptr, @alignCast(alignment, ptr));
                moveFn(self, dx, dy);
            }
        };

        return .{
            .ptr = obj,
            .drawFnPtr = impl.draw,
            .moveFnPtr = impl.move,
        };
    }

    // 定义封装 vtable 函数指针的接口方法
    pub fn draw(self: Shape3) void {
        self.drawFnPtr(self.ptr);
    }
    pub fn move(self: Shape3, dx: i32, dy: i32) void {
        self.moveFnPtr(self.ptr, dx, dy);
    }
};
```

我们可以如下测试：

```zig
test "vtab2_as_intf" {
    var data = init_data();
    var shapes = [_]Shape3{
        Shape3.init(&data.point, Point.draw, Point.move),
        Shape3.init(&data.box, Box.draw, Box.move),
        Shape3.init(&data.circle, Circle.draw, Circle.move),
    };
    for (shapes) |s| {
        s.move(11, 22);
        s.draw();
    }
}
```

# 接口4：使用嵌入式 vtab 和 @fieldParentPtr() 的原始动态分派

接口 `std.build.Step` 和所有构建步骤 `std.build.[RunStep, FmtStep, ...]` 仍然使用这种模式。

```zig
// 定义接口/vtab
const Shape4 = struct {
    drawFn: *const fn (ptr: *Shape4) void,
    moveFn: *const fn (ptr: *Shape4, dx: i32, dy: i32) void,
    // 定义封装 vtab 函数的接口方法
    pub fn draw(self: *Shape4) void {
        self.drawFn(self);
    }
    pub fn move(self: *Shape4, dx: i32, dy: i32) void {
        self.moveFn(self, dx, dy);
    }
};

// 嵌入 vtab 并将 vtab 函数定义为方法的封装
const Circle4 = struct {
    center: Point,
    radius: i32,
    shape: Shape4, // 嵌入 vtab
    pub fn init(c: Point, r: i32) Circle4 {
        // 定义接口封装函数
        const impl = struct {
            pub fn draw(ptr: *Shape4) void {
                const self = @fieldParentPtr(Circle4, "shape", ptr);
                self.draw();
            }
            pub fn move(ptr: *Shape4, dx: i32, dy: i32) void {
                const self = @fieldParentPtr(Circle4, "shape", ptr);
                self.move(dx, dy);
            }
        };
        return .{
            .center = c,
            .radius = r,
            .shape = .{ .moveFn = impl.move, .drawFn = impl.draw },
        };
    }
    // 以下是方法
    pub fn move(self: *Circle4, dx: i32, dy: i32) void {
        self.center.move(dx, dy);
    }
    pub fn draw(self: *Circle4) void {
        print("circle@<{d},{d}>radius:{d}\n", .{ self.center.x, self.center.y, self.radius });
    }
};

// 在结构体上直接嵌入 vtab 并定义 vtab 函数
const Box4 = struct {
    p1: Point,
    p2: Point,
    shape: Shape4, // 嵌入 vtab
    pub fn init(p1: Point, p2: Point) Box4 {
        return .{
            .p1 = p1,
            .p2 = p2,
            .shape = .{ .moveFn = move, .drawFn = draw },
        };
    }
    // 以下是 vtab 函数，不是方法
    pub fn move(ptr: *Shape4, dx: i32, dy: i32) void {
        const self = @fieldParentPtr(Box4, "shape", ptr);
        self.p1.move(dx, dy);
        self.p2.move(dx, dy);
    }
    pub fn draw(ptr: *Shape4) void {
        const self = @fieldParentPtr(Box4, "shape", ptr);
        print("box@<{d},{d}>-<{d},{d}>\n", .{ self.p1.x, self.p1.y, self.p2.x, self.p2.y });
    }
};
```

我们可以如下测试：

```zig
test "vtab3_embedded_in_struct" {
    var box = Box4.init(Point{}, Point{ .x = 2, .y = 3 });
    var circle = Circle4.init(Point{}, 5);

    var shapes = [_]*Shape4{
        &box.shape,
        &circle.shape,
    };
    for (shapes) |s| {
        s.move(11, 22);
        s.draw();
    }
}
```

# 接口5：编译时的泛型接口

所有上述接口都侧重于 `vtab` 和动态分派：接口值将隐藏其持有的具体值的类型。因此，你可以将这些接口值放入数组中并统一处理。

通过 Zig 的编译时计算，你可以定义泛型算法，它可以与提供代码函数体所需的方法或操作符的任何类型一起工作。例如，
我们可以定义一个泛型算法：

```zig
fn update_graphics(shape: anytype, dx: i32, dy: i32) void {
    shape.move(dx, dy);
    shape.draw();
}
```

如上所示，“shape”可以是任何类型，只要它提供 `move()` 和 `draw()` 方法。所有类型检查都发生在编译时，并且没有动态分派。

接下来，我们可以定义一个泛型接口，捕获泛型算法所需的方法；我们可以用它来适应具有不同方法名称的某些类型/实例到所需的 API。

接口 `std.io.[Reader, Writer]` 以及 `std.fifo` 和 `std.fs.File` 使用这种模式。

由于这些泛型接口没有擦除其持有的值的类型信息，它们是不同的类型。因此，你不能将它们放入数组中以统一处理。

```zig
pub fn Shape5(
    comptime Pointer: type,
    comptime drawFn: *const fn (ptr: Pointer) void,
    comptime moveFn: *const fn (ptr: Pointer, dx: i32, dy: i32) void,
) type {
    return struct {
        ptr: Pointer,
        const Self = @This();
        pub fn init(p: Pointer) Self {
            return .{ .ptr = p };
        }
        // 封装传入的函数/方法的接口方法
        pub fn draw(self: Self) void {
            drawFn(self.ptr);
        }
        pub fn move(self: Self, dx: i32, dy: i32) void {
            moveFn(self.ptr, dx, dy);
        }
    };
}

// 一种泛型算法使用鸭子类型/静态分派。
// 注意：形状可以是提供 `move()`/`draw()` 的“任何类型”
fn update_graphics(shape: anytype, dx: i32, dy: i32) void {
    shape.move(dx, dy);
    shape.draw();
}

// 定义一个具有相似但不同方法的 `TextArea`
const TextArea = struct {
    position: Point,
    text: []const u8,
    pub fn init(pos: Point, txt: []const u8) TextArea {
        return .{ .position = pos, .text = txt };
    }
    pub fn relocate(self: *TextArea, dx: i32, dy: i32) void {
        self.position.move(dx, dy);
    }
    pub fn display(self: *TextArea) void {
        print("text@<{d},{d}>:{s}\n", .{ self.position.x, self.position.y, self.text });
    }
};
```

我们可以如下测试：

```zig
test "generic_interface" {
    var box = Box.init(Point{}, Point{ .x = 2, .y = 3 });
    // 将泛型算法直接应用于匹配类型
    update_graphics(&box, 11, 22);
    var textarea = TextArea.init(Point{}, "hello zig!");
    // 使用泛型接口来适应不匹配的类型
    var drawText = Shape5(*TextArea, TextArea.display, TextArea.relocate).init(&textarea);
    update_graphics(drawText, 4, 5);
}
```
