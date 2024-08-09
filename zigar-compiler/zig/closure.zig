const std = @import("std");
const builtin = @import("builtin");
const expect = std.testing.expect;

pub const Closure = struct {
    const code_size = switch (builtin.target.cpu.arch) {
        .x86_64 => 22,
        .aarch64 => 36,
        .x86 => 12,
        else => @compileError("Closure not supported on this architecture: " ++ @tagName(builtin.target.cpu.arch)),
    };

    context_ptr: *const anyopaque,
    key: usize,
    bytes: [code_size]u8,

    pub inline fn get() *const @This() {
        const address = switch (builtin.target.cpu.arch) {
            .x86_64 => asm (""
                : [ret] "={rax}" (-> usize),
            ),
            .aarch64 => asm (""
                : [ret] "={x9}" (-> usize),
            ),
            .x86 => asm (""
                : [ret] "={eax}" (-> usize),
            ),
            else => unreachable,
        };
        return @ptrFromInt(address);
    }

    fn construct(self: *@This(), fn_ptr: *const anyopaque, context_ptr: *const anyopaque, key: usize) void {
        self.context_ptr = context_ptr;
        self.key = key;
        self.createInstructions(fn_ptr);
    }

    pub fn getFunction(self: *const @This(), comptime FT: type) *const FT {
        return @ptrCast(@alignCast(&self.bytes));
    }

    fn createInstructions(self: *@This(), fn_ptr: *const anyopaque) void {
        const ip = &self.bytes;
        const self_addr = @intFromPtr(self);
        const fn_addr = @intFromPtr(fn_ptr);
        switch (builtin.target.cpu.arch) {
            .x86_64 => {
                const MOV = packed struct {
                    prefix: u8 = 0x48,
                    reg: u3,
                    op: u5 = 0x17,
                    imm64: usize,
                };
                const JMP = packed struct {
                    op: u8 = 0xff,
                    rm: u3,
                    reg: u3 = 4,
                    mod: u2 = 0x3,
                };
                @as(*align(1) MOV, @ptrCast(&ip[0])).* = .{
                    .imm64 = self_addr,
                    .reg = 0, // rax
                };
                @as(*align(1) MOV, @ptrCast(&ip[10])).* = .{
                    .imm64 = fn_addr,
                    .reg = 3, // rbx
                };
                @as(*align(1) JMP, @ptrCast(&ip[20])).* = .{
                    .rm = 3, // rbx
                };
            },
            .aarch64 => {
                const MOVZ = packed struct {
                    rd: u5,
                    imm16: u16,
                    hw: u2,
                    op: u9 = 0x1a5,
                };
                const MOVK = packed struct {
                    rd: u5,
                    imm16: u16,
                    hw: u2,
                    op: u9 = 0x1e5,
                };
                const BR = packed struct {
                    op4: u5 = 0,
                    rn: u5,
                    op3: u6 = 0,
                    op2: u5 = 0x1f,
                    opc: u4 = 0,
                    op: u7 = 0x6b,
                };
                @as(*align(1) MOVZ, @ptrCast(&ip[0])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&self_addr))[0],
                    .hw = 0,
                    .rd = 9,
                };
                @as(*align(1) MOVK, @ptrCast(&ip[4])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&self_addr))[1],
                    .hw = 1,
                    .rd = 9,
                };
                @as(*align(1) MOVK, @ptrCast(&ip[8])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&self_addr))[2],
                    .hw = 2,
                    .rd = 9,
                };
                @as(*align(1) MOVK, @ptrCast(&ip[12])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&self_addr))[3],
                    .hw = 3,
                    .rd = 9,
                };
                @as(*align(1) MOVZ, @ptrCast(&ip[16])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&fn_addr))[0],
                    .hw = 0,
                    .rd = 10,
                };
                @as(*align(1) MOVK, @ptrCast(&ip[20])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&fn_addr))[1],
                    .hw = 1,
                    .rd = 10,
                };
                @as(*align(1) MOVK, @ptrCast(&ip[24])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&fn_addr))[2],
                    .hw = 2,
                    .rd = 10,
                };
                @as(*align(1) MOVK, @ptrCast(&ip[28])).* = .{
                    .imm16 = @as([*]const u16, @ptrCast(&fn_addr))[3],
                    .hw = 3,
                    .rd = 10,
                };
                @as(*align(1) BR, @ptrCast(&ip[32])).* = .{
                    .rn = 10,
                };
            },
            .x86 => {
                const MOV = packed struct {
                    reg: u3,
                    op: u5 = 0x17,
                    imm32: usize,
                };
                const JMP = packed struct {
                    op: u8 = 0xff,
                    rm: u3,
                    reg: u3 = 4,
                    mod: u2 = 0x3,
                };
                @as(*align(1) MOV, @ptrCast(&ip[0])).* = .{
                    .imm32 = self_addr,
                    .reg = 0, // eax
                };
                @as(*align(1) MOV, @ptrCast(&ip[5])).* = .{
                    .imm32 = fn_addr,
                    .reg = 3, // ebx
                };
                @as(*align(1) JMP, @ptrCast(&ip[10])).* = .{
                    .rm = 3, // ebx
                };
            },
            else => unreachable,
        }
    }
};

test "Closure" {
    const ns = struct {
        fn check(number_ptr: *usize) i32 {
            const closure = Closure.get();
            number_ptr.* = @intFromPtr(closure.context_ptr) + closure.key;
            return 777;
        }
    };
    const bytes = try std.posix.mmap(
        null,
        1024 * 4,
        std.posix.PROT.READ | std.posix.PROT.WRITE | std.posix.PROT.EXEC,
        .{ .TYPE = .PRIVATE, .ANONYMOUS = true },
        -1,
        0,
    );
    defer std.posix.munmap(bytes);
    const closure: *Closure = @ptrCast(bytes);
    const address = 0xABCD_0000;
    const context_ptr: *const anyopaque = @ptrFromInt(address);
    const key: usize = 1234;
    closure.construct(&ns.check, context_ptr, key);
    const f = closure.getFunction(@TypeOf(ns.check));
    var number: usize = undefined;
    const result = f(&number);
    try expect(result == 777);
    try expect(number == address + key);
}
