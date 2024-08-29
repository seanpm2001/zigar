import { mixin } from '../class.js';
import { MemberType } from '../members/all.js';

// handle non-standard ints 32-bit or smaller

mixin({
  getAccessorInt(access, member) {
    const { bitSize, byteSize } = member;
    const f = this.getAccessor(access, { type: MemberType.Uint, bitSize: byteSize * 8, byteSize });
    const signMask = 2 ** (bitSize - 1);
    const valueMask = signMask - 1;
    if (access === 'get') {
      return function(offset, littleEndian) {
        const n = f.call(this, offset, littleEndian);
        return (n & valueMask) - (n & signMask);
      };
    } else {
      return function(offset, value, littleEndian) {
        const n = (value < 0) ? signMask | (value & valueMask) : value & valueMask;
        f.call(this, offset, n, littleEndian);
      };
    }
  }
});

export function isNeededByMember(member) {
  const { type, bitSize, bitOffset, byteSize } = member;
  if (type === MemberType.Int && bitSize <= 32) {
    if (![ 8, 16, 32 ].includes(bitSize)) {
      if (byteSize === undefined && (bitOffset & 0x07) + bitSize <= 8) {
        // ints handled by the mixin "int-unaligned" don't need this one
        return false;
      }
      return true
    }
  }
  return false;
}
