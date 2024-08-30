import { expect } from 'chai';
import { defineClass } from '../../../src/environment/class.js';
import { MemberType } from '../../../src/environment/members/all.js';

import All from '../../../src/environment/accessors/all.js';
import UintUnaligned, {
  isNeededByMember
} from '../../../src/environment/accessors/uint-unaligned.js';

const Env = defineClass('AccessorTest', [ All, UintUnaligned ]);

describe('Accessor: uint-unaligned', function() {
  describe('isNeededByMember', function() {
    it('should return true when mixin is needed by a member', function() {
      const members = [
        { type: MemberType.Uint, bitSize: 7, bitOffset: 1 },
        { type: MemberType.Uint, bitSize: 1, bitOffset: 2 },
        { type: MemberType.Uint, bitSize: 3, bitOffset: 32 + 3 },
      ];
      for (const member of members) {
        expect(isNeededByMember(member)).to.be.true;
      }
    })
    it('should return false when mixin is not needed by a member', function() {
      const members = [
        { type: MemberType.Object, slot: 1 },
        { type: MemberType.Uint, bitSize: 32, byteSize: 4, bitOffset: 0 },
        { type: MemberType.Uint, bitSize: 7, bitOffset: 3 },
      ];
      for (const member of members) {
        expect(isNeededByMember(member)).to.be.false;
      }
    })
  })
  describe('getAccessorUintUnaligned', function() {
    it('should return methods for accessing small misaligned uints', function() {
      const members = [
        { type: MemberType.Uint, bitSize: 2, bitOffset: 0 },
        { type: MemberType.Uint, bitSize: 3, bitOffset: 2 },
        { type: MemberType.Uint, bitSize: 3, bitOffset: 5 },
      ];
      const env = new Env();
      const dv = new DataView(new ArrayBuffer(1 + 1))
      const get1 = env.getAccessorUintUnaligned('get', members[0]);
      const get2 = env.getAccessorUintUnaligned('get', members[1]);
      const get3 = env.getAccessorUintUnaligned('get', members[2]);
      dv.setUint8(1, 0xff);
      expect(get1.call(dv, 1)).to.equal(2 ** 2 - 1);
      expect(get2.call(dv, 1)).to.equal(2 ** 3 - 1);
      expect(get3.call(dv, 1)).to.equal(2 ** 3 - 1);
      const set1 = env.getAccessorUintUnaligned('set', members[0]);
      const set2 = env.getAccessorUintUnaligned('set', members[1]);
      const set3 = env.getAccessorUintUnaligned('set', members[2]);
      set1.call(dv, 1, 1);
      set2.call(dv, 1, 1);
      set3.call(dv, 1, 1);
      expect(dv.getUint8(1)).to.equal(parseInt('00100101', 2));
    })
  })
})