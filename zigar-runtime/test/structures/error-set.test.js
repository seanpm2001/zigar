import { expect } from 'chai';
import { defineClass } from '../../src/environment.js';

import AccessorAll from '../../src/accessors/all.js';
import { MemberFlag, MemberType, StructureType } from '../../src/constants.js';
import DataCopying from '../../src/features/data-copying.js';
import StructureAcquisition from '../../src/features/structure-acquisition.js';
import ViewManagement from '../../src/features/view-management.js';
import MemberAll from '../../src/members/all.js';
import MemberObject from '../../src/members/object.js';
import MemberPrimitive from '../../src/members/primitive.js';
import SpecialMethods from '../../src/members/special-methods.js';
import SpecialProps from '../../src/members/special-props.js';
import MemberTyp from '../../src/members/type.js';
import MemberUint from '../../src/members/uint.js';
import All from '../../src/structures/all.js';
import ErrorSet, {
  isNeededByStructure,
} from '../../src/structures/error-set.js';
import Primitive from '../../src/structures/primitive.js';
import { CAST, ENVIRONMENT, INITIALIZE, MEMORY, SLOTS } from '../../src/symbols.js';

const Env = defineClass('ErrorSetTest', [
  AccessorAll, MemberUint, MemberPrimitive, MemberAll, All, Primitive, DataCopying,  SpecialMethods,
  SpecialProps, StructureAcquisition, ViewManagement, MemberTyp,  ErrorSet, MemberObject
]);

describe('Structure: error-set', function() {
  describe('isNeededByStructure', function() {
    it('should return true when mixin is needed by a structure', function() {
      const structure = {
        type: StructureType.ErrorSet,
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
  describe('defineErrorSet', function() {
    it('should return a function', function() {
      const structure = {
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
        instance: {},
        static: {
          members: [],
          template: {
            [SLOTS]: {},
          }
        },
      };
      structure.instance.members = [
        {
          type: MemberType.Uint,
          bitSize: 16,
          bitOffset: 0,
          byteSize: 1,
          structure,
        },
      ];
      const env = new Env();
      const descriptors = {};
      const constructor = env.defineErrorSet(structure, descriptors);
      expect(constructor).to.be.a('function');
    })
    it('should add descriptors to the given object', function() {
      const structure = {
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
        instance: {},
        static: {
          members: [],
          template: {
            [SLOTS]: {},
          }
        },
      };
      structure.instance.members = [
        {
          type: MemberType.Uint,
          bitSize: 16,
          bitOffset: 0,
          byteSize: 2,
          structure,
        },
      ];
      const env = new Env();
      const descriptors = {};
      env.defineErrorSet(structure, descriptors);
      expect(descriptors.$?.get).to.be.a('function');
      expect(descriptors.$?.set).to.be.a('function');
      expect(descriptors[INITIALIZE]?.value).to.be.a('function');
    })
  })
  describe('finalizeErrorSet', function() {
    it('should add static descriptors to the given object', function() {
      const structure = {
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
        instance: {},
        static: {
          members: [],
          template: {
            [SLOTS]: {},
          }
        },
      };
      structure.instance.members = [
        {
          type: MemberType.Uint,
          bitSize: 16,
          bitOffset: 0,
          byteSize: 2,
          structure,
        },
      ];
      const env = new Env();
      const descriptors = {};
      env.finalizeErrorSet(structure, descriptors);
      expect(descriptors[CAST]?.value).to.be.a('function');
    })
    it('should add descriptors for items in error set', function() {
      const structure = {
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
        instance: {},
        static: {},
      };
      structure.instance.members = [
        {
          type: MemberType.Uint,
          bitSize: 16,
          bitOffset: 0,
          byteSize: 2,
          structure,
        },
      ];
      structure.static.members = [
        {
          name: 'dog_ate_homework',
          type: MemberType.Object,
          flags: MemberFlag.IsPartOfSet,
          slot: 0,
          structure,
        },
        {
          name: 'cat_fell_in_love',
          type: MemberType.Object,
          flags: MemberFlag.IsPartOfSet,
          slot: 1,
          structure,
        },
      ];
      const Item = function(number) {
        this[MEMORY] = new DataView(new ArrayBuffer(2));
        this[MEMORY].setInt16(0, number, true);
      };
      const dog = new Item(77);
      const cat = new Item(88);
      structure.static.template = {
        [SLOTS]: {
          0: dog,
          1: cat
        },
      };
      const env = new Env();
      const descriptors = {};
      // need to call defineErrorSet(), since that function creates the global error set
      env.defineErrorSet(structure, {});
      env.finalizeErrorSet(structure, descriptors);
      expect(descriptors[77]?.value).to.be.an('error');
      expect(descriptors[88]?.value).to.be.an('error');
      expect(descriptors.dog_ate_homework?.value).to.be.an('error');
      expect(descriptors.cat_fell_in_love?.value).to.be.an('error');
    })
  })
  describe('defineStructure', function() {
    it('should define an error set', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      expect(ErrorSet).to.be.a('function');
      expect(ErrorSet.UnableToRetrieveMemoryLocation).to.be.an.instanceOf(Error);
      expect(ErrorSet.UnableToRetrieveMemoryLocation).to.be.an('error');
      expect(ErrorSet.UnableToRetrieveMemoryLocation.message).to.equal('Unable to retrieve memory location');
      expect(ErrorSet.UnableToCreateObject.message).to.equal('Unable to create object');
      expect(`${ErrorSet.UnableToCreateObject}`).to.equal(`Error: Unable to create object`);
      expect(ErrorSet.UnableToCreateObject + '').to.equal(`Error: Unable to create object`);
      expect(ErrorSet.UnableToCreateObject.toString()).to.equal(`Error: Unable to create object`);
      expect(ErrorSet.UnableToRetrieveMemoryLocation.valueOf()).to.equal(ErrorSet.UnableToRetrieveMemoryLocation);
      expect(Number(ErrorSet.UnableToRetrieveMemoryLocation)).to.equal(5);
      expect(Number(ErrorSet.UnableToCreateObject)).to.equal(8);
      expect(ErrorSet(5)).to.equal(ErrorSet.UnableToRetrieveMemoryLocation);
      expect(ErrorSet(8)).to.equal(ErrorSet.UnableToCreateObject);
      try {
        throw ErrorSet.UnableToCreateObject;
      } catch (err) {
        expect(err).to.equal(ErrorSet.UnableToCreateObject);
      }
      const object = new ErrorSet(ErrorSet.UnableToCreateObject);
      expect(object.$).to.equal(ErrorSet.UnableToCreateObject);
      object.$ = ErrorSet.UnableToRetrieveMemoryLocation;
      expect(object.$).to.equal(ErrorSet.UnableToRetrieveMemoryLocation);
      expect(object.valueOf()).to.equal(ErrorSet.UnableToRetrieveMemoryLocation);
      expect(JSON.stringify(ErrorSet.UnableToRetrieveMemoryLocation)).to.equal('{"error":"Unable to retrieve memory location"}');
      expect(JSON.stringify(object)).to.equal('{"error":"Unable to retrieve memory location"}');
      object.dataView.setInt16(0, -1);
      expect(() => object.valueOf()).to.throw(TypeError);
    })
    it('should define anyerror', function() {
      const env = new Env();
      // define error first
      const errorStructure1 = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet1',
        byteSize: 2,
      });
      env.attachMember(errorStructure1, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure: errorStructure1
      });
      env.attachMember(errorStructure1, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure: errorStructure1,
      }, true);
      env.attachMember(errorStructure1, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure: errorStructure1,
      }, true);
      const ErrorSet1 = env.defineStructure(errorStructure1);
      env.attachTemplate(errorStructure1, {
        [SLOTS]: {
          0: ErrorSet1.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet1.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(errorStructure1);
      // define anyerror
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'anyerror',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
      });
      const AnyError = env.defineStructure(structure);
      env.endStructure(structure);
      // define another error afterward
      const errorStructure2 = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet1',
        byteSize: 2,
      });
      env.attachMember(errorStructure2, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure: errorStructure2
      });
      env.attachMember(errorStructure2, {
        name: 'pants_on_fire',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure: errorStructure2,
      }, true);
      env.attachMember(errorStructure2, {
        name: 'jesus_showed_up',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure: errorStructure2,
      }, true);
      const ErrorSet2 = env.defineStructure(errorStructure2);
      env.attachTemplate(errorStructure2, {
        [SLOTS]: {
          0: ErrorSet2.call(ENVIRONMENT, errorData(6)),
          1: ErrorSet2.call(ENVIRONMENT, errorData(7)),
        }
      }, true);
      env.endStructure(errorStructure2);
      expect(AnyError).to.be.a('function');
      expect(AnyError.UnableToRetrieveMemoryLocation).to.be.an.instanceOf(Error);
      expect(AnyError.UnableToRetrieveMemoryLocation.message).to.equal('Unable to retrieve memory location');
      expect(Number(AnyError.UnableToRetrieveMemoryLocation)).to.equal(Number(ErrorSet1.UnableToRetrieveMemoryLocation));
      expect(ErrorSet1.UnableToRetrieveMemoryLocation in AnyError).to.be.true;
      expect(Number(AnyError.pants_on_fire)).to.equal(Number(ErrorSet2.pants_on_fire));
      expect(AnyError.pants_on_fire).to.be.instanceOf(Error);
      expect(AnyError.pants_on_fire.message).to.equal('Pants on fire');
      expect(ErrorSet2.pants_on_fire in AnyError).to.be.true;
      expect(AnyError.valueOf()).to.eql({
        UnableToRetrieveMemoryLocation: AnyError.UnableToRetrieveMemoryLocation,
        UnableToCreateObject: AnyError.UnableToCreateObject,
        pants_on_fire: AnyError.pants_on_fire,
        jesus_showed_up: AnyError.jesus_showed_up,
      });
    })
    it('should create an object for storing an error', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      const error = new ErrorSet(5);
      expect(error.$.message).to.equal(ErrorSet.UnableToRetrieveMemoryLocation.message);
    })
    it('should cast the same buffer to the same object', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      const buffer = new ArrayBuffer(2);
      const object1 = ErrorSet(buffer);
      const object2 = ErrorSet(buffer);
      expect(object2).to.equal(object1);
    })
    it('should cast number to an error', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      expect(ErrorSet(5)).to.equal(ErrorSet.UnableToRetrieveMemoryLocation);
      expect(ErrorSet(8)).to.equal(ErrorSet.UnableToCreateObject);
      expect(ErrorSet(9)).to.be.undefined;
    })
    it('should cast string to an error', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'unable_to_retrieve_memory_location',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      const text = ErrorSet.UnableToCreateObject.toString();
      expect(text).to.equal('Error: Unable to create object');
      expect(ErrorSet(text)).to.equal(ErrorSet.UnableToCreateObject);
      expect(ErrorSet('UnableToCreateObject')).to.equal(ErrorSet.UnableToCreateObject);
      expect(ErrorSet('unable_to_retrieve_memory_location')).to.equal(ErrorSet.unable_to_retrieve_memory_location);
      expect(ErrorSet('Error: Unable to retrieve memory location')).to.equal(ErrorSet.unable_to_retrieve_memory_location);
      expect(ErrorSet('Unable to retrieve memory location')).to.be.undefined;
      expect(ErrorSet('Dunno')).to.be.undefined;
    })
    it('should cast object to an error', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'unable_to_retrieve_memory_location',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      expect(ErrorSet({ error: 'Unable to create object' })).to.equal(ErrorSet.UnableToCreateObject);
      expect(ErrorSet(JSON.parse(JSON.stringify(ErrorSet.UnableToCreateObject)))).to.equal(ErrorSet.UnableToCreateObject);
      expect(ErrorSet({ error: 'Unable to retrieve memory location' })).to.equal(ErrorSet.unable_to_retrieve_memory_location);
      expect(ErrorSet({ error: 'UnableToCreateObject' })).to.be.undefined;
    })
    it('should detect that set contains errors from a different set', function() {
      const env = new Env();
      const catStructure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'CatError',
        byteSize: 2,
      });
      env.attachMember(catStructure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure: catStructure
      });
      const CatError = env.defineStructure(catStructure);
      env.attachMember(catStructure, {
        name: 'CucumberEncountered',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure: catStructure,
      }, true);
      env.attachMember(catStructure, {
        name: 'CatnipEncountered',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure: catStructure,
      }, true);
      env.attachTemplate(catStructure, {
        [SLOTS]: {
          0: CatError.call(ENVIRONMENT, errorData(5)),
          1: CatError.call(ENVIRONMENT, errorData(6)),
        },
      }, true);
      env.endStructure(catStructure);
      const dogStructure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'DogError',
        byteSize: 2,
      });
      env.attachMember(dogStructure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure: dogStructure,
      });
      const DogError = env.defineStructure(dogStructure);
      env.attachMember(dogStructure, {
        name: 'StrangerEncountered',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure: dogStructure,
      }, true);
      env.attachMember(dogStructure, {
        name: 'BathRequired',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure: dogStructure,
      }, true);
      env.attachTemplate(dogStructure, {
        [SLOTS]: {
          0: DogError.call(ENVIRONMENT, errorData(7)),
          1: DogError.call(ENVIRONMENT, errorData(8)),
        },
      }, true);
      env.endStructure(dogStructure);
      const petStructure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'PetError',
        byteSize: 2,
      });
      env.attachMember(petStructure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure: petStructure,
      });
      const PetError = env.defineStructure(petStructure);
      env.attachMember(petStructure, {
        name: 'CucumberEncountered',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure: petStructure,
      }, true);
      env.attachMember(petStructure, {
        name: 'CatnipEncountered',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure: petStructure,
      }, true);
      env.attachMember(petStructure, {
        name: 'StrangerEncountered',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 2,
        structure: petStructure,
      }, true);
      env.attachMember(petStructure, {
        name: 'BathRequired',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 3,
        structure: petStructure,
      }, true);
      env.attachTemplate(petStructure, {
        [SLOTS]: {
          0: PetError.call(ENVIRONMENT, errorData(5)),
          1: PetError.call(ENVIRONMENT, errorData(6)),
          2: PetError.call(ENVIRONMENT, errorData(7)),
          3: PetError.call(ENVIRONMENT, errorData(8)),
        },
      }, true);
      env.endStructure(petStructure);
      expect(DogError.BathRequired in PetError).to.be.true;
      expect(DogError.BathRequired in DogError).to.be.true;
      expect(CatError.CucumberEncountered in PetError).to.be.true;
      expect(DogError.BathRequired).to.equal(PetError.BathRequired);
      expect(CatError.CucumberEncountered).to.equal(PetError.CucumberEncountered);
      expect(new Error('Doh') in PetError).to.be.false;
      expect(null in PetError).to.be.false;
    })
    it('should throw when no initializer is provided', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      expect(() => new ErrorSet()).to.throw(TypeError);
    })
    it('should throw when initializer is not one of the expected types', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      expect(() => ErrorSet(false)).to.throw(TypeError);
    })
    it('should accept special properties', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      const object = new ErrorSet({ typedArray: new Uint16Array([ 8 ])});
      expect(object.$).to.equal(ErrorSet.UnableToCreateObject);
    })
    it('should throw when no special properties are found', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      expect(() => new ErrorSet({})).to.throw(TypeError);
    })
    it('should initialize error object from toJSON output', function() {
      const env = new Env();
      const structure = env.beginStructure({
        type: StructureType.ErrorSet,
        name: 'ErrorSet',
        byteSize: 2,
      });
      env.attachMember(structure, {
        type: MemberType.Uint,
        bitSize: 16,
        bitOffset: 0,
        byteSize: 2,
        structure,
      });
      const ErrorSet = env.defineStructure(structure);
      env.attachMember(structure, {
        name: 'UnableToRetrieveMemoryLocation',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 0,
        structure,
      }, true);
      env.attachMember(structure, {
        name: 'UnableToCreateObject',
        type: MemberType.Object,
        flags: MemberFlag.IsReadOnly,
        slot: 1,
        structure,
      }, true);
      env.attachTemplate(structure, {
        [SLOTS]: {
          0: ErrorSet.call(ENVIRONMENT, errorData(5)),
          1: ErrorSet.call(ENVIRONMENT, errorData(8)),
        }
      }, true);
      env.endStructure(structure);
      const object1 = new ErrorSet(ErrorSet.UnableToCreateObject);
      const json = object1.toJSON();
      const object2 = new ErrorSet(json);
      expect(object2.$).to.equal(ErrorSet.UnableToCreateObject);
      expect(() => new ErrorSet({ error: 'Something' })).to.throw(TypeError)
        .with.property('message').to.contain('Something');
    })

  })
})

function errorData(index) {
  const ta = new Uint16Array([ index ]);
  return new DataView(ta.buffer, 0, 2);
}