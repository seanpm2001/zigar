import { StructureType, MemberType, getPrimitive } from './type.js';
import { obtainGetter, obtainSetter } from './struct.js';
import { obtainArrayGetter, obtainArraySetter, obtainArrayLengthGetter, getArrayIterator } from './array.js';
import { obtainTypedArrayGetter } from './typed-array.js';
import { obtainCopyFunction } from './memory.js';
import { obtainDataView, getDataView } from './data-view.js';
import { throwNoNewEnum } from './error.js';
import { MEMORY, SLOTS, SYNC, ENUM_INDEX, ENUM_ITEMS } from './symbol.js';

export const globalSlots = {};

function invokeThunk(thunk, args) {
  thunk.call(args, globalSlots, SLOTS, MEMORY, SYNC);
}

export function invokeFactory(thunk) {
  const args = { [SLOTS]: {} };
  thunk.call(args, globalSlots, SLOTS, MEMORY, SYNC);
  return args[SLOTS][0].constructor;
}

export function getArgumentBuffers(args) {
  const buffers = [];
  const included = new WeakMap();
  const scanned = new WeakMap();
  const scan = (object) => {
    if (scanned.get(object)) {
      return;
    }
    const memory = object[MEMORY];
    if (memory.buffer instanceof ArrayBuffer) {
      if (!included.get(memory.buffer)) {
        buffers.push(memory.buffer);
        included.set(memory.buffer, true);
      }
    }
    scanned.set(object, true);
    const slots = object[SLOTS];
    if (slots) {
      for (const child of Object.values(slots)) {
        scan(child);
      }
    }
  };
  scan(args);
  return buffers;
}

export function beginStructure(def, options = {}) {
  const {
    type,
    name,
    size,
  } = def;
  return { 
    constructor: null, 
    copier: null,
    type, 
    name,
    size, 
    instance: {
      members: [],
      template: null,
    },
    static: {
      members: [],
      template: null,
    },
    methods: [],
    options,
  };
}

export function attachMember(s, def) {
  const target = (def.isStatic) ? s.static : s.instance;
  target.members.push(def);
}

export function attachMethod(s, def) {
  s.methods.push(def);
}

export function attachTemplate(s, def) {
  const target = (def.isStatic) ? s.static : s.instance;
  target.template = def.template;
}

export function finalizeStructure(s) {
  try {
    switch (s.type) {
      case StructureType.Singleton: 
        return finalizeSingleton(s);
      case StructureType.Array:
        return finalizeArray(s);
      case StructureType.Struct:
      case StructureType.ExternUnion:
        return finalizeStruct(s);
      case StructureType.TaggedUnion:
        // TODO
        return null;
      case StructureType.Enumeration:
        return finalizeEnumeration(s);
    } 
  } catch (err) {
    console.error(err);
    throw err;
  }
}

function finalizeSingleton(s) {
  const { 
    size,
    name,
    instance: {
      members: [ member ],
    },
    options,
  } = s;
  const primitive = getPrimitive(member.type, member.bitSize);
  const get = obtainGetter(member, options);
  const set = obtainSetter(member, options);
  const copy = obtainCopyFunction(size);
  const copier = s.copier = function (dest, src) {
    copy(dest[MEMORY], src[MEMORY]);
  };
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv, init;
    if (creating) {
      // new operation--expect matching primitive
      if (primitive !== undefined) {
        if (arg !== undefined) {
          init = primitive(arg);
        } 
      }
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = obtainDataView(arg, size);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv },
    });
    if (!creating) {
      return self;
    }
  };
  if (name) {
    Object.defineProperty(constructor, 'name', { value: name, writable: false });
  }
  s.size = size;
  Object.defineProperties(constructor.prototype, {
    get: { value: get, configurable: true, writable: true },
    set: { value: set, configurable: true, writable: true },
    [Symbol.toPrimitive]: { value: get, configurable: true, writable: true },
  });
  return constructor;
}

function finalizeArray(s) {
  const {
    size,
    name,
    instance: {
      members: [ member ],
    },
    options,
  } = s; 
  const copy = obtainCopyFunction(size); 
  const get = obtainArrayGetter(member, options);
  const set = obtainArraySetter(member, options);
  const getLength = obtainArrayLengthGetter(member, options);
  const copier = s.copier = function(dest, src) {
    copy(dest[MEMORY], src[MEMORY]);   
  };
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv, init;
    if (creating) {
      // new operation--expect an array
      // TODO: validate
      if (arg !== undefined) {
        init = arg;
      }
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = obtainDataView(arg, size);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv },
    });
    if (!creating) {
      return self;
    }
  };
  if (name) {
    Object.defineProperty(constructor, 'name', { value: name, writable: false });
  }
  Object.defineProperties(constructor.prototype, {
    get: { value: get, configurable: true, writable: true },
    set: { value: set, configurable: true, writable: true },
    length: { get: getLength, configurable: true },
    [Symbol.iterator]: { value: getArrayIterator, configurable: true },
  });
  attachDataViewAccessors(s);
  return constructor;
}

function finalizeStruct(s) {
  const { 
    size,
    name,
    instance: {
      members,
      template,
    },
    options,
  } = s;
  const copy = obtainCopyFunction(size);
  const descriptors = {};
  for (const member of members) {
    const get = obtainGetter(member, options);
    const set = obtainSetter(member, options);
    descriptors[member.name] = { get, set, configurable: true, enumerable: true };
  }
  const hasSlots = true; // TODO
  const copier = s.copier = function(dest, src) {
    copy(dest[MEMORY], src[MEMORY]);
    if (hasSlots) {
      Object.assign(dest[SLOTS], src[SLOTS]);
    }
  };
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv, init;
    if (creating) {
      // new operation--expect an object
      // TODO: validate
      if (arg !== undefined) {
        init = arg;
      }
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = obtainDataView(arg, size);
    }
    Object.defineProperties(self, {
      [MEMORY]: { value: dv },
    });
    Object.defineProperties(self, descriptors);
    if (hasSlots) {
      Object.defineProperties(self, {
        [SLOTS]: { value: {} },
      });  
    } 
    if (creating) {
      if (template) {
        copier(this, template);
      }
    } else {
      return self;
    }
  };
  if (name) {
    Object.defineProperty(constructor, 'name', { value: name, writable: false });
  }
  attachDataViewAccessors(s);
  attachStaticMembers(s);
  attachMethods(s);
  return constructor;
};

function finalizeEnumeration(s) {
  const { 
    name,
    instance: {
      members,
      template,
    },
    options,
  } = s;
  const primitive = getPrimitive(members[0].type, members[0].bitSize);
  const getValue = obtainArrayGetter(members[0], options);
  const count = members.length;
  const items = {};
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    if (creating) {
      // the "constructor" is only used to convert a number into an enum object
      // new enum items cannot be created
      throwNoNewEnum();    
    }
    let index = -1;
    if (isSequential) {
      // normal enums start at 0 and go up, so the value is the index 
      index = Number(arg);
    } else {
      // it's not sequential, so we need to compare values
      // casting just in case the enum is BigInt
      const v = primitive(arg);
      for (let i = 0; i < count; i++) {
        const value = getValue.call(constructor, i);
        if (value === v) {
          index = i;
          break;
        }
      }
    }
    // return the enum object (created down below)
    return items[index];
  };
  if (name) {
    Object.defineProperty(constructor, 'name', { value: name, writable: false });
  }
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
    // so we don't get an empty object when JSON.stringify() is used
    toJSON: { value: valueOf, configurable: true, writable: true },
  });
  // now that the class has the right hidden properties, getValue() will work 
  // scan the array to see if the enum's numeric representation is sequential
  const isSequential = (() => {
    // try-block in the event that the enum has bigInt items 
    try {
      for (let i = 0; i < count; i++) {
        if (get.call(constructor, i) !== i) {
          return false;
        }
      }
      return true;
    } catch (err) {      
      return false;
    }
  })();
  // attach the enum items to the constructor and the reloc object
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
  attachStaticMembers(s);
  attachMethods(s);
  return constructor;
};

export function attachStaticMembers(s) {
  const {
    constructor,
    static: {
      members,
      template,
    },
    options,
  } = s;
  if (!template) {
    return;
  }
  const descriptors = {
    [SLOTS]: { value: template[SLOTS] },
  };
  // static variables are all pointers, with each represented by an object 
  // sittinng a relocatable slot
  for (const member of members) {
    const get = obtainGetter(member, options);
    const set = obtainSetter(member, options);
    descriptors[member.name] = { get, set, configurable: true, enumerable: true };
  };
  Object.defineProperties(constructor, descriptors);
}

export function attachMethods(s) {
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
      const a = new constructor();
      for (const [ index, arg ] of args.entries()) {
        if (arg !== undefined) {
          a[index] = arg;
        }
      }
      invokeThunk(thunk, a);
      return a.retval;
    }
    Object.defineProperties(f, {
      name: { value: name, writable: false },
    });
    Object.defineProperties(constructor, { 
      [name]: { value: f, configurable: true, enumerable: true, writable: true },
    });
    if (!isStaticOnly) {
      const m = function(...args) {
        const { constructor } = argStruct;
        const a = new constructor();
        a[0] = this;
        for (const [ index, arg ] of args.entries()) {
          if (arg !== undefined) {
            a[index + 1] = arg;
          }
        }
        invokeThunk(thunk, a);
        return a.retval;
      }
      Object.defineProperties(m, {
        name: { value: name, writable: false }, 
      });
      Object.defineProperties(constructor.prototype, {
        [name]: { value: m, configurable: true, writable: true },
      });
    } 
  }
}

function attachDataViewAccessors(s) {
  const {
    constructor: {
      prototype,
    },
    instance: {
      members
    },
  } = s;
  if (!Object.getOwnPropertyDescriptor(prototype, 'dataView')) {
    Object.defineProperties(prototype, { 
      dataView: { get: getDataView, configurable: true, enumerable: true },
    });
  }
  const getTypedArray = obtainTypedArrayGetter(members);
  if (getTypedArray && !Object.getOwnPropertyDescriptor(prototype, 'typedArray')) {
    Object.defineProperties(prototype, {
      typedArray: { get: getTypedArray, configurable: true, enumerable: true },
    });
  }
}
