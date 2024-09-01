import { mixin } from '../environment.js';
import {
  InactiveUnionProperty, InvalidInitializer, MissingUnionInitializer, MultipleUnionInitializers
} from '../errors.js';
import { MemberType } from '../members/all.js';
import {
  getSelf
} from '../object.js';
import { copyPointer, disablePointer, never, resetPointer } from '../pointer.js';
import {
  handleError
} from '../special.js';
import { getChildVivificator, getIteratorIterator, getPointerVisitor } from '../struct.js';
import {
  COPIER, ENTRIES_GETTER, NAME, POINTER_VISITOR, PROPS, PROP_GETTERS, PROP_SETTERS,
  TAG,
  VIVIFICATOR
} from '../symbols.js';
import { StructureType } from './all.js';

export default mixin({
  defineUnion(structure) {
    const {
      type,
      byteSize,
      align,
      instance: { members, template },
      isIterator,
      hasPointer,
    } = structure;
    const isTagged = (type === StructureType.TaggedUnion);
    const exclusion = (isTagged || (type === StructureType.BareUnion && this.runtimeSafety));
    const memberDescriptors = {};
    const memberInitializers = {};
    const memberValueGetters = {};
    const valueMembers = (exclusion) ? members.slice(0, -1) : members;
    const selectorMember = (exclusion) ? members[members.length - 1] : null;
    const { get: getSelector, set: setSelector } = (exclusion) ? this.getDescriptor(selectorMember) : {};
    const getActiveField = (isTagged)
    ? function() {
        const item = getSelector.call(this);
        return item[NAME];
      }
    : function() {
        const index = getSelector.call(this);
        return valueMembers[index].name;
      };
    const setActiveField = (isTagged)
    ? function(name) {
        const { constructor } = selectorMember.structure;
        setSelector.call(this, constructor[name]);
      }
    : function(name) {
        const index = valueMembers.findIndex(m => m.name === name);
        setSelector.call(this, index);
      };
    for (const member of valueMembers) {
      const { name } = member;
      const { get: getValue, set: setValue } = this.getDescriptor(member);
      const get = (exclusion)
      ? function() {
          const currentName = getActiveField.call(this);
          if (name !== currentName) {
            if (isTagged) {
              // tagged union allows inactive member to be queried
              return null;
            } else {
              // whereas bare union does not, since the condition is not detectable
              // when runtime safety is off
              throw new InactiveUnionProperty(structure, name, currentName);
            }
          }
          this[POINTER_VISITOR]?.(resetPointer);
          return getValue.call(this);
        }
      : getValue;
      const set = (exclusion && setValue)
      ? function(value) {
          const currentName = getActiveField.call(this);
          if (name !== currentName) {
            throw new InactiveUnionProperty(structure, name, currentName);
          }
          setValue.call(this, value);
        }
      : setValue;
      const init = (exclusion && setValue)
      ? function(value) {
          setActiveField.call(this, name);
          setValue.call(this, value);
          this[POINTER_VISITOR]?.(resetPointer);
        }
      : setValue;
      memberDescriptors[name] = { get, set, configurable: true, enumerable: true };
      memberInitializers[name] = init;
      memberValueGetters[name] = getValue;
    }
    const hasDefaultMember = !!valueMembers.find(m => !m.isRequired);
    const memberKeys = Object.keys(memberDescriptors);
    const propApplier = this.createPropertyApplier(structure);
    const initializer = function(arg) {
      if (arg instanceof constructor) {
        /* WASM-ONLY-END */
        this[COPIER](arg);
        if (hasPointer) {
          this[POINTER_VISITOR](copyPointer, { vivificate: true, source: arg });
        }
      } else if (arg && typeof(arg) === 'object') {
        let found = 0;
        for (const key of memberKeys) {
          if (key in arg) {
            found++;
          }
        }
        if (found > 1) {
          throw new MultipleUnionInitializers(structure);
        }
        if (propApplier.call(this, arg) === 0 && !hasDefaultMember) {
          throw new MissingUnionInitializer(structure, arg, exclusion);
        }
      } else if (arg !== undefined) {
        throw new InvalidInitializer(structure, 'object with a single property', arg);
      }
    };
    // non-tagged union as marked as not having pointers--if there're actually
    // members with pointers, we need to disable them
    const pointerMembers = members.filter(m => m.structure?.hasPointer);
    const hasInaccessiblePointer = !hasPointer && (pointerMembers.length > 0);
    const modifier = (hasInaccessiblePointer && !this.comptime)
    ? function() {
        // make pointer access throw
        this[POINTER_VISITOR](disablePointer, { vivificate: true });
      }
    : undefined;
    const constructor = structure.constructor = this.createConstructor(structure, { modifier, initializer });
    const fieldDescriptor = (isTagged)
    ? {
        // for tagged union,  only the active field
        get() { return [ getActiveField.call(this) ] }
      }
    : {
        // for bare and extern union, all members are included
        value: valueMembers.map(m => m.name)
      };
    const isChildActive = (isTagged)
    ? function(child) {
        const name = getActiveField.call(this);
        const active = memberValueGetters[name].call(this);
        return child === active;
      }
    : never;
    const toPrimitive = (isTagged)
    ? function(hint) {
      switch (hint) {
        case 'string':
        case 'default':
          return getActiveField.call(this);
        default:
          return getSelector.call(this, 'number');
      }
    }
    : null;
    const getTagClass = function() { return selectorMember.structure.constructor };
    const getIterator = (isIterator) ? getIteratorIterator : getUnionIterator;
    const hasAnyPointer = hasPointer || hasInaccessiblePointer;
    const hasObject = !!members.find(m => m?.type === MemberType.Object);
    const instanceDescriptors = {
      $: { get: getSelf, set: initializer, configurable: true },
      ...memberDescriptors,
      [Symbol.iterator]: { value: getIterator },
      [Symbol.toPrimitive]: isTagged && { value: toPrimitive },
      [ENTRIES_GETTER]: { value: getUnionEntries },
      [TAG]: isTagged && { get: getSelector, configurable: true },
      [VIVIFICATOR]: hasObject && { value: getChildVivificator(structure, this) },
      [POINTER_VISITOR]: hasAnyPointer && { value: getPointerVisitor(structure, { isChildActive }) },
      [PROP_GETTERS]: { value: memberValueGetters },
      [PROPS]: fieldDescriptor,
    };
    const staticDescriptors = {
      tag: isTagged && { get: getTagClass },
    };
    this.attachDescriptors(structure, instanceDescriptors, staticDescriptors);
    // replace regular setters with ones that change the active field
    const setters = constructor.prototype[PROP_SETTERS];
    for (const [ name, init ] of Object.entries(memberInitializers)) {
      if (init) {
        setters[name] = init;
      }
    }
    return constructor;
  },
});

export function isNeededByStructure(structure) {
  switch (structure.type) {
    case StructureType.TaggedUnion:
    case StructureType.BareUnion:
    case StructureType.ExternUnion:
      return true;
    default:
      return false;
  }
}

export function getUnionEntries(options) {
  return {
    [Symbol.iterator]: getUnionEntriesIterator.bind(this, options),
    length: this[PROPS].length,
  };
}

export function getUnionIterator(options) {
  const entries = getUnionEntries.call(this, options);
  return entries[Symbol.iterator]();
}

export function getUnionEntriesIterator(options) {
  const self = this;
  const props = this[PROPS];
  const getters = this[PROP_GETTERS];
  let index = 0;
  return {
    next() {
      let value, done;
      if (index < props.length) {
        const current = props[index++];
        // get value of prop with no check
        value = [ current, handleError(() => getters[current].call(self), options) ];
        done = false;
      } else {
        done = true;
      }
      return { value, done };
    },
  };
}