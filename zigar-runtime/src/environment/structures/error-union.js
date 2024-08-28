import { NotInErrorSet } from '../../error.js';
import { getMemoryCopier, getMemoryResetter } from '../../memory.js';
import { makeReadOnly } from '../../object.js';
import { copyPointer, resetPointer } from '../../pointer.js';
import {
  convertToJSON, getBase64Descriptor, getDataViewDescriptor, getValueOf
} from '../../special.js';
import { getChildVivificator, getPointerVisitor } from '../../struct.js';
import {
  ALIGN, CLASS, COPIER, POINTER_VISITOR, RESETTER, SIZE, TYPE, VIVIFICATOR, WRITE_DISABLER
} from '../../symbol.js';
import { isErrorJSON } from '../../types.js';
import { mixin } from '../class.js';
import { MemberType } from '../members/all.js';
import { StructureType } from './all.js';

mixin({
  defineErrorUnion(structure) {
    const {
      byteSize,
      align,
      instance: { members },
      hasPointer,
    } = structure;
    const { get: getValue, set: setValue } = this.getDescriptor(members[0]);
    const { get: getError, set: setError } = this.getDescriptor(members[1]);
    const get = function() {
      const errNum = getError.call(this, 'number');
      if (errNum) {
        throw getError.call(this);
      } else {
        return getValue.call(this);
      }
    };
    const isValueVoid = members[0].type === MemberType.Void;
    const errorSet = members[1].structure.constructor;
    const isChildActive = function() {
      return !getError.call(this, 'number');
    };
    const clearValue = function() {
      this[RESETTER]();
      this[POINTER_VISITOR]?.(resetPointer);
    };
    const hasObject = !!members.find(m => m.type === MemberType.Object);
    const propApplier = this.createPropertyApplier(structure);
    const initializer = function(arg) {
      if (arg instanceof constructor) {
        this[COPIER](arg);
        if (hasPointer) {
          if (isChildActive.call(this)) {
            this[POINTER_VISITOR](copyPointer, { vivificate: true, source: arg });
          }
        }
      } else if (arg instanceof errorSet[CLASS] && errorSet(arg)) {
        setError.call(this, arg);
        clearValue.call(this);
      } else if (arg !== undefined || isValueVoid) {
        try {
          // call setValue() first, in case it throws
          setValue.call(this, arg);
          setError.call(this, 0, 'number');
        } catch (err) {
          if (arg instanceof Error) {
            // we give setValue a chance to see if the error is actually an acceptable value
            // now is time to throw an error
            throw new NotInErrorSet(structure);
          } else if (isErrorJSON(arg)) {
            setError.call(this, arg);
            clearValue.call(this);
          } else if (arg && typeof(arg) === 'object') {
            if (propApplier.call(this, arg) === 0) {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
    };
    const constructor = structure.constructor = this.createConstructor(structure, { initializer });
    const { bitOffset: valueBitOffset, byteSize: valueByteSize } = members[0];
    const instanceDescriptors = {
      '$': { get, set: initializer },
      dataView: getDataViewDescriptor(structure),
      base64: getBase64Descriptor(structure),
      valueOf: { value: getValueOf },
      toJSON: { value: convertToJSON },
      delete: { value: this.getDestructor() },
      [COPIER]: { value: getMemoryCopier(byteSize) },
      [RESETTER]: { value: getMemoryResetter(valueBitOffset / 8, valueByteSize) },
      [VIVIFICATOR]: hasObject && { value: getChildVivificator(structure, this) },
      [POINTER_VISITOR]: hasPointer && { value: getPointerVisitor(structure, { isChildActive }) },
      [WRITE_DISABLER]: { value: makeReadOnly },
    };
    const staticDescriptors = {
      [ALIGN]: { value: align },
      [SIZE]: { value: byteSize },
      [TYPE]: { value: structure.type },
    };
    this.attachDescriptors(constructor, instanceDescriptors, staticDescriptors);
  },
});

export function isRequiredByStructure(structure) {
  return structure.type === StructureType.ErrorUnion;
}