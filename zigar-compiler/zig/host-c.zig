const std = @import("std");
const builtin = @import("builtin");
const exporter = @import("./exporter.zig");
const types = @import("./types.zig");
const thunk_zig = @import("./thunk-zig.zig");
const thunk_js = @import("./thunk-js.zig");
const expect = std.testing.expect;

const Value = types.Value;
const MemoryType = types.MemoryType;
const Memory = types.Memory;
const Error = types.Error;

const ModuleData = opaque {};

// struct for C
const StructureC = extern struct {
    name: ?[*:0]const u8,
    structure_type: types.StructureType,
    length: usize,
    byte_size: usize,
    alignment: u16,
    is_const: bool,
    is_tuple: bool,
    is_iterator: bool,
    has_pointer: bool,
};
const MemberC = extern struct {
    name: ?[*:0]const u8,
    member_type: types.MemberType,
    is_required: bool,
    bit_offset: usize,
    bit_size: usize,
    byte_size: usize,
    slot: usize,
    structure: ?Value,
};
const MethodC = extern struct {
    name: ?[*:0]const u8,
    thunk_id: usize,
    structure: Value,
};
const JsCall = extern struct {
    id: usize,
    arg_ptr: *anyopaque,
    arg_size: usize,
    futex_handle: usize = 0,
};

pub fn missing(comptime T: type) comptime_int {
    return std.math.maxInt(T);
}

pub const Result = enum(u32) {
    ok,
    failure,
};

// host interface
pub const Host = struct {
    context: *ModuleData,

    pub fn init(ptr: ?*anyopaque) Host {
        return .{ .context = @ptrCast(ptr.?) };
    }

    pub fn allocateMemory(self: Host, size: usize, alignment: u16) !Memory {
        var memory: Memory = undefined;
        if (imports.allocate_host_memory(self.context, size, alignment, &memory) != .ok) {
            return Error.unable_to_allocate_memory;
        }
        return memory;
    }

    pub fn freeMemory(self: Host, memory: Memory) !void {
        if (imports.free_host_memory(self.context, &memory) != .ok) {
            return Error.unable_to_free_memory;
        }
    }

    pub fn captureString(self: Host, memory: Memory) !Value {
        var value: Value = undefined;
        if (imports.capture_string(self.context, &memory, &value) != .ok) {
            return Error.unable_to_create_object;
        }
        return value;
    }

    pub fn captureView(self: Host, memory: Memory) !Value {
        var value: Value = undefined;
        if (imports.capture_view(self.context, &memory, &value) != .ok) {
            return Error.unable_to_create_data_view;
        }
        return value;
    }

    pub fn castView(self: Host, memory: Memory, structure: Value) !Value {
        var value: Value = undefined;
        if (imports.cast_view(self.context, &memory, structure, &value) != .ok) {
            return Error.unable_to_create_object;
        }
        return value;
    }

    pub fn getSlotNumber(self: Host, scope: u32, key: u32) !usize {
        var result: u32 = undefined;
        if (imports.get_slot_number(self.context, scope, key, &result) != .ok) {
            return Error.unable_to_obtain_slot;
        }
        return result;
    }

    pub fn readSlot(self: Host, target: ?Value, id: usize) !Value {
        var result: Value = undefined;
        if (imports.read_slot(self.context, target, id, &result) != .ok) {
            return Error.unable_to_retrieve_object;
        }
        return result;
    }

    pub fn writeSlot(self: Host, target: ?Value, id: usize, value: ?Value) !void {
        if (imports.write_slot(self.context, target, id, value) != .ok) {
            return Error.unable_to_insert_object;
        }
    }

    pub fn beginStructure(self: Host, def: types.Structure) !Value {
        const def_c: StructureC = .{
            .name = if (def.name) |p| @ptrCast(p) else null,
            .structure_type = def.structure_type,
            .length = def.length orelse missing(usize),
            .byte_size = def.byte_size orelse missing(usize),
            .alignment = def.alignment orelse missing(u16),
            .is_const = def.is_const,
            .is_tuple = def.is_tuple,
            .is_iterator = def.is_iterator,
            .has_pointer = def.has_pointer,
        };
        var structure: Value = undefined;
        if (imports.begin_structure(self.context, &def_c, &structure) != .ok) {
            return Error.unable_to_start_structure_definition;
        }
        return structure;
    }

    pub fn attachMember(self: Host, structure: Value, member: types.Member, is_static: bool) !void {
        const member_c: MemberC = .{
            .name = if (member.name) |p| @ptrCast(p) else null,
            .member_type = member.member_type,
            .is_required = member.is_required,
            .bit_offset = member.bit_offset orelse missing(usize),
            .bit_size = member.bit_size orelse missing(usize),
            .byte_size = member.byte_size orelse missing(usize),
            .slot = member.slot orelse missing(usize),
            .structure = member.structure,
        };
        if (imports.attach_member(self.context, structure, &member_c, is_static) != .ok) {
            if (is_static) {
                return Error.unable_to_add_static_member;
            } else {
                return Error.unable_to_add_structure_member;
            }
        }
    }

    pub fn attachTemplate(self: Host, structure: Value, template: Value, is_static: bool) !void {
        if (imports.attach_template(self.context, structure, template, is_static) != .ok) {
            return Error.unable_to_add_structure_template;
        }
    }

    pub fn finalizeShape(self: Host, structure: Value) !void {
        if (imports.finalize_shape(self.context, structure) != .ok) {
            return Error.unable_to_define_structure;
        }
    }

    pub fn endStructure(self: Host, structure: Value) !void {
        if (imports.end_structure(self.context, structure) != .ok) {
            return Error.unable_to_define_structure;
        }
    }

    pub fn createTemplate(self: Host, dv: ?Value) !Value {
        var value: Value = undefined;
        if (imports.create_template(self.context, dv, &value) != .ok) {
            return Error.unable_to_create_structure_template;
        }
        return value;
    }

    pub fn createErrorMessage(self: Host, err: anyerror) !Value {
        const err_name = @errorName(err);
        const memory = Memory.from(err_name, true);
        return self.captureString(memory);
    }

    pub fn writeToConsole(self: Host, dv: Value) !void {
        if (imports.write_to_console(self.context, dv) != .ok) {
            return Error.unable_to_write_to_console;
        }
    }

    pub fn writeBytesToConsole(self: Host, bytes: [*]const u8, len: usize) !void {
        const memory: Memory = .{
            .bytes = @constCast(bytes),
            .len = len,
            .attributes = .{ .is_comptime = true },
        };
        const dv = try self.captureView(memory);
        try self.writeToConsole(dv);
    }

    pub fn handleJsCall(ctx: thunk_js.Context, arg_ptr: *anyopaque, arg_size: usize, wait: bool) thunk_js.CallResult {
        var call: JsCall = .{ .id = ctx.id, .arg_ptr = arg_ptr, .arg_size = arg_size };
        const md: *ModuleData = @ptrCast(ctx.ptr);
        if (main_thread) {
            return imports.perform_js_call(md, &call);
        } else {
            var futex: Futex = undefined;
            if (wait) {
                futex.value = std.atomic.Value(u32).init(0);
                futex.handle = @intFromPtr(&futex);
                call.futex_handle = futex.handle;
            }
            if (imports.queue_js_call(md, &call) != .ok) {
                return .failure;
            }
            if (wait) {
                std.Thread.Futex.wait(&futex.value, 0);
                return @enumFromInt(futex.value.load(.acquire));
            } else {
                return .ok;
            }
        }
    }
};

threadlocal var module_data: ?*ModuleData = null;
threadlocal var main_thread: bool = false;

fn initialize(md: *ModuleData) callconv(.C) Result {
    module_data = md;
    main_thread = true;
    return .ok;
}

// allocator for fixed memory
var gpa = std.heap.GeneralPurposeAllocator(.{}){};
var allocator = gpa.allocator();

fn clearBytes(bytes: [*]u8, len: usize) void {
    var start: usize = 0;
    inline for (.{ usize, u8 }) |T| {
        const mask = ~(@as(usize, @sizeOf(T)) - 1);
        const remaining = len - start;
        const count = remaining & mask;
        if (count > 0) {
            const end = start + count;
            for (std.mem.bytesAsSlice(T, bytes[start..end])) |*ptr| ptr.* = 0;
            start += count;
            if (start == len) break;
        }
    }
}

test "clearBytes" {
    const lengths = [_]usize{ 18, 19, 20, 21, 23, 333 };
    for (lengths) |len| {
        const ptr_align = 0;
        const bytes = allocator.rawAlloc(len, ptr_align, 0) orelse @panic("No memory");
        clearBytes(bytes, len);
        for (bytes[0..len]) |byte| {
            try expect(byte == 0);
        }
        allocator.rawFree(bytes[0..len], ptr_align, 0);
    }
}

fn allocateExternMemory(_: MemoryType, len: usize, alignment: u8, memory: *Memory) callconv(.C) Result {
    const ptr_align = if (alignment != 0) std.math.log2_int(u16, alignment) else 0;
    if (allocator.rawAlloc(len, ptr_align, 0)) |bytes| {
        clearBytes(bytes, len);
        memory.bytes = bytes;
        memory.len = len;
        memory.attributes.alignment = alignment;
        memory.attributes.is_const = false;
        memory.attributes.is_comptime = false;
        return .ok;
    } else {
        return .failure;
    }
}

fn freeExternMemory(_: MemoryType, memory: *const Memory) callconv(.C) Result {
    if (memory.bytes) |bytes| {
        const alignment = memory.attributes.alignment;
        const len = memory.len;
        const ptr_align = if (alignment != 0) std.math.log2_int(u16, alignment) else 0;
        allocator.rawFree(bytes[0..len], ptr_align, 0);
        return .ok;
    } else {
        return .failure;
    }
}

pub fn overrideWrite(bytes: [*]const u8, len: usize) callconv(.C) Result {
    if (module_data) |mod| {
        const host = Host.init(mod);
        if (host.writeBytesToConsole(bytes, len)) {
            return .ok;
        } else |_| {}
    }
    return .failure;
}

pub fn runThunk(
    md: *ModuleData,
    thunk_address: usize,
    fn_address: usize,
    args: *anyopaque,
    dest: *?Value,
) callconv(.C) Result {
    const thunk: thunk_zig.Thunk = @ptrFromInt(thunk_address);
    dest.* = thunk(md, @ptrFromInt(fn_address), args);
    return .ok;
}

pub fn runVariadicThunk(
    md: *ModuleData,
    thunk_address: usize,
    fn_address: usize,
    args: *anyopaque,
    attr_ptr: *const anyopaque,
    arg_count: usize,
    dest: *?Value,
) callconv(.C) Result {
    const thunk: thunk_zig.VariadicThunk = @ptrFromInt(thunk_address);
    dest.* = thunk(md, @ptrFromInt(fn_address), args, attr_ptr, arg_count);
    return .ok;
}

pub fn runJsThunkCnstructor(
    md: *ModuleData,
    thunk_address: usize,
    func_id: usize,
    dest: *?Value,
) callconv(.C) Result {
    const constructor: thunk_js.ThunkConstructor = @ptrFromInt(thunk_address);
    dest.* = constructor(md, func_id);
    return .ok;
}

const Futex = struct {
    value: std.atomic.Value(u32),
    handle: usize = undefined,
};

pub fn wakeCaller(futex_handle: usize, value: u32) callconv(.C) Result {
    // make sure futex address is valid
    const ptr: *Futex = @ptrFromInt(futex_handle);
    if (ptr.handle == futex_handle) {
        ptr.value.store(value, .release);
        std.Thread.Futex.wake(&ptr.value, 1);
        return .ok;
    }
    return .failure;
}

// pointer table that's filled on the C side
const Imports = extern struct {
    allocate_host_memory: *const fn (*ModuleData, usize, u16, *Memory) callconv(.C) Result,
    free_host_memory: *const fn (*ModuleData, *const Memory) callconv(.C) Result,
    capture_string: *const fn (*ModuleData, *const Memory, *Value) callconv(.C) Result,
    capture_view: *const fn (*ModuleData, *const Memory, *Value) callconv(.C) Result,
    cast_view: *const fn (*ModuleData, *const Memory, Value, *Value) callconv(.C) Result,
    read_slot: *const fn (*ModuleData, ?Value, usize, *Value) callconv(.C) Result,
    write_slot: *const fn (*ModuleData, ?Value, usize, ?Value) callconv(.C) Result,
    begin_structure: *const fn (*ModuleData, *const StructureC, *Value) callconv(.C) Result,
    attach_member: *const fn (*ModuleData, Value, *const MemberC, bool) callconv(.C) Result,
    attach_template: *const fn (*ModuleData, Value, Value, bool) callconv(.C) Result,
    finalize_shape: *const fn (*ModuleData, Value) callconv(.C) Result,
    end_structure: *const fn (*ModuleData, Value) callconv(.C) Result,
    create_template: *const fn (*ModuleData, ?Value, *Value) callconv(.C) Result,
    write_to_console: *const fn (*ModuleData, Value) callconv(.C) Result,
    queue_js_call: *const fn (*ModuleData, *JsCall) callconv(.C) thunk_js.CallResult,
    perform_js_call: *const fn (*ModuleData, *JsCall) callconv(.C) thunk_js.CallResult,
};
var imports: Imports = undefined;

// pointer table that's used on the C side
const Exports = extern struct {
    initialize: *const fn (*ModuleData) callconv(.C) Result,
    allocate_fixed_memory: *const fn (MemoryType, usize, u8, *Memory) callconv(.C) Result,
    free_fixed_memory: *const fn (MemoryType, *const Memory) callconv(.C) Result,
    get_factory_thunk: *const fn (*usize) callconv(.C) Result,
    run_thunk: *const fn (*ModuleData, usize, usize, *anyopaque, *?Value) callconv(.C) Result,
    run_variadic_thunk: *const fn (*ModuleData, usize, usize, *anyopaque, *const anyopaque, usize, *?Value) callconv(.C) Result,
    run_js_thunk_constructor: *const fn (*ModuleData, usize, usize, *?Value) callconv(.C) Result,
    override_write: *const fn ([*]const u8, usize) callconv(.C) Result,
    wake_caller: *const fn (usize, u32) callconv(.C) Result,
};

const ModuleAttributes = packed struct(u32) {
    little_endian: bool,
    runtime_safety: bool,
    _: u30 = 0,
};

pub const Module = extern struct {
    version: u32,
    attributes: ModuleAttributes,
    imports: *Imports = &imports,
    exports: *const Exports,
};

pub fn createGetFactoryThunk(comptime T: type) fn (*usize) callconv(.C) Result {
    const ns = struct {
        fn getFactoryThunk(dest: *usize) callconv(.C) Result {
            const factory = exporter.createRootFactory(Host, T);
            dest.* = @intFromPtr(factory);
            return .ok;
        }
    };
    return ns.getFactoryThunk;
}

pub fn createModule(comptime T: type) Module {
    return .{
        .version = 4,
        .attributes = .{
            .little_endian = builtin.target.cpu.arch.endian() == .little,
            .runtime_safety = switch (builtin.mode) {
                .Debug, .ReleaseSafe => true,
                else => false,
            },
        },
        .imports = &imports,
        .exports = &.{
            .initialize = initialize,
            .allocate_fixed_memory = allocateExternMemory,
            .free_fixed_memory = freeExternMemory,
            .get_factory_thunk = createGetFactoryThunk(T),
            .run_thunk = runThunk,
            .run_variadic_thunk = runVariadicThunk,
            .run_js_thunk_constructor = runJsThunkCnstructor,
            .override_write = overrideWrite,
            .wake_caller = wakeCaller,
        },
    };
}

test "createModule" {
    const Test = struct {
        pub const a: i32 = 1;
        const b: i32 = 2;
        pub var c: bool = true;
        pub const d: f64 = 3.14;
        pub const e: [4]i32 = .{ 3, 4, 5, 6 };
        pub const f = enum { dog, cat, chicken };
        pub const g = enum(c_int) { dog = -100, cat, chicken };
        pub fn h(arg1: i32, arg2: i32) bool {
            return arg1 < arg2;
        }
    };
    const module = createModule(Test);
    try expect(module.version == 4);
    try expect(module.attributes.little_endian == (builtin.target.cpu.arch.endian() == .little));
}
