import { requireDataView, setDataView } from './data-view.js';
import {
  throwMissingInitializers, throwNoInitializer, throwNoProperty, throwReadOnly
} from './error.js';
import { isReadOnly } from './member.js';
import {
  ALL_KEYS, CONST, CONST_PROTOTYPE, COPIER, GETTER, MEMORY, POINTER_VISITOR, PROP_SETTERS, SETTER,
  SLOTS, TARGET_SETTER, VIVIFICATOR
} from './symbol.js';
import { MemberType } from './types.js';

export function defineProperties(object, descriptors) {
  for (const [ name, descriptor ] of Object.entries(descriptors)) {
    if (descriptor) {
      const { 
        set,
        get,
        value,
        enumerable,
        configurable = true,
        writable = true,
      } = descriptor;
      Object.defineProperty(object, name, (get) 
        ? { get, set, configurable, enumerable } 
        : { value, configurable, enumerable, writable }
      );
    }
  }
  for (const symbol of Object.getOwnPropertySymbols(descriptors)) {
    const descriptor = descriptors[symbol];
    if (descriptor) {
      Object.defineProperty(object, symbol, descriptor);
    }
  }
}

export function attachDescriptors(constructor, instanceDescriptors, staticDescriptors) {
  // create prototype for read-only objects
  const prototypeRO = {};
  Object.setPrototypeOf(prototypeRO, constructor.prototype);
  const instanceDescriptorsRO = {};
  const propSetters = {};
  for (const [ name, descriptor ] of Object.entries(instanceDescriptors)) {
    if (descriptor?.set) {
      instanceDescriptorsRO[name] = { ...descriptor, set: throwReadOnly };
      // save the setters so we can initialize read-only objects
      if (name !== '$') {
        propSetters[name] = descriptor.set;
      }
    } else if (name === 'set') {
      instanceDescriptorsRO[name] = { value: throwReadOnly, configurable: true, writable: true };
    }
  }
  const vivificate = instanceDescriptors[VIVIFICATOR]?.value;
  const vivificateDescriptor = { 
    // vivificate child objects as read-only too
    value: function(slot) { 
      return vivificate.call(this, slot, false);
    }
  };
  const { get, set } = instanceDescriptors.$;
  defineProperties(constructor.prototype, { 
    [CONST]: { value: false },
    [ALL_KEYS]: { value: Object.keys(propSetters) },
    [SETTER]: { value: set },
    [GETTER]: { value: get },
    [PROP_SETTERS]: { value: propSetters },
    ...instanceDescriptors,
  });
  defineProperties(constructor, {
    [CONST_PROTOTYPE]: { value: prototypeRO },
    ...staticDescriptors,
  }); 
  defineProperties(prototypeRO, { 
    constructor: { value: constructor, configurable: true },
    [CONST]: { value: true },
    [SETTER]: { value: throwReadOnly },
    [VIVIFICATOR]: vivificate && vivificateDescriptor,
    ...instanceDescriptorsRO,
  });
  return constructor;
}

export function createConstructor(structure, handlers, env) {
  const {
    byteSize,
    align,
    instance: { members, template },
    hasPointer,
  } = structure;
  const {
    modifier,
    initializer,
    finalizer,
    alternateCaster,
    shapeDefiner,
  } = handlers;
  const hasSlots = needSlots(members);
  // comptime fields are stored in the instance template's slots
  let comptimeFieldSlots;
  if (template?.[SLOTS]) {
    const comptimeMembers = members.filter(m => isReadOnly(m));
    if (comptimeMembers.length > 0) {
      comptimeFieldSlots = comptimeMembers.map(m => m.slot);
    } 
  }
  const cache = new ObjectCache();
  const constructor = function(arg, options = {}) {
    const {
      writable = true,
      fixed = false,
    } = options;
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      if (arguments.length === 0) {
        throwNoInitializer(structure);
      }
      self = this;
      if (hasSlots) {
        self[SLOTS] = {};
      }
      if (shapeDefiner) {
        // provided by defineSlice(); the slice is different from other structures as it does not have 
        // a fixed size; memory is allocated by the slice initializer based on the argument given
        initializer.call(self, arg, fixed);
        dv = self[MEMORY]; 
      } else {
        self[MEMORY] = dv = env.allocateMemory(byteSize, align, fixed);
      }
    } else {
      if (alternateCaster) {
        // casting from number, string, etc.
        self = alternateCaster.call(this, arg, options);
        if (self !== false) {
          return self;
        }
      }
      // look for buffer
      dv = requireDataView(structure, arg, env);
      if (self = cache.find(dv, writable)) {
        return self;
      }
      self = Object.create(writable ? constructor.prototype : constructor[CONST_PROTOTYPE]);
      if (shapeDefiner) {
        setDataView.call(self, dv, structure, false, false, { shapeDefiner });
      } else {
        self[MEMORY] = dv;
      }
      if (hasSlots) {
        self[SLOTS] = {};
        if (hasPointer && arg instanceof constructor) {
          // copy pointer from other object
          self[POINTER_VISITOR](copyPointer, { vivificate: true, source: arg });
        } 
      }
    }
    if (comptimeFieldSlots) {
      for (const slot of comptimeFieldSlots) {
        self[SLOTS][slot] = template[SLOTS][slot];
      }
    }
    if (modifier) {
      modifier.call(self);
    }
    if (creating) {
      // initialize object unless it's been done already
      if (!shapeDefiner) {
        initializer.call(self, arg);
      }
      if (!writable) {
        // create object with read-only prototype
        self = Object.assign(Object.create(constructor[CONST_PROTOTYPE]), self);
      } 
    }
    if (finalizer) {
      self = finalizer.call(self);
    }
    return cache.save(dv, writable, self); 
  };
  return constructor;
}

export function copyPointer({ source }) {
  const target = source[SLOTS][0];
  if (target) {
    this[TARGET_SETTER](target);
  }
}

export function createPropertyApplier(structure) {
  const { instance: { template } } = structure;  
  return function(arg, fixed) {
    const argKeys = Object.keys(arg);
    const propSetters = this[PROP_SETTERS];
    const allKeys = this[ALL_KEYS];
    // don't accept unknown props
    for (const key of argKeys) {
      if (!(key in propSetters)) {
        throwNoProperty(structure, key);
      }
    }
    // checking each name so that we would see inenumerable initializers as well
    let normalCount = 0;
    let normalFound = 0;
    let normalMissing = 0;
    let specialFound = 0;
    for (const key of allKeys) {
      const set = propSetters[key];
      if (set.special) {
        if (key in arg) {
          specialFound++;
        }
      } else {
        normalCount++;
        if (key in arg) {
          normalFound++;
        } else if (set.required) {
          normalMissing++;
        }
      }
    }
    if (normalMissing !== 0 && specialFound === 0) {
      const missing = allKeys.filter(k => propSetters[k].required && !(k in arg));
      throwMissingInitializers(structure, missing)
    }
    if (specialFound + normalFound > argKeys.length) {
      // some props aren't enumerable
      for (const key of allKeys) {
        if (key in arg) {
          if (!argKeys.includes(key)) {
            argKeys.push(key)
          }
        }
      }
    }
    // apply default values unless all properties are initialized
    if (normalFound < normalCount && specialFound === 0) {
      if (template) {
        if (template[MEMORY]) {
          this[COPIER](template);
        }
        this[POINTER_VISITOR]?.(copyPointer, { vivificate: true, source: template });
      }
    }
    for (const key of argKeys) {
      const set = propSetters[key];
      set.call(this, arg[key], fixed);
    }
    return argKeys.length;
  };
}

export function needSlots(members) {
  for (const { type } of members) {
    switch (type) {
      case MemberType.Object:
      case MemberType.Comptime:
      case MemberType.Type:
      case MemberType.Literal:
        return true;
    }
  }
  return false;
}

export function getSelf() {
  return this;
}

export class ObjectCache {
  [0] = null;
  [1] = null;

  find(dv, writable) {
    const key = (writable) ? 0 : 1;
    const map = this[key];
    return map?.get(dv);
  }

  save(dv, writable, object) {
    const key = (writable) ? 0 : 1;
    let map = this[key];    
    if (!map) {
      map = this[key] = new WeakMap();
    }
    map.set(dv, object);
    return object;
  }
}