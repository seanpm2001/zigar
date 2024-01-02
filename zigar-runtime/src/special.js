import { StructureType, defineProperties } from './structure.js';
import { MemberType } from './member.js';
import { restoreMemory } from './memory.js';
import { decodeBase64, decodeText, encodeBase64, encodeText } from './text.js';
import { throwBufferSizeMismatch, throwTypeMismatch } from './error.js';
import { MEMORY, MEMORY_COPIER, VALUE_NORMALIZER } from './symbol.js';
import { isTypedArray } from './data-view.js';

export function addSpecialAccessors(s) {
  // const { constructor } = s;
  // // use toPrimitive() as valueOf() when there's one
  // const valueDescriptor = getValueDescriptor(s);
  // defineProperties(constructor.prototype, {
  //   dataView: { ...getDataViewAccessors(s), configurable: true },
  //   base64: { ...getBase64Accessors(), configurable: true },
  //   toJSON:  valueDescriptor,
  //   valueOf: valueDescriptor,
  //   string: canBeString(s) && { ...getStringAccessors(s), configurable: true },
  //   typedArray: canBeTypedArray(s) && { ...getTypedArrayAccessors(s), configurable: true },
  // });
}

export function getValueOf() {
  const map = new Map();
  return this[VALUE_NORMALIZER](map);
}

function getValueDescriptor(s) {
  switch (s.type) {
    case StructureType.Primitive:
    case StructureType.Enumeration:
      const toPrimitive = s.constructor.prototype[Symbol.toPrimitive];
      return { value: toPrimitive, configurable: true, writable: true };
    case StructureType.ErrorSet:
      return;
  }
  return { value: getValueOf, configurable: true, writable: true };
}

function canBeString(s) {
  if (s.type === StructureType.Array || s.type === StructureType.Slice) {
    const { type, bitSize } = s.instance.members[0];
    if (type === MemberType.Uint && (bitSize === 8 || bitSize === 16)) {
      return true;
    }
  }
  return false;
}

function canBeTypedArray(s) {
  return !!s.typedArray;
}

export function getSpecialKeys(s) {
  const keys = [ 'dataView', 'base64' ];
  if (canBeString(s)) {
    keys.push('string');
  }
  if (canBeTypedArray(s)) {
    keys.push('typedArray');
  }
  return keys;
}

export function getDataViewAccessors(structure) {
  const { sentinel, type, byteSize } = structure;
  return {
    get() {
      /* WASM-ONLY */
      restoreMemory.call(this);
      /* WASM-ONLY-END */
      return this[MEMORY];
    },
    set(dv) {
      checkDataView(dv);
      const byteLength = byteSize * ((type === StructureType.Slice) ? this.length : 1);
      if (dv.byteLength !== byteLength) {
        throwBufferSizeMismatch(structure, dv, this);
      }
      const source = { [MEMORY]: dv };
      sentinel?.validateData(source, this.length);
      this[MEMORY_COPIER](source);
    },
  };
}

export function checkDataView(dv) {
  if (dv?.[Symbol.toStringTag] !== 'DataView') {
    throwTypeMismatch('a DataView', dv);
  }
  return dv;
}

export function getBase64Accessors() {
  return {
    get() {
      return encodeBase64(this.dataView);
    },
    set(str) {
      if (typeof(str) !== 'string') {
        throwTypeMismatch('string', str);
      }
      this.dataView = decodeBase64(str);
    }
  }
}

export function getStringAccessors(structure) {
  const { sentinel, instance: { members: [ member ] } } = structure;
  const { byteSize } = member;
  return {
    get() {
      const dv = this.dataView;
      const TypedArray = (byteSize === 1) ? Int8Array : Int16Array;
      const ta = new TypedArray(dv.buffer, dv.byteOffset, this.length);
      const s = decodeText(ta, `utf-${byteSize * 8}`);
      return (sentinel?.value === undefined) ? s : s.slice(0, -1);
    },
    set(src) {
      this.dataView = getDataViewFromUTF8(src, byteSize, sentinel?.value);
    },
  };
}

export function getDataViewFromUTF8(str, byteSize, sentinelValue) {
  if (typeof(str) !== 'string') {
    throwTypeMismatch('a string', str);
  }
  if (sentinelValue !== undefined) {
    if (str.charCodeAt(str.length - 1) !== sentinelValue) {
      str = str + String.fromCharCode(sentinelValue);
    }
  }
  const ta = encodeText(str, `utf-${byteSize * 8}`);
  return new DataView(ta.buffer);
}

export function getTypedArrayAccessors(structure) {
  const { typedArray } = structure;
  return {
    get() {
      const dv = this.dataView;
      const length = dv.byteLength / typedArray.BYTES_PER_ELEMENT;
      return new typedArray(dv.buffer, dv.byteOffset, length);
    },
    set(ta) {
      this.dataView = getDataViewFromTypedArray(ta, typedArray);
    },
  };
}

export function getDataViewFromTypedArray(ta, TypedArray) {
  if (!isTypedArray(ta, TypedArray)) {
    throwTypeMismatch(TypedArray.name, ta);
  }
  return new DataView(ta.buffer, ta.byteOffset, ta.byteLength);;
}

