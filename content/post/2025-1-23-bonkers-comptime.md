---
title: Zig Comptime 非常好
author: xihale
date: 2025-01-23T12:00:00+08:00
---

> 原文: <https://www.scottredig.com/blog/bonkers_comptime/>  
> 译注：由于原作者没有公开源代码而生成的有关交互性代码块的相关 html 代码比较复杂，并且译者不太熟悉 hugo ，所以为了避免麻烦，所有的代码块都没有原文的交互功能，请移步原文交互对应的代码块，非常抱起造成人如此不便。  
> 译注：本文使用了 AI 辅助翻译，并在多处采用了意译，由于译者的编程水平和英文水平并不高，可能会有很多理解得不对的地方，由此可能会有不准确的地方，欢迎指正(issue 或 pr)。

> 译注：由于 comptime 本身即是关键概念，并且下文的意思更侧重于 Zig comptime 的特性，故下文大多使用 comptime 代替（涵盖）编译时概念。

## 引子

编程通过自动化地处理数据极大地提升了生产力。而元编程则让我们可以像处理数据一样处理代码，以此将编程的力量反向作用于编程自身。而在底层编程中，我想元编程可能带来最大的优势，因为那些高级概念必须得精确要被映射到某些低级操作。然而，除了函数式编程语言外，我一直觉得各编程语言对元编程的实现并不理想。因此，当我看到 Zig 把元编程列为一个主要特性时，我提起了很大的兴趣。

说实话，刚开始使用 Zig 的 comptime 时，我的体验相当糟糕。那些概念对我而言很陌生，而想要实现预期的效果也很困难。不过后来，当我转换了思路，一切都迎刃而解了，由此，我突然就喜欢上了它。现在，为了帮助你更快地走上这条探索之路，下面我将介绍六种不同的“视角”来理解 comptime。每个视角都从不同的角度，帮助你将已有的编程知识应用到 Zig 中。

这并不是一本完整涵盖了 comptime 的所有所需知识的详细指南。相反，它更侧重于提供多种策略，从不同视角帮助你全面地理解该如何以 comptime 的角度思考问题。

为了明确起见，所有示例都是有效的 Zig 代码，但示例中的转换只是概念性的，它们并不是 Zig 实际的实现方式。

## 视角1: 忽略它

我说我喜欢这个特性，却又立刻叫你忽略它，这确实有点怪。但我认为此处正是 Zig comptime 超能力说体现的地方，所以我将从这里出发。Zig Zen 中的第三条是“倾向于阅读代码，而不是编写代码。”确实，能够轻松地阅读代码在各种情况下都很重要，因为它是建立概念理解的基础，而这种理解也是调试或修改代码所必需的。

元编程很容易让人陷入“只写代码”的境地。如果你在使用基于宏的元编程或代码生成器，那么代码就会变成两种版本：源代码和展开后的代码。这个额外的间接层使得从阅读到调试代码的整个过程都变得更加困难。当你要改变程序的行为时，你不仅需要确定生成的代码应该是什么样的，还需要弄清楚该如何通过元编程来生成这些代码。

但在 Zig 中，这些额外的开销是完全不需要的。你可以简单地忽略代码在不同时间执行这一隐形的前提条件，而在概念上直接将运行时和编译时的区别忽略掉再来理解那些代码。为了演示这一点，让我们一步一步来看两个不同的代码示例。第一个是普通的运行时代码，第二个则是利用了 comptime 的代码。

> 普通的运行时代码

```Zig
pub fn main() void {
    const array: [3]i64 = .{1,2,3};
    var sum: i64 = 0;
    for (array) |value| {
        sum += value;
    }
    std.debug.print("array's sum is {d}.\n", .{sum});
}
```

点击“下一步”逐步执行程序，观察状态的变化。这个例子很简单：对一组数字求和。现在我们来做些奇怪的事：对一个结构体的字段求和。虽然这个例子有些牵强，但却能够很好地展示这一概念。
> 译注：由于原作者没有公开源代码而生成的有关交互性代码块的相关 html 代码比较复杂，并且译者不太熟悉 hugo ，所以为了避免麻烦，所有的代码块都没有原文的交互功能，请移步原文交互对应的代码块，非常抱起造成人如此不便。  

> 基于 comptime 的代码

```Zig
const MyStruct = struct {
    a: i64,
    b: i64,
    c: i64,
};

pub fn main() void {
    const my_struct: MyStruct = .{
        .a = 1,
        .b = 2,
        .c = 3,
    };

    var sum: i64 = 0;
    inline for (comptime std.meta.fieldNames(MyStruct)) |field_name| {
        sum += @field(my_struct, field_name);
    }
    std.debug.print("struct's sum is {d}.\n", .{sum});
}
```

与数组求和的例子相比，这个 comptime 示例引入的新东西几乎是微不足道的。这正是 comptime 的重点！这段代码的可执行文件效率和你在 C 中为结构体类型手写一个求和函数一样高效，而它却看起来像是你在使用支持运行时反射的语言编写的。虽然这不是 Zig 实际的工作方式，但这也不完全是一个纯粹的理论练习：Zig 核心团队正在开发一个调试器，允许你像这个例子一样逐步执行混合了编译时和运行时的代码。

Zig 中有很多基于 comptime 且远远不止这样简单的类型反射，但你只需要阅读那些代码、完全无需深入了解其中有关 comptime 的细节就可以理解它们在干什么。当然，如果你想使用 comptime 编写代码，则不能仅仅止步于此，让我们继续深入。

## 视角2: 看啊，泛型

泛型在 Zig 中并不是一个特定的功能。相反，Zig 中的仅仅一小部分的 comptime 特性就可以提供用来处理你进行泛型编程所需的一切。这种视角虽然不能让你完全理解 comptime，但它确实为你提供了一个入口点，借此，你可以完成基于元编程的许多任务。

要使一个类型成为泛型，只需将其定义包裹在一个接受类型并返回类型的函数中。(译注：由于 Zig 中类型是一等公民，所以面向类型的类型是合法且常见的)

```Zig
pub fn GenericMyStruct(comptime T: type) type {
    return struct {
        a: T,
        b: T,
        c: T,

        fn sumFields(my_struct: GenericMyStruct(T)) T {
            var sum: T = 0;
            const fields = comptime std.meta.fieldNames(GenericMyStruct(T));
            inline for (fields) |field_name| {
                sum += @field(my_struct, field_name);
            }
            return sum;
        }
    };
}

pub fn main() void {
    const my_struct: GenericMyStruct(i64) = .{
        .a = 1,
        .b = 2,
        .c = 3,
    };
    std.debug.print("struct's sum is {d}.\n", .{my_struct.sumFields()});
}
```

泛型函数也可以如此实现。

```Zig
fn quadratic(comptime T: type, a: T, b: T, c: T, x: T) T {
    return a * x*x + b * x + c;
}

pub fn main() void {
    const a = quadratic(f32, 21.6, 3.2, -3, 0.5);
    const b = quadratic(i64, 1, -3, 4, 2);
    std.debug.print("Answer: {d}{d}\n", .{a, b});
}
```

当然，也可以通过使用特殊类型 anytype 来推断参数的类型，而这通常在参数的类型对函数签名的其余部分没有影响时使用。（译注：此时要限制 a, b, c 的类型相同，所以此处不用 anytype ）

## 视角2：编译时运行的标准代码

> 译注：此处 "commands" 被翻译为 “语法”
这是一个古老的故事：一开始，只是为了简化某些操作而引入了一些自动化语法。然而，很快人们就会发现，仅仅有这些命令是不够的，还需要变量来存储数据，条件语句来控制流程，循环来重复执行某些操作。这些看似合理的需求，最终导致这些自动化语法变得越来越复杂，甚至演变成一个完整的宏语言。而 Zig 语言试图打破这种模式，只使用同一种语法来处理运行时、编译时和构建系统中的任务。

考虑经典的 Fizz Buzz。

```Zig
fn fizzBuzz(writer: std.io.AnyWriter) !void {
    var i: usize = 1;
    while (i <= 100) : (i += 1) {
        if (i % 3 == 0 and i % 5 == 0) {
            try writer.print("fizzbuzz\n", .{});
        } else if (i % 3 == 0) {
            try writer.print("fizz\n", .{});
        } else if (i % 5 == 0) {
            try writer.print("buzz\n", .{});
        } else {
            try writer.print("{d}\n", .{i});
        }
    }
}

pub fn main() !void {
    const out_writer = std.io.getStdOut().writer().any();
    try fizzBuzz(out_writer);
}
```

确实很简单。但是，每当讨论如何优化 Fizz Buzz 算法时，人们总是忽略一个事实：标准的 Fizz Buzz 问题只需要输出前100个数字的结果。既然输出是固定的，那为什么不直接预先计算出答案，然后输出呢？（由此，我时常认为那些有关优化讨论有些滑稽的。）  
我们可以使用相同的 Fizz Buzz 函数来实现这一点。

```Zig
pub fn main() !void {
    const full_fizzbuzz = comptime init: {
        var cw = std.io.countingWriter(std.io.null_writer);
        fizzBuzz(cw.writer().any()) catch unreachable;

        var buffer: [cw.bytes_written]u8 = undefined;
        var fbs = std.io.fixedBufferStream(&buffer);
        fizzBuzz(fbs.writer().any()) catch unreachable;

        break :init buffer;
    };

    const out_writer = std.io.getStdOut().writer().any();
    try out_writer.writeAll(&full_fizzbuzz);
}
```

这里的 comptime 关键字表示它前面的代码块将在编译期间运行。此外，该代码块被标记为“init”，以便整个块可以通过之后的 break 语句产出一个值。

我们用一个计算写入字符数的 `writer`（但忽略掉实际要写入的字符）来确定总长度。然后根据该长度创建 `full_fizzbuzz` 数组来保存实际数据。

仅对关键部分进行计时，预计算版本的运行速度约快 9 倍。当然，这个例子过于简单，以至于总执行时间受到很多其他因素的影响（支配），但你不难借此明白这其中 comptime 对于性能优化的意味。

comptime 和运行时之间有一些小的区别。比如，只有 comptime 可以访问类型为 comptime_int、comptime_float 或 type 的变量。此外，一些函数只有 comptime 参数，这使它们仅限于编译时环境。相对的，只有运行时才能进行系统调用或调用与其相关的函数。如果你的代码不使用这些特性，那么它在编译时和运行时中的表现将是一样的。

## 视角3：程序特化(Partial Evaluation)

>译注：可以参考 [怎样理解 Partial Evaluation？ - luikore的回答](https://www.zhihu.com/question/29266193/answer/43842022) 和 [Partial evaluation - wikipedia](https://en.wikipedia.org/wiki/Partial_evaluation)

现在我们要进入有趣的部分。

>译注：请参考下面的代码和代码后的解释理解这句话。

要分析一段代码的执行，我们可以将表达式展开，用一些统一的方式执行运算，直到剩下最终结果。（One way to view evaluation of code is to substitute inputs with their runtime value, and then repeatedly substitute the first expression into the evaluated form until only the result remains.）（译注：这不仅仅可以理解为循环展开等，还可以理解为将代码逻辑分为原子化的部分，以致于我们可以将编译时的部分预先处理）这在计算机科学理论背景下很常见，也是某些函数式语言的特点。作为后面例子的准备，我们将使用数组求和来了解这个过程：

```Zig
pub fn main() void {
    const array: [3]i64 = .{1,2,3};
    var sum: i64 = 0;

    for (array) |value| {
        sum += value;
    }
    // 这可以展开为:
    {
        const value = array[0];
        sum += value;
    }
    {
        const value = array[1];
        sum += value;
    }
    {
        const value = array[2];
        sum += value;
    }

    std.debug.print("array's sum is {d}.\n", .{sum});
}
```

程序特化是一种优化策略，可以让你提前传递一些已知参数。在这种情况下，编译器可以对使用已知值的表达式进行计算，由此产生一个新的函数，这个函数只接受尚未知的参数，并对其进行剩下的计算，并返回最终结果。Zig 的 comptime 可以被视为在编译过程中进行的程序特化。再次查看 sum 结构的例子：

```Zig
onst MyStruct = struct {
    a: i64,
    b: i64,
    c: i64,

    fn sumFields(my_struct: MyStruct) i64 {
      var sum: i64 = 0;
      inline for (comptime std.meta.fieldNames(MyStruct)) |field_name| {
          sum += @field(my_struct, field_name);
      }
    
    // 这可以展开为:
    {
        const field_name = "a";
        sum += @field(my_struct, field_name);
    }
    {
        const field_name = "b";
        sum += @field(my_struct, field_name);
    }
    {
        const field_name = "c";
        sum += @field(my_struct, field_name);
    }
    // 更进一步，有：
    sum += my_struct.a;
    sum += my_struct.b;
    sum += my_struct.c;

    return sum;
  }
};
```

最终的函数是"手动展开"的，但这项工作是由 Zig 的 comptime 完成的。这使得我们可以直接独立而完整地编写出我们要实现的功能，而不需要添加"当你改变 `MyStruct` 的字段时,记得更新 sum 函数"这样的由于依赖于 `MyStruct` 具体字段而预防功能失效的注释。  
基于 comptime 的版本在 `MyStruct` 的任何字段变更时都可以正确地自动处理。

## 视角4：Comptime 求值，运行时代码生成

这与程序特化（Partial Evaluation）非常相似。这里有两个版本的代码,输入(编译前)和输出(编译后)。输入代码由编译器运行。如果一个语句在编译时是可知的,它就会被直接求值。但是如果一个语句需要某些运行时的值,那么这个语句就会被添加到输出代码中。

让我们以数组求和为例来说明这个过程:

> 输入这一段代码：

```Zig
const MyStruct = struct {
    a: i64,
    b: i64,
    c: i64,

    fn sumFields(my_struct: MyStruct) i64 {
        var sum: i64 = 0;
        inline for (comptime std.meta.fieldNames(MyStruct)) |field_name| {
            sum += @field(my_struct, field_name);
        }
        return sum;
    }
};
```

> 生成出的代码：

```Zig
const MyStruct = struct {
    a: i64,
    b: i64,
    c: i64,

    fn sumFields(my_struct: MyStruct) i64 {
        var sum: i64 = 0;
        sum += my_struct.a;
        sum += my_struct.b;
        sum += my_struct.c;
        return sum;
    }
};
```

这实际上是最接近 Zig 编译器处理 comptime 的方式。他们的主要区别在于 Zig 首先解析你的代码的语法，并将其转换为虚拟机的字节码。这个虚拟机的运行方式就是 comptime 的实现方式。这个虚拟机将估量它能处理的所有内容，并为需要运行时处理的内容生成新的字节码（稍后将其转换为机器码）。具有运行时输入的条件语句，如 if 语句，会直接输出两条路径。

自然，这样做的后果是死代码永远不会被语义分析。也就是说，一个无效的函数并不总是会在实际被使用之前产出相应的编译错误。（对此你可能需要适应一段时间）然而，这也使得编译更加高效（译注：部分地弥补了 Zig 暂不支持增量编译的缺陷），并允许更自然的外观条件编译，这里没有 #ifdef （译注：噢，谢天谢地~）！

值得注意的是，comptime 在 Zig 的设计中渗透得很深。所有 Zig 代码都通过这个虚拟机运行，包括那些没有明显使用 comptime 的函数。即使是简单的类型名称，比如函数参数，实际上也是表达式（expression），它们在 comptime 时被视为类型为 type 的变量。这也是上面泛型示例工作的方式。而这也意味着，在适当的情况下，你可以使用更复杂的表达式来计算类型。

由此产生的另一个后果是，与大多数静态类型语言相比，Zig 代码的静态分析要复杂得多，因为这些以及其依赖的逻辑在 Zig 编译器中实际占据了相当大的篇幅。因此，Zig 的工作链总是处于正在执行状态，这使得代码补全等编辑器工具并不总能很好地工作。

## 视角5：直接生成代码（Textual Code Generation）

我在文章开头感叹元编程难度。然而，即使在 Zig 中，它仍然是一个强大的工具，在解决某些问题方面也占有一席之地。如果您熟悉这种元编程方法，那么转向 Zig comptime 可能会感觉像是一次重大降级。运用这种方法，运行时会动态生成具有相似结构的代码。

最后一个例子正是这样做的。  
然而，如果你以合适的角度看待事物，元编程和混合编译时、运行时的代码在某些意义上是相等的。

下有两例。第一个是一个元编程的示例，第二个是我们熟悉的 comptime 示例。这两个版本的代码有着相同的逻辑。

> 元编程

```Zig
pub fn writeSumFn(
    writer: std.io.AnyWriter,
    type_name: []const u8,
    field_names: [][]const u8,
) !void {
    try writer.print("fn sumFields(value: {s}) i64 {{\n", .{type_name});
    try writer.print("var sum: i64 = 0;\n", .{});
    for (field_names) |field_name| {
        try writer.print("sum += value.{s};\n", .{field_name});
    }
    try writer.print("return sum;\n", .{});
    try writer.print("}}\n", .{});
}
```

注意这里有两次转换：在生成器中运行的代码成为最终代码的编译时部分。而生成器输出的代码则成为最终代码的运行时部分。
（Notice how there are two conversions: The code which runs in the generator becomes the comptime part of the code. The code which the generator outputs becomes the runtime part of the code.）
> 译注：此处包括之后的 `conversions` 都不太会翻译。（同时也感觉对此的理解得有点模糊）

> comptime（混合编译时、运行时）
> 以下代码与上面代码的第六行到倒数第三行每行的执行逻辑是完全一样的。

```Zig
fn sumFields(my_struct: MyStruct) i64 {
    var sum: i64 = 0;
    inline for (comptime std.meta.fieldNames(MyStruct)) |field_name| {
        sum += @field(my_struct, field_name);
    }
    return sum;
}
```

我喜欢这个例子的另一个原因是，它展示了在 Zig 中生成使用类型信息作为输入是多么的简单，尽管这个例子略去了类型名称和字段名称信息的来源。如果你使用其他形式的输入，例如特定格式的内容，Zig 提供了 `@embedFile`，借此你可以像往常一样解析它。

回到泛型的例子，有一些值得强调的细微之处：

> 元编程

```Zig
pub fn writeMyStructOfType(
    writer: std.io.AnyWriter,
    T: []const u8,
) !void {
    try writer.print("const MyStruct_{s} = struct {{\n", .{T});
    try writer.print("a: {s},\n", .{T});
    try writer.print("b: {s},\n", .{T});
    try writer.print("c: {s},\n", .{T});

    try writer.print("fn sumFields(value: MyStruct_{s}) {s} {{\n", .{T,T});
    try writer.print("var sum: {s} = 0;\n", .{T});
    const fields = [_][]const u8{ "a", "b", "c" };
    for (fields) |field_name| {
        try writer.print("sum += value.{s};\n", .{field_name});
    }
    try writer.print("return sum;\n", .{});
    try writer.print("}}\n", .{});
    try writer.print("}};\n", .{});
}
```

> comptime （混合编译时、运行时）
> 以下代码与上面代码的第五行到倒数第二行每行的执行逻辑是完全一样的

```Zig
pub fn GenericMyStruct(comptime T: type) type {



    return struct {
        a: T,
        b: T,
        c: T,

        fn sumFields(my_struct: GenericMyStruct(T)) T {
            var sum: T = 0;
            const fields = comptime std.meta.fieldNames(GenericMyStruct(T));
            inline for (fields) |field_name| {
                sum += @field(my_struct, field_name);
            }
            return sum;
        }
    };
}
```

以上 struct 字段的生成体现了上述两种转换（`conversions`）方式，并且将两者混合在了一行中。字段的类型表达式推断（生成）由生成器或 comptime 完成。

在 comptime 下，引用类型名称的方式更加直接，可以直接使用函数，而不必将文本拼接成一个在代码生成中保持一致的名称。

例外的是，你可以创建在编译时确定字段名称的类型，但是这样做需要调用一个包含字段定义列表的内置函数。因此，您不能在这些类型上定义声明（declarations），例如方法。实际上，这并不限制您代码的表达能力，但它确实限制了您可以向其他代码公开的 API 类型。

与此部分相关的是 C 中的宏（marco）。大多数你能在 comptime 做的事情宏都可以做，尽管它们很少以相似的形式出现。然而，也有一些在宏中允许事情在 comptime 中是不能做到的。例如，你不用 comptime 将你不喜欢的 Zig 的关键字的命名替换成你喜欢的。但我认为这是正确的选择，即使这对于那些习惯那种做法的人来说将是一个艰难的过渡。此外，Zig 参考了半个世纪以来的程序员在这方面的探索，所以它的选择要理智得多。

## 结论

在阅读 Zig 代码以理解代码行为时，考虑 comptime 并不是必要的。而当编写 comptime 代码时，我通常会将其视为程序特化（Partial Evaluation）的一种形式。然而，如果你知道如何使用不同的元编程方法解决问题，你很可能有能力将其翻译成 comptime 形式。

元编程中直接生成代码的方法的存在，就是我全力支持 Zig 风格的 comptime 元编程的原因。尽管，直接生成代码是几乎是最强大的，但是，在阅读和调试时忽略 comptime 的特性的元编程方法确是最简单的。正因如此，我给本文取名为《Zig 的 comptime 非常好》。

## 进一步阅读

Zig 并非一个仅仅依赖 comptime 这一特性的语言。你可以在[官方网站](https://ziglang.org/)上了解更多关于 Zig 的信息。

在这篇文章中，我多次使用相同的例子来展示不同的转换方式（代码->编译时和运行时），以简化展示的过程。这样做的缺点是，尽管谈论了很多，但实际上我并没有展示太多相关的内容。而[语言参考文档](https://ziglang.org/documentation/0.13.0/)详细介绍了编译时的具体特性。

如果您想看到更多示例，我建议您阅读一些 Zig 的标准库代码。以下是一些供有兴趣者参考的链接：

[std.debug.print 的格式化函数](https://github.com/ziglang/zig/blob/0.13.0/lib/std/fmt.zig#L80)是一个强大的泛型函数。许多语言在运行时解析它们的格式字符串，并很可能为字符串格式添加了一些特殊的效验器，以尽早捕获错误。而在 Zig 中，格式字符串是在编译时解析的，这样不仅生成了高效的最终代码，还在编译时完成了所有的校验。

[ArrayList](https://github.com/ziglang/zig/blob/0.13.0/lib/std/array_list.zig#L25) 是一个实现相对简单但功能齐全的泛型容器。

Zig 的函数可以具有几种不同的返回类型。但是，这并不是依赖于编译器中的某些魔法的操作，而只是[典型的 comptime 的应用](https://github.com/ziglang/zig/blob/0.13.0/lib/std/start.zig#L508)。

<hr/>

如果您想就这篇帖子提供评论或更正，请通过 <blogcomments@scottredig.com> 邮箱联系原作者。  
如果有任何翻译的问题请提 issue 或 pr。
