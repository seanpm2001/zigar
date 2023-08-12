const MEMORY = Symbol('memory');
const SLOTS = Symbol('slots');
const ZIG = Symbol('zig');
const PARENT = Symbol('parent');
const ELEMENT = Symbol('element');
const SOURCE = Symbol('source');
const ENUM_INDEX = Symbol('enumIndex');
const ENUM_ITEMS = Symbol('enumItems');
const ERROR_INDEX = Symbol('errorIndex');
const ENUM_ITEM = Symbol('enumItem');
const CLEAR_PREVIOUS = Symbol('hidePrevious');
const GETTER = Symbol('getter');
const SETTER = Symbol('setter');
const LENGTH = Symbol('length');
const PROXY = Symbol('proxy');

function getBitAlignFunction(bitPos, bitSize, toAligned) {
  if (bitPos + bitSize <= 8) {
    const mask = (2 ** bitSize) - 1;
    if (toAligned) {
      // from single byte
      return function(dest, src, offset) {
        const n = src.getUint8(offset);
        const b = (n >> bitPos) & mask;
        dest.setUint8(0, b);
      };
    } else {
      // to single byte
      const destMask = 0xFF ^ (mask << bitPos);
      return function(dest, src, offset) {
        const n = src.getUint8(0);
        const d = dest.getUint8(offset);
        const b = (d & destMask) | ((n & mask) << bitPos);
        dest.setUint8(offset, b);
      };
    }
  } else {
    const leadBits = 8 - bitPos;
    const leadMask = (2 ** leadBits) - 1;
    if (toAligned) {
      const trailBits = bitSize % 8;
      const trailMask = (2 ** trailBits) - 1;
      return function(dest, src, offset) {
        let i = offset, j = 0;
        let n = src.getUint8(i++), b;
        let bitBuf = (n >> bitPos) & leadMask;
        let bitCount = leadBits;
        let remaining = bitSize;
        do {
          if (remaining > bitCount) {
            n = src.getUint8(i++);
            bitBuf = bitBuf | (n << bitCount);
            //bitCount += 8;
          }
          b = (remaining >= 8) ? bitBuf & 0xFF : bitBuf & trailMask;
          dest.setUint8(j++, b);
          bitBuf >>= 8;
          //bitCount -= 8;
          remaining -= 8;
        } while (remaining > 0);
      }
    } else {
      const trailBits = (bitSize - leadBits) % 8;
      const trailMask = (2 ** trailBits) - 1;
      const destMask1 = 0xFF ^ (leadMask << bitPos);
      const destMask2 = 0xFF ^ trailMask;
      return function(dest, src, offset) {
        let i = 0, j = offset;
        // preserve bits ahead of bitPos
        let d = dest.getUint8(j), n, b;
        let bitBuf = d & destMask1;
        let bitCount = bitPos;
        let remaining = bitSize + bitCount;
        do {
          if (remaining > bitCount) {
            n = src.getUint8(i++);
            bitBuf = bitBuf | (n << bitCount);
            bitCount += 8;
          }
          if (remaining >= 8) {
            b = bitBuf & 0xFF;
          } else {
            // preserve bits at the destination sitting behind the trailing bits
            d = dest.getUint8(j);
            b = (d & destMask2) | (bitBuf & trailMask);
          }
          dest.setUint8(j++, b);
          bitBuf >>= 8;
          bitCount -= 8;
          remaining -= 8;
        } while (remaining > 0);
      }
    }
  }
}

function getMemoryCopier(size) {
  switch (size) {
    case 1: return copy1;
    case 2: return copy2;
    case 4: return copy4;
    case 8: return copy8;
    case 16: return copy16;
    case 32: return copy32;
    default:
      if (!(size & 0x07)) return copy8x;
      if (!(size & 0x03)) return copy4x;
      if (!(size & 0x01)) return copy2x;
      return copy1x;
  }
}

function copy1x(dest, src) {
  for (let i = 0, len = dest.byteLength; i < len; i++) {
    dest.setInt8(i, src.getInt8(i));
  }
}

function copy2x(dest, src) {
  for (let i = 0, len = dest.byteLength; i < len; i += 2) {
    dest.setInt16(i, src.getInt16(i, true), true);
  }
}

function copy4x(dest, src) {
  for (let i = 0, len = dest.byteLength; i < len; i += 4) {
    dest.setInt32(i, src.getInt32(i, true), true);
  }
}

function copy8x(dest, src) {
  for (let i = 0, len = dest.byteLength; i < len; i += 8) {
    dest.setInt32(i, src.getInt32(i, true), true);
    dest.setInt32(i + 4, src.getInt32(i + 4, true), true);
  }
}

function copy1(dest, src) {
  dest.setInt8(0, src.getInt8(0));
}

function copy2(dest, src) {
  dest.setInt16(0, src.getInt16(0, true), true);
}

function copy4(dest, src) {
  dest.setInt32(0, src.getInt32(0, true), true);
}

function copy8(dest, src) {
  dest.setInt32(0, src.getInt32(0, true), true);
  dest.setInt32(4, src.getInt32(4, true), true);
}

function copy16(dest, src) {
  dest.setInt32(0, src.getInt32(0, true), true);
  dest.setInt32(4, src.getInt32(4, true), true);
  dest.setInt32(8, src.getInt32(8, true), true);
  dest.setInt32(12, src.getInt32(12, true), true);
}

function copy32(dest, src) {
  dest.setInt32(0, src.getInt32(0, true), true);
  dest.setInt32(4, src.getInt32(4, true), true);
  dest.setInt32(8, src.getInt32(8, true), true);
  dest.setInt32(12, src.getInt32(12, true), true);
  dest.setInt32(16, src.getInt32(16, true), true);
  dest.setInt32(20, src.getInt32(20, true), true);
  dest.setInt32(24, src.getInt32(24, true), true);
  dest.setInt32(28, src.getInt32(28, true), true);
}

function getMemoryResetter(size) {
  switch (size) {
    case 1: return reset1;
    case 2: return reset2;
    case 4: return reset4;
    case 8: return reset8;
    case 16: return reset16;
    case 32: return reset32;
    default:
      if (!(size & 0x07)) return reset8x;
      if (!(size & 0x03)) return reset4x;
      if (!(size & 0x01)) return reset2x;
      return reset1x;
  }
}

function reset1x(dest) {
  for (let i = 0, len = dest.byteLength; i < len; i++) {
    dest.setInt8(i, 0);
  }
}

function reset2x(dest) {
  for (let i = 0, len = dest.byteLength; i < len; i += 2) {
    dest.setInt16(i, 0, true);
  }
}

function reset4x(dest) {
  for (let i = 0, len = dest.byteLength; i < len; i += 4) {
    dest.setInt32(i, 0, true);
  }
}

function reset8x(dest) {
  for (let i = 0, len = dest.byteLength; i < len; i += 8) {
    dest.setInt32(i, 0, true);
    dest.setInt32(i + 4, 0, true);
  }
}

function reset1(dest) {
  dest.setInt8(0, 0);
}

function reset2(dest) {
  dest.setInt16(0, 0, true);
}

function reset4(dest) {
  dest.setInt32(0, 0, true);
}

function reset8(dest) {
  dest.setInt32(0, 0, true);
  dest.setInt32(4, 0, true);
}

function reset16(dest) {
  dest.setInt32(0, 0, true);
  dest.setInt32(4, 0, true);
  dest.setInt32(8, 0, true);
  dest.setInt32(12, 0, true);
}

function reset32(dest) {
  dest.setInt32(0, 0, true);
  dest.setInt32(4, 0, true);
  dest.setInt32(8, 0, true);
  dest.setInt32(12, 0, true);
  dest.setInt32(16, 0, true);
  dest.setInt32(20, 0, true);
  dest.setInt32(24, 0, true);
  dest.setInt32(28, 0, true);
}
/* c8 ignore end */

function throwBufferSizeMismatch(structure, dv) {
  const { type, name, size } = structure;
  const actual = dv.byteLength;
  const s = (size > 1) ? 's' : '';
  if (type === StructureType.Slice) {
    throw new TypeError(`${name} has elements that are ${size} byte${s} in length, received ${actual}`);
  } else {
    throw new TypeError(`${name} has ${size} byte${s}, received ${actual}`);
  }
}

function throwBufferExpected(structure) {
  const { size, typedArray } = structure;
  const s = (size > 1) ? 's' : '';
  const list = [ 'an ArrayBuffer', 'a DataView' ];
  const last = (typedArray) ? `${article(typedArray.name)} ${typedArray.name}` : list.pop();
  throw new TypeError(`Expecting an ${list.join(', ')} or ${last} ${size} byte${s} in length`);
}

function throwInvalidEnum(structure, value) {
  const { name } = structure;
  throw new TypeError(`Value given does not correspond to an item of enum ${name}: ${value}`);
}

function throwEnumExpected(structure) {
  const { name } = structure;
  throw new TypeError(`Enum item expected: ${name}`);
}

function throwNoNewEnum(structure) {
  const { name } = structure;
  throw new TypeError(`Cannot create new enum item\nCall ${name} without the use of "new" to obtain an enum object`);
}

function throwNoNewError(structure) {
  const { name } = structure;
  throw new TypeError(`Cannot create new error\nCall ${name} without the use of "new" to obtain an error object`);
}

function throwNotInErrorSet(structure) {
  const { name } = structure;
  throw new TypeError(`Error given is not a part of error set ${name}`);
}

function throwUnknownErrorNumber(structure, number) {
  const { name } = structure;
  throw new TypeError(`Error number does not corresponds to any error in error set ${name}: #${number}`);
}

function throwMultipleUnionInitializers(structure) {
  const { name } = structure;
  throw new TypeError(`Only one property of ${name} can be given a value`);
}

function throwInactiveUnionProperty(structure, index, currentIndex) {
  const { instance: { members } } = structure;
  const { name: newName } = members[index];
  const { name: oldName } = members[currentIndex];
  throw new TypeError(`Modifying property ${newName} when ${oldName} is active`);
}

function throwMissingUnionInitializer(structure, arg, exclusion) {
  const { name, instance: { members } } = structure;
  const missing = members.slice(0, exclusion ? -1 : undefined).map(m => m.name);
  throw new TypeError(`${name} needs an initializer for one of its union properties: ${missing.join(', ')}`);
}

function throwInvalidInitializer(structure, expected, arg) {
  const { name } = structure;
  const description = Object.prototype.toString.call(arg);
  throw new TypeError(`The constructor of ${name} expects ${expected} as an argument, received ${description}`);
}

function throwInvalidArrayInitializer(structure, arg) {
  const { instance: { members: [ member ] }, typedArray } = structure;
  const acceptable = [];
  const primitive = getPrimitiveType(member);
  if (primitive) {
    acceptable.push(`an array of ${primitive}s`);
  } else if (member.type === MemberType.EnumerationItem) {
    acceptable.push(`an array of enum items`);
  } else {
    acceptable.push(`an array of objects`);
  }
  if (typedArray) {
    acceptable.push(`${article(typedArray.name)} ${typedArray.name}`);
  }
  throwInvalidInitializer(structure, acceptable.join(' or '), arg);
}

function throwArrayLengthMismatch(structure, arg) {
  const { name, size, instance: { members: [ member ] } } = structure;
  const { byteSize: elementSize, structure: { constructor: elementConstructor} } = member;
  const length = size / elementSize;
  const { length: argLength, constructor: argConstructor } = arg;
  const s = (length > 1) ? 's' : '';
  let source;
  if (argConstructor === elementConstructor) {
    source = `only a single one`;
  } else if (argConstructor[ELEMENT] === elementConstructor) {
    source = `a slice/array that has ${argLength}`;
  } else {
    source = `${argLength} initializer${argLength > 1 ? 's' : ''}`;
  }
  throw new TypeError(`${name} has ${length} element${s}, received ${source}`);
}

function throwMissingInitializers(structure, arg) {
  const { name, instance: { members } } = structure;
  const missing = [];
  for (const { name, isRequired } of members) {
    if (isRequired) {
      if (arg?.[name] === undefined) {
        missing.push(name);
      }
    }
  }
  throw new TypeError(`Missing initializers for ${name}: ${missing.join(', ')}`);
}

function throwNoProperty(structure, propName) {
  const { name } = structure;
  throw new TypeError(`${name} does not have a property with that name: ${propName}`);
}

function throwArgumentCountMismatch(structure, actual) {
  const { name, instance: { members } } = structure;
  const argCount = members.length - 1;
  const s = (argCount > 1) ? 's' : '';
  throw new Error(`${name} expects ${argCount} argument${s}, received ${actual}`);
}

function rethrowArgumentError(structure, index, err) {
  const { name, instance: { members } } = structure;
  // Zig currently does not provide the argument name
  const argName = `args[${index}]`;
  const argCount = members.length - 1;
  const prefix = (index !== 0) ? '..., ' : '';
  const suffix = (index !== argCount - 1) ? ', ...' : '';
  const argLabel = prefix + argName + suffix;
  const newError = new err.constructor(`${name}(${argLabel}): ${err.message}`);
  newError.stack = err.stack;
  throw newError;
}

function throwNoCastingToPointer(structure) {
  throw new TypeError(`Non-slice pointers can only be created with the help of the new operator`);
}

function throwInaccessiblePointer() {
  throw new TypeError(`Pointers within an untagged union are not accessible`);
}

function throwOverflow(member, value) {
  const typeName = getTypeName(member);
  throw new TypeError(`${typeName} cannot represent the value given: ${value}`);
}

function throwOutOfBound(member, index) {
  const { name } = member;
  throw new RangeError(`Index exceeds the size of ${name ?? 'array'}: ${index}`);
}

function rethrowRangeError(member, index, err) {
  if (err instanceof RangeError) {
    throwOutOfBound(member, index);
  } else {
    throw err;
  }
}

function throwNotNull(member) {
  const { name } = member;
  throw new RangeError(`Property ${name} can only be null`);
}

function throwZigError(name) {
  throw new Error(decamelizeErrorName(name));
}

function decamelizeErrorName(name) {
  // use a try block in case Unicode regex fails
  try {
    const lc = name.replace(/(\p{Uppercase}+)(\p{Lowercase}*)/gu, (m0, m1, m2) => {
      if (m1.length === 1) {
        return ` ${m1.toLocaleLowerCase()}${m2}`;
      } else {
        if (m2) {
          const acronym = m1.substring(0, m1.length - 1);
          const letter = m1.charAt(m1.length - 1).toLocaleLowerCase();
          return ` ${acronym} ${letter}${m2}`;
        } else {
          return ` ${m1}`;
        }
      }
    }).trimStart();
    return lc.charAt(0).toLocaleUpperCase() + lc.substring(1);
    /* c8 ignore next 3 */
  } catch (err) {
    return name;
  }
}

function article(noun) {
  return /^[aeiou]/i.test(noun) ? 'an' : 'a';
}

function getDataViewBoolAccessor(access, member) {
  return cacheMethod(access, member, () => {
    const { byteSize } = member;
    if (byteSize === undefined) {
      return undefined;
    }
    const typeName = getTypeName({ type: MemberType.Int, isSigned: true, bitSize: byteSize * 8 });
    if (access === 'get') {
      const get = DataView.prototype[`get${typeName}`];
      return function(offset, littleEndian) {
        return !!get.call(this, offset, littleEndian);
      };
    } else {
      const set = DataView.prototype[`set${typeName}`];
      const T = (byteSize > 4) ? 1n : 1;
      const F = (byteSize > 4) ? 0n : 0;
      return function(offset, value, littleEndian) {
        set.call(this, offset, value ? T : F, littleEndian);
      };
    }
  });
}

function getDataViewBoolAccessorEx(access, member) {
  return cacheMethod(access, member, () => {
    if (isByteAligned(member)) {
      return getDataViewBoolAccessor(access, member);
    }
    const { bitOffset } = member;
    const bitPos = bitOffset & 0x07;
    const mask = 1 << bitPos;
    const get = DataView.prototype.getInt8;
    if (access === 'get') {
      return function(offset) {
        const n = get.call(this, offset);
        return !!(n & mask);
      };
    } else {
      const set = DataView.prototype.setInt8;
      return function(offset, value) {
        const n = get.call(this, offset);
        const b = (value) ? n | mask : n & ~mask;
        set.call(this, offset, b);
      };
    }
  });
}

function getDataViewIntAccessor(access, member) {
  return cacheMethod(access, member, (name) => {
    return DataView.prototype[name];
  });
}

function getDataViewIntAccessorEx(access, member) {
  return cacheMethod(access, member, (name) => {
    if (DataView.prototype[name]) {
      return DataView.prototype[name];
    }
    if (isByteAligned(member)) {
      return defineAlignedIntAccessor(access, member)
    } else {
      return defineUnalignedIntAccessor(access, member);
    }
  });
}

function getDataViewFloatAccessor(access, member) {
  return cacheMethod(access, member, (name) => {
    return DataView.prototype[name];
  });
}

function getDataViewFloatAccessorEx(access, member) {
  return cacheMethod(access, member, (name) => {
    if (DataView.prototype[name]) {
      return DataView.prototype[name];
    }
    if (isByteAligned(member)) {
      return defineAlignedFloatAccessor(access, member)
    } else {
      return defineUnalignedFloatAccessor(access, member);
    }
  });
}

function getDataView(structure, arg, TypedArray) {
  const { type, size, typedArray } = structure;
  let dv;
  // not using instanceof just in case we're getting objects created in other contexts
  const tag = arg?.[Symbol.toStringTag];
  if (tag === 'DataView') {
    dv = arg;
  } else if (tag === 'ArrayBuffer' || tag === 'SharedArrayBuffer') {
    dv = new DataView(arg);
  } else if (typedArray && tag === typedArray.name) {
    dv = new DataView(arg.buffer, arg.byteOffset, arg.byteLength);
  } else {
    const memory = arg?.[MEMORY];
    if (memory && (type === StructureType.Array || type === StructureType.Slice)) {
      const { instance: { members: [ member ] } } = structure;
      const { byteSize: elementSize, structure: { constructor: elementConstructor } } = member;
      // casting to a array/slice
      const { constructor: argConstructor } = arg;
      let number;
      if (elementConstructor === argConstructor) {
        // matching object
        number = 1;
      } else if (elementConstructor === argConstructor[ELEMENT]) {
        // matching slice/array
        number = arg.length;
      }
      if (number !== undefined) {
        if (type === StructureType.Slice || number * elementSize === size) {
          return memory;
        } else {
          throwArrayLengthMismatch(structure, arg);
        }
      }
    }
  }
  if (dv) {
    if (type === StructureType.Slice ? dv.byteLength % size !== 0 : dv.byteLength !== size) {
      throwBufferSizeMismatch(structure, dv);
    }
  }
  return dv;
}

function requireDataView(structure, arg) {
  const dv = getDataView(structure, arg);
  if (!dv) {
    throwBufferExpected(structure);
  }
  return dv;
}

function getTypedArrayClass({ type, isSigned, byteSize }) {
  if (type === MemberType.Int) {
    if (isSigned) {
      switch (byteSize) {
        case 1: return Int8Array;
        case 2: return Int16Array;
        case 4: return Int32Array;
        case 8: return BigInt64Array;
      }
    } else {
      switch (byteSize) {
        case 1: return Uint8Array;
        case 2: return Uint16Array;
        case 4: return Uint32Array;
        case 8: return BigUint64Array;
      }
    }
  } else if (type === MemberType.Float) {
    switch (byteSize) {
      case 4: return Float32Array;
      case 8: return Float64Array;
    }
  }
}

function isTypedArray(arg, TypedArray) {
  const tag = arg?.[Symbol.toStringTag];
  return (!!TypedArray && tag === TypedArray.name);
}

function getTypeName({ type, isSigned, bitSize, byteSize }) {
  if (type === MemberType.Int) {
    return `${bitSize <= 32 ? '' : 'Big' }${isSigned ? 'Int' : 'Uint'}${bitSize}`;
  } else if (type === MemberType.Float) {
    return `Float${bitSize}`;
  } else if (type === MemberType.Bool) {
    const boolSize = (byteSize !== undefined) ? byteSize * 8 : 1;
    return `Bool${boolSize}`;
  } else if (type === MemberType.Void) {
    return `Null`;
  }
}

function defineAlignedIntAccessor(access, member) {
  const { isSigned, bitSize, byteSize } = member;
  if (bitSize < 64) {
    // actual number of bits needed when stored aligned
    const typeName = getTypeName({ ...member, bitSize: byteSize * 8 });
    const get = DataView.prototype[`get${typeName}`];
    const set = DataView.prototype[`set${typeName}`];
    if (isSigned) {
      const signMask = (bitSize <= 32) ? 2 ** (bitSize - 1) : 2n ** BigInt(bitSize - 1);
      const valueMask = (bitSize <= 32) ? signMask - 1 : signMask - 1n;
      if (access === 'get') {
        return function(offset, littleEndian) {
          const n = get.call(this, offset, littleEndian);
          return (n & valueMask) - (n & signMask);
        };
      } else {
        return function(offset, value, littleEndian) {
          const n = (value < 0) ? signMask | (value & valueMask) : value & valueMask;
          set.call(this, offset, n, littleEndian);
        };
      }
    } else {
      const valueMask = (bitSize <= 32) ? (2 ** bitSize) - 1 : (2n ** BigInt(bitSize)) - 1n;
      if (access === 'get') {
        return function(offset, littleEndian) {
          const n = get.call(this, offset, littleEndian);
          return n & valueMask;
        };
      } else {
        return function(offset, value, littleEndian) {
          const n = value & valueMask;
          set.call(this, offset, n, littleEndian);
        };
      }
    }
  } else {
    // larger than 64 bits
    const getWord = DataView.prototype.getBigUint64;
    const setWord = DataView.prototype.setBigUint64;
    const wordCount = Math.ceil(bitSize / 64);
    const get = function(offset, littleEndian) {
      let n = 0n;
      if (littleEndian) {
        for (let i = 0, j = offset + (wordCount - 1) * 8; i < wordCount; i++, j -= 8) {
          const w = getWord.call(this, j, littleEndian);
          n = (n << 64n) | w;
        }
      } else {
        for (let i = 0, j = offset; i < wordCount; i++, j += 8) {
          const w = getWord.call(this, j, littleEndian);
          n = (n << 64n) | w;
        }
      }
      return n;
    };
    const set = function(offset, value, littleEndian) {
      let n = value;
      const mask = 0xFFFFFFFFFFFFFFFFn;
      if (littleEndian) {
        for (let i = 0, j = offset; i < wordCount; i++, j += 8) {
          const w = n & mask;
          setWord.call(this, j, w, littleEndian);
          n >>= 64n;
        }
      } else {
        n <<= BigInt(wordCount * 64 - bitSize);
        for (let i = 0, j = offset + (wordCount - 1) * 8; i < wordCount; i++, j -= 8) {
          const w = n & mask;
          setWord.call(this, j, w, littleEndian);
          n >>= 64n;
        }
      }
      return n;
    };
    if (isSigned) {
      const signMask = 2n ** BigInt(bitSize - 1);
      const valueMask = signMask - 1n;
      if (access === 'get') {
        return function(offset, littleEndian) {
          const n = get.call(this, offset, littleEndian);
          return (n & valueMask) - (n & signMask);
        };
      } else {
        return function(offset, value, littleEndian) {
          const n = (value < 0) ? signMask | (value & valueMask) : value & valueMask;
          set.call(this, offset, n, littleEndian);
        };
      }
    } else {
      const valueMask = (2n ** BigInt(bitSize)) - 1n;
      if (access === 'get') {
        return function(offset, littleEndian) {
          const n = get.call(this, offset, littleEndian);
          return n & valueMask;
        };
      } else {
        return function(offset, value, littleEndian) {
          const n = value & valueMask;
          set.call(this, offset, n, littleEndian);
        };
      }
    }
  }
}

function defineUnalignedIntAccessor(access, member) {
  const { isSigned, bitSize, bitOffset } = member;
  const bitPos = bitOffset & 0x07;
  if (bitPos + bitSize <= 8) {
    const set = DataView.prototype.setUint8;
    const get = DataView.prototype.getUint8;
    // sub-8-bit numbers have real use cases
    if (isSigned) {
      const signMask = 2 ** (bitSize - 1);
      const valueMask = signMask - 1;
      if (access === 'get') {
        return function(offset) {
          const n = get.call(this, offset);
          const s = n >>> bitPos;
          return (s & valueMask) - (s & signMask);
        };
      } else {
        const outsideMask = 0xFF ^ ((valueMask | signMask) << bitPos);
        return function(offset, value) {
          let b = get.call(this, offset);
          const n = (value < 0) ? signMask | (value & valueMask) : value & valueMask;
          b = (b & outsideMask) | (n << bitPos);
          set.call(this, offset, b);
        };
      }
    } else {
      const valueMask = (2 ** bitSize - 1);
      if (access === 'get') {
        return function(offset) {
          const n = get.call(this, offset);
          const s = n >>> bitPos;
          return s & valueMask;
        };
      } else {
        const outsideMask = 0xFF ^ (valueMask << bitPos);
        return function(offset, value) {
          const n = get.call(this, offset);
          const b = (n & outsideMask) | ((value & valueMask) << bitPos);
          set.call(this, offset, b);
        };
      }
    }
  }
  return defineUnalignedAccessorUsing(access, member, getDataViewIntAccessorEx);
}

function defineAlignedFloatAccessor(access, member) {
  const { bitSize } = member;
  if (bitSize === 16) {
    const buf = new DataView(new ArrayBuffer(4));
    const set = DataView.prototype.setUint16;
    const get = DataView.prototype.getUint16;
    if (access === 'get') {
      return function(offset, littleEndian) {
        const n = get.call(this, offset, littleEndian);
        const sign = n >>> 15;
        const exp = (n & 0x7C00) >> 10;
        const frac = n & 0x03FF;
        if (exp === 0) {
          return (sign) ? -0 : 0;
        } else if (exp === 0x1F) {
          if (!frac) {
            return (sign) ? -Infinity : Infinity;
          } else {
            return NaN;
          }
        }
        const n32 = (sign << 31) | ((exp - 15 + 127) << 23) | (frac << 13);
        buf.setUint32(0, n32, littleEndian);
        return buf.getFloat32(0, littleEndian);
      }
    } else {
      return function(offset, value, littleEndian) {
        buf.setFloat32(0, value, littleEndian);
        const n = buf.getUint32(0, littleEndian);
        const sign = n >>> 31;
        const exp = (n & 0x7F800000) >> 23;
        const frac = n & 0x007FFFFF;
        const exp16 = (exp - 127 + 15);
        let n16;
        if (exp === 0) {
          n16 = sign << 15;
        } else if (exp === 0xFF) {
          n16 = sign << 15 | 0x1F << 10 | (frac ? 1 : 0);
        } else if (exp16 >= 31) {
          n16 = sign << 15 | 0x1F << 10;
        } else {
          n16 = sign << 15 | exp16 << 10 | (frac >> 13);
        }
        set.call(this, offset, n16, littleEndian);
      }
    }
  } else if (bitSize === 80) {
    const buf = new DataView(new ArrayBuffer(8));
    const setWord = DataView.prototype.setBigUint64;
    const getWord = DataView.prototype.getBigUint64;
    const get = function(offset, littleEndian) {
      const w1 = getWord.call(this, offset, littleEndian);
      const w2 = getWord.call(this, offset + 8, littleEndian);
      return (littleEndian) ? w1 | w2 << 64n : w1 << 64n | w2;
    };
    const set = function(offset, value, littleEndian) {
      const w1 = value & 0xFFFFFFFFFFFFFFFFn;
      const w2 = value >> 64n;
      setWord.call(this, offset + (littleEndian ? 0 : 8), w1, littleEndian);
      setWord.call(this, offset + (littleEndian ? 8 : 0), w2, littleEndian);
    };
    if (access === 'get') {
      return function(offset, littleEndian) {
        const n = get.call(this, offset, littleEndian);
        const sign = n >> 79n;
        const exp = (n & 0x7FFF0000000000000000n) >> 64n;
        const frac = n & 0x00007FFFFFFFFFFFFFFFn;
        if (exp === 0n) {
          return (sign) ? -0 : 0;
        } else if (exp === 0x7FFFn) {
          if (!frac) {
            return (sign) ? -Infinity : Infinity;
          } else {
            return NaN;
          }
        }
        const exp64 = exp - 16383n + 1023n;
        if (exp64 >= 2047n) {
          return (sign) ? -Infinity : Infinity;
        }
        const n64 = (sign << 63n) | (exp64 << 52n) | (frac >> 11n);
        buf.setBigUint64(0, n64, littleEndian);
        return buf.getFloat64(0, littleEndian);
      }
    } else {
      return function(offset, value, littleEndian) {
        buf.setFloat64(0, value, littleEndian);
        const n = buf.getBigUint64(0, littleEndian);
        const sign = n >> 63n;
        const exp = (n & 0x7FF0000000000000n) >> 52n;
        const frac = n & 0x000FFFFFFFFFFFFFn;
        let n80;
        if (exp === 0n) {
          n80 = sign << 79n | (frac << 11n);
        } else if (exp === 0x07FFn) {
          n80 = sign << 79n | 0x7FFFn << 64n | (frac ? 0x00002000000000000000n : 0n) | 0x00008000000000000000n;
          //                                                 ^ bit 61                       ^ bit 63
        } else {
          n80 = sign << 79n | (exp - 1023n + 16383n) << 64n | (frac << 11n) | 0x00008000000000000000n;
        }
        set.call(this, offset, n80, littleEndian);
      }
    }
  } else if (bitSize === 128) {
    const buf = new DataView(new ArrayBuffer(8));
    const getWord = DataView.prototype.getBigUint64;
    const setWord = DataView.prototype.setBigUint64;
    const get = function(offset, littleEndian) {
      const w1 = getWord.call(this, offset, littleEndian);
      const w2 = getWord.call(this, offset + 8, littleEndian);
      return (littleEndian) ? w1 | w2 << 64n : w1 << 64n | w2;
    };
    const set = function(offset, value, littleEndian) {
      const w1 = value & 0xFFFFFFFFFFFFFFFFn;
      const w2 = value >> 64n;
      setWord.call(this, offset + (littleEndian ? 0 : 8), w1, littleEndian);
      setWord.call(this, offset + (littleEndian ? 8 : 0), w2, littleEndian);
    };
    if (access === 'get') {
      return function(offset, littleEndian) {
        const n = get.call(this, offset, littleEndian);
        const sign = n >> 127n;
        const exp = (n & 0x7FFF0000000000000000000000000000n) >> 112n;
        const frac = n & 0x0000FFFFFFFFFFFFFFFFFFFFFFFFFFFFn;
        if (exp === 0n) {
          return (sign) ? -0 : 0;
        } else if (exp === 0x7FFFn) {
          if (!frac) {
            return (sign) ? -Infinity : Infinity;
          } else {
            return NaN;
          }
        }
        const exp64 = exp - 16383n + 1023n;
        if (exp64 >= 2047n) {
          return (sign) ? -Infinity : Infinity;
        }
        const n64 = (sign << 63n) | (exp64 << 52n) | (frac >> 60n);
        buf.setBigUint64(0, n64, littleEndian);
        return buf.getFloat64(0, littleEndian);
      }
    } else {
      return function(offset, value, littleEndian) {
        buf.setFloat64(0, value, littleEndian);
        const n = buf.getBigUint64(0, littleEndian);
        const sign = n >> 63n;
        const exp = (n & 0x7FF0000000000000n) >> 52n;
        const frac = n & 0x000FFFFFFFFFFFFFn;
        let n128;
        if (exp === 0n) {
          n128 = sign << 127n | (frac << 60n);
        } else if (exp === 0x07FFn) {
          n128 = sign << 127n | 0x7FFFn << 112n | (frac ? 1n : 0n);
        } else {
          n128 = sign << 127n | (exp - 1023n + 16383n) << 112n | (frac << 60n);
        }
        set.call(this, offset, n128, littleEndian);
      }
    }
  }
}

function defineUnalignedFloatAccessor(access, member) {
  return defineUnalignedAccessorUsing(access, member, getDataViewFloatAccessorEx);
}

function defineUnalignedAccessorUsing(access, member, getDataViewAccessor) {
  // pathological usage scenario--handle it anyway by copying the bitSize into a
  // temporary buffer, bit-aligning the data
  const { bitSize, bitOffset } = member;
  const bitPos = bitOffset & 0x07;
  const byteSize = [ 1, 2, 4, 8 ].find(b => b * 8 >= bitSize) ?? Math.ceil(bitSize / 64) * 64;
  const buf = new DataView(new ArrayBuffer(byteSize));
  if (access === 'get') {
    const getAligned = getDataViewAccessor('get', { ...member, byteSize });
    const copyBits = getBitAlignFunction(bitPos, bitSize, true);
    return function(offset, littleEndian) {
      copyBits(buf, this, offset);
      return getAligned.call(buf, 0, littleEndian);
    };
  } else {
    const setAligned = getDataViewAccessor('set', { ...member, byteSize });
    const applyBits = getBitAlignFunction(bitPos, bitSize, false);
    return function(offset, value, littleEndian) {
      setAligned.call(buf, 0, value, littleEndian);
      applyBits(this, buf, offset);
    };
  }
}

function cacheMethod(access, member, cb) {
  const { type, bitOffset, bitSize } = member;
  const bitPos = bitOffset & 0x07;
  const typeName = getTypeName(member);
  const suffix = isByteAligned(member) ? `` : `Bit${bitPos}`;
  const name = `${access}${typeName}${suffix}`;
  let fn = methodCache[name];
  if (!fn) {
    fn = cb(name);
    if (access === 'set' && type === MemberType.Int && bitSize > 32) {
      // automatically convert number to bigint
      const set = fn;
      fn = function(offset, value, littleEndian) {
        if (typeof(value) === 'number') {
          value = BigInt(value);
        }
        set.call(this, offset, value, littleEndian);
      };
    }
    if (fn && fn.name !== name) {
      Object.defineProperty(fn, 'name', { value: name, configurable: true, writable: false });
    }
    methodCache[name] = fn;
  }
  return fn;
}

const methodCache = {};

const MemberType = {
  Void: 0,
  Bool: 1,
  Int: 2,
  Float: 3,
  EnumerationItem: 4,
  Object: 5,
  Type: 6,
};

const factories$1 = Array(Object.values(MemberType).length);

function useVoid() {
  factories$1[MemberType.Void] = getVoidAccessor;
}

function useBool() {
  factories$1[MemberType.Bool] = getBoolAccessor;
}

function useBoolEx() {
  factories$1[MemberType.Bool] = getBoolAccessorEx;
}

function useInt() {
  factories$1[MemberType.Int] = getIntAccessor;
}

function useIntEx() {
  factories$1[MemberType.Int] = getIntAccessorEx;
}

function useFloat() {
  factories$1[MemberType.Float] = getFloatAccessor;
}

function useFloatEx() {
  factories$1[MemberType.Float] = getFloatAccessorEx;
}

function useEnumerationItem() {
  factories$1[MemberType.EnumerationItem] = getEnumerationItemAccessor;
}

function useEnumerationItemEx() {
  factories$1[MemberType.EnumerationItem] = getEnumerationItemAccessorEx;
}

function useObject() {
  factories$1[MemberType.Object] = getObjectAccessor;
}

function isByteAligned({ bitOffset, bitSize, byteSize }) {
  return byteSize !== undefined || (!(bitOffset & 0x07) && !(bitSize & 0x07)) || bitSize === 0;
}

function useType() {
  factories$1[MemberType.Type] = getTypeAccessor;
}

function getAccessors(member, options = {}) {
  const f = factories$1[member.type];
  if (process.env.NODE_ENV !== 'production') {
    /* c8 ignore next 10 */
    if (typeof(f) !== 'function') {
      const [ name ] = Object.entries(MemberType).find(a => a[1] === member.type);
      throw new Error(`No factory for ${name}: ${member.name}`);
    }
  }
  return {
    get: f('get', member, options),
    set: f('set', member, options)
  };
}

function getVoidAccessor(type, member, options) {
  const { runtimeSafety } = options;
  if (type === 'get') {
    return function() {
      return null;
    };
  } else {
    if (runtimeSafety) {
      return function(value) {
        if (value != null) {
          throwNotNull(member);
        }
      };
      } else {
      return function() {};
    }
  }
}

function getBoolAccessor(access, member, options) {
  return getAccessorUsing(access, member, options, getDataViewBoolAccessor)
}

function getBoolAccessorEx(access, member, options) {
  return getAccessorUsing(access, member, options, getDataViewBoolAccessorEx)
}

function getIntAccessor(access, member, options) {
  const getDataViewAccessor = addRuntimeCheck(options, getDataViewIntAccessor);
  return getAccessorUsing(access, member, options, getDataViewAccessor)
}

function getIntAccessorEx(access, member, options) {
  const getDataViewAccessor = addRuntimeCheck(options, getDataViewIntAccessorEx);
  return getAccessorUsing(access, member, options, getDataViewAccessor)
}

function addRuntimeCheck(options, getDataViewAccessor) {
  return function (access, member) {
    const {
      runtimeSafety = true,
    } = options;
    const accessor = getDataViewAccessor(access, member);
    if (runtimeSafety && access === 'set') {
      const { min, max } = getIntRange(member);
      return function(offset, value, littleEndian) {
        if (value < min || value > max) {
          throwOverflow(member, value);
        }
        accessor.call(this, offset, value, littleEndian);
      };
    }
    return accessor;
  };
}

function getFloatAccessor(access, member, options) {
  return getAccessorUsing(access, member, options, getDataViewFloatAccessor)
}

function getFloatAccessorEx(access, member, options) {
  return getAccessorUsing(access, member, options, getDataViewFloatAccessorEx)
}

function getEnumerationItemAccessor(access, member, options) {
  const getDataViewAccessor = addEnumerationLookup(getDataViewIntAccessor);
  return getAccessorUsing(access, member, options, getDataViewAccessor) ;
}

function getEnumerationItemAccessorEx(access, member, options) {
  const getDataViewAccessor = addEnumerationLookup(getDataViewIntAccessorEx);
  return getAccessorUsing(access, member, options, getDataViewAccessor) ;
}

function addEnumerationLookup(getDataViewIntAccessor) {
  return function(access, member) {
    const accessor = getDataViewIntAccessor(access, { ...member, type: MemberType.Int });
    const { structure } = member;
    if (access === 'get') {
      return function(offset, littleEndian) {
        const { constructor } = structure;
        const value = accessor.call(this, offset, littleEndian);
        // the enumeration constructor returns the object for the int value
        const object = constructor(value);
        if (!object) {
          throwInvalidEnum(value);
        }
        return object;
      };
    } else {
      return function(offset, value, littleEndian) {
        const { constructor } = structure;
        if (!(value instanceof constructor)) {
          throwEnumExpected(constructor);
        }
        accessor.call(this, offset, value.valueOf(), littleEndian);
      };
    }
  };
}

function getObjectAccessor(access, member, options) {
  const { structure, slot } = member;
  switch (structure.type) {
    case StructureType.ErrorUnion:
    case StructureType.Optional: {
      if (slot !== undefined) {
        if (access === 'get') {
          return function() {
            const object = this[SLOTS][slot];
            return object.$;
          };
        } else {
          return function(value) {
            const object = this[SLOTS][slot];
            return object.$ = value;
          };
        }
      } else {
        if (access === 'get') {
          return function(index) {
            const object = this[SLOTS][index];
            return object.$;
          };
        } else {
          return function(index, value) {
            const object = this[SLOTS][index];
            return object.$ = value;
          };
        }
      }
    }
    default: {
      if (slot !== undefined) {
        if (access === 'get') {
          return function() {
            const object = this[SLOTS][slot];
            return object;
          };
        } else {
          return function(value) {
            const object = this[SLOTS][slot];
            object.$ = value;
          };
        }
      } else {
        // array accessors
        if (access === 'get') {
          return function(index) {
            const object = this[SLOTS][index];
            return object;
          };
        } else {
          return function(index, value) {
            const object = this[SLOTS][index];
            object.$ = value;
          };
        }
      }
    }
  }
}

function getTypeAccessor(type, member, options) {
  const { structure } = member;
  if (type === 'get') {
    return function() {
      const { constructor } = structure;
      return constructor;
    };
  }
}

function getAccessorUsing(access, member, options, getDataViewAccessor) {
  const {
    runtimeSafety = true,
    littleEndian = true,
  } = options;
  const { type, bitOffset, byteSize } = member;
  const accessor = getDataViewAccessor(access, member);
  if (bitOffset !== undefined) {
    const offset = bitOffset >> 3;
    {
      if (access === 'get') {
        return function() {
          try {
            return accessor.call(this[MEMORY], offset, littleEndian);
          } catch (err) {
            if (err instanceof TypeError && restoreMemory.call(this)) {
              return accessor.call(this[MEMORY], offset, littleEndian);
            } else {
              throw err;
            }
          }
        };
      } else {
        return function(value) {
          try {
            return accessor.call(this[MEMORY], offset, value, littleEndian);
          } catch (err) {
            if (err instanceof TypeError && restoreMemory.call(this)) {
              return accessor.call(this[MEMORY], offset, value, littleEndian);
            } else {
              throw err;
            }
          }
        }
      }
    }
  } else {
    {
      if (access === 'get') {
        return function(index) {
          try {
            return accessor.call(this[MEMORY], index * byteSize, littleEndian);
          } catch (err) {
            if (err instanceof TypeError && restoreMemory.call(this)) {
              return accessor.call(this[MEMORY], index * byteSize, littleEndian);
            } else {
              rethrowRangeError(member, index, err);
            }
          }
        };
      } else {
        return function(index, value) {
          try {
            return accessor.call(this[MEMORY], index * byteSize, value, littleEndian);
          } catch (err) {
            if (err instanceof TypeError && restoreMemory.call(this)) {
              return accessor.call(this[MEMORY], index * byteSize, value, littleEndian);
            } else {
              rethrowRangeError(member, index, err);
            }
          }
        }
      }
    }
  }
}

function restoreMemory() {
  const dv = this[MEMORY];
  const source = dv[SOURCE];
  if (!source || dv.byteOffset !== 0) {
    return false;
  }
  const { memory, address, len } = source;
  const newDV = new DataView(memory.buffer, address, len);
  newDV[SOURCE] = source;
  Object.defineProperty(this, MEMORY, { value: newDV, configurable: true });
  return true;
}

function addSpecialAccessors(s) {
  const {
    constructor,
    instance: {
      members,
    },
  } = s;
  const dvAccessors = getDataViewAccessors(s);
  const base64Acccessors = getBase64Accessors();
  const descriptors = {
    dataView: { ...dvAccessors, configurable: true },
    base64: { ...base64Acccessors, configurable: true },
    toJSON: { value: getValueOf, configurable: true, writable: true },
    valueOf: { value: getValueOf, configurable: true, writable: true },
  };
  if (s.type === StructureType.Array || s.type === StructureType.Slice) {
    const { type, isSigned, byteSize } = members[0];
    if (type === MemberType.Int && !isSigned && (byteSize === 1 || byteSize === 2)) {
      const strAccessors = getStringAccessors(byteSize);
      descriptors.string = { ...strAccessors, configurable: true };
    }
  }
  if (s.type === StructureType.Array || s.type === StructureType.Slice || s.type === StructureType.Vector) {
    if (s.typedArray) {
      const { byteSize } = members[0];
      const taAccessors = getTypedArrayAccessors(s.typedArray, byteSize);
      descriptors.typedArray = { ...taAccessors, configurable: true };
    }
  }
  Object.defineProperties(constructor.prototype, descriptors);
}

function getDataViewAccessors(structure) {
  const { size } = structure;
  const copy = getMemoryCopier(size);
  return {
    get() {
      {
        restoreMemory.call(this);
      }
      return this[MEMORY];
    },
    set(src) {
      if (src.byteLength !== size) {
        throwBufferSizeMismatch(structure, src);
      }
      {
        restoreMemory.call(this);
      }
      copy(this[MEMORY], src);
    },
  };
}

function getBase64Accessors() {
  return {
    get() {
      const dv = this.dataView;
      const ta = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      const bstr = String.fromCharCode.apply(null, ta);
      return btoa(bstr);
    },
    set(src) {
      const bstr = atob(src);
      const ta = new Uint8Array(bstr.length);
      for (let i = 0; i < ta.byteLength; i++) {
        ta[i] = bstr.charCodeAt(i);
      }
      const dv = new DataView(ta.buffer);
      this.dataView = dv;
    }
  }
}

const decoders = {};
const encoders = {};

function getStringAccessors(byteSize) {
  return {
    get() {
      let decoder = decoders[byteSize];
      if (!decoder) {
        decoder = decoders[byteSize] = new TextDecoder(`utf-${byteSize * 8}`);
      }
      const dv = this.dataView;
      const TypedArray = (byteSize === 1) ? Int8Array : Int16Array;
      const ta = new TypedArray(dv.buffer, dv.byteOffset, dv.byteLength / byteSize);
      return decoder.decode(ta);
    },
    set(src) {
      let encoder = encoders[byteSize];
      if (!encoder) {
        encoder = encoders[byteSize] = new TextEncoder(`utf-${byteSize * 8}`);
      }
      const ta = encoder.encode(src);
      const dv = new DataView(ta.buffer);
      this.dataView = dv;
    },
  };
}

function getTypedArrayAccessors(typedArray, byteSize) {
  return {
    get() {
      const dv = this.dataView;
      return new typedArray(dv.buffer, dv.byteOffset, dv.byteLength / byteSize);
    },
    set(src) {
      const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);      this.dataView = dv;
    },
  };
}

function getValueOf() {
  const map = new WeakMap();
  function extract(object) {
    if (object[Symbol.iterator]) {
      const array = [];
      for (const element of object) {
        array.push(extract(element));
      }
      return array;
    } else if (object && typeof(object) === 'object') {
      let result = map.get(object);
      if (!result) {
        result = {};
        map.set(object, result);
        for (const [ name, child ] of Object.entries(object)) {
          result[name] = extract(child);
        }
        return result;
      }
      return result;
    } else {
      return object;
    }
  }  return extract(this.$);
}

function finalizePrimitive(s) {
  const {
    size,
    instance: {
      members: [ member ],
    },
    options,
  } = s;
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      // new operation--expect matching primitive
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = requireDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
    });
    if (creating) {
      initializer.call(self, arg);
    } else {
      return self;
    }
  };
  const copy = getMemoryCopier(size);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
    } else {
      this.$ = arg;
    }
  };
  const { get, set } = getAccessors(member, options);
  Object.defineProperties(constructor.prototype, {
    $: { get, set, configurable: true },
    [Symbol.toPrimitive]: { value: get, configurable: true, writable: true },
  });
  addSpecialAccessors(s);
  return constructor;
}
function getIntRange({ isSigned, bitSize }) {
  if (bitSize <= 32) {
    const max = 2 ** (isSigned ? bitSize - 1 : bitSize) - 1;
    const min = (isSigned) ? -(2 ** (bitSize - 1)) : 0;
    return { min, max };
  } else {
    bitSize = BigInt(bitSize);
    const max = 2n ** (isSigned ? bitSize - 1n : bitSize) - 1n;
    const min = (isSigned) ? -(2n ** (bitSize - 1n)) : 0n;
    return { min, max };
  }
}

function getPrimitiveClass({ type, bitSize }) {
  if (type === MemberType.Int) {
    if (bitSize <= 32) {
      return Number;
    } else {
      return BigInt;
    }
  } else if (type === MemberType.Float) {
    return Number;
  } else if (type === MemberType.Bool) {
    return Boolean;
  }
}

function getPrimitiveType(member) {
  const Primitive = getPrimitiveClass(member);
  if (Primitive) {
    return typeof(Primitive(0));
  }
}

function finalizeArray(s) {
  const {
    size,
    instance: {
      members: [ member ],
    },
    hasPointer,
    options,
  } = s;
  if (process.env.NODE_DEV !== 'production') {
    /* c8 ignore next 6 */
    if (member.bitOffset !== undefined) {
      throw new Error(`bitOffset must be undefined for array member`);
    }
    if (member.slot !== undefined) {
      throw new Error(`slot must be undefined for array member`);
    }
  }
  const objectMember = (member.type === MemberType.Object) ? member : null;
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = requireDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
    });
    if (objectMember) {
      createChildObjects$1.call(self, objectMember, this, dv);
    }
    if (creating) {
      initializer.call(self, arg);
    }
    return createProxy$1.call(self);
  };
  const { byteSize: elementSize, structure: elementStructure } = member;
  const count = size / elementSize;
  const copy = getMemoryCopier(size);
  const typedArray = s.typedArray = getTypedArrayClass(member);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
      if (pointerCopier) {
        pointerCopier.call(this, arg);
      }
    } else {
      if (Array.isArray(arg) || isTypedArray(arg, typedArray)) {
        const len = arg.length;
        if (len !== count) {
          throwArrayLengthMismatch(s, arg);
        }
        for (let i = 0; i < len; i++) {
          set.call(this, i, arg[i]);
        }
      } else {
        throwInvalidArrayInitializer(s, arg);
      }
    }
  };
  const retriever = function() { return this[PROXY] };
  const pointerCopier = s.pointerCopier = (hasPointer) ? getPointerCopier$1(objectMember) : null;
  s.pointerResetter = (hasPointer) ? getPointerResetter$1(objectMember) : null;
  s.pointerDisabler = (hasPointer) ? getPointerDisabler$1(objectMember) : null;
  const { get, set } = getAccessors(member, options);
  Object.defineProperties(constructor.prototype, {
    get: { value: get, configurable: true, writable: true },
    set: { value: set, configurable: true, writable: true },
    length: { value: count, configurable: true },
    $: { get: retriever, set: initializer, configurable: true },
    [Symbol.iterator]: { value: getArrayIterator, configurable: true },
  });
  Object.defineProperty(constructor, ELEMENT, { get: () => elementStructure.constructor });
  addSpecialAccessors(s);
  return constructor;
}

function createChildObjects$1(member, recv, dv) {
  let slots = this[SLOTS];
  if (!slots) {
    slots = {};
    Object.defineProperties(this, {
      [SLOTS]: { value: slots },
    });
  }
  const { structure: { constructor }, byteSize: elementSize } = member;
  if (recv !== ZIG) {
    recv = PARENT;
  }
  for (let i = 0, offset = 0, len = this.length; i < len; i++, offset += elementSize) {
    const childDV = new DataView(dv.buffer, offset, elementSize);
    slots[i] = constructor.call(recv, childDV);
  }
}

function getPointerCopier$1(member) {
  return function(src) {
    const { structure: { pointerCopier } } = member;
    const destSlots = this[SLOTS];
    const srcSlots = src[SLOTS];
    for (let i = 0, len = this.length; i < len; i++) {
      pointerCopier.call(destSlots[i], srcSlots[i]);
    }
  };
}

function getPointerResetter$1(member) {
  return function(src) {
    const { structure: { pointerResetter } } = member;
    const destSlots = this[SLOTS];
    for (let i = 0, len = this.length; i < len; i++) {
      pointerResetter.call(destSlots[i]);
    }
  };
}

function getPointerDisabler$1(member) {
  return function(src) {
    const { structure: { pointerDisabler } } = member;
    const destSlots = this[SLOTS];
    for (let i = 0, len = this.length; i < len; i++) {
      pointerDisabler.call(destSlots[i]);
    }
  };
}

function getArrayIterator() {
  const self = this;
  const length = this.length;
  let index = 0;
  return {
    next() {
      let value, done;
      if (index < length) {
        value = self.get(index);
        done = false;
        index++;
      } else {
        done = true;
      }
      return { value, done };
    },
  };
}

function createProxy$1() {
  const proxy = new Proxy(this, proxyHandlers$1);
  this[PROXY] = proxy;
  return proxy;
}

const proxyHandlers$1 = {
  get(array, name) {
    const index = (typeof(name) === 'symbol') ? 0 : name|0;
    if (index !== 0 || index == name) {
      return array.get(index);
    } else {
      switch (name) {
        case 'get':
          if (!array[GETTER]) {
            array[GETTER] = array.get.bind(array);
          }
          return array[GETTER];
        case 'set':
          if (!array[SETTER]) {
            array[SETTER] = array.set.bind(array);
          }
          return array[SETTER];
        default:
          return array[name];
      }
    }
  },
  set(array, name, value) {
    const index = (typeof(name) === 'symbol') ? 0 : name|0;
    if (index !== 0 || index == name) {
      array.set(index, value);
    } else {
      switch (name) {
        case 'get':
          array[GETTER] = value;
          break;
        case 'set':
          array[SETTER] = value;
          break;
        default:
          array[name] = value;
      }
    }
    return true;
  },
  deleteProperty(array, name) {
    const index = (typeof(name) === 'symbol') ? 0 : name|0;
    if (index !== 0 || index == name) {
      return false;
    } else {
      switch (name) {
        case 'get':
          delete array[GETTER];
          break;
        case 'set':
          delete array[SETTER];
          break;
        default:
          delete array[name];
      }
      return true;
    }
  },
  has(array, name) {
    const index = (typeof(name) === 'symbol') ? 0 : name|0;
    if (index !== 0 || index == name) {
      return (index >= 0 && index < array.length);
    } else {
      return array[name];
    }
  },
  ownKeys(array) {
    const keys = [];
    for (let i = 0, len = array.length; i < len; i++) {
      keys.push(`${i}`);
    }
    keys.push('length');
    return keys;
  },
  getOwnPropertyDescriptor(array, name) {
    const index = (typeof(name) === 'symbol') ? 0 : name|0;
    if (index !== 0 || index == name) {
      if (index >= 0 && index < array.length) {
        return { value: array.get(index), enumerable: true, writable: true, configurable: true };
      }
    }
  },
};

function addStaticMembers(s) {
  const {
    constructor,
    static: {
      members,
      template,
    },
    options,
  } = s;
  const descriptors = {};
  if (template) {
    descriptors[SLOTS] = { value: template[SLOTS] };
  }
  for (const member of members) {
    // static members are either Pointer or Type
    let { get, set } = getAccessors(member, options);
    if (member.type === MemberType.Object) {
      const getPtr = get;
      get = function() {
        // dereference pointer
        const ptr = getPtr.call(this);
        return ptr['*'];
      };
      set = (member.isConst) ? undefined : function(value) {
        const ptr = getPtr.call(this);
        ptr['*'] = value;
      };
    }
    descriptors[member.name] = { get, set, configurable: true, enumerable: true };
  }  Object.defineProperties(constructor, descriptors);
}

function addMethods(s) {
  const {
    constructor,
    methods,
  } = s;
  for (const method of methods) {
    const {
      name,
      argStruct,
      thunk,
      isStaticOnly,
    } = method;
    const f = function(...args) {
      const { constructor } = argStruct;
      const a = new constructor(args);
      return invokeThunk(thunk, a);
    };
    Object.defineProperties(f, {
      name: { value: name, writable: false },
    });
    Object.defineProperties(constructor, {
      [name]: { value: f, configurable: true, enumerable: true, writable: true },
    });
    if (!isStaticOnly) {
      const m = function(...args) {
        const { constructor } = argStruct;
        const a = new constructor([ this, ...args ]);
        return invokeThunk(thunk, a);
      };
      Object.defineProperties(m, {
        name: { value: name, writable: false },
      });
      Object.defineProperties(constructor.prototype, {
        [name]: { value: m, configurable: true, writable: true },
      });
    }
  }
}

function invokeThunk(thunk, args) {
  {
    const res = thunk(args);
    if (res !== undefined) {
      if (res instanceof Promise) {
        // a promise of the function having been linked and called
        return res.then(() => args.retval);
      } else {
        throwZigError(res);
      }
    }
    /* c8 ignore next 3 */
  }
  return args.retval;
}

function finalizeStruct(s) {
  const {
    size,
    instance: {
      members,
      template,
    },
    hasPointer,
    options,
  } = s;
  const descriptors = {};
  for (const member of members) {
    const { get, set } = getAccessors(member, options);
    descriptors[member.name] = { get, set, configurable: true, enumerable: true };
  }
  const objectMembers = members.filter(m => m.type === MemberType.Object);
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = getDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
      ...descriptors
    });
    if (objectMembers.length > 0) {
      createChildObjects.call(self, objectMembers, this, dv);
    }
    if (creating) {
      initializer.call(self, arg);
      if (arg) {
        for (const [ key, value ] of Object.entries(arg)) {
          this[key] = value;
        }
      }
    } else {
      return self;
    }
  };
  const copy = getMemoryCopier(size);
  const requiredNames = members.filter(m => m.isRequired).map(m => m.name);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
      if (pointerCopier) {
        pointerCopier.call(this, arg);
      }
    } else {
      if (arg && typeof(arg) !== 'object') {
        throwInvalidInitializer(s, 'an object', arg);
      }
      for (const name of requiredNames) {
        if (arg?.[name] === undefined) {
          throwMissingInitializers(s, arg);
        }
      }
      const keys = (arg) ? Object.keys(arg) : [];
      for (const key of keys) {
        if (!descriptors.hasOwnProperty(key)) {
          throwNoProperty(s, key);
        }
      }
      // apply default values unless all properties are initialized
      if (template && keys.length < members.length) {
        copy(this[MEMORY], template[MEMORY]);
        if (pointerCopier) {
          pointerCopier.call(this, template);
        }
      }
      for (const key of keys) {
        this[key] = arg[key];
      }
    }
  };
  const retriever = function() { return this };
  const pointerCopier = s.pointerCopier = (hasPointer) ? getPointerCopier(objectMembers) : null;
  s.pointerResetter = (hasPointer) ? getPointerResetter(objectMembers) : null;
  s.pointerDisabler = (hasPointer) ? getPointerDisabler(objectMembers) : null;
  Object.defineProperties(constructor.prototype, {
    $: { get: retriever, set: initializer, configurable: true },
  });
  addSpecialAccessors(s);
  addStaticMembers(s);
  addMethods(s);
  return constructor;
}
function createChildObjects(members, recv, dv) {
  const slots = {};
  if (recv !== ZIG)  {
    recv = PARENT;
  }
  const parentOffset = dv.byteOffset;
  for (const { structure: { constructor }, bitOffset, byteSize, slot } of members) {
    const offset = parentOffset + (bitOffset >> 3);
    const childDV = new DataView(dv.buffer, offset, byteSize);
    slots[slot] = constructor.call(recv, childDV);
  }
  Object.defineProperties(this, {
    [SLOTS]: { value: slots },
  });
}

function getPointerCopier(members) {
  const pointerMembers = members.filter(m => m.structure.hasPointer);
  return function(src) {
    const destSlots = this[SLOTS];
    const srcSlots = src[SLOTS];
    for (const { slot, structure: { pointerCopier } } of pointerMembers) {
      pointerCopier.call(destSlots[slot], srcSlots[slot]);
    }
  };
}

function getPointerResetter(members) {
  const pointerMembers = members.filter(m => m.structure.hasPointer);
  return function() {
    const destSlots = this[SLOTS];
    for (const { slot, structure: { pointerResetter } } of pointerMembers) {
      pointerResetter.call(destSlots[slot]);
    }
  };
}

function getPointerDisabler(members) {
  const pointerMembers = members.filter(m => m.structure.hasPointer);
  return function() {
    const destSlots = this[SLOTS];
    for (const { slot, structure: { pointerDisabler } } of pointerMembers) {
      pointerDisabler.call(destSlots[slot]);
    }
  };
}

function finalizeUnion(s) {
  const {
    type,
    size,
    instance: {
      members,
      template,
    },
    options,
    hasPointer,
  } = s;
  const {
    runtimeSafety = true,
  } = options;
  const descriptors = {};
  let getEnumItem;
  let showDefault;
  let valueMembers;
  const exclusion = (type === StructureType.TaggedUnion || (type === StructureType.BareUnion && runtimeSafety));
  if (exclusion) {
    const selectorMember = members[members.length - 1];
    const { get: getSelector, set: setSelector } = getAccessors(selectorMember, options);
    let getIndex, setIndex;
    if (type === StructureType.TaggedUnion) {
      // rely on the enumeration constructor to translate the enum values into indices
      const { structure: { constructor } } = selectorMember;
      getEnumItem = getSelector;
      getIndex = function() {
        const item = getSelector.call(this);
        return item[ENUM_INDEX];
      };
      setIndex = function(index) {
        setSelector.call(this, constructor(index));
      };
    } else {
      getIndex = getSelector;
      setIndex = setSelector;
    }
    showDefault = function() {
      const index = getIndex.call(this);
      const { name } = members[index];
      Object.defineProperty(this, name, { enumerable: true });
    };
    valueMembers = members.slice(0, -1);
    for (const [ index, member ] of valueMembers.entries()) {
      const { get: getValue, set: setValue } = getAccessors(member, options);
      const get = function() {
        if (index !== getIndex.call(this)) {
          return null;
        }
        return getValue.call(this);
      };
      const set = function(value) {
        const currentIndex = getIndex.call(this);
        if (index !== currentIndex) {
          throwInactiveUnionProperty(s, index, currentIndex);
        }
        setValue.call(this, value);
      };
      const show = function() {
        const { name, slot, structure: { pointerResetter } = {} } = member;
        const clear = () => {
          Object.defineProperty(this, name, { enumerable: false });
          if (pointerResetter) {
            const object = this[SLOTS][slot];
            pointerResetter.call(object);
          }
        };
        Object.defineProperties(this, {
          [name]: { enumerable: true },
          [CLEAR_PREVIOUS]: { value: clear, configurable: true },
        });
      };
      const init = function(value) {
        this[CLEAR_PREVIOUS]?.call();
        setIndex.call(this, index);
        setValue.call(this, value);
        show.call(this);
      };
      descriptors[member.name] = { get, set, init, configurable: true };
    }
  } else {
    // extern union
    valueMembers = members;
    for (const member of members) {
      const { get, set } = getAccessors(member, options);
      descriptors[member.name] = { get, set, init: set, configurable: true, enumerable: true };
    }
  }
  const objectMembers = members.filter(m => m.type === MemberType.Object);
  const hasInaccessiblePointer = !hasPointer && !!objectMembers.find(m => m.structure.hasPointer);
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = getDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
    });
    Object.defineProperties(self, descriptors);
    if (objectMembers.length > 0) {
      createChildObjects.call(self, objectMembers, this, dv);
      if (hasInaccessiblePointer) {
        pointerDisabler.call(self);
      }
    }
    if (creating) {
      initializer.call(self, arg);
    } else {
      return self;
    }
  };
  const hasDefaultMember = !!valueMembers.find(m => !m.isRequired);
  const copy = getMemoryCopier(size);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
      if (pointerCopier) {
        pointerCopier.call(this, arg);
      }
    } else {
      if (arg && typeof(arg) !== 'object') {
        throwInvalidInitializer(s, 'an object with a single property', arg);
      }
      const keys = (arg) ? Object.keys(arg) : [];
      for (const key of keys) {
        if (!descriptors.hasOwnProperty(key)) {
          throwNoProperty(s, key);
        }
      }
      if (keys.length !== 1) {
        if (keys.length === 0) {
          if (!hasDefaultMember) {
            throwMissingUnionInitializer(s);
          }
        } else {
          throwMultipleUnionInitializers(s);
        }
      }
      if (keys.length === 0) {
        if (template) {
          copy(this[MEMORY], template[MEMORY]);
          if (pointerCopier) {
            pointerCopier.call(this, template);
          }
        }
        if (showDefault) {
          showDefault.call(this);
        }
      } else {
        for (const key of keys) {
          const { init } = descriptors[key];
          init.call(this, arg[keys]);
        }
      }
    }
  };
  const retriever = function() { return this };
  const pointerCopier = s.pointerCopier = getPointerCopier(objectMembers);
  s.pointerResetter = getPointerResetter(objectMembers);
  const pointerDisabler = getPointerDisabler(objectMembers);
  if (type === StructureType.TaggedUnion) {
    // enable casting to enum
    Object.defineProperties(constructor.prototype, {
      [ENUM_ITEM]: { get: getEnumItem, configurable: true },
    });
  }
  Object.defineProperties(constructor.prototype, {
    $: { get: retriever, set: initializer, configurable: true },
  });
  addSpecialAccessors(s);
  addStaticMembers(s);
  addMethods(s);
  return constructor;
}

function finalizeErrorUnion(s) {
  const {
    name,
    size,
    instance: { members },
    options,
  } = s;
  const objectMembers = members.filter(m => m.type === MemberType.Object);
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      // new operation
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = requireDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
    });
    if (objectMembers.length > 0) {
      createChildObjects.call(self, objectMembers, this, dv);
    }
    if (creating) {
      initializer.call(this, arg);
    } else {
      return self;
    }
  };
  const copy = getMemoryCopier(size);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
      if (pointerCopier) {
        if (check.call(this)) {
          pointerCopier.call(this, arg);
        }
      }
    } else {
      this.$ = arg;
    }
  };
  const pointerCopier = s.pointerCopier = getPointerCopier(objectMembers);
  s.pointerResetter = getPointerResetter(objectMembers);
  s.pointerDisabler = getPointerDisabler(objectMembers);
  const { get, set, check } = getErrorUnionAccessors(members, size, options);
  Object.defineProperties(constructor.prototype, {
    $: { get, set, configurable: true },
  });
  addSpecialAccessors(s);
  return constructor;
}

function getErrorUnionAccessors(members, size, options) {
  const { get: getValue, set: setValue } = getAccessors(members[0], options);
  const { get: getError, set: setError } = getAccessors(members[1], options);
  const { structure: valueStructure = {} } = members[0];
  const { structure: errorStructure } = members[1];
  const reset = getMemoryResetter(size);
  return {
    get: function() {
      const errorNumber = getError.call(this);
      if (errorNumber !== 0) {
        const { constructor } = errorStructure;
        const err = constructor(errorNumber);
        if (!err) {
          throwUnknownErrorNumber(errorStructure, errorNumber);
        }
        throw err;
      } else {
        return getValue.call(this);
      }
    },
    set: function(value) {
      if (value instanceof Error) {
        const { constructor } = errorStructure;
        const { pointerResetter } = valueStructure;
        if (!(value instanceof constructor)) {
          throwNotInErrorSet(errorStructure);
        }
        reset(this[MEMORY]);
        setError.call(this, Number(value));
        if (pointerResetter) {
          pointerResetter.call(this[SLOTS][0]);
        }
      } else {
        setValue.call(this, value);
        setError.call(this, 0);
      }
    },
    check: function() {
      const errorNumber = getError.call(this);
      return (errorNumber === 0);
    },
  };
}

function finalizeErrorSet(s) {
  const {
    name,
    instance: {
      members,
    },
  } = s;
  const errors = {};
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    if (creating) {
      throwNoNewError(s);
    }
    const index = Number(arg);
    return errors[index];
  };
  Object.setPrototypeOf(constructor.prototype, Error.prototype);
  const valueOf = function() { return this[ERROR_INDEX] };
  const toStringTag = function() { return 'Error' };
  Object.defineProperties(constructor.prototype, {
    // provide a way to retrieve the error index
    [Symbol.toPrimitive]: { value: valueOf, configurable: true, writable: true },
    // ensure that libraries that rely on the string tag for type detection will
    // correctly identify the object as an error
    [Symbol.toStringTag]: { get: toStringTag, configurable: true },
  });
  // attach the errors to the constructor and the
  for (const [ index, { name, slot } ] of members.entries()) {
    // can't use the constructor since it would throw
    const error = Object.create(constructor.prototype);
    const message = decamelizeErrorName(name);
    Object.defineProperties(error, {
      message: { value: message, configurable: true, enumerable: true, writable: false },
      [ERROR_INDEX]: { value: slot },
    });
    Object.defineProperties(constructor, {
      [name]: { value: error, configurable: true, enumerable: true, writable: true },
    });
    errors[slot] = error;
  }
  return constructor;
}

function finalizeEnumeration(s) {
  const {
    instance: {
      members,
      template,
    },
    options,
  } = s;
  if (process.env.NODE_DEV !== 'production') {
    /* c8 ignore next 5 */
    for (const member of members) {
      if (member.bitOffset !== undefined) {
        throw new Error(`bitOffset must be undefined for enumeration member`);
      }
    }
  }
  const Primitive = getPrimitiveClass(members[0]);
  const { get: getValue } = getAccessors(members[0], options);
  const count = members.length;
  const items = {};
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    if (creating) {
      // the "constructor" is only used to convert a number into an enum object
      // new enum items cannot be created
      throwNoNewEnum(s);
    }
    if (arg && typeof(arg) === 'object') {
      // if it's a tagged union, return the active tag
      if (arg[ENUM_ITEM]) {
        return arg[ENUM_ITEM];
      }
    }
    let index = -1;
    if (isSequential) {
      // normal enums start at 0 and go up, so the value is the index
      index = Number(arg);
    } else {
      // values aren't sequential, so we need to compare values
      // casting just in case the enum is BigInt
      const given = Primitive(arg);
      for (let i = 0; i < count; i++) {
        const value = getValue.call(constructor, i);
        if (value === given) {
          index = i;
          break;
        }
      }
    }
    // return the enum object (created down below)
    return items[index];
  };
  // attach the numeric values to the class as its binary data
  // this allows us to reuse the array getter
  Object.defineProperties(constructor, {
    [MEMORY]: { value: template[MEMORY] },
    [ENUM_ITEMS]: { value: items },
  });
  const valueOf = function() {
    const index = this[ENUM_INDEX] ;
    return getValue.call(constructor, index);
  };
  Object.defineProperties(constructor.prototype, {
    [Symbol.toPrimitive]: { value: valueOf, configurable: true, writable: true },
    $: { get: valueOf, configurable: true },
  });
  // now that the class has the right hidden properties, getValue() will work
  // scan the array to see if the enum's numeric representation is sequential
  const isSequential = (() => {
    // try-block in the event that the enum has bigInt items
    try {
      for (let i = 0; i < count; i++) {
        if (getValue.call(constructor, i) !== i) {
          return false;
        }
      }
      return true;
      /* c8 ignore next 3 */
    } catch (err) {
      return false;
    }
  })();
  // attach the enum items to the constructor
  for (const [ index, { name } ] of members.entries()) {
    // can't use the constructor since it would throw
    const item = Object.create(constructor.prototype);
    Object.defineProperties(item, {
      [ENUM_INDEX]: { value: index },
    });
    Object.defineProperties(constructor, {
      [name]: { value: item, configurable: true, enumerable: true, writable: true },
    });
    items[index] = item;
  }
  addSpecialAccessors(s);
  addStaticMembers(s);
  addMethods(s);
  return constructor;
}

function finalizeOptional(s) {
  const {
    size,
    instance: { members },
    options,
  } = s;
  const objectMembers = members.filter(m => m.type === MemberType.Object);
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = requireDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv },
    });
    if (objectMembers.length > 0) {
      createChildObjects.call(self, objectMembers, this, dv);
    }
    if (creating) {
      initializer.call(self, arg);
    } else {
      return self;
    }
  };
  const copy = getMemoryCopier(size);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
      if (pointerCopier) {
        // don't bother copying pointers when it's empty
        if (check.call(this)) {
          pointerCopier.call(this, arg);
        }
      }
    } else {
      this.$ = arg;
    }
  };
  const pointerCopier = s.pointerCopier = getPointerCopier(objectMembers);
  s.pointerResetter = getPointerResetter(objectMembers);
  s.pointerDisabler = getPointerDisabler(objectMembers);
  const { get, set, check } = getOptionalAccessors(members, size, options);
  Object.defineProperties(constructor.prototype, {
    $: { get, set, configurable: true },
  });
  addSpecialAccessors(s);
  return constructor;
}

function getOptionalAccessors(members, size, options) {
  const { get: getValue, set: setValue } = getAccessors(members[0], options);
  const { get: getPresent, set: setPresent } = getAccessors(members[1], options);
  const { structure: valueStructure = {} } = members[0];
  const reset = getMemoryResetter(size);
  return {
    get: function() {
      const present = getPresent.call(this);
      if (present) {
        return getValue.call(this);
      } else {
        return null;
      }
    },
    set: function(value) {
      if (value != null) {
        setPresent.call(this, true);
        setValue.call(this, value);
      } else {
        reset(this[MEMORY]);
        const { pointerResetter } = valueStructure;
        if (pointerResetter) {
          pointerResetter.call(this[SLOTS][0]);
        }
      }
    },
    check: getPresent
  };
}

function finalizePointer(s) {
  const {
    size,
    instance: {
      members: [ member ],
    },
  } = s;
  const { structure: target = {} } = member;
  const constructor = s.constructor = function(arg) {
    const calledFromZig = (this === ZIG);
    const calledFromParent = (this === PARENT);
    let creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      if (calledFromZig || calledFromParent) {
        dv = requireDataView(s, arg);
      } else {
        throwNoCastingToPointer();
      }
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
      [SLOTS]: { value: { 0: null } },
      // a boolean value indicating whether Zig currently owns the pointer
      [ZIG]: { value: calledFromZig, writable: true },
    });
    if (creating) {
      initializer.call(self, arg);
    }
    return createProxy.call(self, target);
  };
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      // not doing memory copying since the value stored there probably isn't valid anyway
      pointerCopier.call(this, arg);
    } else {
      const Target = target.constructor;
      if (!(arg instanceof Target)) {
        const dv = getDataView(target, arg);
        if (dv) {
          // autocast to target type
          arg = Target(dv);
        } else {
          // autovivificate target object
          arg = new Target(arg);
        }
      }
      this[SLOTS][0] = arg;
    }
  };
  // return the proxy object if one is used
  const retriever = function() { return this[PROXY] };
  const pointerCopier = s.pointerCopier = function(arg) {
    this[SLOTS][0] = arg[SLOTS][0];
  };
  s.pointerResetter = function() {
    this[SLOTS][0] = null;
  };
  s.pointerDisabler = function() {
    Object.defineProperties(this[SLOTS], {
      0: { get: throwInaccessiblePointer, set: throwInaccessiblePointer, configurable: true },
    });
  };
  const getTargetValue = function() {
    const object = this[SLOTS][0];
    return object.$;
  };
  const setTargetValue = (member.isConst) ? undefined : function(value) {
    const object = this[SLOTS][0];
    object.$ = value;
  };
  Object.defineProperties(constructor.prototype, {
    '*': { get: getTargetValue, set: setTargetValue, configurable: true },
    '$': { get: retriever, set: initializer, configurable: true, },
  });
  return constructor;
}

function createProxy(target) {
  const proxy = new Proxy(this, (target.type !== StructureType.Pointer) ? proxyHandlers : {});
  this[PROXY] = proxy;
  return proxy;
}

const proxyHandlers = {
  get(pointer, name) {
    switch (name) {
      case '$':
      case '*':
      case ZIG:
      case SLOTS:
      case MEMORY:
        return pointer[name];
      default:
        return pointer[SLOTS][0][name];
    }
  },
  set(pointer, name, value) {
    switch (name) {
      case '$':
      case '*':
      case ZIG:
      case SLOTS:
      case MEMORY:
        pointer[name] = value;
        break;
      default:
        pointer[SLOTS][0][name] = value;
    }
    return true;
  },
  deleteProperty(pointer, name) {
    switch (name) {
      case '$':
      case '*':
      case ZIG:
      case SLOTS:
      case MEMORY:
        delete pointer[name];
        break;
      default:
        delete pointer[SLOTS][0][name];
    }
    return true;
  },
  has(pointer, name) {
    return name in pointer[SLOTS][0];
  },
  ownKeys(pointer) {
    return [ ...Object.getOwnPropertyNames(pointer[SLOTS][0]), SLOTS, ZIG, MEMORY ];
  },
  getOwnPropertyDescriptor(pointer, name) {
    switch (name) {
      case '$':
      case '*':
      case ZIG:
      case SLOTS:
      case MEMORY:
        return Object.getOwnPropertyDescriptor(pointer, name);
      default:
        return Object.getOwnPropertyDescriptor(pointer[SLOTS][0], name);
    }
  },
};

function finalizeSlice(s) {
  const {
    instance: {
      members: [ member ],
    },
    hasPointer,
    options,
  } = s;
  if (process.env.NODE_DEV !== 'production') {
    /* c8 ignore next 6 */
    if (member.bitOffset !== undefined) {
      throw new Error(`bitOffset must be undefined for slice member`);
    }
    if (member.slot !== undefined) {
      throw new Error(`slot must be undefined for slice member`);
    }
  }
  const objectMember = (member.type === MemberType.Object) ? member : null;
  const { byteSize: elementSize, structure: elementStructure } = member;
  const typedArray = s.typedArray = getTypedArrayClass(member);
  const getCount = (arg) => {
    if (Array.isArray(arg) || isTypedArray(arg, typedArray) || arg instanceof constructor) {
      return arg.length;
    } else if (typeof(arg) === 'number') {
      return arg;
    } else {
      throwInvalidArrayInitializer(s, arg);
    }
  };
  let count;
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      count = getCount(arg);
      dv = new DataView(new ArrayBuffer(elementSize * count));
    } else {
      self = Object.create(constructor.prototype);
      dv = requireDataView(s, arg);
      count = dv.byteLength / elementSize;
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
      [LENGTH]: { value: count },
    });
    if (objectMember) {
      createChildObjects$1.call(self, objectMember, this, dv);
    }
    if (creating) {
      initializer.call(self, arg);
    }
    return createProxy$1.call(self);
  };
  const copy = getMemoryCopier(elementSize);
  const initializer = s.initializer = function(arg) {
    if (getCount(arg) !== count) {
      throwArrayLengthMismatch(s, arg);
    }
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
      if (pointerCopier) {
        pointerCopier.call(this, arg);
      }
    } else {
      if (Array.isArray(arg) || isTypedArray(arg, typedArray)) {
        for (let i = 0; i < count; i++) {
          set.call(this, i, arg[i]);
        }
      } else {
        for (let i = 0; i < count; i++) {
          set.call(this, i, undefined);
        }
      }
    }
  };
  const retriever = function() { return this };
  const pointerCopier = s.pointerCopier = (hasPointer) ? getPointerCopier$1(objectMember) : null;
  s.pointerResetter = (hasPointer) ? getPointerResetter$1(objectMember) : null;
  s.pointerDisabler = (hasPointer) ? getPointerDisabler$1(objectMember) : null;
  const { get, set } = getAccessors(member, options);
  const getLength = function() { return this[LENGTH] };
  Object.defineProperties(constructor.prototype, {
    get: { value: get, configurable: true, writable: true },
    set: { value: set, configurable: true, writable: true },
    length: { get: getLength, configurable: true },
    $: { get: retriever, set: initializer, configurable: true },
    [Symbol.iterator]: { value: getArrayIterator, configurable: true },
  });
  Object.defineProperty(constructor, ELEMENT, { get: () => elementStructure.constructor });
  addSpecialAccessors(s);
  return constructor;
}

function finalizeVector(s) {
  const {
    size,
    instance: {
      members: [ member ],
    },
    options,
  } = s;
  if (process.env.NODE_DEV !== 'production') {
    /* c8 ignore next 6 */
    if (member.bitOffset !== undefined) {
      throw new Error(`bitOffset must be undefined for vector member`);
    }
    if (member.slot !== undefined) {
      throw new Error(`slot must be undefined for vector member`);
    }
  }
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = requireDataView(s, arg);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv, configurable: true },
    });
    if (creating) {
      initializer.call(self, arg);
    } else {
      return self;
    }
  };
  const { byteSize: elementSize, structure: elementStructure } = member;
  const count = size / elementSize;
  const copy = getMemoryCopier(size);
  const typedArray = s.typedArray = getTypedArrayClass(member);
  const initializer = s.initializer = function(arg) {
    if (arg instanceof constructor) {
      copy(this[MEMORY], arg[MEMORY]);
    } else {
      if (Array.isArray(arg) || isTypedArray(arg, typedArray)) {
        const len = arg.length;
        if (len !== count) {
          throwArrayLengthMismatch(s, arg);
        }
        for (let i = 0; i < len; i++) {
          this[i] = arg[i];
        }
      } else {
        throwInvalidArrayInitializer(s, arg);
      }
    }
  };
  const retriever = function() { return this };
  const elementDescriptors = {};
  for (let i = 0, bitOffset = 0; i < count; i++, bitOffset += elementSize * 8) {
    const { get, set } = getAccessors({ ...member, bitOffset }, options);
    elementDescriptors[i] = { get, set, configurable: true };
  }
  Object.defineProperties(constructor.prototype, {
    ...elementDescriptors,
    length: { value: count, configurable: true },
    $: { get: retriever, set: initializer, configurable: true },
    [Symbol.iterator]: { value: getVectorIterator, configurable: true },
  });
  Object.defineProperty(constructor, ELEMENT, { get: () => elementStructure.constructor });
  addSpecialAccessors(s);
  return constructor;
}

function getVectorIterator() {
  const self = this;
  const length = this.length;
  let index = 0;
  return {
    next() {
      let value, done;
      if (index < length) {
        value = self[index];
        done = false;
        index++;
      } else {
        done = true;
      }
      return { value, done };
    },
  };
}

function finalizeArgStruct(s) {
  const {
    size,
    instance: {
      members,
    },
    options,
  } = s;
  const descriptors = {};
  for (const member of members) {
    descriptors[member.name] = getAccessors(member, options);
  }
  const objectMembers = members.filter(m => m.type === MemberType.Object);
  const constructor = s.constructor = function(args) {
    const dv = new DataView(new ArrayBuffer(size));
    Object.defineProperties(this, {
      [MEMORY]: { value: dv },
    });
    if (objectMembers.length > 0) {
      createChildObjects.call(this, objectMembers, this, dv);
    }
    initializer.call(this, args);
  };
  const argNames = members.slice(0, -1).map(m => m.name);
  const argCount = argNames.length;
  const initializer = s.initializer = function(args) {
    if (args.length !== argCount) {
      throwArgumentCountMismatch(s, args.length);
    }
    for (const [ index, name ] of argNames.entries()) {
      try {
        this[name] = args[index];
      } catch (err) {
        rethrowArgumentError(s, index, err);
      }
    }
  };

  Object.defineProperties(constructor.prototype, descriptors);
  return constructor;
}

const StructureType = {
  Primitive: 0,
  Array: 1,
  Struct: 2,
  ArgStruct: 3,
  ExternUnion: 4,
  BareUnion: 5,
  TaggedUnion: 6,
  ErrorUnion: 7,
  ErrorSet: 8,
  Enumeration: 9,
  Optional: 10,
  Pointer: 11,
  Slice: 12,
  Vector: 13,
  Opaque: 14,
  Function: 15,
};

const factories = Array(Object.values(StructureType).length);

function usePrimitive() {
  factories[StructureType.Primitive] = finalizePrimitive;
}

function useArray() {
  factories[StructureType.Array] = finalizeArray;
}

function useStruct() {
  factories[StructureType.Struct] = finalizeStruct;
}

function useExternUnion() {
  factories[StructureType.ExternUnion] = finalizeUnion;
}

function useBareUnion() {
  factories[StructureType.BareUnion] = finalizeUnion;
}

function useTaggedUnion() {
  factories[StructureType.TaggedUnion] = finalizeUnion;
}

function useErrorUnion() {
  factories[StructureType.ErrorUnion] = finalizeErrorUnion;
}

function useErrorSet() {
  factories[StructureType.ErrorSet] = finalizeErrorSet;
}

function useEnumeration() {
  factories[StructureType.Enumeration] = finalizeEnumeration;
}

function useOptional() {
  factories[StructureType.Optional] = finalizeOptional;
}

function usePointer() {
  factories[StructureType.Pointer] = finalizePointer;
}

function useSlice() {
  factories[StructureType.Slice] = finalizeSlice;
}

function useVector() {
  factories[StructureType.Vector] = finalizeVector;
}

function useOpaque() {
  factories[StructureType.Opaque] = finalizeStruct;
}

function useArgStruct() {
  factories[StructureType.ArgStruct] = finalizeArgStruct;
}

function finalizeStructure(s) {
  try {
    const f = factories[s.type];
    if (process.env.NODE_ENV !== 'production') {
      /* c8 ignore next 10 */
      if (typeof(f) !== 'function') {
        const [ name ] = Object.entries(StructureType).find(a => a[1] === s.type);
        throw new Error(`No factory for ${name}: ${f}`);
      }
    }
    const constructor = f(s);
    if (constructor) {
      Object.defineProperty(constructor, 'name', { value: s.name, writable: false });
    }
    return constructor;
    /* c8 ignore next 4 */
  } catch (err) {
    console.error(err);
    throw err;
  }
}

const MemoryDisposition = {
  Auto: 0,
  Copy: 1,
  Link: 2,
};

async function linkModule(modulePromise, params = {}) {
  const {
    resolve,
    reject,
    promise,
    ...linkParams
  } = params;
  try {
    const module = await modulePromise;
    const result = await runModule(module, linkParams);
    resolve(result);
  } catch (err) {
    reject(err);
  }
  return promise;
}

async function runModule(module, options = {}) {
  const {
    omitFunctions = false,
    slots = {},
    variables,
    methodRunner,
  } = options;
  let nextValueIndex = 1;
  let valueTable = { 0: null };
  const valueIndices = new WeakMap();
  let nextStringIndex = 1;
  const stringTable = { 0: null };
  const stringIndices = {};
  const decoder = new TextDecoder();
  const callContexts = {};
  const globalSlots = slots;
  const empty = () => {};
  const imports = {
    _startCall,
    _endCall,
    _allocMemory,
    _freeMemory,
    _getMemory,
    _getMemoryOffset,
    _getMemoryLength,
    _wrapMemory,
    _createString,
    _getPointerStatus,
    _setPointerStatus,
    _readGlobalSlot,
    _readObjectSlot,
    _writeObjectSlot,
    _createDataView,
    _writeToConsole,

    // these functions will only be called at comptime
    _writeGlobalSlot: empty,
    _setObjectPropertyString: empty,
    _setObjectPropertyInteger: empty,
    _setObjectPropertyBoolean: empty,
    _setObjectPropertyObject: empty,
    _beginStructure: empty,
    _attachMember: empty,
    _attachMethod: empty,
    _attachTemplate: empty,
    _finalizeStructure: empty,
    _createObject: empty,
    _createTemplate: empty,
  };
  const { instance } = await WebAssembly.instantiate(module, { env: imports });
  const { memory: wasmMemory, define, run, alloc, free, safe } = instance.exports;
  let consolePending = '', consoleTimeout = 0;

  {
    // link variables
    for (const [ address, object ] of Object.entries(variables)) {
      linkObject(object, Number(address));
    }
    // link methods
    methodRunner[0] = function(thunkIndex, argStruct) {
      const argIndex = addObject(argStruct);
      const errorIndex = run(argIndex, thunkIndex);
      if (errorIndex !== 0) {
        throwError(errorIndex);
      }
    };
  }

  function getString(address, len) {
    const ta = new Uint8Array(wasmMemory.buffer, address, len);
    return decoder.decode(ta);
  }

  function addString(address, len) {
    const s = getString(address, len);
    let index = stringIndices[s];
    if (index === undefined) {
      index = stringIndices[s] = nextStringIndex++;
      stringTable[index] = s;
    }
    return index;
  }

  function addObject(object) {
    const index = nextValueIndex++;
    valueTable[index] = object;
    valueIndices.set(object, index);
    return index;
  }

  function getObjectIndex(object) {
    const index = valueIndices.get(object);
    return (index !== undefined) ? index : addObject(object);
  }

  function linkObject(object, address) {
    const dv1 = object[MEMORY];
    const len = dv1.byteLength;
    const dv2 = new DataView(wasmMemory.buffer, address, len);
    /*
    console.log({ address });
    for (const [ index, dv ] of [ dv1, dv2 ].entries()) {
      const array = [];
      for (let i = 0; i < dv.byteLength; i++) {
        array.push(dv.getUint8(i));
      }
      console.log(`${index + 1}: ${array.join(' ')}`)
    }
    */
    const copy = getMemoryCopier(dv1.byteLength);
    copy(dv2, dv1);
    dv2[SOURCE] = { memory: wasmMemory, address, len };
    Object.defineProperty(object, MEMORY, { value: dv2, configurable: true });
    if (object.hasOwnProperty(ZIG)) {
      // a pointer--link the target too
      const targetObject = object[SLOTS][0];
      const targetAddress = dv2.getUint32(0, true);
      linkObject(targetObject, targetAddress);
    }
  }

  function throwError(errorIndex) {
    const errorName = stringTable[errorIndex];
    const errorMsg = decamelizeErrorName(errorName);
    throw new Error(errorMsg);
  }

  function _startCall(ctxAddr) {
    callContexts[ctxAddr] = { bufferMap: new Map() };
  }

  function _endCall(ctxAddr) {
    // move data from WASM memory into buffers
    const ctx = callContexts[ctxAddr];
    for (const [ buffer, { address, len, dv, copy } ] of ctx.bufferMap) {
      const src = new DataView(wasmMemory.buffer, address, len);
      copy(dv, src);
    }
    delete callContexts[ctxAddr];
    if (Object.keys(callContexts) === 0) {
      // clear the value table
      nextValueIndex = 1;
      valueTable = { 0: null };
    }
  }

  function _allocMemory(ctxAddr, len) {
    const address = alloc(ctxAddr, len);
    const ctx = callContexts[ctxAddr];
    const buffer = new ArrayBuffer(len);
    const dv = new DataView(buffer);
    const copy = getMemoryCopier(len);
    ctx.bufferMap.set(buffer, { address, len, dv, copy });
    return address;
  }

  function _freeMemory(ctxAddr, address, len) {
    for (const [ buffer, { address: matching } ] of bufferMap) {
      if (address === matching) {
        bufferMap.delete(buffer);
        free(ctxAddr, address, len);
      }
    }
  }

  function _getMemory(ctxAddr, objectIndex) {
    const object = valueTable[objectIndex];
    let dv = object[MEMORY];
    if (!dv) {
      return 0;
    }
    const ctx = callContexts[ctxAddr];
    let memory = ctx.bufferMap.get(dv.buffer);
    if (!memory) {
      const len = dv.buffer.byteLength;
      const address = alloc(ctxAddr, len);
      const dest = new DataView(wasmMemory.buffer, address, len);
      // create new dataview if the one given only covers a portion of it
      const src = (dv.byteLength === len) ? dv : new DataView(dv.buffer);
      const copy = getMemoryCopier(len);
      copy(dest, src);
      memory = { address, len, dv: src, copy };
      ctx.bufferMap.set(dv.buffer, memory);
    }
    return addObject({
      address: memory.address + dv.byteOffset,
      len: dv.byteLength
    });
  }

  function _getMemoryOffset(objectIndex) {
    const object = valueTable[objectIndex];
    return object.address;
  }

  function _getMemoryLength(objectIndex) {
    const object = valueTable[objectIndex];
    return object.len;
  }

  function _wrapMemory(structureIndex, viewIndex) {
    const structure = valueTable[structureIndex];
    let dv = valueTable[viewIndex];
    let object;
    {
      const { constructor } = structure;
      object = constructor.call(ZIG, dv);
    }
    return addObject(object);
  }

  function _createString(address, len) {
    return addString(address, len);
  }

  function _getPointerStatus(objectIndex) {
    const pointer = valueTable[objectIndex];
    const status = pointer[ZIG];
    if (typeof(status) !== 'boolean') {
      return -1;
    }
    return status ? 1 : 0;
  }

  function _setPointerStatus(objectIndex, status) {
    const pointer = valueTable[objectIndex];
    pointer[ZIG] = !!status;
  }

  function _readGlobalSlot(slot) {
    const object = globalSlots[slot];
    return object ? getObjectIndex(object) : 0;
  }

  function _readObjectSlot(objectIndex, slot) {
    const object = valueTable[objectIndex];
    const value = object[SLOTS][slot];
    return value ? getObjectIndex(value) : 0;
  }

  function _writeObjectSlot(objectIndex, slot, valueIndex) {
    const object = valueTable[objectIndex];
    object[SLOTS][slot] = valueTable[valueIndex];
  }

  function createCopy(ctx, address, len) {
    const buffer = new ArrayBuffer(len);
    const copy = getMemoryCopier(len);
    const dv = new DataView(buffer);
    ctx.bufferMap.set(buffer, { address, len, dv, copy });
    return dv;
  }

  function obtainDataView(ctx, address, len, disposition) {
    if (disposition === MemoryDisposition.Copy) {
      return createCopy(ctx, address, len);
    } else if (disposition === MemoryDisposition.Auto) {
      // look for address among existing buffers
      for (const [ buffer, { address: start, len: count } ] of ctx.bufferMap) {
        if (start <= address && address + len <= start + count) {
          const offset = address - start;
          return new DataView(buffer, offset, len);
        }
      }
    }
    {
      // mystery memory--link directly to it, attaching the memory object
      // so we can recreate the view in the event of buffer deattachment
      // due to address space enlargement
      const dv = new DataView(wasmMemory.buffer, address, len);
      dv[SOURCE] = { memory: wasmMemory, address, len };
      return dv;
    }
  }

  function _createDataView(ctxAddr, address, len, disposition) {
    const ctx = callContexts[ctxAddr];
    return addObject(obtainDataView(ctx, address, len, disposition));
  }

  function _writeToConsole(address, len) {
    // send text up to the last newline character
    const s = getString(address, len);
    const index = s.lastIndexOf('\n');
    if (index === -1) {
      consolePending += s;
    } else {
      console.log(consolePending + s.substring(0, index));
      consolePending = s.substring(index + 1);
    }
    clearTimeout(consoleTimeout);
    if (consolePending) {
      consoleTimeout = setTimeout(() => {
        console.log(consolePending);
        consolePending = '';
      }, 250);
    }
  }
}

function finalizeStructures(structures) {
  const slots = {};
  const variables = {};
  for (const structure of structures) {
    for (const target of [ structure.static, structure.instance ]) {
      // first create the actual template using the provided placeholder
      if (target.template) {
        target.template = createTemplate(target.template);
      }
    }
    for (const method of structure.methods) {
      // create thunk function
      method.thunk = createThunk(method.thunk);
    }
    finalizeStructure(structure);
    // place structure into its assigned slot
    slots[structure.slot] = structure;
  }

  function createTemplate(placeholder) {
    const template = {};
    if (placeholder.memory) {
      const { array, offset, length } = placeholder.memory;
      template[MEMORY] = new DataView(array.buffer, offset, length);
    }
    if (placeholder.slots) {
      template[SLOTS] = insertObjects({}, placeholder.slots);
    }
    return template;
  }

  function insertObjects(dest, placeholders) {
    for (const [ slot, placeholder ] of Object.entries(placeholders)) {
      dest[slot] = createObject(placeholder);
    }
    return dest;
  }

  function createObject(placeholder) {
    let dv;
    if (placeholder.memory) {
      const { array, offset, length } = placeholder.memory;
      dv = new DataView(array.buffer, offset, length);
    } else {
      const { size } = placeholder.structure;
      dv = new DataView(new ArrayBuffer(size));
    }
    const { constructor } = placeholder.structure;
    const object = constructor.call(ZIG, dv);
    if (placeholder.slots) {
      insertObjects(object[SLOTS], placeholder.slots);
    }
    if (placeholder.address !== undefined) {
      // need to replace dataview with one pointing to WASM memory later,
      // when the VM is up and running
      variables[placeholder.address] = object;
    }
    return object;
  }

  let resolve, reject;
  const promise = new Promise((r1, r2) => {
    resolve = r1;
    reject = r2;
  });
  const methodRunner = {
    0: function(index, argStruct) {
      // wait for linking to occur, then activate the runner again
      return promise.then(() => methodRunner[0].call(this, index, argStruct));
    },
  };

  function createThunk(index) {
    return function(argStruct) {
      return methodRunner[0](index, argStruct);
    };
  }

  return { promise, resolve, reject, slots, variables, methodRunner };
}

export { finalizeStructures, linkModule, runModule, useArgStruct, useArray, useBareUnion, useBool, useBoolEx, useEnumeration, useEnumerationItem, useEnumerationItemEx, useErrorSet, useErrorUnion, useExternUnion, useFloat, useFloatEx, useInt, useIntEx, useObject, useOpaque, useOptional, usePointer, usePrimitive, useSlice, useStruct, useTaggedUnion, useType, useVector, useVoid };