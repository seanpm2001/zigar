import { expect } from 'chai';
import { defineClass } from '../../../src/environment/class.js';
import { MEMORY } from '../../../src/symbol.js';

import AccessorAll from '../../../src/environment/accessors/all.js';
import MemberAll, { MemberType } from '../../../src/environment/members/all.js';
import MemberInt from '../../../src/environment/members/int.js';
import MemberPrimitive from '../../../src/environment/members/primitive.js';
import All, {
  isNeededByStructure,
  StructureType,
} from '../../../src/environment/structures/all.js';
import Primitive from '../../../src/environment/structures/primitive.js';

const Env = defineClass('StructureTest', [ AccessorAll, MemberInt, MemberPrimitive, MemberAll, All, Primitive ]);

describe('Structure: all', function() {
  describe('isNeededByStructure', function() {
    it('should return true', function() {
      expect(isNeededByStructure()).to.be.true;
    })
  })
  describe('defineStructure', function() {
    it('should define a structure for holding a integer', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        instance: {
          members: [
            {
              type: MemberType.Int,
              bitSize: 64,
              bitOffset: 0,
              byteSize: 8,
            }
          ],
        },
      };
      const Hello = env.defineStructure(structure);
      expect(Hello).to.be.a('function');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, 0x7FFFFFFFFFFFFFFFn, true);
      const object = Hello(dv);
      expect(object.$).to.equal(0x7FFFFFFFFFFFFFFFn);
      expect(object.valueOf()).to.equal(0x7FFFFFFFFFFFFFFFn);
      expect(BigInt(object)).to.equal(0x7FFFFFFFFFFFFFFFn);
      object.$ = BigInt(Number.MAX_SAFE_INTEGER);
      expect(JSON.stringify(object)).to.equal(`${Number.MAX_SAFE_INTEGER}`);
      object.$ = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
      expect(() => JSON.stringify(object)).to.throw(TypeError);
      object.$ = BigInt(Number.MIN_SAFE_INTEGER);
      expect(JSON.stringify(object)).to.equal(`${Number.MIN_SAFE_INTEGER}`);
      object.$ = BigInt(Number.MIN_SAFE_INTEGER) - 1n;
      expect(() => JSON.stringify(object)).to.throw(TypeError);
    })
  })
  describe('attachDescriptors', function() {
    it('should attach descriptors to a constructor', function() {
    })
  })
  describe('createConstructor', function() {
    it('should return define a primitive', function() {
    })
  })
  describe('createDestructor', function() {
    it('should return define a primitive', function() {
    })
  })
  describe('createPropertyApplier', function() {
    it('should return define a primitive', function() {
    })
  })
  describe('createDestructor', function() {
    it('should return define a primitive', function() {
    })
  })
  describe('extractView', function() {
    it('should return a DataView when given an ArrayBuffer', function() {
      const structure = {
        type: StructureType.Array,
        name: 'Test',
        byteSize: 8
      };
      const arg = new ArrayBuffer(8);
      const env = new Env();
      const dv = env.extractView(structure, arg);
      expect(dv).to.be.instanceOf(DataView);
    })
    it('should return a DataView when given an SharedArrayBuffer', function() {
      const structure = {
        type: StructureType.Array,
        name: 'Test',
        byteSize: 8
      };
      const arg = new SharedArrayBuffer(8);
      const env = new Env();
      const dv = env.extractView(structure, arg);
      expect(dv).to.be.instanceOf(DataView);
    })
    it('should return a DataView when given an DataView', function() {
      const structure = {
        type: StructureType.Array,
        name: 'Test',
        byteSize: 8
      };
      const arg = new DataView(new ArrayBuffer(8));
      const env = new Env();
      const dv = env.extractView(structure, arg);
      expect(dv).to.be.instanceOf(DataView);
    })
    it('should return a DataView when given an DataView with length that is multiple of given size', function() {
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 8
      };
      const arg = new DataView(new ArrayBuffer(64));
      const env = new Env();
      const dv = env.extractView(structure, arg);
      expect(dv).to.be.instanceOf(DataView);
    })
    it('should return a DataView when given an empty DataView', function() {
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 8
      };
      const arg = new DataView(new ArrayBuffer(0));
      const env = new Env();
      const dv = env.extractView(structure, arg);
      expect(dv).to.be.instanceOf(DataView);
    })
    it('should throw when argument is not a data view or buffer', function() {
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 8
      };
      const arg = {};
      const env = new Env();
      expect(() => env.extractView(structure, arg)).to.throw(TypeError)
        .with.property('message').that.contains('8');
    })
    it('should return undefined when argument is not a data view or buffer and required is false', function() {
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 8
      };
      const arg = {};
      const env = new Env();
      const dv = env.extractView(structure, arg, false);
      expect(dv).to.be.undefined;
    })
    it('should throw when there is a size mismatch', function() {
      const structure1 = {
        type: StructureType.Array,
        name: 'Test',
        byteSize: 17
      };
      const structure2 = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 3
      };
      const env = new Env();
      const arg = new DataView(new ArrayBuffer(8));
      expect(() => env.extractView(structure1, arg)).to.throw(TypeError)
        .with.property('message').that.contains('17');
      expect(() => env.extractView(structure2, arg)).to.throw(TypeError)
        .with.property('message').that.contains('3');
    })
    it('should accept compatible TypedArray', function() {
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 3,
        typedArray: Uint32Array
      };
      const env = new Env();
      const ta1 = new Uint32Array([ 1, 2, 3 ]);
      const ta2 = new Int32Array([ 1, 2, 3 ]);
      const dv1 = env.extractView(structure, ta1, false);
      const dv2 = env.extractView(structure, ta2, false);
      expect(dv1).to.be.an.instanceOf(DataView);
      expect(dv2).to.be.undefined;
    })
    it('should return memory of compatible array', function() {
      const elementConstructor = function() {};
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 2,
        instance: {
          members: [
            {
              type: MemberType.Object,
              bitOffset: 0,
              byteSize: 2,
              structure: { constructor: elementConstructor }
            }
          ]
        },
        constructor: function() {},
      };
      const arrayConstructor = function() {};
      arrayConstructor.child = elementConstructor;
      const array = new arrayConstructor();
      array[MEMORY] = new DataView(new ArrayBuffer(6));
      array.length = 3;
      const env = new Env();
      const dv = env.extractView(structure, array);
      expect(dv).to.be.an.instanceOf(DataView);
    })
    it('should return memory of compatible slice', function() {
      const elementConstructor = function() {};
      const structure = {
        type: StructureType.Array,
        name: 'Test',
        byteSize: 6,
        length: 3,
        instance: {
          members: [
            {
              type: MemberType.Object,
              bitOffset: 0,
              byteSize: 2,
              structure: { constructor: elementConstructor }
            }
          ]
        },
        constructor: function() {},
      };
      const arrayConstructor = function() {};
      arrayConstructor.child = elementConstructor;
      const array = new arrayConstructor();
      array[MEMORY] = new DataView(new ArrayBuffer(6));
      array.length = 3;
      const env = new Env();
      const dv = env.extractView(structure, array);
      expect(dv).to.equal(array[MEMORY]);
    })
    it('should fail when slice length does not match size of array', function() {
      const elementConstructor = function() {};
      const structure = {
        type: StructureType.Array,
        name: 'Test',
        byteSize: 6,
        length: 3,
        instance: {
          members: [
            {
              type: MemberType.Object,
              bitOffset: 0,
              byteSize: 2,
              structure: { constructor: elementConstructor }
            }
          ]
        },
        constructor: function() {},
      };
      const arrayConstructor = function() {};
      arrayConstructor.child = elementConstructor;
      const array = new arrayConstructor();
      array[MEMORY] = new DataView(new ArrayBuffer(8));
      array.length = 4;
      const env = new Env();
      expect(() => dv = env.extractView(structure, array)).to.throw(TypeError);
    })
    it('should return memory of compatible object', function() {
      const elementConstructor = function() {};
      const structure = {
        type: StructureType.Slice,
        name: 'Test',
        byteSize: 2,
        instance: {
          members: [
            {
              type: MemberType.Object,
              bitOffset: 0,
              byteSize: 2,
              structure: { constructor: elementConstructor }
            }
          ]
        },
        constructor: function() {},
      };
      const object = new elementConstructor();
      object[MEMORY] = new DataView(new ArrayBuffer(2));
      const env = new Env();
      const dv = env.extractView(structure, object);
      expect(dv).to.equal(object[MEMORY]);
    })
  })
  describe('obtainView', function() {
    it('should obtain the same view object for the same offset and length', function() {
      const env = new Env();
      const buffer = new ArrayBuffer(48);
      const dv1 = env.obtainView(buffer, 4, 8);
      expect(dv1.byteOffset).to.equal(4);
      expect(dv1.byteLength).to.equal(8);
      const dv2 = env.obtainView(buffer, 4, 8);
      expect(dv2).to.equal(dv1);
    })
    it('should be able to keep track of multiple views', function() {
      const env = new Env();
      const buffer = new ArrayBuffer(48);
      const dv1 = env.obtainView(buffer, 4, 8);
      expect(dv1.byteOffset).to.equal(4);
      const dv2 = env.obtainView(buffer, 8, 16);
      expect(dv2.byteOffset).to.equal(8);
      const dv3 = env.obtainView(buffer, 8, 16);
      expect(dv3).to.equal(dv2);
      const dv4 = env.obtainView(buffer, 4, 8);
      expect(dv4).to.equal(dv1);
    })
  })
})

