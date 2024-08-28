import { ArgumentCountMismatch, adjustArgumentError } from '../../error.js';
import { getMemoryCopier } from '../../memory.js';
import { getChildVivificator, getPointerVisitor } from '../../struct.js';
import {
  ALIGN, COPIER, MEMORY, MEMORY_RESTORER, POINTER_VISITOR, SIZE, SLOTS, VIVIFICATOR
} from '../../symbol.js';
import { defineProperties, mixin } from '../class.js';
import { MemberType } from '../members/all.js';
import { StructureType } from './all.js';

mixin({
  defineArgStruct(structure) {
    const {
      byteSize,
      align,
      instance: { members },
      hasPointer,
    } = structure;
    const thisEnv = this;
    const hasObject = !!members.find(m => m.type === MemberType.Object);
    const argKeys = members.slice(1).map(m => m.name);
    const argCount = argKeys.length;
    const constructor = structure.constructor = function(args, name, offset) {
      const creating = this instanceof constructor;
      let self, dv;
      if (creating) {
        self = this;
        dv = thisEnv.allocateMemory(byteSize, align);
      } else {
        self = Object.create(constructor.prototype);
        dv = args;
      }
      self[MEMORY] = dv;
      if (hasObject) {
        self[SLOTS] = {};
      }
      if (creating) {
        if (args.length !== argCount) {
          throw new ArgumentCountMismatch(name, argCount - offset, args.length - offset);
        }
        for (const [ index, key ] of argKeys.entries()) {
          try {
            this[key] = args[index];
          } catch (err) {
            throw adjustArgumentError(name, index - offset, argCount - offset, err);
          }
        }
      } else {
        return self;
      }
    };
    const memberDescriptors = {};
    for (const member of members) {
      memberDescriptors[member.name] = this.getDescriptor(member);
    }
    const { slot: retvalSlot, type: retvalType } = members[0];
    const isChildMutable = (retvalType === MemberType.Object)
    ? function(object) {
        const child = this[VIVIFICATOR](retvalSlot);
        return object === child;
      }
    : function() { return false };
    defineProperties(constructor.prototype, {
      ...memberDescriptors,
      [COPIER]: { value: getMemoryCopier(byteSize) },
      [VIVIFICATOR]: hasObject && { value: getChildVivificator(structure, this) },
      [POINTER_VISITOR]: hasPointer && { value: getPointerVisitor(structure, { isChildMutable }) },
      [MEMORY_RESTORER]: process.env.WASM && { value: this.getMemoryRestorer(null) },
    });
    defineProperties(constructor, {
      [ALIGN]: { value: align },
      [SIZE]: { value: byteSize },
    });
  },
});

export function isRequiredByStructure(structure) {
  return structure.type === StructureType.ArgStruct;
}