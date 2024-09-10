import { expect } from 'chai';
import { MemberFlag, MemberType, StructureFlag, StructureType } from '../../src/constants.js';
import { defineClass } from '../../src/environment.js';
import { INITIALIZE, MEMORY, SLOTS } from '../../src/symbols.js';

import AccessorAll from '../../src/accessors/all.js';
import AccessorBool from '../../src/accessors/bool.js';
import AccessorFloat128 from '../../src/accessors/float128.js';
import AccessorJumboInt from '../../src/accessors/jumbo-int.js';
import AccessorJumbo from '../../src/accessors/jumbo.js';
import Baseline from '../../src/features/baseline.js';
import DataCopying from '../../src/features/data-copying.js';
import IntConversion from '../../src/features/int-conversion.js';
import StructureAcquisition from '../../src/features/structure-acquisition.js';
import ViewManagement from '../../src/features/view-management.js';
import MemberAll from '../../src/members/all.js';
import MemberBool from '../../src/members/bool.js';
import MemberFloat from '../../src/members/float.js';
import MemberInt from '../../src/members/int.js';
import MemberObject from '../../src/members/object.js';
import PointerInArray from '../../src/members/pointer-in-array.js';
import PointerInStruct from '../../src/members/pointer-in-struct.js';
import MemberPrimitive from '../../src/members/primitive.js';
import SpecialMethods from '../../src/members/special-methods.js';
import SpecialProps from '../../src/members/special-props.js';
import MemberTypeMixin from '../../src/members/type.js';
import MemberUint from '../../src/members/uint.js';
import MemberVoid from '../../src/members/void.js';
import All from '../../src/structures/all.js';
import ArrayLike from '../../src/structures/array-like.js';
import Array from '../../src/structures/array.js';
import Optional, {
  isNeededByStructure,
} from '../../src/structures/optional.js';
import Pointer from '../../src/structures/pointer.js';
import Primitive from '../../src/structures/primitive.js';
import Slice from '../../src/structures/slice.js';
import StructLike from '../../src/structures/struct-like.js';
import Struct from '../../src/structures/struct.js';

const Env = defineClass('OptionalTest', [
  AccessorAll, MemberInt, MemberPrimitive, MemberAll, All, Primitive, DataCopying, SpecialMethods,
  SpecialProps, StructureAcquisition, ViewManagement, MemberTypeMixin, AccessorJumbo,
  AccessorJumboInt, Optional, AccessorBool, AccessorFloat128, MemberBool, MemberFloat,
  MemberObject, Struct, StructLike, MemberUint, MemberVoid, IntConversion, Pointer,
  PointerInStruct, Slice, ArrayLike, Array, PointerInArray, Baseline,
]);

describe('Structure: optional', function() {
  describe('isNeededByStructure', function() {
    it('should return true when mixin is needed by a structure', function() {
      const structure = {
        type: StructureType.Optional
      };
      expect(isNeededByStructure(structure)).to.be.true;
    })
    it('should return false when mixin is needed by a structure', function() {
      const structure = {
        type: StructureType.Struct
      };
      expect(isNeededByStructure(structure)).to.be.false;
    })
  })
  describe('defineOptional', function() {
    it('should return a function', function() {
      const structure = {
        type: StructureType.Optional,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
        flags: StructureFlag.HasSelector,
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 32,
          bitOffset: 0,
          byteSize: 4,
          structure: {},
        },
        {
          type: MemberType.Bool,
          bitSize: 1,
          bitOffset: 32,
          byteSize: 1,
          flags: MemberFlag.IsSelector,
          structure: {},
        },
      ];
      const env = new Env();
      const descriptors = {};
      const constructor = env.defineOptional(structure, descriptors);
      expect(constructor).to.be.a('function');
    })
    it('should add descriptors to the given object', function() {
      const structure = {
        type: StructureType.Optional,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 32,
          bitOffset: 0,
          byteSize: 4,
          structure: {},
        },
        {
          type: MemberType.Bool,
          bitSize: 1,
          bitOffset: 32,
          byteSize: 1,
          flags: MemberFlag.IsSelector,
          structure: {},
        },
      ];
      const env = new Env();
      const descriptors = {};
      env.defineOptional(structure, descriptors);
      expect(descriptors.$?.get).to.be.a('function');
      expect(descriptors.$?.set).to.be.a('function');
      expect(descriptors[INITIALIZE]?.value).to.be.a('function');
    })
  })
  describe('defineStructure', function() {
    it('should define a structure for storing an optional value', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Float,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        structure: {
          type: StructureType.Primitive,
        }
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        flags: MemberFlag.IsSelector,
        structure: {},
      });
      env.defineStructure(structure);
      env.endStructure(structure);
      const { constructor: Hello } = structure;
      const object = Hello(new ArrayBuffer(18));
      expect(object.$).to.equal(null);
      object.$ = 3.14;
      expect(object.$).to.equal(3.14);
      expect(object.valueOf()).to.equal(3.14);
      object.$ = null;
      expect(object.$).to.equal(null);
      expect(object.valueOf()).to.equal(null);
    })
    it('should cast the same buffer to the same object', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Float,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        structure: {
          type: StructureType.Primitive,
        }
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        flags: MemberFlag.IsSelector,
        structure: {},
      });
      env.defineStructure(structure);
      env.endStructure(structure);
      const { constructor: Hello } = structure;
      const buffer = new ArrayBuffer(18);
      const object1 = Hello(buffer);
      const object2 = Hello(buffer);
      expect(object2).to.equal(object1);
    })
    it('should throw when no initializer is provided', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Float,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        structure: {
          type: StructureType.Primitive,
        }
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        flags: MemberFlag.IsSelector,
        structure: {},
      });
      env.defineStructure(structure);
      env.endStructure(structure);
      const { constructor: Hello } = structure;
      expect(() => new Hello).to.throw(TypeError);
    })
    it('should initialize an optional value based on argument given', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Float,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        structure: {
          type: StructureType.Primitive,
        }
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        flags: MemberFlag.IsSelector,
        structure: {},
      });
      env.defineStructure(structure);
      env.endStructure(structure);
      const { constructor: Hello } = structure;
      const object = new Hello(null);
      expect(object.$).to.equal(null);
      object.$ = 3.14;
      expect(object.$).to.equal(3.14);
    })
    it('should initialize an optional value from object of same type', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Float,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        structure: {
          type: StructureType.Primitive,
        }
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        flags: MemberFlag.IsSelector,
        structure: {},
      });
      env.defineStructure(structure);
      env.endStructure(structure);
      const { constructor: Hello } = structure;
      const object = new Hello({});
      object.$ = 3.14;
      const object2 = new Hello(object);
      expect(object2.$).to.equal(3.14);
    })
    it('should define a structure for storing an optional struct', function() {
      const env = new Env();
      const structStructure = env.beginStructure({
        type: StructureType.Struct,
        name: 'Animal',
        byteSize: 8,
      });
      env.attachMember(structStructure, {
        name: 'dog',
        type: MemberType.Int,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: {},
      });
      env.attachMember(structStructure, {
        name: 'cat',
        type: MemberType.Int,
        bitSize: 32,
        bitOffset: 32,
        byteSize: 4,
        structure: {},
      });
      env.defineStructure(structStructure);
      env.endStructure(structStructure);
      const { constructor: Animal } = structStructure;
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue | StructureFlag.HasSlot | StructureFlag.HasObject,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: structStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        flags: MemberFlag.IsSelector,
        structure: {},
      });
      env.defineStructure(structure);
      env.endStructure(structure);
      const { constructor: Hello } = structure;
      const object = Hello(new ArrayBuffer(18));
      expect(object.$).to.equal(null);
      object.$ = { dog: 1, cat: 2 };
      expect(object.$).to.be.instanceOf(Animal);
      object.$ = null;
      expect(object.valueOf()).to.equal(null);
      expect(object.$).to.equal(null);
      object.$ = new Hello({ dog: 3, cat: 3 });
      expect(object.valueOf()).to.eql({ dog: 3, cat: 3 });
    })
    it('should do nothing when undefined is assigned to it', function() {
      const env = new Env();
      const floatStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'Int32',
        byteSize: 16,
      });
      env.attachMember(floatStructure, {
        type: MemberType.Float,
        bitSize: 128,
        bitOffset: 0,
        byteSize: 16,
        structure: floatStructure,
      });
      env.defineStructure(floatStructure);
      env.endStructure(floatStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 18,
      });
      env.attachMember(structure, {
        type: MemberType.Float,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        structure: floatStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberFlag.IsSelector,
        bitOffset: 128,
        bitSize: 1,
        byteSize: 1,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const object = new Hello(3.14);
      expect(object.$).to.equal(3.14);
      object.$ = undefined;
      expect(object.$).to.equal(3.14);
    })
    it('should work correctly when value is void', function() {
      const env = new Env();
      const voidStructure = env.beginStructure({
        type: StructureType.Primitive,
        name: 'Int32',
        byteSize: 0,
      });
      env.attachMember(voidStructure, {
        type: MemberType.Void,
        bitSize: 0,
        bitOffset: 0,
        byteSize: 0,
        structure: voidStructure,
      });
      env.defineStructure(voidStructure);
      env.endStructure(voidStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 1,
      });
      env.attachMember(structure, {
        type: MemberType.Void,
        bitOffset: 0,
        bitSize: 0,
        byteSize: 0,
        structure: voidStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberFlag.IsSelector,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 1,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const object = Hello(new ArrayBuffer(1));
      expect(object.$).to.equal(null);
      object.$ = undefined;
      expect(object.$).to.equal(undefined);
      expect(object.valueOf()).to.equal(undefined);
      object.$ = null;
      expect(object.$).to.equal(null);
      expect(object.valueOf()).to.equal(null);
    })
    it('should define a structure for storing an optional pointer', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      const Int32 = env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const ptrStructure = env.beginStructure({
        type: StructureType.Pointer,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.IsSingle,
        name: '*Int32',
        byteSize: 8,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.defineStructure(ptrStructure);
      env.endStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 8,
      });
      env.attachMember(structure, {
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 64,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberFlag.IsSelector,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const object = Hello(new ArrayBuffer(8));
      expect(object.$).to.equal(null);
      object.$ = new Int32(0);
      object.$['*'] = 5;
      expect(object.$['*']).to.equal(5);
    })
    it('should define a structure for storing an optional slice', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const sliceStructure = env.beginStructure({
        type: StructureType.Slice,
        flags: StructureFlag.IsString,
        name: '[_]Uint8',
        byteSize: 1,
      })
      env.attachMember(sliceStructure, {
        type: MemberType.Uint,
        bitSize: 8,
        byteSize: 1,
        structure: intStructure,
      });
      env.defineStructure(sliceStructure);
      env.endStructure(sliceStructure);
      const ptrStructure = env.beginStructure({
        type: StructureType.Pointer,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.IsMultiple | StructureFlag.HasLength,
        name: '[]Uint8',
        byteSize: 16,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 128,
        bitOffset: 0,
        byteSize: 16,
        slot: 0,
        structure: sliceStructure,
      });
      env.defineStructure(ptrStructure);
      env.endStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 16,
      });
      env.attachMember(structure, {
        name: 'value',
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
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
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const encoder = new TextEncoder();
      const array = encoder.encode('This is a test');
      const object = new Hello(array);
      debugger;
      expect(object.$.string).to.equal('This is a test');
      expect(object.$.typedArray).to.eql(array);
      object.valueOf();
      expect(JSON.stringify(object)).to.eql(JSON.stringify([ ...array ]));
      const object2 = new Hello(null);
      expect(object2.$).to.be.null;
    })
    it('should copy pointers where initialized from an optional of the same type', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const sliceStructure = env.beginStructure({
        type: StructureType.Slice,
        flags: StructureFlag.IsString,
        name: '[_]Uint8',
        byteSize: 1,
      })
      env.attachMember(sliceStructure, {
        type: MemberType.Uint,
        bitSize: 8,
        byteSize: 1,
        structure: intStructure,
      });
      env.defineStructure(sliceStructure);
      env.endStructure(sliceStructure);
      const ptrStructure = env.beginStructure({
        type: StructureType.Pointer,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasLength | StructureFlag.IsMultiple,
        name: '[]Uint8',
        byteSize: 16,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 128,
        bitOffset: 0,
        byteSize: 16,
        slot: 0,
        structure: sliceStructure,
      });
      env.defineStructure(ptrStructure);
      env.endStructure(ptrStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: 16,
      });
      env.attachMember(structure, {
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: 128,
        byteSize: 16,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberFlag.IsSelector,
        bitOffset: 0,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const encoder = new TextEncoder();
      const array = encoder.encode('This is a test');
      const object = new Hello(array);
      expect(object.$.string).to.equal('This is a test');
      const object2 = new Hello(object);
      expect(object2.$.string).to.equal('This is a test');
    })
    it('should release pointers in struct when it is set to null', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      const Int32 = env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const ptrStructure = env.beginStructure({
        type: StructureType.Pointer,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureType.IsSingle,
        name: '*Int32',
        byteSize: 8,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      const Int32Ptr = env.defineStructure(ptrStructure);
      env.endStructure(ptrStructure);
      const structStructure = env.beginStructure({
        type: StructureType.Struct,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot,
        name: 'Hello',
        byteSize: 8 * 2,
      });
      env.attachMember(structStructure, {
        name: 'dog',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structStructure, {
        name: 'cat',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 64,
        byteSize: 8,
        slot: 1,
        structure: ptrStructure,
      })
      const int1 = new Int32(1234);
      const int2 = new Int32(4567);
      const intPtr1 = new Int32Ptr(int1);
      const intPtr2 = new Int32Ptr(int2);
      env.attachTemplate(structStructure, {
        [MEMORY]: (() => {
          const dv = new DataView(new ArrayBuffer(8 * 2));
          dv.setBigUint64(0, 0xaaaaaaaaaaaaaaaan, true);
          dv.setBigUint64(8, 0xaaaaaaaaaaaaaaaan, true);
          return dv;
        })(),
        [SLOTS]: {
          0: intPtr1,
          1: intPtr2,
        }
      });
      env.defineStructure(structStructure);
      env.endStructure(structStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: structStructure.byteSize + 32,
      });
      env.attachMember(structure, {
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: structStructure.byteSize * 8,
        byteSize: structStructure.byteSize,
        slot: 0,
        structure: structStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberFlag.IsSelector,
        bitOffset: structStructure.byteSize * 8,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const object = new Hello({});
      const ptr = object.$.cat;
      expect(ptr[SLOTS][0]).to.not.be.undefined;
      object.$ = null;
      expect(ptr[SLOTS][0]).to.be.undefined;
      object[VISIT](function({ isActive }) {
        expect(isActive(this)).to.be.false;
      });
    })
    it('should release pointers in struct when it is set to null externally', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const ptrStructure = env.beginStructure({
        type: StructureType.Pointer,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureType.IsSingle,
        name: '*Int32',
        byteSize: 8,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.defineStructure(ptrStructure);
      env.endStructure(ptrStructure);
      const { constructor: Int32Ptr } = ptrStructure;
      const structStructure = env.beginStructure({
        type: StructureType.Struct,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot,
        name: 'Hello',
        byteSize: 8 * 2,
      });
      env.attachMember(structStructure, {
        name: 'dog',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: ptrStructure,
      });
      env.attachMember(structStructure, {
        name: 'cat',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 64,
        byteSize: 8,
        slot: 1,
        structure: ptrStructure,
      })
      const int1 = new Int32(1234);
      const int2 = new Int32(4567);
      const intPtr1 = new Int32Ptr(int1);
      const intPtr2 = new Int32Ptr(int2);
      env.attachTemplate(structStructure, {
        [MEMORY]: (() => {
          const dv = new DataView(new ArrayBuffer(8 * 2));
          dv.setBigUint64(0, 0xaaaaaaaaaaaaaaaan, true);
          dv.setBigUint64(8, 0xaaaaaaaaaaaaaaaan, true);
          return dv;
        })(),
        [SLOTS]: {
          0: intPtr1,
          1: intPtr2,
        }
      });
      env.defineStructure(structStructure);
      env.endStructure(structStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: structStructure.byteSize + 4,
      });
      env.attachMember(structure, {
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: structStructure.byteSize * 8,
        byteSize: structStructure.byteSize,
        slot: 0,
        structure: structStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberType.IsSelector,
        bitOffset: structStructure.byteSize * 8,
        bitSize: 1,
        byteSize: 1,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const object = new Hello({});
      const ptr = object.$.cat;
      expect(ptr[SLOTS][0]).to.not.be.undefined;
      object[MEMORY].setUint8(structStructure.byteSize, 0);
      expect(object.$).to.be.null;
      expect(ptr[SLOTS][0]).to.be.undefined;
    })
    it('should release pointers in array when it is set to null', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      const Int32 = env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const ptrStructure = env.beginStructure({
        type: StructureType.Pointer,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.IsSingle,
        name: '*Int32',
        byteSize: 8,
      });
      env.attachMember(ptrStructure, {
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      });
      env.defineStructure(ptrStructure);
      env.endStructure(ptrStructure);
      const arrayStructure = env.beginStructure({
        type: StructureType.Array,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot,
        name: 'Hello',
        length: 4,
        byteSize: 8 * 4,
      });
      env.attachMember(arrayStructure, {
        type: MemberType.Object,
        bitSize: 64,
        byteSize: 8,
        structure: ptrStructure,
      });
      env.defineStructure(arrayStructure);
      env.endStructure(arrayStructure);
      const structure = env.beginStructure({
        type: StructureType.Optional,
        flags: StructureFlag.HasPointer | StructureFlag.HasObject | StructureFlag.HasSlot | StructureFlag.HasSelector | StructureFlag.HasValue,
        name: 'Hello',
        byteSize: arrayStructure.byteSize + 32,
      });
      env.attachMember(structure, {
        type: MemberType.Object,
        bitOffset: 0,
        bitSize: arrayStructure.byteSize * 8,
        byteSize: arrayStructure.byteSize,
        slot: 0,
        structure: arrayStructure,
      });
      env.attachMember(structure, {
        type: MemberType.Bool,
        flags: MemberFlag.IsSelector,
        bitOffset: arrayStructure.byteSize * 8,
        bitSize: 1,
        byteSize: 8,
        structure: {},
      });
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      const object = new Hello([ new Int32(1234), new Int32(4567), new Int32(7890), new Int32(12345) ]);
      const array = object.$;
      for (let i = 0; i < 4; i++) {
        expect(array[SLOTS][i][SLOTS][0]).to.not.be.undefined;
      }
      object.$ = null;
      for (let i = 0; i < 4; i++) {
        expect(array[SLOTS][i][SLOTS][0]).to.be.undefined;
      }
    })
  })
})