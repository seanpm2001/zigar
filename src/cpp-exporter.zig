const std = @import("std");
const exporter = @import("exporter.zig");
const builtin = @import("builtin");
const assert = std.debug.assert;

const Value = exporter.Value;
const StructureType = exporter.StructureType;
const Structure = exporter.Structure;
const MemberType = exporter.MemberType;
const Member = exporter.Member;
const Method = exporter.Method;
const Memory = exporter.Memory;
const MemoryDisposition = exporter.MemoryDisposition;
const Template = exporter.Template;
const Thunk = exporter.Thunk;
const Error = exporter.Error;
const missing = exporter.missing;
const Call = *anyopaque;

pub const Result = enum(u32) {
    OK,
    Failure,
};

// host interface
pub const Host = struct {
    context: Call,

    pub const RuntimeHost = Host;

    pub fn init(ptr: *anyopaque) Host {
        return .{ .context = @ptrCast(ptr) };
    }

    pub fn getInitPtr(self: Host) *anyopaque {
        return @ptrCast(self.context);
    }

    pub fn allocateMemory(self: Host, size: usize) !Memory {
        var memory: Memory = undefined;
        if (callbacks.allocate_memory(self.context, size, &memory) != .OK) {
            return Error.UnableToAllocateMemory;
        }
        return memory;
    }

    pub fn freeMemory(self: Host, memory: Memory) !void {
        if (callbacks.free_memory(self.context, &memory) != .OK) {
            return Error.UnableToFreeMemory;
        }
    }

    pub fn getMemory(self: Host, container: Value, comptime T: type, comptime size: std.builtin.Type.Pointer.Size) !exporter.PointerType(T, size) {
        var memory: Memory = undefined;
        if (callbacks.get_memory(self.context, container, &memory) != .OK) {
            return Error.UnableToRetrieveMemoryLocation;
        }
        return exporter.fromMemory(memory, T, size);
    }

    pub fn wrapMemory(self: Host, memory: Memory, disposition: MemoryDisposition, comptime T: type, comptime size: std.builtin.Type.Pointer.Size) !Value {
        const slot = exporter.getStructureSlot(T, size);
        const structure = try self.readGlobalSlot(slot);
        var value: Value = undefined;
        const actual_disposition: MemoryDisposition = switch (disposition) {
            .Auto => if (self.isOnStack(memory)) .Copy else .Auto,
            else => disposition,
        };
        if (callbacks.wrap_memory(self.context, structure, &memory, actual_disposition, &value) != .OK) {
            return Error.UnableToCreateObject;
        }
        return value;
    }

    fn isOnStack(self: Host, memory: Memory) bool {
        // since the context struct is allocated on the stack, its address is the
        // starting point of stack space used by Zig code
        const bytes = memory.bytes orelse return false;
        const len = memory.len;
        const stack_top = @intFromPtr(self.context);
        const stack_bottom = @intFromPtr(&stack_top);
        const address = @intFromPtr(bytes);
        return (stack_bottom <= address and address + len <= stack_top);
    }

    pub fn getPointerStatus(self: Host, pointer: Value) !bool {
        var sync: bool = undefined;
        if (callbacks.get_pointer_status(self.context, pointer, &sync) != .OK) {
            return Error.PointerIsInvalid;
        }
        return sync;
    }

    pub fn setPointerStatus(self: Host, pointer: Value, sync: bool) !void {
        if (callbacks.set_pointer_status(self.context, pointer, sync) != .OK) {
            return Error.PointerIsInvalid;
        }
    }

    pub fn readGlobalSlot(self: Host, slot: usize) !Value {
        var value: Value = undefined;
        if (callbacks.read_global_slot(self.context, slot, &value) != .OK) {
            return Error.UnableToFindObjectType;
        }
        return value;
    }

    pub fn writeGlobalSlot(self: Host, slot: usize, value: Value) !void {
        if (callbacks.write_global_slot(self.context, slot, value) != .OK) {
            return Error.UnableToSetObjectType;
        }
    }

    pub fn readObjectSlot(self: Host, container: Value, id: usize) !Value {
        var result: Value = undefined;
        if (callbacks.read_object_slot(self.context, container, id, &result) != .OK) {
            return Error.UnableToRetrieveObject;
        }
        return result;
    }

    pub fn writeObjectSlot(self: Host, container: Value, id: usize, value: ?Value) !void {
        if (callbacks.write_object_slot(self.context, container, id, value) != .OK) {
            return Error.UnableToInsertObject;
        }
    }

    pub fn beginStructure(self: Host, def: Structure) !Value {
        var structure: Value = undefined;
        if (callbacks.begin_structure(self.context, &def, &structure) != .OK) {
            return Error.UnableToStartStructureDefinition;
        }
        return structure;
    }

    pub fn attachMember(self: Host, structure: Value, member: Member) !void {
        if (callbacks.attach_member(self.context, structure, &member) != .OK) {
            if (member.is_static) {
                return Error.UnableToAddStaticMember;
            } else {
                return Error.UnableToAddStructureMember;
            }
        }
    }

    pub fn attachMethod(self: Host, structure: Value, method: Method) !void {
        if (callbacks.attach_method(self.context, structure, &method) != .OK) {
            return Error.UnableToAddMethod;
        }
    }

    pub fn attachTemplate(self: Host, structure: Value, template: Template) !void {
        if (callbacks.attach_template(self.context, structure, &template) != .OK) {
            return Error.UnableToAddStructureTemplate;
        }
    }

    pub fn finalizeStructure(self: Host, structure: Value) !void {
        if (callbacks.finalize_structure(self.context, structure) != .OK) {
            return Error.UnableToDefineStructure;
        }
    }

    pub fn createTemplate(self: Host, bytes: []u8) !Value {
        const memory: Memory = .{
            .bytes = if (bytes.len > 0) bytes.ptr else null,
            .len = bytes.len,
        };
        var value: Value = undefined;
        if (callbacks.create_template(self.context, &memory, &value) != .OK) {
            return Error.UnableToCreateStructureTemplate;
        }
        return value;
    }

    pub fn createString(self: Host, message: []const u8) !Value {
        const memory: Memory = .{
            .bytes = @constCast(@ptrCast(message)),
            .len = message.len,
        };
        var value: Value = undefined;
        if (callbacks.create_string(self.context, &memory, &value) != .OK) {
            return Error.UnableToCreateString;
        }
        return value;
    }

    pub fn logValues(self: Host, args: anytype) !void {
        const fields = std.meta.fields(@TypeOf(args));
        var values: [fields.len]Value = undefined;
        inline for (fields, 0..) |field, index| {
            const v = @field(args, field.name);
            values[index] = switch (field.type) {
                Value => v,
                else => try self.createString(v),
            };
        }
        if (callbacks.log_values(self.context, values.len, @ptrCast(&values)) != .OK) {
            return Error.Unknown;
        }
    }
};

// pointer table that's filled on the C++ side
const Callbacks = extern struct {
    allocate_memory: *const fn (Call, usize, *Memory) callconv(.C) Result,
    free_memory: *const fn (Call, *const Memory) callconv(.C) Result,
    get_memory: *const fn (Call, Value, *Memory) callconv(.C) Result,
    wrap_memory: *const fn (Call, Value, *const Memory, MemoryDisposition, *Value) callconv(.C) Result,

    get_pointer_status: *const fn (Call, Value, *bool) callconv(.C) Result,
    set_pointer_status: *const fn (Call, Value, bool) callconv(.C) Result,

    read_global_slot: *const fn (Call, usize, *Value) callconv(.C) Result,
    write_global_slot: *const fn (Call, usize, ?Value) callconv(.C) Result,
    read_object_slot: *const fn (Call, Value, usize, *Value) callconv(.C) Result,
    write_object_slot: *const fn (Call, Value, usize, ?Value) callconv(.C) Result,

    begin_structure: *const fn (Call, *const Structure, *Value) callconv(.C) Result,
    attach_member: *const fn (Call, Value, *const Member) callconv(.C) Result,
    attach_method: *const fn (Call, Value, *const Method) callconv(.C) Result,
    attach_template: *const fn (Call, Value, *const Template) callconv(.C) Result,
    finalize_structure: *const fn (Call, Value) callconv(.C) Result,
    create_template: *const fn (Call, *const Memory, *Value) callconv(.C) Result,

    create_string: *const fn (Call, *const Memory, *Value) callconv(.C) Result,
    log_values: *const fn (Call, usize, [*]Value) callconv(.C) Result,
};

var callbacks: Callbacks = undefined;

const ModuleFlags = packed struct(u32) {
    little_endian: bool,
    runtime_safety: bool,
    _: u30 = 0,
};

pub const Module = extern struct {
    version: u32 = 1,
    flags: ModuleFlags,
    callbacks: *Callbacks = &callbacks,
    factory: Thunk,
};

pub fn createModule(comptime T: type) Module {
    return .{
        .flags = .{
            .little_endian = builtin.target.cpu.arch.endian() == .Little,
            .runtime_safety = switch (builtin.mode) {
                .Debug, .ReleaseSafe => true,
                else => false,
            },
        },
        .factory = exporter.createRootFactory(Host, T),
    };
}

test "createModule" {
    const Test = struct {
        pub const a: i32 = 1;
        const b: i32 = 2;
        pub var c: bool = true;
        pub const d: f64 = 3.14;
        pub const e: [4]i32 = .{ 3, 4, 5, 6 };
        pub const f = enum { Dog, Cat, Chicken };
        pub const g = enum(c_int) { Dog = -100, Cat, Chicken };
        pub fn h(arg1: i32, arg2: i32) bool {
            return arg1 < arg2;
        }
    };
    const module = createModule(Host, Test);
    assert(module.version == 1);
    assert(module.flags.little_endian == (builtin.target.cpu.arch.endian() == .Little));
    switch (@typeInfo(@TypeOf(module.factory))) {
        .Pointer => |pt| {
            switch (@typeInfo(pt.child)) {
                .Fn => |f| {
                    assert(f.params.len == 2);
                    assert(f.calling_convention == .C);
                },
                else => {
                    assert(false);
                },
            }
        },
        else => {
            assert(false);
        },
    }
}