import { ObjectCache, defineProperties, needSlots } from './structure.js';
import { MemberType, isByteAligned, getDescriptor } from './member.js';
import { getDestructor, getMemoryCopier } from './memory.js';
import { getCompatibleTags, addTypedArray, requireDataView } from './data-view.js';
import { getSpecialKeys } from './special.js';
import { ALIGN, COMPAT, CONST, MEMORY, MEMORY_COPIER, SIZE, SLOTS } from './symbol.js';
import { throwInvalidInitializer, throwNoInitializer, throwNoProperty, 
  throwReadOnly } from './error.js';

export function definePrimitive(s, env) {
  const {
    byteSize,
    align,
    instance: { members: [ member ] },
  } = s;
  addTypedArray(s);
  const hasSlots = needSlots(s);
  const cache = new ObjectCache();
  const constructor = s.constructor = function(arg, options = {}) {
    const {
      writable = true,
      fixed = false,
    } = options;
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      if (arguments.length === 0) {
        throwNoInitializer(s);
      }
      self = this;
      dv = env.allocateMemory(byteSize, align, fixed);
    } else {
      dv = requireDataView(s, arg, env);
      if (self = cache.find(dv, writable)) {
        return self;
      }
      self = Object.create(constructor.prototype);
    }
    self[MEMORY] = dv;
    if (hasSlots) {
      self[SLOTS] = {};
    }
    if (creating) {
      initializer.call(self, arg);
    } 
    if (!writable) {
      defineProperties(self, {
        $: { get, set: throwReadOnly, configurable: true },
        [CONST]: { value: true, configurable: true },
      });
    }
    return cache.save(dv, writable, self);
  };
  const specialKeys = getSpecialKeys(s);
  const initializer = function(arg) {
    if (arg instanceof constructor) {
      this[MEMORY_COPIER](arg);
    } else {
      if (arg && typeof(arg) === 'object') {
        for (const key of Object.keys(arg)) {
          if (!(key in this)) {
            throwNoProperty(s, key);
          }
        }
        let specialFound = 0;
        for (const key of specialKeys) {
          if (key in arg) {
            specialFound++;
          }
        }
        if (specialFound === 0) {
          const type = getPrimitiveType(member);
          throwInvalidInitializer(s, type, arg);
        }
        for (const key of specialKeys) {
          if (key in arg) {
            this[key] = arg[key];
          }
        }
      } else if (arg !== undefined) {
        this.$ = arg;
      }
    }
  };
  const { get, set } = getDescriptor(member, env);
  defineProperties(constructor.prototype, {
    delete: { value: getDestructor(env), configurable: true },
    $: { get, set, configurable: true },
    [Symbol.toPrimitive]: { value: get, configurable: true, writable: true },
    [MEMORY_COPIER]: { value: getMemoryCopier(byteSize) },
  });
  defineProperties(constructor, {
    [COMPAT]: { value: getCompatibleTags(s) },
    [ALIGN]: { value: align },
    [SIZE]: { value: byteSize },
  });
  return constructor;
};

export function getIntRange(member) {
  const { type, bitSize } = member;
  const signed = (type === MemberType.Int);
  let magBits = (signed) ? bitSize - 1 : bitSize;
  if (bitSize <= 32) {
    const max = 2 ** magBits - 1;
    const min = (signed) ? -(2 ** magBits) : 0;
    return { min, max };
  } else {
    magBits = BigInt(magBits);
    const max = 2n ** magBits - 1n;
    const min = (signed) ? -(2n ** magBits) : 0n;
    return { min, max };
  }
}

export function getPrimitiveClass({ type, bitSize }) {
  if (type === MemberType.Int || type === MemberType.Uint) {
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

export function getPrimitiveType(member) {
  const Primitive = getPrimitiveClass(member);
  if (Primitive) {
    return typeof(Primitive(0));
  }
}

export function isExtendedType(member) {
  if (!isByteAligned(member)) {
    return true;
  }
  const { type, bitSize } = member;
  if (type === MemberType.Int || type === MemberType.EnumerationItem) {
    return !(bitSize === 8 || bitSize === 16 || bitSize === 32 || bitSize === 64);
  } else if (type === MemberType.Float) {
    return !(bitSize === 32 || bitSize === 64);
  } else {
    return false;
  }
}
