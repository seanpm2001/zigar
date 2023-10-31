import { MemberType, getAccessors } from './member.js';
import { getMemoryCopier, restoreMemory, getPointerAlign } from './memory.js';
import { requireDataView, addTypedArray, checkDataViewSize, getCompatibleTags } from './data-view.js';
import { getArrayIterator, createProxy, createArrayEntries, addChildVivificator, addPointerVisitor } from './array.js';
import {
  addSpecialAccessors,
  checkDataView,
  getDataViewFromBase64,
  getDataViewFromTypedArray,
  getDataViewFromUTF8,
  getSpecialKeys
} from './special.js';
import {
  throwInvalidArrayInitializer,
  throwArrayLengthMismatch,
  throwNoProperty,
  throwMisplacedSentinel,
  throwMissingSentinel,
  throwNoInitializer,
} from './error.js';
import { LENGTH, MEMORY, SLOTS, GETTER, SETTER, COMPAT, POINTER_VISITOR } from './symbol.js';
import { copyPointer } from './pointer.js';
import { getSelf } from './struct.js';

export function finalizeSlice(s, env) {
  const {
    align,
    instance: {
      members: [ member ],
    },
    hasPointer,
    options,
  } = s;
  const typedArray = addTypedArray(s);
  if (process.env.ZIGAR_DEV) {
    /* c8 ignore next 6 */
    if (member.bitOffset !== undefined) {
      throw new Error(`bitOffset must be undefined for slice member`);
    }
    if (member.slot !== undefined) {
      throw new Error(`slot must be undefined for slice member`);
    }
  }
  const hasObject = (member.type === MemberType.Object);
  const { byteSize: elementSize, structure: elementStructure } = member;
  const sentinel = getSentinel(s, options);
  if (sentinel) {
    // zero-terminated strings aren't expected to be commonly used
    // so we're not putting this prop into the standard structure
    s.sentinel = sentinel;
  }
  const ptrAlign = getPointerAlign(align);
  // the slices are different from other structures due to variability of their sizes
  // we only know the "shape" of an object after we've processed the initializers
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self;
    if (creating) {
      if (arguments.length === 0) {
        throwNoInitializer(s);
      }
      self = this;
      initializer.call(self, arg);
    } else {
      self = Object.create(constructor.prototype);
      const dv = requireDataView(s, arg);
      shapeDefiner.call(self, dv, dv.byteLength / elementSize, this);
    }
    return createProxy.call(self);
  };
  const copy = getMemoryCopier(elementSize, true);
  const specialKeys = getSpecialKeys(s);
  const shapeDefiner = function(dv, length) {
    if (!dv) {
      dv = env.allocMemory(length * elementSize, ptrAlign);
    }
    this[MEMORY] = dv;
    this[GETTER] = null;
    this[SETTER] = null;
    this[LENGTH] = length;
    if (hasObject) {
      this[SLOTS] = {};
    }
  };
  const shapeChecker = function(arg, length) {
    if (length !== this[LENGTH]) {
      throwArrayLengthMismatch(s, this, arg);
    }
  };
  // the initializer behave differently depending on whether it's called  by the
  // constructor or by a member setter (i.e. after object's shape has been established)
  const initializer = function(arg) {
    let shapeless = !this.hasOwnProperty(MEMORY);
    if (arg instanceof constructor) {
      if (shapeless) {
        shapeDefiner.call(this, null, arg.length);
      } else {
        shapeChecker.call(this, arg, arg.length);
      }
      restoreMemory.call(this);
      restoreMemory.call(arg);
      copy(this[MEMORY], arg[MEMORY]);
      if (hasPointer) {
        this[POINTER_VISITOR](true, arg, copyPointer);
      }
    } else {
      if (typeof(arg) === 'string' && specialKeys.includes('string')) {
        arg = { string: arg };
      }
      if (arg?.[Symbol.iterator]) {
        let argLen = arg.length;
        if (typeof(argLen) !== 'number') {
          arg = [ ...arg ];
          argLen = arg.length;
        }
        if (!this[MEMORY]) {
          shapeDefiner.call(this, null, argLen);
        } else {
          shapeChecker.call(this, arg, argLen);
        }
        let i = 0;
        for (const value of arg) {
          sentinel?.validateValue(value, i, argLen);
          set.call(this, i++, value);
        }
      } else if (typeof(arg) === 'number') {
        if (shapeless && arg >= 0 && isFinite(arg)) {
          shapeDefiner.call(this, null, arg);
        } else {
          throwInvalidArrayInitializer(s, arg, shapeless);
        }
      } else if (arg && typeof(arg) === 'object') {
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
          throwInvalidArrayInitializer(s, arg);
        }
        for (const key of specialKeys) {
          if (key in arg) {
            if (shapeless) {
              // can't use accessors since the object has no memory yet
              let dv, dup = true;
              switch (key) {
                case 'dataView':
                  dv = arg[key];
                  checkDataView(dv);
                  break;
                case 'typedArray':
                  dv = getDataViewFromTypedArray(arg[key], typedArray);
                  break;
                case 'string':
                  dv = getDataViewFromUTF8(arg[key], elementSize, sentinel?.value);
                  dup = false;
                  break;
                case 'base64':
                  dv = getDataViewFromBase64(arg[key]);
                  dup = false;
                  break;
              }
              checkDataViewSize(s, dv);
              const length = dv.byteLength / elementSize;
              sentinel?.validateData(dv, length);
              if (dup) {
                shapeDefiner.call(this, null, length);
                copy(this[MEMORY], dv);
              } else {
                // reuse memory from string decoding
                shapeDefiner.call(this, dv, length);
              }
              shapeless = false;
            } else {
              this[key] = arg[key];
            }
          }
        }
      } else if (arg !== undefined) {
        throwInvalidArrayInitializer(s, arg);
      }
    }
  };
  const { get, set } = getAccessors(member, options);
  Object.defineProperties(constructor.prototype, {
    get: { value: get, configurable: true, writable: true },
    set: { value: set, configurable: true, writable: true },
    length: { get: getLength, configurable: true },
    $: { get: getSelf, set: initializer, configurable: true },
    [Symbol.iterator]: { value: getArrayIterator, configurable: true, writable: true },
    entries: { value: createArrayEntries, configurable: true, writable: true },
  });
  Object.defineProperties(constructor, {
    child: { get: () => elementStructure.constructor },
    [COMPAT]: { value: getCompatibleTags(s) },
  });
  if (hasObject) {
    addChildVivificator(s);
    if (hasPointer) {
      addPointerVisitor(s);
    }
  }
  addSpecialAccessors(s);
  return constructor;
}

function getLength() {
  return this[LENGTH];
}

export function getSentinel(structure, options) {
  const {
    runtimeSafety = true,
  } = options;
  const {
    instance: { members: [ member, sentinel ], template },
  } = structure;
  if (!sentinel) {
    return;
  }
  if (process.env.ZIGAR_DEV) {
    /* c8 ignore next 3 */
    if (sentinel.bitOffset === undefined) {
      throw new Error(`bitOffset must be 0 for sentinel member`);
    }
  }
  const { get: getSentinelValue } = getAccessors(sentinel, options);
  const value = getSentinelValue.call(template, 0);
  const { get } = getAccessors(member, options);
  const validateValue = (runtimeSafety) ? function(v, i, l) {
    if (v === value && i !== l - 1) {
      throwMisplacedSentinel(structure, v, i, l);
    } else if (v !== value && i === l - 1) {
      throwMissingSentinel(structure, value, i, l);
    }
  } : function(v, i, l) {
    if (v !== value && i === l - 1) {
      throwMissingSentinel(structure, value, l);
    }
  };
  const validateData = (runtimeSafety) ? function(dv, l) {
    const object = { [MEMORY]: dv };
    for (let i = 0; i < l; i++) {
      const v = get.call(object, i);
      if (v === value && i !== l - 1) {
        throwMisplacedSentinel(structure, value, i, l);
      } else if (v !== value && i === l - 1) {
        throwMissingSentinel(structure, value, l);
      }
    }
  } : function(dv, l) {
    const object = { [MEMORY]: dv };
    if (l > 0) {
      const i = l - 1;
      const v = get.call(object, i);
      if (v !== value) {
        throwMissingSentinel(structure, value, l);
      }
    }
  };
  const bytes = template[MEMORY];
  return { value, bytes, validateValue, validateData };
}