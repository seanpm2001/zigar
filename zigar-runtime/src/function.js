import { TypeMismatch } from './error';
import { defineProperties, ObjectCache } from './object';
import { MEMORY, VARIANTS } from './symbol';
import { CallResult } from './types';

export function defineFunction(structure, env) {
  const {
    name,
    instance: { members: [ member ], template: thunk },
    static: { template: jsThunkConstructor },
  } = structure;
  const cache = new ObjectCache();
  const { structure: { constructor: Arg, instance: { members: argMembers } } } = member;
  const argCount = argMembers.length - 1;
  const constructor = structure.constructor = function(arg) {
    const creating = this instanceof constructor;
    let self, method, binary;
    let dv, funcId;
    if (creating) {
      if (arguments.length === 0) {
        throw new NoInitializer(structure);
      }
      if (typeof(arg) !== 'function') {
        throw new TypeMismatch('function', arg);
      }
      const constuctorAddr = env.getViewAddress(jsThunkConstructor[MEMORY]);
      funcId = env.getFunctionId(arg);
      dv = env.getFunctionThunk(constuctorAddr, funcId);
    } else {
      dv = arg;
    }
    if (self = cache.find(dv)) {
      return self;
    }
    if (creating) {
      const fn = arg;
      self = anonymous(function(...args) {
        return fn(...args);
      });
      method = function(...args) {
        return fn([ this, ...args]);
      }
      binary = function(dv, asyncCallHandle) {
        let result = CallResult.OK;
        let awaiting = false;
        try {
          const argStruct = Arg(dv);
          const args = [];
          for (let i = 0; i < argCount; i++) {
            args.push(argStruct[i]);
          }
          const retval = fn(...args);
          if (retval?.[Symbol.toStringTag] === 'Promise') {
            if (asyncCallHandle) {
              retval.then((value) => {
                argStruct.retval = value;
              }).catch((err) => {
                console.error(err);
                result = CallResult.Failure;
              }).then(() => {
                env.finalizeAsyncCall(asyncCallHandle, result);
              });
              awaiting = true;
            } else {
              result = CallResult.Deadlock;
            }
          } else {
            argStruct.retval = retval;
          }
        } catch (err) {
          console.error(err);
          result = CallResult.Failure;
        }
        if (!awaiting && asyncCallHandle) {
          env.finalizeAsyncCall(asyncCallHandle, result);
        }
        return result;
      };
      env.setFunctionCaller(funcId, binary);
    } else {
      const invoke = function(argStruct) {
        const thunkAddr = env.getViewAddress(thunk[MEMORY]);
        const funcAddr = env.getViewAddress(self[MEMORY]);
        env.invokeThunk(thunkAddr, funcAddr, argStruct);
      };
      self = anonymous(function (...args) {
        const argStruct = new Arg(args, self.name, 0);
        invoke(argStruct);
        return argStruct.retval;
      });
      method = function(...args) {
        const argStruct = new Arg([ this, ...args ], variant.name, 1);
        invoke(argStruct);
        return argStruct.retval;
      };
      binary = function(dv) {
        invoke(Arg(dv));
      };
    }
    Object.setPrototypeOf(self, constructor.prototype);
    self[MEMORY] = dv;
    defineProperties(self, {
      length: { value: argCount, writable: false },
      [VARIANTS]: { value: { method, binary } },
    });
    defineProperties(method, {
      length: { value: argCount - 1, writable: false },
      name: { get: () => self.name },
    });
    cache.save(dv, self);
    return self;
  };
  constructor.prototype = Object.create(Function.prototype);
  defineProperties(constructor.prototype, {
    constructor: { value: constructor },
  });
  return constructor;
}

function anonymous(f) {
  return f
};
