import { expect } from 'chai';

import { StructureType, MemberType } from '../src/type.js';
import { MEMORY, SLOTS } from '../src/symbol.js';
import {
  obtainOptionalGetter,
  obtainOptionalSetter,
} from '../src/optional.js';

describe('Optional functions', function() {
  describe('obtainOptionalGetter', function() {
    it('should return a function for getting optional float', function() {
      const members = [
        {
          type: MemberType.Float,
          bitOffset: 0,
          bitSize: 64,
          byteSize: 8,
        },
        {
          type: MemberType.Bool,
          isSigned: false,
          bitOffset: 64,
          bitSize: 1,
          byteSize: 1,
        },
      ];
      const dv = new DataView(new ArrayBuffer(10));
      dv.setFloat64(0, 3.14, true);
      dv.setUint8(8, 1, true);
      const object = {
        [MEMORY]: dv,
      };
      const f = obtainOptionalGetter(members, {});
      const result1 = f.call(object);
      expect(result1).to.equal(3.14);
      dv.setUint8(8, 0, true);
      const result2 = f.call(object);
      expect(result2).to.be.null;
    })
    it('should return a function for getting optional object value', function() {
      const DummyClass = function() {};
      const members = [
        {
          type: MemberType.Object,
          bitOffset: 0,
          bitSize: 64,
          byteSize: 8,
          slot: 0,
          structure: {
            type: StructureType.Struct,
            constructor: DummyClass,
          }
        },
        {
          type: MemberType.Bool,
          bitOffset: 64,
          bitSize: 1,
          byteSize: 1,
        },
      ];
      const dv = new DataView(new ArrayBuffer(10));
      const object = {
        [MEMORY]: dv,
        [SLOTS]: { 0: null },
      };
      const dummyObject = new DummyClass();
      const f = obtainOptionalGetter(members, {});
      const result1 = f.call(object);
      expect(result1).to.equal(null);
      dv.setUint8(8, 1, true);
      object[SLOTS][0] = dummyObject;
      const result2 = f.call(object);
      expect(result2).to.equal(dummyObject);
    })
  })
  describe('obtainOptionalSetter', function() {
    it('should return a function for setting int or error', function() {
      const members = [
        {
          type: MemberType.Float,
          bitOffset: 0,
          bitSize: 64,
          byteSize: 8,
        },
        {
          type: MemberType.Bool,
          isSigned: false,
          bitOffset: 64,
          bitSize: 1,
          byteSize: 1,
        },
      ];
      const dv = new DataView(new ArrayBuffer(10));
      dv.setFloat64(0, 3.14, true);
      const object = {
        [MEMORY]: dv,
      };
      const f = obtainOptionalSetter(members, {});
      f.call(object, null);
      expect(dv.getUint8(8, true)).to.equal(0);
      expect(dv.getFloat64(0, true)).to.equal(0);
      f.call(object, 1234.5678);
      expect(dv.getUint8(8, true)).to.equal(1);
      expect(dv.getFloat64(0, true)).to.equal(1234.5678);
    })
    it('should return a function for setting object or error', function() {
      const DummyClass = function(value) {
        this.value = value;
      };
      const members = [
        {
          type: MemberType.Object,
          bitOffset: 0,
          bitSize: 64,
          byteSize: 8,
          slot: 0,
          structure: {
            type: StructureType.Struct,
            constructor: DummyClass,
            copier: (dest, src) => {
              dest.value = src.value;
            },
            resetter: (dest) => {
              dest.value = 0;
            },
          }
        },
        {
          type: MemberType.Bool,
          bitOffset: 64,
          bitSize: 1,
          byteSize: 1,
        },
      ];
      const dummyObject = new DummyClass(123);
      const dv = new DataView(new ArrayBuffer(10));
      const object = {
        [MEMORY]: dv,
        [SLOTS]: { 0: dummyObject },
      };
      const f = obtainOptionalSetter(members, {});
      f.call(object, null);
      expect(dv.getUint8(8, true)).to.equal(0);
      // TODO: implement resetter
      //expect(object[SLOTS][0].value).to.equal(0);
      f.call(object, 456);
      expect(dv.getUint8(8, true)).to.equal(1);
      expect(object[SLOTS][0].value).to.equal(456);
    })
  })
})