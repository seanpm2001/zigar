import { MemberFlag, StructureFlag, structureNames, StructureType } from '../constants.js';
import { mixin } from '../environment.js';
import {
  MissingInitializers, NoInitializer, NoProperty
} from '../errors.js';
import { getStructEntries, getStructIterator } from '../iterators.js';
import {
  ALIGN, CACHE, CAST,
  CONST_TARGET, COPY, ENTRIES, FINALIZE, FLAGS, INITIALIZE, KEYS, MEMORY, MODIFY,
  PROPS,
  RESTORE,
  SETTERS, SHAPE, SIZE, SLOTS, TYPE,
  TYPED_ARRAY,
  VARIANTS, VISIT
} from '../symbols.js';
import { defineProperties, defineProperty, defineValue, getTypeName, ObjectCache } from '../utils.js';

export default mixin({
  defineStructure(structure) {
    const {
      type,
      name,
      byteSize,
    } = structure;
    const handlerName = `define${structureNames[type]}`;
    const f = this[handlerName];
    if (process.env.DEV) {
      /* c8 ignore start */
      if (!f) {
        throw new Error(`Missing method: ${handlerName}`);
      }
      /* c8 ignore end */
    }
    // default discriptors
    const keys = [];
    const setters = {};
    const descriptors = {
      delete: this.defineDestructor(),
      [Symbol.toStringTag]: defineValue(name),
      [CONST_TARGET]: { value: null },
      [SETTERS]: defineValue(setters),
      [KEYS]: defineValue(keys),
      // add memory copier (from mixin "memory/copying")
      [COPY]: this.defineCopier(byteSize),
      // add special methods like toJSON() (from mixin "members/special-method")
      ...this.defineSpecialMethods?.(),
      // add special properties like dataView (from mixin "members/special-props")
      ...this.defineSpecialProperties?.(structure),
      ...(process.env.TARGET === 'wasm' && {
        // add method for recoverng from array detachment
        [RESTORE]: this.defineRestorer?.(),
      }),
    };
    for (const [ name, descriptor ] of Object.entries(descriptors)) {
      let s;
      if (s = descriptor?.set) {
        setters[name] = s;
        keys.push(name);
      }
    }
    const constructor = f.call(this, structure, descriptors);
    defineProperties(constructor.prototype, descriptors);
    structure.constructor = constructor;
    return constructor;
  },
  finalizeStructure(structure) {
    const {
      name,
      type,
      constructor,
      align,
      byteSize,
      flags,
      static: { members, template },
    } = structure;
    const props = [];
    const staticDescriptors = {
      name: defineValue(name),
      [ALIGN]: defineValue(align),
      [SIZE]: defineValue(byteSize),
      [TYPE]: defineValue(type),
      [FLAGS]: defineValue(flags),
      [PROPS]: defineValue(props),
      [TYPED_ARRAY]: defineValue(this.getTypedArray(structure)),
      [Symbol.iterator]: defineValue(getStructIterator),
      [ENTRIES]: { get: getStructEntries },
      [PROPS]: defineValue(props),
      ...this.defineSpecialMethods?.(),
    };
    const descriptors = {};
    for (const member of members) {
      const { name, slot } = member;
      if (member.structure.type === StructureType.Function) {
        const fn = template[SLOTS][slot];
        staticDescriptors[name] = defineValue(fn);
        // provide a name if one isn't assigned yet
        if (!fn.name) {
          defineProperty(fn, 'name', { value: name });
        }
        // see if it's a getter or setter
        const [ accessorType, propName ] = /^(get|set)\s+([\s\S]+)/.exec(name)?.slice(1) ?? [];
        const argRequired = (accessorType === 'get') ? 0 : 1;
        if (accessorType && fn.length  === argRequired) {
          const descriptor = staticDescriptors[propName] ??= {};
          descriptor[accessorType] = fn;
        }
        // see if it's a method
        if (startsWithSelf(member, structure)) {
          const { method } = fn[VARIANTS];
          descriptors[name] = defineValue(method);
          if (accessorType && method.length  === argRequired) {
            const descriptor = descriptors[propName] ??= {};
            descriptor[accessorType] = method;
          }
        }
      } else {
        staticDescriptors[name] = this.defineMember(member);
        props.push(name);
      }
    }
    // static variable/constants are stored in slots
    staticDescriptors[SLOTS] = (props.length > 0) && defineValue(template[SLOTS]);
    const handlerName = `finalize${structureNames[type]}`;
    const f = this[handlerName];
    if (f?.call(this, structure, staticDescriptors) !== false) {
      defineProperties(constructor.prototype, descriptors);
      defineProperties(constructor, staticDescriptors);
    }
  },
  createConstructor(structure, handlers = {}) {
    const {
      byteSize,
      align,
      flags,
      instance: { members, template },
    } = structure;
    const { onCastError } = handlers;
    // comptime fields are stored in the instance template's slots
    let comptimeFieldSlots;
    if (template?.[SLOTS]) {
      const comptimeMembers = members.filter(m => m.flags & MemberFlag.IsReadOnly);
      if (comptimeMembers.length > 0) {
        comptimeFieldSlots = comptimeMembers.map(m => m.slot);
      }
    }
    const cache = new ObjectCache();
    const thisEnv = this;
    const constructor = function(arg, options = {}) {
      const {
        fixed = false,
      } = options;
      const creating = this instanceof constructor;
      let self, dv;
      if (creating) {
        if (arguments.length === 0) {
          throw new NoInitializer(structure);
        }
        self = this;
        if (flags & StructureFlag.HasSlot) {
          self[SLOTS] = {};
        }
        if (SHAPE in self) {
          // provided by defineStructureSlice(); the slice is different from other structures
          // as it does not have a fixed size; memory is allocated by the slice initializer
          // based on the argument given
          self[INITIALIZE](arg, fixed);
          dv = self[MEMORY];
        } else {
          self[MEMORY] = dv = thisEnv.allocateMemory(byteSize, align, fixed);
        }
      } else {
        if (CAST in constructor) {
          // casting from number, string, etc.
          self = constructor[CAST].call(this, arg, options);
          if (self !== false) {
            return self;
          }
        }
        // look for buffer
        dv = thisEnv.extractView(structure, arg, onCastError);
        if (self = cache.find(dv)) {
          return self;
        }
        self = Object.create(constructor.prototype);
        if (SHAPE in self) {
          thisEnv.assignView(self, dv, structure, false, false);
        } else {
          self[MEMORY] = dv;
        }
        if (flags & StructureFlag.HasSlot) {
          self[SLOTS] = {};
        }
      }
      if (comptimeFieldSlots) {
        for (const slot of comptimeFieldSlots) {
          self[SLOTS][slot] = template[SLOTS][slot];
        }
      }
      if (MODIFY in self) {
        self[MODIFY]();
      }
      if (creating) {
        // initialize object unless that's done already
        if (!(SHAPE in self)) {
          self[INITIALIZE](arg);
        }
      }
      if (FINALIZE in self) {
        self = self[FINALIZE]();
      }
      return cache.save(dv, self);
    };
    defineProperty(constructor, CACHE, defineValue(cache));
    return constructor;
  },
  defineDestructor() {
    const thisEnv = this;
    return {
      value() {
        const dv = this[MEMORY];
        this[MEMORY] = null;
        if (this[SLOTS]) {
          this[SLOTS] = {};
        }
        thisEnv.releaseFixedView(dv);
      }
    };
  },
  createApplier(structure) {
    const { instance: { template } } = structure;
    return function(arg, fixed) {
      const argKeys = Object.keys(arg);
      const keys = this[KEYS];
      const setters = this[SETTERS];
      // don't accept unknown props
      for (const key of argKeys) {
        if (!(key in setters)) {
          throw new NoProperty(structure, key);
        }
      }
      // checking each name so that we would see inenumerable initializers as well
      let normalCount = 0;
      let normalFound = 0;
      let normalMissing = 0;
      let specialFound = 0;
      for (const key of keys) {
        const set = setters[key];
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
        const missing = keys.filter(k => setters[k].required && !(k in arg));
        throw new MissingInitializers(structure, missing);
      }
      if (specialFound + normalFound > argKeys.length) {
        // some props aren't enumerable
        for (const key of keys) {
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
            this[COPY](template);
          }
          this[VISIT]?.('copy', { vivificate: true, source: template });
        }
      }
      for (const key of argKeys) {
        const set = setters[key];
        set.call(this, arg[key], fixed);
      }
      return argKeys.length;
    };
  },
  getTypedArray(structure) {
    const { type, instance } = structure;
    if (type !== undefined && instance) {
      const [ member ] = instance.members;
      switch (type) {
        case StructureType.Enum:
        case StructureType.ErrorSet:
        case StructureType.Primitive: {
          const typeName = getTypeName(member)
          const arrayName = typeName + 'Array';
          return globalThis[arrayName];
        }
        case StructureType.Array:
        case StructureType.Slice:
        case StructureType.Vector:
          return this.getTypedArray(member.structure);
      }
    }
  },
  ...(process.env.target === 'wasm' ? {
    exports: {
      defineStructure: { argType: 'v' },
    },
  } : process.env.target === 'node' ? {
    exports: {
      defineStructure: null,
    },
  } : undefined),
});

export function isNeededByStructure(structure) {
  return true;
}

function startsWithSelf(fnMember, structure) {
  const argStructure = fnMember.structure.instance.members[0].structure;
  // get structure of first argument (members[0] is retval)
  const arg0Structure = argStructure.instance.members[1]?.structure;
  if (arg0Structure) {
    if (arg0Structure === structure) {
      return true;
    } else if (arg0Structure.type === StructureType.Pointer) {
      const targetStructure = arg0Structure.instance.members[0].structure;
      if (targetStructure === structure) {
        return true;
      }
    }

  }
  return false;
}