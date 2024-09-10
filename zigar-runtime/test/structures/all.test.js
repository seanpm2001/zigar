import { expect } from 'chai';
import { MemberFlag, MemberType, StructureFlag, StructureType } from '../../src/constants.js';
import { defineClass } from '../../src/environment.js';
import { ALIGN, MEMORY, SIZE, SLOTS, TYPED_ARRAY } from '../../src/symbols.js';
import { defineProperty } from '../../src/utils.js';

import AccessorAll from '../../src/accessors/all.js';
import Baseline from '../../src/features/baseline.js';
import DataCopying from '../../src/features/data-copying.js';
import IntConversion from '../../src/features/int-conversion.js';
import StructureAcquisition from '../../src/features/structure-acquisition.js';
import ViewManagement from '../../src/features/view-management.js';
import MemberAll from '../../src/members/all.js';
import MemberInt from '../../src/members/int.js';
import MemberObject from '../../src/members/object.js';
import MemberPrimitive from '../../src/members/primitive.js';
import SpecialMethods from '../../src/members/special-methods.js';
import SpecialProps from '../../src/members/special-props.js';
import MemberUint from '../../src/members/uint.js';
import All, {
  isNeededByStructure,
} from '../../src/structures/all.js';
import Enum from '../../src/structures/enum.js';
import Primitive from '../../src/structures/primitive.js';
import StructLike from '../../src/structures/struct-like.js';
import Struct from '../../src/structures/struct.js';

const Env = defineClass('StructureTest', [
  AccessorAll, MemberInt, MemberPrimitive, MemberAll, All, Primitive, DataCopying, SpecialMethods,
  SpecialProps, ViewManagement, StructureAcquisition, StructLike, Struct, MemberUint, MemberObject,
  Enum, IntConversion, Baseline,
]);

describe('Structure: all', function() {
  describe('isNeededByStructure', function() {
    it('should return true', function() {
      expect(isNeededByStructure()).to.be.true;
    })
  })
  describe('defineStructure', function() {
    it('should define a structure for holding an integer', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure: {},
        }
      ];
      const Hello = env.defineStructure(structure);
      expect(Hello).to.be.a('function');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, 0x7FFF_FFFF_FFFF_FFFFn, true);
      const object = Hello(dv);
      expect(object.$).to.equal(0x7FFF_FFFF_FFFF_FFFFn);
      expect(BigInt(object)).to.equal(0x7FFF_FFFF_FFFF_FFFFn);
      expect(String(object)).to.equal(`${0x7FFF_FFFF_FFFF_FFFFn}`);
    })
    it('should add special methods to structure', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure: {},
        }
      ];
      const Hello = env.defineStructure(structure);
      // the special methods relies on the property [TYPE] on the constructor, which is added by
      // finalizeStructure();
      env.finalizeStructure(structure);
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, 12345n, true);
      const object = Hello(dv);
      expect(object.$).to.equal(12345n);
      expect(object.valueOf()).to.equal(12345n);
      expect(JSON.stringify(object)).to.equal(`${12345n}`);
    })
  })
  describe('createConstructor', function() {
    it('should create a constructor for the structure', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure: {},
        }
      ];
      const Hello = env.defineStructure(structure);
      const object = new Hello(77n);
      expect(object.$).to.equal(77n);
      object.$ = 1234n,
      expect(object.$).to.equal(1234n);
    })
  })
  describe('createApplier', function() {
    it('should create property applier for the structure', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure: {},
        }
      ];
      // the applier function depends on the prop [SETTERS] and [KEYS], which are set
      // by defineStructure()
      const Hello = env.defineStructure(structure);
      const object = new Hello(undefined);
      const f = env.createApplier(structure);
      expect(f).to.be.a('function');
      const dv = new DataView(new ArrayBuffer(16), 8);
      dv.setBigInt64(0, 1234n, true);
      const count1 = f.call(object, { dataView: dv });
      expect(count1).to.equal(1);
      expect(object.$).to.equal(1234n);
      const count2 = f.call(object, {});
      expect(count2).to.equal(0);
    })
    it('should throw when an unrecognized prop is encountered', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure: {},
        }
      ];
      // the applier function depends on the prop [SETTERS] and [KEYS], which are set
      // by defineStructure()
      const Hello = env.defineStructure(structure);
      const object = new Hello(undefined);
      const f = env.createApplier(structure);
      expect(() => f.call(object, { cow: 1234 })).to.throw(TypeError)
        .with.property('message').that.contains('cow');
    })
  })
  describe('defineDestructor', function() {
    const env = new Env;
    it('should return descriptor for destructor', function() {
      const env = new Env;
      const descriptor = env.defineDestructor();
      expect(descriptor.value).to.be.a('function');
      const object = defineProperty({
        [MEMORY]: new DataView(new ArrayBuffer(0)),
      }, 'delete', descriptor);
      let target;
      env.releaseFixedView = (dv) => {
        target = dv;
      };
      expect(() => object.delete()).to.not.throw();
      expect(target).to.be.a('DataView');
    })
  })
  describe('finalizeStructure', function() {
    it('should add special properties to constructor', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        align: 4,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure,
        }
      ];
      const Hello = env.defineStructure(structure);
      env.finalizeStructure(structure);
      expect(Hello.name).to.equal('Hello');
      expect(Hello[ALIGN]).to.equal(4);
      expect(Hello[SIZE]).to.equal(8);
    })
    it('should call type-specific finalization method', function() {
      const env = new Env;
      const structure = {
        type: StructureType.Primitive,
        name: 'Hello',
        byteSize: 8,
        align: 4,
        instance: {},
        static: { members: [] },
      };
      structure.instance.members = [
        {
          type: MemberType.Int,
          bitSize: 64,
          bitOffset: 0,
          byteSize: 8,
          structure,
        }
      ];
      const Hello = env.defineStructure(structure);
      env.finalizeStructure(structure);
      // finalizePrimitive() in mixin "structure/primitive" adds property [TYPE_ARRAY]
      expect(Hello[TYPED_ARRAY]).to.equal(BigInt64Array);
    })
    it('should attach variables to a struct', function() {
      // define structure for integer variables
      const env = new Env;
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Int,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const { constructor: Int32 } = intStructure;
      const structure = env.beginStructure({
        type: StructureType.Struct,
        name: 'Hello',
        byteSize: 8 * 2,
      });
      env.attachMember(structure, {
        name: 'dog',
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      env.attachMember(structure, {
        name: 'cat',
        type: MemberType.Uint,
        bitSize: 32,
        bitOffset: 32,
        byteSize: 4,
        structure: intStructure,
      });
      env.attachMember(structure, {
        name: 'superdog',
        type: MemberType.Object,
        bitSize: 64,
        bitOffset: 0,
        byteSize: 8,
        slot: 0,
        structure: intStructure,
      }, true);
      env.attachMember(structure, {
        name: 'supercat',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        bitSize: 64,
        bitOffset: 64,
        byteSize: 8,
        slot: 1,
        structure: intStructure,
      }, true);
      const int1 = new Int32(1234);
      const int2 = new Int32(4567);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: int1,
          1: int2,
        },
      }, true);
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      expect(Hello.superdog).to.equal(1234);
      Hello.superdog = 43;
      expect(Hello.superdog).to.equal(43);
      expect(Hello.supercat).to.equal(4567);
      expect(() => Hello.supercat = 777).to.throw();
      expect(Hello.supercat).to.equal(4567);
      const object = new Hello(undefined);
      expect(object.dog).to.equal(0);
      object.dog = 123;
      expect(object.dog).to.equal(123);
      expect(Hello.superdog).to.equal(43);
      const descriptors = Object.getOwnPropertyDescriptors(Hello);
      expect(descriptors.superdog.set).to.be.a('function');
      expect(descriptors.supercat.set).to.be.undefined;
      const names = [], values = [];
      for (const [ name, value ] of Hello) {
        names.push(name);
        values.push(value);
      }
      expect(names).to.eql([ 'superdog', 'supercat' ]);
      expect(values).to.eql([ 43, 4567 ]);
      expect(Hello.valueOf()).to.eql({ superdog: 43, supercat: 4567 });
      expect(JSON.stringify(Hello)).to.eql('{"superdog":43,"supercat":4567}');
    })
    it('should attach variables to an enum', function() {
      const env = new Env();
      const intStructure = env.beginStructure({
        type: StructureType.Primitive,
        flags: StructureFlag.HasValue,
        name: 'Int32',
        byteSize: 4,
      });
      env.attachMember(intStructure, {
        type: MemberType.Int,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
        structure: intStructure,
      });
      const Int32 = env.defineStructure(intStructure);
      env.endStructure(intStructure);
      const structure = env.beginStructure({
        type: StructureType.Enum,
        flags: StructureFlag.HasValue,
        name: 'Hello'
      });
      env.attachMember(structure, {
        name: 'Dog',
        type: MemberType.Int,
        bitSize: 32,
        byteSize: 4,
        structure: intStructure,
      });
      env.attachMember(structure, {
        name: 'Cat',
        type: MemberType.Int,
        bitSize: 32,
        byteSize: 4,
        structure: intStructure,
      });
      env.attachTemplate(structure, {
        [MEMORY]: (() => {
          const dv = new DataView(new ArrayBuffer(4 * 2));
          dv.setUint32(0, 0, true);
          dv.setUint32(4, 1, true);
          return dv;
        })(),
        [SLOTS]: {},
      });
      env.attachMember(structure, {
        name: 'superdog',
        type: MemberType.Object,
        slot: 0,
        structure: intStructure,
      }, true);
      env.attachMember(structure, {
        name: 'supercat',
        type: MemberType.Object,
        slot: 1,
        structure: intStructure,
      }, true);
      const int1 = new Int32(1234);
      const int2 = new Int32(4567);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: int1,
          1: int2,
        },
      }, true);
      const Hello = env.defineStructure(structure);
      env.endStructure(structure);
      expect(Hello.superdog).to.equal(1234);
      Hello.superdog = 43;
      expect(Hello.superdog).to.equal(43);
      expect(Hello.supercat).to.equal(4567);
      // make sure the variables aren't overwriting the enum slots
      expect(Hello(0)).to.equal(Hello.Dog);
      expect(Hello(1)).to.equal(Hello.Cat);
    })
  })
  describe('getTypedArray', function() {
    it('should return typed array constructor for integer primitive', function() {
      let index = 0;
      const types = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        BigInt64Array,
        BigUint64Array,
      ];
      const env = new Env;
      for (const byteSize of [ 1, 2, 4, 8 ]) {
        for (const type of [ MemberType.Int, MemberType.Uint ]) {
          const structure = {
            type: StructureType.Primitive,
            instance: {
              members: [
                {
                  type,
                  bitSize: byteSize * 8,
                  byteSize,
                }
              ]
            }
          };
          const f = env.getTypedArray(structure);
          expect(f).to.be.a('function');
          expect(f).to.equal(types[index++]);
        }
      }
    })
    it('should return a typed array constructor for non-standard integer', function() {
      const structure = {
        type: StructureType.Primitive,
        instance: {
          members: [
            {
              type: MemberType.Uint,
              bitSize: 36,
              byteSize: 8,
            }
          ]
        }
      };
      const env = new Env;
      const f = env.getTypedArray(structure);
      expect(f).to.equal(BigUint64Array);
    })
    it('should return typed array constructor for floating point', function() {
      let index = 0;
      const types = [
        undefined,
        Float32Array,
        Float64Array,
        undefined,
      ];
      const env = new Env;
      for (const byteSize of [ 2, 4, 8, 16 ]) {
        const structure = {
          type: StructureType.Primitive,
          instance: {
            members: [
              {
                type: MemberType.Float,
                bitSize: byteSize * 8,
                byteSize,
              }
            ]
          }
        };
        const f = env.getTypedArray(structure);
        expect(f).to.equal(types[index++]);
      }
    })
    it('should return type array constructor of child elements', function() {
      const structure = {
        type: StructureType.Array,
        instance: {
          members: [
            {
              type: MemberType.Object,
              bitSize: 32 * 4,
              byteSize: 4 * 4,
              structure: {
                type: StructureType.Primitive,
                instance: {
                  members: [
                    {
                      type: MemberType.Float,
                      bitSize: 32,
                      byteSize: 4,
                    }
                  ]
                }
              }
            }
          ]
        }
      };
      const env = new Env;
      const f = env.getTypedArray(structure);
      expect(f).to.equal(Float32Array);
    })
  })
})
