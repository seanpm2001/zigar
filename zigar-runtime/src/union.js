import { StructureType } from './structure.js';
import { MemberType, getAccessors } from './member.js';
import { getMemoryCopier, restoreMemory } from './memory.js';
import { getDataView } from './data-view.js';
import { addStaticMembers } from './static.js';
import { addMethods } from './method.js';
import { addSpecialAccessors, getSpecialKeys } from './special.js';
import { addChildVivificators, addPointerVisitor, getSelf } from './struct.js';
import {
  throwInvalidInitializer,
  throwMissingUnionInitializer,
  throwMultipleUnionInitializers,
  throwNoProperty,
  throwInactiveUnionProperty,
  throwNoInitializer,
} from './error.js';
import { copyPointer, disablePointer, resetPointer } from './pointer.js';
import { MEMORY, ENUM_NAME, ENUM_ITEM, TAG, SLOTS, POINTER_VISITOR } from './symbol.js';

export function finalizeUnion(s) {
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
  let valueMembers;
  const isTagged = (type === StructureType.TaggedUnion);
  const exclusion = (isTagged || (type === StructureType.BareUnion && runtimeSafety));
  if (exclusion) {
    valueMembers = members.slice(0, -1);
    const selectorMember = members[members.length - 1];
    const { get: getSelector, set: setSelector } = getAccessors(selectorMember, options);
    let getName, setName;
    if (type === StructureType.TaggedUnion) {
      const { structure: { constructor } } = selectorMember;
      getEnumItem = getSelector;
      getName = function() {
        const item = getSelector.call(this);
        return item[ENUM_NAME];
      };
      setName = function(name) {
        setSelector.call(this, constructor[name]);
      };
    } else {
      const names = valueMembers.map(m => m.name);
      getName = function() {
        const index = getSelector.call(this);
        return names[index];
      };
      setName = function(name) {
        const index = names.indexOf(name);
        setSelector.call(this, index);
      };
    }
    for (const member of valueMembers) {
      const { name, slot } = member;
      const { get: getValue, set: setValue } = getAccessors(member, options);
      const update = (isTagged) ? function(name) {
        if (this[TAG]?.name !== name) {
          this[TAG]?.clear?.();
          this[TAG] = { name };
          if (hasPointer) {
            this[TAG].clear = () => {
              const object = this[SLOTS][slot];
              object[POINTER_VISITOR](false, null, resetPointer);
            };
          }
        }
      } : null;
      const get = function() {
        const currentName = getName.call(this);
        update?.call(this, currentName);
        if (name !== currentName) {
          if (isTagged) {
            return null;
          } else {
            throwInactiveUnionProperty(s, name, currentName);
          }
        }
        return getValue.call(this);
      };
      const set = function(value) {
        const currentName = getName.call(this);
        update?.call(this, currentName);
        if (name !== currentName) {
          throwInactiveUnionProperty(s, name, currentName);
        }
        setValue.call(this, value);
      };
      const init = function(value) {
        setName.call(this, name);
        setValue.call(this, value);
        update?.call(this, name);
      };
      descriptors[member.name] = { get, set, init, update, configurable: true, enumerable: true };
    }
  } else {
    // extern union
    valueMembers = members;
    for (const member of members) {
      const { get, set } = getAccessors(member, options);
      descriptors[member.name] = { get, set, init: set, configurable: true, enumerable: true };
    }
  }
  const hasObject = !!members.find(m => m.type === MemberType.Object);
  const pointerMembers = members.filter(m => m.structure.hasPointer);
  // non-tagged union as marked as not having pointers--if there're actually
  // members with pointers, we need to disable them
  const hasInaccessiblePointer = !hasPointer && (pointerMembers.length > 0);
  const constructor = s.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, dv;
    if (creating) {
      if (arguments.length === 0) {
        throwNoInitializer(s);
      }
      self = this;
      dv = new DataView(new ArrayBuffer(size));
    } else {
      self = Object.create(constructor.prototype);
      dv = getDataView(s, arg);
    }
    self[MEMORY] = dv;
    if (isTagged) {
      // don't know the TAG property in the console, since it's not always up-to-date
      Object.defineProperties(self, TAG, { value: null, writable: true });
    }
    Object.defineProperties(self, descriptors);
    if (hasObject) {
      self[SLOTS] = {};
      if (hasInaccessiblePointer) {
        // make pointer access throw
        self[POINTER_VISITOR](true, null, disablePointer);
      }
    }
    if (creating) {
      initializer.call(self, arg);
    }
    if (isTagged) {
      return new Proxy(self, taggedProxyHandlers);
    } else {
      return (creating) ? undefined : self;
    }
  };
  const hasDefaultMember = !!valueMembers.find(m => !m.isRequired);
  const copy = getMemoryCopier(size);
  const specialKeys = getSpecialKeys(s);
  const initializer = function(arg) {
    if (arg instanceof constructor) {
      restoreMemory.call(this);
      restoreMemory.call(arg);
      copy(this[MEMORY], arg[MEMORY]);
      if (hasPointer) {
        this[POINTER_VISITOR](true, arg, copyPointer);
      }
    } else {
      if (arg && typeof(arg) === 'object') {
        const keys = Object.keys(arg);
        let found = 0;
        let specialInit = false;
        for (const key of keys) {
          if (descriptors.hasOwnProperty(key)) {
            found++;
          } else if (specialKeys.includes(key)) {
            specialInit = true;
          } else {
            throwNoProperty(s, key);
          }
        }
        if (found !== 1) {
          if (found === 0) {
            if (!specialInit && !hasDefaultMember) {
              throwMissingUnionInitializer(s, arg, exclusion);
            }
          } else {
            throwMultipleUnionInitializers(s);
          }
        }
        if (specialInit) {
          for (const key of keys) {
            this[key] = arg[keys];
          }
        } else if (found === 0) {
          if (template) {
            restoreMemory.call(this);
            copy(this[MEMORY], template[MEMORY]);
            if (hasPointer) {
              this[POINTER_VISITOR](true, template, copyPointer);
            }
          }
        } else {
          for (const key of keys) {
            const { init } = descriptors[key];
            init.call(this, arg[key]);
          }
        }
      } else if (arg !== undefined) {
        throwInvalidInitializer(s, 'object with a single property', arg);
      }
    }
  };
  if (isTagged) {
    // enable casting to enum
    Object.defineProperty(constructor.prototype, ENUM_ITEM, { get: getEnumItem, configurable: true });
  }
  Object.defineProperty(constructor.prototype, '$', { get: getSelf, set: initializer, configurable: true });
  if (hasObject) {
    addChildVivificators(s);
    if (hasPointer || hasInaccessiblePointer) {
      addPointerVisitor(s);
    }
  }
  addSpecialAccessors(s);
  addStaticMembers(s);
  addMethods(s);
  return constructor;
};

const taggedProxyHandlers = {
  ownKeys(union) {
    const item = union[ENUM_ITEM];
    const name = item[ENUM_NAME];
    return [ name, MEMORY ];
  },
};