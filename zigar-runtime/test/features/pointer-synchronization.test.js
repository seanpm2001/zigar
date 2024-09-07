import { expect } from 'chai';
import { defineClass } from '../../src/environment.js';

import { StructureType } from '../../src/constants.js';
import Baseline from '../../src/features/baseline.js';

const Env = defineClass('FeatureTest', [ Baseline ]);

describe('Feature: pointer-synchronization', function() {
  describe('updatePointerAddresses', function() {
    it('should update pointer addresses', function() {
      const env = new Environment();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
        align: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*i32',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.ArgStruct,
        name: 'ArgStruct',
        byteSize: 32,
        hasPointer: true,
      });
      env.attachMember(structure, {
        name: 'retval',
        type: MemberType.Void,
        bitOffset: 0,
        bitSize: 0,
        byteSize: 0,
        structure: {},
      });
      env.attachMember(structure, {
        name: '0',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        name: '1',
        type: MemberType.Object,
        bitOffset: 64,
        bitSize: 64,
        byteSize: 8,
        slot: 1,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        name: '2',
        type: MemberType.Object,
        bitOffset: 128,
        bitSize: 64,
        byteSize: 8,
        slot: 2,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        name: '3',
        type: MemberType.Object,
        bitOffset: 192,
        bitSize: 64,
        byteSize: 8,
        slot: 3,
        structure: ptrStructure,
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: ArgStruct } = structure;
      const object1 = new Int32(123);
      const object2 = new Int32(123);
      const args = new ArgStruct([ object1, object2, object1, object1 ]);
      env.getTargetAddress = function(target, cluster) {
        // flag object1 as misaligned
        if (cluster) {
          return;
        } else {
          return 0x1000n;
        }
      };
      env.allocateShadowMemory = function(len, align) {
        return new DataView(new ArrayBuffer(len));
      };
      env.getBufferAddress = function(buffer) {
        return 0x2000n;
      };
      env.startContext();
      env.updatePointerAddresses(args);
      expect(args[0][MEMORY].getBigUint64(0, true)).to.equal(0x2004n);
      expect(args[1][MEMORY].getBigUint64(0, true)).to.equal(0x1000n);
      expect(args[2][MEMORY].getBigUint64(0, true)).to.equal(0x2004n);
      expect(args[3][MEMORY].getBigUint64(0, true)).to.equal(0x2004n);
    })
    it('should be able to handle self-referencing structures', function() {
      const env = new Environment();
      const structure = env.beginStructure({
        type: StructureType.Struct,
        name: 'Hello',
        byteSize: 12,
        hasPointer: true,
      });
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const optionalStructure = env.beginStructure({
        type: StructureType.Optional,
        name: '?*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(optionalStructure, {
        name: 'value',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(optionalStructure, {
        name: 'present',
        type: MemberType.Bool,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      env.finalizeShape(optionalStructure);
      env.finalizeStructure(optionalStructure);
      env.attachMember(structure, {
        name: 'sibling',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: optionalStructure,
      });
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      env.attachMember(structure, {
        name: 'number',
        type: MemberType.Int,
        bitOffset: 64,
        bitSize: 32,
        byteSize: 4,
        structure: intStructure,
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: Hello } = structure;
      const object1 = new Hello({ sibling: null });
      const object2 = new Hello({ sibling: object1 });
      const object3 = new Hello({ sibling: object2 });
      object1.sibling = object3;
      expect(object3.sibling['*']).to.equal(object2);
      expect(object3.sibling['*'].sibling['*']).to.equal(object1);
      expect(object3.sibling['*'].sibling['*'].sibling['*']).to.equal(object3);
      const map = new Map([
        [ object1[MEMORY], 0x1000n ],
        [ object2[MEMORY], 0x2000n ],
        [ object3[MEMORY], 0x3000n ],
      ]);
      env.getTargetAddress = function(target, cluster) {
        return map.get(target[MEMORY]);
      };
      env.startContext();
      env.updatePointerAddresses(object3);
      expect(object1[MEMORY].getBigUint64(0, true)).to.equal(0x3000n);  // obj1 -> obj3
      expect(object2[MEMORY].getBigUint64(0, true)).to.equal(0x1000n);  // obj2 -> obj1
      expect(object3[MEMORY].getBigUint64(0, true)).to.equal(0x2000n);  // obj3 -> obj2
    })
    it('should ignore inactive pointers', function() {
      const env = new Environment();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*i32',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        name: 'Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(structure, {
        name: 'value',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        name: 'present',
        type: MemberType.Bool,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      env.getTargetAddress = function(target, cluster) {
        return 0x1000n;
      };
      const { constructor: Hello } = structure;
      // start now with an active pointer so it gets vivificated in order to ensure code coverage
      const object = new Hello(new Int32(1234));
      env.updatePointerAddresses(object);
      expect(object[MEMORY].getBigUint64(0, true)).to.equal(0x1000n);
      // now make the pointer inactive
      object.$ = null;
      env.updatePointerAddresses(object);
      expect(object[MEMORY].getBigUint64(0, true)).to.equal(0n);
    })
    it('should ignore pointers in a bare union', function() {
      const env = new Environment();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*Int32',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const structStructure = env.beginStructure({
        type: StructureType.Struct,
        name: 'SomeStruct',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(structStructure, {
        name: 'pointer',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.finalizeShape(structStructure);
      env.finalizeStructure(structStructure);
      const arrayStructure = env.beginStructure({
        type: StructureType.Array,
        name: '[4]*Int32',
        length: 4,
        byteSize: 8 * 4,
        hasPointer: true,
      });
      env.attachMember(arrayStructure, {
        type: MemberType.Object,
        bitSize: 64,
        byteSize: 8,
        structure: ptrStructure,
      });
      env.finalizeShape(arrayStructure);
      env.finalizeStructure(arrayStructure);
      const structure = env.beginStructure({
        type: StructureType.BareUnion,
        name: 'Hello',
        byteSize: 8 * 4,
        hasPointer: false,
      });
      env.attachMember(structure, {
        name: 'pointer',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        name: 'struct',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 1,
        structure: structStructure,
      });
      env.attachMember(structure, {
        name: 'array',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8 * 4,
        slot: 2,
        structure: arrayStructure,
      });
      env.attachMember(structure, {
        name: 'number',
        type: MemberType.Int,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: {},
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: Hello } = structure;
      const object = new Hello(undefined);
      let called = false;
      env.getTargetAddress = function(target, cluster) {
        called = true;
        return 0x1000n;
      };
      env.updatePointerAddresses(object);
      expect(called).to.be.false;
    })
  })
  describe('findTargetClusters', function() {
    it('should find overlapping objects', function() {
      const env = new Environment();
      const Test = function(dv) {
        this[MEMORY] = dv;
      };
      const buffer1 = new ArrayBuffer(16);
      const buffer2 = new ArrayBuffer(16);
      const object1 = new Test(new DataView(buffer1, 0, 8));
      const object2 = new Test(new DataView(buffer1, 4, 8));
      const object3 = new Test(new DataView(buffer2, 0, 8));
      const object4 = new Test(new DataView(buffer2, 8, 8));
      const object5 = new Test(new DataView(buffer1, 0, 12));
      const clusters = env.findTargetClusters([
        [ object1, object2, object5 ],
        [ object3, object4 ],
      ]);
      expect(clusters).to.have.lengthOf(1);
      expect(clusters[0].targets).to.contain(object1).and.contain(object2);
      expect(clusters[0].start).to.equal(0);
      expect(clusters[0].end).to.equal(12);
    })
  })
  describe('updatePointerTargets', function() {
    it('should set pointer slot to undefined when pointer is inactive', function() {
      const env = new Environment();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*i32',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        name: 'Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(structure, {
        name: 'value',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        name: 'present',
        type: MemberType.Bool,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: Hello } = structure;
      const object = new Hello(new Int32(123));
      expect(object.$['*']).to.equal(123);
      object[MEMORY].setBigUint64(0, 0n);
      env.updatePointerTargets(object);
      expect(object[SLOTS][0][SLOTS][0]).to.be.undefined;
      expect(object.$).to.be.null;
    })
    it('should ignore const pointers', function() {
      const env = new Environment();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*i32',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.ArgStruct,
        name: 'Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(structure, {
        name: 'retval',
        type: MemberType.Bool,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      env.attachMember(structure, {
        name: '0',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: Hello } = structure;
      const object = new Hello([ new Int32(123) ]);
      expect(object[0]['*']).to.equal(123);
      env.updatePointerTargets(object);
      expect(object[0]['*']).to.equal(123);
    })
    it('should clear slot when pointer has invalid address', function() {
      const env = new Environment();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*i32',
        byteSize: 8,
        hasPointer: true,
        isConst: false,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const { constructor: Int32Ptr } = ptrStructure;
      const ptr = new Int32Ptr(new Int32(123));
      expect(ptr['*']).to.equal(123);
      ptr[MEMORY].setBigUint64(0, 0xaaaaaaaaaaaaaaaan, true);
      env.updatePointerTargets(ptr);
      expect(() => ptr['*']).to.throw(TypeError)
        .with.property('message').that.contains('Null')
    })
    it('should be able to handle self-referencing structures', function() {
      const env = new Environment();
      const structure = env.beginStructure({
        type: StructureType.Struct,
        name: 'Hello',
        byteSize: 12,
        hasPointer: true,
      });
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const optionalStructure = env.beginStructure({
        type: StructureType.Optional,
        name: '?*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(optionalStructure, {
        name: 'value',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(optionalStructure, {
        name: 'present',
        type: MemberType.Bool,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      env.finalizeShape(optionalStructure);
      env.finalizeStructure(optionalStructure);
      env.attachMember(structure, {
        name: 'sibling',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: optionalStructure,
      });
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      env.attachMember(structure, {
        name: 'number',
        type: MemberType.Int,
        bitOffset: 64,
        bitSize: 32,
        byteSize: 4,
        structure: intStructure,
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: Hello } = structure;
      const object1 = new Hello({ sibling: null });
      const object2 = new Hello({ sibling: object1 });
      const object3 = new Hello({ sibling: object2 });
      const object4 = new Hello({ sibling: null });
      const object5 = new Hello({ sibling: object4 });
      object1.sibling = object3;
      expect(object3.sibling['*']).to.equal(object2);
      expect(object3.sibling['*'].sibling['*']).to.equal(object1);
      expect(object3.sibling['*'].sibling['*'].sibling['*']).to.equal(object3);
      const map = new Map([
        [ 0x1000n, object1[MEMORY] ],
        [ 0x2000n, object2[MEMORY] ],
        [ 0x3000n, object3[MEMORY] ],
        [ 0x4000n, object4[MEMORY] ],
        [ 0x5000n, object5[MEMORY] ],
      ]);
      env.obtainFixedView = function(address, len) {
        return map.get(address);
      };
      object1[MEMORY].setBigUint64(0, 0x5000n, true); // obj1 -> obj5
      object2[MEMORY].setBigUint64(0, 0x1000n, true); // obj2 -> obj1
      object3[MEMORY].setBigUint64(0, 0x0000n, true); // obj3 -> null
      object5[MEMORY].setBigUint64(0, 0x4000n, true); // obj5 -> obj4
      env.updatePointerTargets(object3);
      expect(object3.sibling).to.be.null;
      expect(object2.sibling['*']).to.equal(object1);
      expect(object1.sibling['*']).to.equal(object5);
      expect(object5.sibling['*']).to.equal(object4);
    })
    it('should acquire missing objects', function() {
      const env = new Environment();
      const structure = env.beginStructure({
        type: StructureType.Struct,
        name: 'Hello',
        byteSize: 12,
        hasPointer: true,
      });
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const optionalStructure = env.beginStructure({
        type: StructureType.Optional,
        name: '?*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(optionalStructure, {
        name: 'value',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(optionalStructure, {
        name: 'present',
        type: MemberType.Bool,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      env.finalizeShape(optionalStructure);
      env.finalizeStructure(optionalStructure);
      env.attachMember(structure, {
        name: 'sibling',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: optionalStructure,
      });
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'i32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      env.finalizeShape(intStructure);
      env.finalizeStructure(intStructure);
      env.attachMember(structure, {
        name: 'number',
        type: MemberType.Int,
        bitOffset: 64,
        bitSize: 32,
        byteSize: 4,
        structure: intStructure,
      });
      env.finalizeShape(structure);
      env.finalizeStructure(structure);
      const { constructor: Hello } = structure;
      const object1 = new Hello({ sibling: null });
      const object2 = new Hello({ sibling: null });
      const object3 = new Hello({ sibling: null });
      const map = new Map([
        [ 0x1000n, object1[MEMORY] ],
        [ 0x2000n, object2[MEMORY] ],
        [ 0x3000n, object3[MEMORY] ],
      ]);
      env.obtainFixedView = function(address, len) {
        return map.get(address);
      };
      object1[MEMORY].setBigUint64(0, 0x3000n, true); // obj1 -> obj3
      object2[MEMORY].setBigUint64(0, 0x1000n, true); // obj2 -> obj1
      object3[MEMORY].setBigUint64(0, 0x2000n, true); // obj3 -> obj2
      env.updatePointerTargets(object3);
      expect(object3.sibling['*']).to.equal(object2);
      expect(object2.sibling['*']).to.equal(object1);
      expect(object1.sibling['*']).to.equal(object3);
    })
    it('should acquire missing opaque structures', function() {
      const env = new Environment();
      const opaqueStructure = env.beginStructure({
        type: StructureType.Opaque,
        name: 'Hello',
        hasPointer: false,
      });
      env.finalizeShape(opaqueStructure);
      env.finalizeStructure(opaqueStructure);
      const ptrStructure = env.beginStructure({
        type: StructureType.SinglePointer,
        name: '*Hello',
        byteSize: 8,
        hasPointer: true,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: opaqueStructure,
      });
      env.finalizeShape(ptrStructure);
      env.finalizeStructure(ptrStructure);
      const { constructor: Ptr } = ptrStructure;
      const pointer = new Ptr(undefined);
      const dv = new DataView(new ArrayBuffer(16))
      const map = new Map([
        [ 0x1000n, dv ],
      ]);
      env.obtainFixedView = function(address, len) {
        return map.get(address);
      };
      pointer[MEMORY].setBigUint64(0, 0x1000n, true);
      env.updatePointerTargets(pointer);
      expect(pointer.dataView).to.equal(dv);
    })
  })
})