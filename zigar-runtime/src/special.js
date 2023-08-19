import { StructureType } from './structure.js';
import { MemberType, restoreMemory } from './member.js';
import { getMemoryCopier } from './memory.js';
import { throwBufferSizeMismatch, throwInvalidInitializer, throwTypeMismatch } from './error.js';
import { MEMORY } from './symbol.js';
import { isTypedArray } from './data-view.js';

export function addSpecialAccessors(s) {
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
  if (canBeString(s)) {
    const { byteSize } = s.instance.members[0];
    const strAccessors = getStringAccessors(byteSize);
    descriptors.string = { ...strAccessors, configurable: true };
  }
  if (canBeTypedArray(s)) {
    const taAccessors = getTypedArrayAccessors(s.typedArray);
    descriptors.typedArray = { ...taAccessors, configurable: true };
  }
  Object.defineProperties(constructor.prototype, descriptors);
}

function canBeString(s) {
  if (s.type === StructureType.Array || s.type === StructureType.Slice) {
    const { type, isSigned, bitSize } = s.instance.members[0];
    if (type === MemberType.Int && !isSigned && (bitSize === 8 || bitSize === 16)) {
      return true;
    }
  }
  return false;
}

function canBeTypedArray(s) {
  if (s.type === StructureType.Array || s.type === StructureType.Slice || s.type === StructureType.Vector) {
    if (s.typedArray) {
      return true;
    }
  }
  return false;
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
  const { type, resizer, size } = structure;
  const copy = getMemoryCopier(size);
  return {
    get() {
      if (process.env.ZIGAR_TARGET === 'WASM-RUNTIME') {
        restoreMemory.call(this);
      }
      return this[MEMORY];
    },
    set(dv) {
      checkDataView(dv);
      if (process.env.ZIGAR_TARGET === 'WASM-RUNTIME') {
        restoreMemory.call(this);
      }
      if (this[MEMORY].byteSize !== dv.byteLength) {
        throwBufferSizeMismatch(structure, dv);
      }
      copy(this[MEMORY], dv);
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
      const dv = this.dataView;
      const ta = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      const bstr = String.fromCharCode.apply(null, ta);
      return btoa(bstr);
    },
    set(str) {
      this.dataView = getDataViewFromBase64(str);
    }
  }
}

export function getDataViewFromBase64(str) {
  if (typeof(str) !== 'string') {
    throwTypeMismatch('a string', str);
  }
  const bstr = atob(str);
  const ta = new Uint8Array(bstr.length);
  for (let i = 0; i < ta.byteLength; i++) {
    ta[i] = bstr.charCodeAt(i);
  }
  return new DataView(ta.buffer);
}

const decoders = {};

export function getStringAccessors(byteSize) {
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
      this.dataView = getDataViewFromUTF8(src, byteSize);
    },
  };
}

const encoders = {};

export function getDataViewFromUTF8(str, byteSize) {
  if (typeof(str) !== 'string') {
    throwTypeMismatch('a string', str);
  }
  let encoder = encoders[byteSize];
  if (!encoder) {
    encoder = encoders[byteSize] = new TextEncoder(`utf-${byteSize * 8}`);
  }
  const ta = encoder.encode(str);
  return new DataView(ta.buffer);
}

export function getTypedArrayAccessors(TypedArray, byteSize) {
  return {
    get() {
      const dv = this.dataView;
      return new TypedArray(dv.buffer, dv.byteOffset, dv.byteLength / byteSize);
    },
    set(ta) {
      this.dataView = getDataViewFromTypedArray(ta, TypedArray);
    },
  };
}

export function getDataViewFromTypedArray(ta, TypedArray) {
  if (!isTypedArray(ta, TypedArray)) {
    throwTypeMismatch(TypedArray.name, ta);
  }
  return new DataView(ta.buffer, ta.byteOffset, ta.byteLength);;
}

export function getValueOf() {
  const map = new WeakMap();
  function extract(object) {
    let f;
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
  };
  return extract(this.$);
}