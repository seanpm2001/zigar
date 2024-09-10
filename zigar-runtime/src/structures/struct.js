import { MemberFlag, StructureFlag, StructureType } from '../constants.js';
import { mixin } from '../environment.js';
import { InvalidInitializer } from '../errors.js';
import {
  getStructEntries, getStructIterator, getVectorEntries, getVectorIterator, getZigIterator
} from '../iterators.js';
import { COPY, ENTRIES, INITIALIZE, KEYS, PROPS, SETTERS, VISIT, VIVIFICATE } from '../symbols.js';
import { defineValue } from '../utils.js';

export default mixin({
  defineStruct(structure, descriptors) {
    const {
      instance: { members },
      flags,
    } = structure;
    const backingIntMember = members.find(m => m.flags & MemberFlag.IsBackingInt);
    const backingInt = backingIntMember && this.defineMember(backingIntMember);
    const propApplier = this.createApplier(structure);
    const initializer = function(arg) {
      if (arg instanceof constructor) {
        this[COPY](arg);
        if (flags & StructureFlag.HasPointer) {
          this[VISIT]('copy', { vivificate: true, source: arg });
        }
      } else if (arg && typeof(arg) === 'object') {
        propApplier.call(this, arg);
      } else if ((typeof(arg) === 'number' || typeof(arg) === 'bigint') && backingInt) {
        backingInt.set.call(this, arg);
      } else if (arg !== undefined) {
        throw new InvalidInitializer(structure, 'object', arg);
      }
    };
    const constructor = this.createConstructor(structure);
    // add descriptors of struct field
    const setters = descriptors[SETTERS].value;
    const keys = descriptors[KEYS].value;
    const props = [];
    for (const member of members.filter(m => !!m.name)) {
      const { name, flags } = member;
      const { set } = descriptors[name] = this.defineMember(member);
      if (set) {
        if (flags & MemberFlag.IsRequired) {
          set.required = true;
        }
        setters[name] = set;
        keys.push(name);
      }
      props.push(name);
    }
    descriptors.$ = { get() { return this }, set: initializer };
    // add length and entries if struct is a tuple
    descriptors.length = (flags & StructureFlag.IsTuple) && {
      value: (members.length > 0) ? parseInt(members[members.length - 1].name) + 1 : 0,
    };
    descriptors.entries = (flags & StructureFlag.IsTuple) && {
      value: getVectorEntries,
    };
    // allow conversion of packed struct to number when there's a backing int
    descriptors[Symbol.toPrimitive] = backingInt && {
      value(hint) {
        return (hint === 'string')
          ? Object.prototype.toString.call(this)
          : backingInt.get.call(this);
      }
    };
    // add iterator
    descriptors[Symbol.iterator] = defineValue(
      (flags & StructureFlag.IsIterator)
      ? getZigIterator
      : (flags & StructureFlag.IsTuple)
        ? getVectorIterator
        : getStructIterator
    );
    descriptors[INITIALIZE] = defineValue(initializer);
    // for creating complex fields on access
    descriptors[VIVIFICATE] = (flags & StructureFlag.HasObject) && this.defineVivificatorStruct(structure);
    // for operating on pointers contained in the struct
    descriptors[VISIT] = (flags & StructureFlag.HasPointer) && this.defineVisitorStruct(structure);
    descriptors[ENTRIES] = { get: (flags & StructureFlag.IsTuple) ? getVectorEntries : getStructEntries };
    descriptors[PROPS] = defineValue(props);
    return constructor;
  }
});

export function isNeededByStructure(structure) {
  return structure.type === StructureType.Struct;
}