import { MemberType, getAccessors } from './member.js';
import { getMemoryCopier } from './memory.js';
import { requireDataView, getTypedArrayClass, isTypedArray } from './data-view.js';
import { addSpecialAccessors } from './special.js';
import { throwInvalidArrayInitializer, throwArrayLengthMismatch } from './error.js';
import { MEMORY, SLOTS, ZIG, PARENT, GETTER, SETTER, PROXY, ELEMENT } from './symbol.js';

export function finalizeArray(s) {
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
      createChildObjects.call(self, objectMember, this, dv);
    }
    if (creating) {
      initializer.call(self, arg);
    }
    return createProxy.call(self);
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
  const pointerCopier = s.pointerCopier = (hasPointer) ? getPointerCopier(objectMember) : null;
  const pointerResetter = s.pointerResetter = (hasPointer) ? getPointerResetter(objectMember) : null;
  const pointerDisabler = s.pointerDisabler = (hasPointer) ? getPointerDisabler(objectMember) : null;
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

export function createChildObjects(member, recv, dv) {
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

export function getPointerCopier(member) {
  return function(src) {
    const { structure: { pointerCopier } } = member;
    const destSlots = this[SLOTS];
    const srcSlots = src[SLOTS];
    for (let i = 0, len = this.length; i < len; i++) {
      pointerCopier.call(destSlots[i], srcSlots[i]);
    }
  };
}

export function getPointerResetter(member) {
  return function(src) {
    const { structure: { pointerResetter } } = member;
    const destSlots = this[SLOTS];
    for (let i = 0, len = this.length; i < len; i++) {
      pointerResetter.call(destSlots[i]);
    }
  };
}

export function getPointerDisabler(member) {
  return function(src) {
    const { structure: { pointerDisabler } } = member;
    const destSlots = this[SLOTS];
    for (let i = 0, len = this.length; i < len; i++) {
      pointerDisabler.call(destSlots[i]);
    }
  };
}

export function getArrayIterator() {
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

export function createProxy() {
  const proxy = new Proxy(this, proxyHandlers);
  this[PROXY] = proxy;
  return proxy;
}

const proxyHandlers = {
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
