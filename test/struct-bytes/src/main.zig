const std = @import("std");

const UnionTag = enum(u16) {
    cat = 123,
    dog = 777,
    monkey = 3433,
};

const Error = error{
    Error1,
    Error2,
    Error3,
    Error4,
    Error5,
    Error6,
    Error7,
    Error8,
    Error9,
    Error10,
    Error11,
    Error12,
    Error13,
    Error14,
    Error15,
    UnknownError,
};

const Structs = struct {
    const SingleInt32 = struct {
        number: i32 = 1234,
    };
    const MisalignedInt64 = packed struct {
        flag1: bool = true,
        flag2: bool = false,
        number: i64 = 1234567890,
    };
    const BasicUnion = union {
        cat: i32,
        dog: i32,
        monkey: i64,
    };
    const TaggedUnion = union(UnionTag) {
        cat: i32,
        dog: i32,
        monkey: i64,
    };
    const BigInt1 = struct {
        number: u128 = 0x0_1FFF_FFFF_FFFF_FFFF,
    };
    const BigInt2 = struct {
        number: u128 = std.mem.nativeToBig(u128, 0x0_1FFF_FFFF_FFFF_FFFF),
    };
    const BigInt3 = struct {
        number: u72 = 0x0_1FFF_FFFF_FFFF_FFFF,
    };
    const BigInt4 = struct {
        number: u72 = std.mem.nativeToBig(u72, 0x0_1FFF_FFFF_FFFF_FFFF),
    };
    const BigInt5 = struct {
        number: i65 = -0xFFFF_FFFF_FFFF_FFFF,
    };
    const Float16 = struct {
        number1: f16 = 3.141592653589793238462643383279502884197169399375105820974,
        number2: f16 = 0.0,
        number3: f16 = -0.0,
        number4: f16 = std.math.inf(f16),
        number5: f16 = -std.math.inf(f16),
        number6: f16 = std.math.nan(f16),
    };
    const Float80 = struct {
        number1: f80 = 3.141592653589793238462643383279502884197169399375105820974,
        number2: f80 = 0.0,
        number3: f80 = -0.0,
        number4: f80 = std.math.inf(f80),
        number5: f80 = -std.math.inf(f80),
        number6: f80 = std.math.nan(f80),
    };
    const Float128 = struct {
        number1: f128 = 3.141592653589793238462643383279502884197169399375105820974,
        number2: f128 = 0.0,
        number3: f128 = -0.0,
        number4: f128 = std.math.inf(f128),
        number5: f128 = -std.math.inf(f128),
        number6: f128 = std.math.nan(f128),
    };
    const OverflowFloat80 = struct {
        max: f80 = std.math.floatMax(f64),
        maxx2: f80 = @floatCast(f80, std.math.floatMax(f64)) * 2,
        minusMaxx2: f80 = -@floatCast(f80, std.math.floatMax(f64)) * 2,
    };
    const OverflowFloat128 = struct {
        max: f128 = std.math.floatMax(f64),
        maxx2: f128 = @floatCast(f128, std.math.floatMax(f64)) * 2,
        minusMaxx2: f128 = -@floatCast(f128, std.math.floatMax(f64)) * 2,
    };
    const OptionalIntSet = struct {
        number: ?i64 = 0x00000FFFF,
    };
    const OptionalIntEmpty = struct {
        number: ?i64 = null,
    };
    const VoidNoError = struct {
        value: anyerror!void = {},
    };
    const VoidWithError = struct {
        value: anyerror!void = Error.UnknownError,
    };
    const BoolNoError = struct {
        value: anyerror!bool = true,
    };
    const BoolWithError = struct {
        value: anyerror!bool = Error.UnknownError,
    };
    const Int8NoError = struct {
        number: anyerror!i8 = 0x1F,
    };
    const Int8WithError = struct {
        number: anyerror!i8 = Error.UnknownError,
    };
    const Int9NoError = struct {
        number: anyerror!i9 = 0x1F,
    };
    const Int9WithError = struct {
        number: anyerror!i9 = Error.UnknownError,
    };
    const Int16NoError = struct {
        number: anyerror!i16 = 0x1F,
    };
    const Int16WithError = struct {
        number: anyerror!i16 = Error.UnknownError,
    };
    const Int32NoError = struct {
        number: anyerror!i32 = 0x1F,
    };
    const Int32WithError = struct {
        number: anyerror!i32 = Error.UnknownError,
    };
    const Int64NoError = struct {
        number: anyerror!i64 = 0x1F,
    };
    const Int64WithError = struct {
        number: anyerror!i64 = Error.UnknownError,
    };
    const OptionalBool = struct {
        value: ?bool = true,
    };
    const OptionalBoolNull = struct {
        value: ?bool = null,
    };
    const OptionalInt8 = struct {
        number: ?i8 = 123,
    };
    const OptionalInt8Null = struct {
        number: ?i8 = null,
    };
    const OptionalInt32 = struct {
        number: ?i32 = 1234,
    };
    const OptionalInt32Null = struct {
        number: ?i32 = null,
    };
    const OptionalBoolNoError = struct {
        value: anyerror!?bool = true,
    };
    const OptionalBoolWithError = struct {
        value: anyerror!?bool = Error.UnknownError,
    };
    const OptionalInt32NoError = struct {
        number: anyerror!?i32 = 1234,
    };
    const OptionalInt32WithError = struct {
        number: anyerror!?i32 = Error.UnknownError,
    };
};

pub fn main() !void {
    var args = std.process.args();
    _ = args.next() orelse return;
    const arg1 = args.next() orelse {
        std.debug.print("Available structs:\n\n", .{});
        inline for (@typeInfo(Structs).Struct.decls) |decl| {
            std.debug.print("{s}\n", .{decl.name});
        }
        std.debug.print("\n", .{});
        return;
    };
    const arg2 = args.next();
    const stdout_file = std.io.getStdOut().writer();
    var bw = std.io.bufferedWriter(stdout_file);
    const stdout = bw.writer();
    var found = false;
    inline for (@typeInfo(Structs).Struct.decls) |decl| {
        if (std.mem.eql(u8, arg1, decl.name)) {
            const T = @field(Structs, decl.name);
            var s: T = undefined;
            switch (@typeInfo(T)) {
                .Union => |un| {
                    if (arg2) |tag_name| {
                        var found_tag = false;
                        inline for (un.fields) |field| {
                            if (std.mem.eql(u8, tag_name, field.name)) {
                                s = @unionInit(T, field.name, 1234);
                                found_tag = true;
                            }
                        }
                        if (!found_tag) {
                            std.debug.print("Unknown tag: {s}\n", .{tag_name});
                        }
                    } else {
                        std.debug.print("Available tags:\n\n", .{});
                        inline for (un.fields) |field| {
                            std.debug.print("{s}\n", .{field.name});
                        }
                        std.debug.print("\n", .{});
                        return;
                    }
                },
                else => {
                    s = .{};
                },
            }
            try stdout.print("{s} ({d} bytes): \n\n", .{ @typeName(T), @sizeOf(T) });
            const ptr = @ptrCast([*]u8, &s);
            const len = @sizeOf(T);
            var i: usize = 0;
            try stdout.print("[ ", .{});
            while (i < len) : (i += 1) {
                try stdout.print("{d}, ", .{ptr[i]});
            }
            try stdout.print("]", .{});
            try stdout.print("\n\n", .{});
            found = true;
            break;
        }
    }
    if (!found) {
        std.debug.print("Unknown type: {s}\n", .{arg1});
    }
    try bw.flush();
}
