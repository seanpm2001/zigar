import { mixin } from '../class.js';
import { MemberType } from '../members/all.js';

// handles bools, including implicit ones in optional pointers, where an address
// of zero would be treated as boolean false

export default mixin({
  getAccessorBool(access, member) {
    const { bitSize, byteSize } = member;
    const f = this.getAccessor(access, { type: MemberType.Uint, bitSize: byteSize * 8, byteSize: byteSize });
    if (access === 'get') {
      return function(offset, littleEndian) {
        return !!f.call(this, offset, littleEndian);
      }
    } else {
      const zero = (bitSize <= 32) ? 0 : 0n;
      const one = (bitSize <= 32) ? 1 : 1n;
      return function(offset, value, littleEndian) {
        f.call(this, offset, value ? one : zero, littleEndian);
      }
    }
  }
});

export function isNeededByMember(member) {
  const { type, byteSize } = member;
  return type === MemberType.Bool && byteSize !== undefined;
}
