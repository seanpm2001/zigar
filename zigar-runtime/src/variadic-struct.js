import { ArgumentCountMismatch, InvalidVariadicArgument, adjustArgumentError } from './error.js';
import { getDescriptor } from './member.js';
import { getMemoryCopier } from './memory.js';
import { defineProperties } from './object.js';
import { always } from './pointer.js';
import { getChildVivificator } from './struct.js';
import {
  ALIGN, ATTRIBUTES, COPIER, MEMORY, MEMORY_RESTORER, PARENT, POINTER_VISITOR, PRIMITIVE, SIZE,
  SLOTS, VIVIFICATOR
} from './symbol.js';
import { MemberType } from './types.js';

export function defineVariadicStruct(structure, env) {
  const {
    byteSize,
    align,
    instance: { members },
  } = structure;
  const hasObject = !!members.find(m => m.type === MemberType.Object);
  const argKeys = members.slice(1).map(m => m.name);
  const maxSlot = members.map(m => m.slot).sort().pop();
  const argCount = argKeys.length;
  const constructor = structure.constructor = function(args, name, offset) {
    if (args.length < argCount) {
      throw new ArgumentCountMismatch(name, `at least ${argCount - offset}`, args.length - offset);
    }
    // calculate the actual size of the struct based on arguments given
    let totalByteSize = byteSize;
    let maxAlign = align;
    const varArgs = args.slice(argCount);
    const offsets = {};
    for (const [ index, arg ] of varArgs.entries()) {
      const dv = arg[MEMORY]
      if (!dv) {
        const err = new InvalidVariadicArgument();
        throw adjustArgumentError(name, index - offset, argCount - offset, err);
      }
      const argAlign = arg.constructor[ALIGN];
      const offset = offsets[index] = (totalByteSize + argAlign - 1) & ~(argAlign - 1);
      totalByteSize = offset + dv.byteLength;
      if (argAlign > maxAlign) {
        maxAlign = argAlign;
      }
    }
    const attrs = new ArgAttributes(args.length, env);
    const dv = env.allocateMemory(totalByteSize, maxAlign);
    this[MEMORY] = dv;
    this[SLOTS] = {};
    for (const [ index, key ] of argKeys.entries()) {
      try {
        this[key] = args[index];
        const { bitOffset, byteSize, type } = members[index + 1];
        attrs.set(index, bitOffset / 8, byteSize, type);
      } catch (err) {
        throw adjustArgumentError(name, index - offset, argCount - offset, err);
      }
    }
    for (const [ index, arg ] of varArgs.entries()) {
      // create additional child objects and copy arguments into them
      const slot = maxSlot + index + 1;
      const { byteLength } = arg[MEMORY];
      const offset = offsets[index];
      const childDV = env.obtainView(dv.buffer, offset, byteLength);
      const child = this[SLOTS][slot] = arg.constructor.call(PARENT, childDV);
      child.$ = arg;
      attrs.set(argCount + index, offset, byteLength, arg.constructor[PRIMITIVE]);
    }
    this[ATTRIBUTES] = attrs;
  };
  const memberDescriptors = {};
  for (const member of members) {
    memberDescriptors[member.name] = getDescriptor(member, env);
  }
  const { slot: retvalSlot, type: retvalType } = members[0];
  const isChildMutable = (retvalType === MemberType.Object)
  ? function(object) {
      const child = this[VIVIFICATOR](retvalSlot);
      return object === child;
    }
  : function() { return false };
  const visitPointers = function(cb, options = {}) {
    const {
      vivificate = false,
      isActive = always,
      isMutable = always,
    } = options;
    const childOptions = {
      ...options,
      isActive,
      isMutable: (object) => isMutable(this) && isChildMutable.call(this, object),
    };
    if (vivificate && retvalType === MemberType.Object) {
      this[VIVIFICATOR](retvalSlot);
    }
    for (const child of Object.values(this[SLOTS])) {
      child?.[POINTER_VISITOR]?.(cb, childOptions);
    }
  };
  defineProperties(constructor.prototype, {
    ...memberDescriptors,
    [COPIER]: { value: getMemoryCopier(undefined, true) },
    [VIVIFICATOR]: hasObject && { value: getChildVivificator(structure, env) },
    [POINTER_VISITOR]: { value: visitPointers },
    /* WASM-ONLY */
    [MEMORY_RESTORER]: { value: function() {} },
    /* WASM-ONLY-END */
  });
  defineProperties(constructor, {
    [ALIGN]: { value: align },
    [SIZE]: { value: byteSize },
  });
  return constructor;
}

function ArgAttributes(length, env) {
  this[MEMORY] = env.allocateMemory(length * 4, 4);
  this.length = length;
  this.littleEndian = env.littleEndian;
}
Object.assign(ArgAttributes.prototype, {
  [COPIER]: getMemoryCopier(4, true),
  [ALIGN]: 4,
  set: function(index, offset, size, type) {
    const dv = this[MEMORY];
    dv.setUint16(index * 4, offset, this.littleEndian);
    dv.setUint8(index * 4 + 2, Math.min(255, size));
    dv.setUint8(index * 4 + 3, type === MemberType.Float);
  }
});
