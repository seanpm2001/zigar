import { expect } from 'chai';

import {
  MemberType,
  useIntEx,
  useObject,
} from '../src/member.js';
import { MEMORY, SLOTS } from '../src/symbol.js';
import {
  StructureType,
  useArgStruct,
  useStruct,
  beginStructure,
  attachMember,
  finalizeStructure,
} from '../src/structure.js';

describe('ArgStruct functions', function() {
  describe('finalizeArgStruct', function() {
    beforeEach(function() {
      useArgStruct();
      useIntEx();
      useStruct();
      useObject();
    })
    it('should define an argument struct', function() {
      const structure = beginStructure({
        type: StructureType.ArgStruct,
        name: 'Hello',
        size: 4 * 3,
      });
      attachMember(structure, {
        name: '0',
        type: MemberType.Int,
        isStatic: false,
        isSigned: true,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      attachMember(structure, {
        name: '1',
        type: MemberType.Int,
        isStatic: false,
        isSigned: true,
        bitSize: 32,
        bitOffset: 32,
        byteSize: 4,
      });
      attachMember(structure, {
        name: 'retval',
        type: MemberType.Int,
        isStatic: false,
        isSigned: true,
        bitSize: 32,
        bitOffset: 64,
        byteSize: 4,
      });
      const ArgStruct = finalizeStructure(structure);
      expect(ArgStruct).to.be.a('function');
      const object = new ArgStruct();
      object[0] = 123;
      object[1] = 456;
      object.retval = 777;
      expect(object.retval).to.equal(777);
    })
    it('should define an argument struct that contains a struct', function() {
      const childStructure = beginStructure({
        type: StructureType.Struct,
        name: 'Hello',
        size: 4 * 2,
      });
      attachMember(childStructure, {
        name: 'dog',
        type: MemberType.Int,
        isStatic: false,
        isSigned: true,
        bitSize: 32,
        bitOffset: 0,
        byteSize: 4,
      });
      attachMember(childStructure, {
        name: 'cat',
        type: MemberType.Int,
        isStatic: false,
        isSigned: true,
        bitSize: 32,
        bitOffset: 32,
        byteSize: 4,
      });
      finalizeStructure(childStructure);
      const structure = beginStructure({
        type: StructureType.ArgStruct,
        name: 'Hello',
        size: childStructure.size + 4,
      });
      attachMember(structure, {
        name: 'pet',
        type: MemberType.Object,
        isStatic: false,
        bitSize: childStructure.size * 8,
        bitOffset: 0,
        byteSize: childStructure.size,
        slot: 0,
        structure: childStructure,
      });
      attachMember(structure, {
        name: 'number',
        type: MemberType.Int,
        isStatic: false,
        isSigned: true,
        bitSize: 32,
        bitOffset: childStructure.size * 8,
        byteSize: 4,
      });
      const ArgStruct = finalizeStructure(structure);
      const object = new ArgStruct();
      object.pet = { dog: 1234, cat: 4567 };
      object.number = 789;
      expect({ ...object.pet }).to.eql({ dog: 1234, cat: 4567 });
    })
  })
})