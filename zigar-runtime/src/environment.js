import { defineProperties, getStructureFactory, getStructureName } from './structure.js';
import { decodeText } from './text.js';
import { initializeErrorSets } from './error-set.js';
import { throwAlignmentConflict, throwZigError } from './error.js';
import { ADDRESS_GETTER, ADDRESS_SETTER, ALIGN, CHILD_VIVIFICATOR, ENVIRONMENT, LENGTH_GETTER,
  LENGTH_SETTER, MEMORY, MEMORY_COPIER, POINTER_SELF, POINTER_VISITOR, SENTINEL, SIZE, SLOTS,
  THUNK_REPLACER } from './symbol.js';
import { getCopyFunction, getMemoryCopier } from './memory.js';

const defAlign = 16;

export class Environment {
  context;
  contextStack = [];
  consolePending = [];
  consoleTimeout = 0;
  slots = {}

  /*
  Functions to be defined in subclass:

  getBufferAddress(buffer: ArrayBuffer): bigInt|number {
    // return a buffer's address
  }
  allocateRelocatableMemory(len: number, align: number): DataView {
    // allocate memory and remember its address
  }
  allocateShadowMemory(len: number, align: number): DataView {
    // allocate memory for shadowing objects
  }
  freeRelocatableMemory(address: bigInt|number, len: number, align: number): void {
    // free previously allocated memory
  }
  freeShadowMemory(address: bigInt|number, len: number, align: number): void {
    // free memory allocated for shadow
  }
  allocateFixedMemory(len: number, align: number): DataView {
    // allocate fixed memory and keep a reference to it
  }
  freeFixedMemory(address: bigInt|number, len: number, align: number): void {
    // free previously allocated fixed memory return the reference
  }
  obtainFixedView(address: bigInt|number, len: number): DataView {
    // obtain a data view of memory at given address
  }
  isFixed(dv: DataView): boolean {
    // return true/false depending on whether view is point to fixed memory
  }
  copyBytes(dst: DataView, address: bigInt|number, len: number): void {
    // copy memory at given address into destination view
  }
  findSentinel(address, bytes: DataView): number {
    // return offset where sentinel value is found
  }
  getTargetAddress(target: object, cluster: object|undefined) {
    // return the address of target's buffer if correctly aligned
  }
  */

  startContext() {
    if (this.context) {
      this.contextStack.push(this.context);
    }
    this.context = new CallContext();
  }

  endContext() {
    this.context = this.contextStack.pop();
  }

  createBuffer(len, align, fixed = false) {
    if (fixed) {
      return this.createFixedBuffer(len);
    } else {
      return this.createRelocatableBuffer(len, align);
    }
  }

  createRelocatableBuffer(len) {
    const buffer = new ArrayBuffer(len);
    return new DataView(buffer);
  }

  registerMemory(dv, targetDV = null) {
    const { memoryList } = this.context;
    const address = this.getViewAddress(dv);
    const index = findMemoryIndex(memoryList, address);
    memoryList.splice(index, 0, { address, dv, len: dv.byteLength, targetDV });
    return address;
  }

  unregisterMemory(address) {
    const { memoryList } = this.context;
    const index = findMemoryIndex(memoryList, address);
    const prev = memoryList[index - 1];
    if (prev?.address === address) {
      memoryList.splice(index - 1, 1);
    }
  }

  findMemory(address, len) {
    if (this.context) {
      const { memoryList, shadowMap } = this.context;
      const index = findMemoryIndex(memoryList, address);
      const prev = memoryList[index - 1];
      if (prev?.address === address && prev.len === len) {
        return prev.targetDV ?? prev.dv;
      } else if (prev?.address <= address && address < add(prev.address, prev.len)) {
        const offset = Number(address - prev.address) + prev.dv.byteOffset;
        if (prev.targetDV) {
          return new DataView(prev.targetDV.buffer, prev.targetDV.byteOffset + offset, len);
        } else {
          return new DataView(prev.dv.buffer, prev.dv.byteOffset + offset, len);
        }
      }
    }
    // not found in any of the buffers we've seen--assume it's fixed memory
    return this.obtainFixedView(address, len);
  }

  getViewAddress(dv) {
    const address = this.getBufferAddress(dv.buffer);
    return add(address, dv.byteOffset);
  }

  createView(address, len, ptrAlign, copy) {
    if (copy) {
      const dv = this.createRelocatableBuffer(len, ptrAlign);
      this.copyBytes(dv, address, len);
      return dv;
    } else {
      return this.obtainFixedView(address, len);
    }
  }

  createObject(structure, arg) {
    const { constructor } = structure;
    return new constructor(arg);
  }

  castView(structure, dv) {
    const { constructor, hasPointer } = structure;
    const object = constructor.call(ENVIRONMENT, dv);
    if (hasPointer) {
      // acquire targets of pointers
      this.acquirePointerTargets(object);
    }
    return object;
  }

  readSlot(target, slot) {
    const slots = target ? target[SLOTS] : this.slots;
    return slots?.[slot];
  }

  writeSlot(target, slot, value) {
    const slots = target ? target[SLOTS] : this.slots;
    if (slots) {
      slots[slot] = value;
    }
  }

  /* COMPTIME-ONLY */
  createTemplate(dv) {
    return {
      [MEMORY]: dv,
      [SLOTS]: {}
    };
  }

  beginStructure(def, options = {}) {
    const {
      type,
      name,
      length,
      byteSize,
      align,
      isConst,
      hasPointer,
    } = def;
    return {
      constructor: null,
      typedArray: null,
      type,
      name,
      length,
      byteSize,
      align,
      isConst,
      hasPointer,
      instance: {
        members: [],
        methods: [],
        template: null,
      },
      static: {
        members: [],
        methods: [],
        template: null,
      },
      options,
    };
  }

  attachMember(s, member, isStatic = false) {
    const target = (isStatic) ? s.static : s.instance;
    target.members.push(member);
  }

  attachMethod(s, method, isStaticOnly = false) {
    s.static.methods.push(method);
    if (!isStaticOnly) {
      s.instance.methods.push(method);
    }
  }

  attachTemplate(s, template, isStatic = false) {
    const target = (isStatic) ? s.static : s.instance;
    target.template = template;
  }
  /* COMPTIME-ONLY-END */

  finalizeStructure(s) {
    try {
      const f = getStructureFactory(s.type);
      const constructor = f(s, this);
      if (typeof(constructor) === 'function') {
        defineProperties(constructor, {
          name: { value: getStructureName(s), writable: false }
        });
        if (!constructor.prototype.hasOwnProperty(Symbol.toStringTag)) {
          defineProperties(constructor.prototype, {
            [Symbol.toStringTag]: { value: s.name, configurable: true, writable: false }
          });
        }
      }
      return constructor;
      /* c8 ignore next 4 */
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  createCaller(method, useThis) {
    let { name,  argStruct, thunk } = method;
    const { constructor } = argStruct;
    const self = this;
    let f;
    if (useThis) {
      f = function(...args) {
        return self.invokeThunk(thunk, new constructor([ this, ...args ]));
      }
    } else {
      f = function(...args) {
        return self.invokeThunk(thunk, new constructor(args));
      }
    }
    Object.defineProperty(f, 'name', { value: name });
    /* NODE-ONLY */
    // need to set the local variables as well as the property of the method object
    /* c8 ignore next */
    f[THUNK_REPLACER] = r => thunk = argStruct = method.thunk = r;
    /* NODE-ONLY-END */
    return f;
  }

  /* RUNTIME-ONLY */
  writeToConsole(dv) {
    try {
      const array = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      // send text up to the last newline character
      const index = array.lastIndexOf(0x0a);
      if (index === -1) {
        this.consolePending.push(array);
      } else {
        const beginning = array.subarray(0, index);
        const remaining = array.slice(index + 1);   // copying, in case incoming buffer is pointing to stack memory
        const list = [ ...this.consolePending, beginning ];
        console.log(decodeText(list));
        this.consolePending = (remaining.length > 0) ? [ remaining ] : [];
      }
      clearTimeout(this.consoleTimeout);
      if (this.consolePending.length > 0) {
        this.consoleTimeout = setTimeout(() => {
          console.log(decodeText(this.consolePending));
          this.consolePending = [];
        }, 250);
      }
      /* c8 ignore next 3 */
    } catch (err) {
      console.error(err);
    }
  }

  flushConsole() {
    if (this.consolePending.length > 0) {
      console.log(decodeText(this.consolePending));
      this.consolePending = [];
      clearTimeout(this.consoleTimeout);
    }
  }

  updatePointerAddresses(args) {
    // first, collect all the pointers
    const pointerMap = new Map();
    const bufferMap = new Map();
    const potentialClusters = [];
    const env = this;
    const callback = function({ isActive }) {
      if (!isActive(this)) {
        return;
      }
      // bypass proxy
      const pointer = this[POINTER_SELF];
      if (pointerMap.get(pointer)) {
        return;
      }
      const target = pointer['*'];
      if (target) {
        pointerMap.set(pointer, target);
        const dv = target[MEMORY];
        if (!env.isFixed(dv)) {
          // see if the buffer is shared with other objects
          const other = bufferMap.get(dv.buffer);
          if (other) {
            const array = Array.isArray(other) ? other : [ other ];
            const index = findSortedIndex(array, dv.byteOffset, t => t[MEMORY].byteOffset);
            array.splice(index, 0, target);
            if (!Array.isArray(other)) {
              bufferMap.set(dv.buffer, array);
              potentialClusters.push(array);
            }
          } else {
            bufferMap.set(dv.buffer, target);
          }
          // scan pointers in target
          target[POINTER_VISITOR]?.(callback);
        }
      }
    };
    args[POINTER_VISITOR](callback, {});
    // find targets that overlap each other
    const clusters = this.findTargetClusters(potentialClusters);
    const clusterMap = new Map();
    for (const cluster of clusters) {
      for (const target of cluster.targets) {
        clusterMap.set(target, cluster);
      }
    }
    // process the pointers
    for (const [ pointer, target ] of pointerMap) {
      const cluster = clusterMap.get(target);
      let address = this.getTargetAddress(target, cluster);
      if (address === false) {
        // need to shadow the object
        address = this.getShadowAddress(target, cluster);
      }
      // update the pointer
      pointer[ADDRESS_SETTER](address);
      pointer[LENGTH_SETTER]?.(target.length);
    }
  }

  findTargetClusters(potentialClusters) {
    const clusters = [];
    for (const targets of potentialClusters) {
      let prevTarget = null, prevStart = 0, prevEnd = 0;
      let currentCluster = null;
      for (const target of targets) {
        const dv = target[MEMORY];
        const { byteOffset: start, byteLength } = dv;
        const end = start + byteLength;
        let forward = true;
        if (prevTarget) {
          if (prevEnd > start) {
            // the previous target overlaps this one
            if (!currentCluster) {
              currentCluster = {
                targets: [ prevTarget ],
                start: prevStart,
                end: prevEnd,
                address: undefined,
                misaligned: undefined,
              };
              clusters.push(currentCluster);
            }
            currentCluster.targets.push(target);
            if (end > prevEnd) {
              // set cluster end offset to include this one
              currentCluster.end = end;
            } else {
              // the previous target contains this one
              forward = false;
            }
          } else {
            currentCluster = null;
          }
        }
        if (forward) {
          prevTarget = target;
          prevStart = start;
          prevEnd = end;
        }
      }
    }
    return clusters;
  }

  getShadowAddress(target, cluster) {
    if (cluster) {
      const dv = target[MEMORY];
      if (cluster.address === undefined) {
        const shadow = this.createClusterShadow(cluster);
        cluster.address = this.getViewAddress(shadow[MEMORY]);
      }
      return add(cluster.address, dv.byteOffset);
    } else {
      const shadow = this.createShadow(target);
      return this.getViewAddress(shadow[MEMORY]);
    }
  }

  createShadow(object) {
    const dv = object[MEMORY]
    const align = object.constructor[ALIGN];
    const shadow = Object.create(object.constructor.prototype);
    shadow[MEMORY] = this.allocateShadowMemory(dv.byteLength, align);
    return this.addShadow(shadow, object);
  }

  createClusterShadow(cluster) {
    const { start, end, targets } = cluster;
    // look for largest align
    let maxAlign = 0, maxAlignOffset;
    for (const target of targets) {
      const offset = target[MEMORY].byteOffset;
      const align = target.constructor[ALIGN];
      if (align > maxAlign) {
        maxAlign = align;
        maxAlignOffset = offset;
      }
    }
    // ensure the shadow buffer is large enough to accommodate necessary adjustments
    const len = end - start;
    const { buffer, byteOffset } = this.allocateShadowMemory(len + maxAlign, 0);
    const address = add(this.getBufferAddress(buffer), byteOffset);
    const maxAlignAddress = getAlignedAddress(add(address, maxAlignOffset), maxAlign);
    const shadowAddress = subtract(maxAlignAddress, maxAlignOffset);
    // make sure that other pointers are correctly aligned also
    for (const target of targets) {
      const offset = target[MEMORY].byteOffset;
      if (offset !== maxAlignOffset) {
        const align = target.constructor[ALIGN];
        if (isMisaligned(add(shadowAddress, offset), align)) {
          throwAlignmentConflict(align, maxAlign);
        }
      }
    }
    // placeholder object type
    const prototype = {
      [MEMORY_COPIER]: getMemoryCopier(len)
    };
    const source = Object.create(prototype);
    const shadow = Object.create(prototype);
    source[MEMORY] = new DataView(targets[0][MEMORY].buffer, Number(start), len);
    shadow[MEMORY] = new DataView(buffer, Number(shadowAddress - address), len);
    return this.addShadow(shadow, source);
  }

  addShadow(shadow, object) {
    let { shadowMap } = this.context;
    if (!shadowMap) {
      shadowMap = this.context.shadowMap = new Map();
    }
    shadowMap.set(shadow, object);
    this.registerMemory(shadow[MEMORY], object[MEMORY]);
    return shadow;
  }

  removeShadow(dv) {
    const { shadowMap } = this.context;
    if (shadowMap) {
      for (const [ shadow, object ] of shadowMap) {
        if (shadow[MEMORY] === dv) {
          shadowMap.delete(shadow);
          break;
        }
      }
    }
  }

  updateShadows() {
    const { shadowMap } = this.context;
    if (!shadowMap) {
      return;
    }
    for (const [ shadow, object ] of shadowMap) {
      shadow[MEMORY_COPIER](object);
    }
  }

  updateShadowTargets() {
    const { shadowMap } = this.context;
    if (!shadowMap) {
      return;
    }
    for (const [ shadow, object ] of shadowMap) {
      object[MEMORY_COPIER](shadow);
    }
  }

  releaseShadows() {
    const { shadowMap } = this.context;
    if (!shadowMap) {
      return;
    }
    for (const [ shadow, object ] of shadowMap) {
      const shadowDV = shadow[MEMORY];
      const address = this.getViewAddress(shadowDV);
      const len = shadowDV.byteLength;
      const align = object.constructor[ALIGN];
      this.freeShadowMemory(address, len, align);
    }
  }
  /* RUNTIME-ONLY-END */

  acquirePointerTargets(args) {
    const env = this;
    const pointerMap = new Map();
    const callback = function({ isActive, isMutatable }) {
      const pointer = this[POINTER_SELF];
      if (isActive(this) === false) {
        pointer[SLOTS][0] = null;
        return;
      }
      if (pointerMap.get(pointer)) {
        return;
      }
      const Target = pointer.constructor.child;
      let target = this[SLOTS][0];
      if (target && !isMutatable(this)) {
        // the target exists and cannot be changed--we're done
        return;
      }

      // obtain address (and possibly length) from memory
      const address = pointer[ADDRESS_GETTER]();
      let len = pointer[LENGTH_GETTER]?.();
      if (len === undefined) {
        const sentinel = Target[SENTINEL];
        if (sentinel) {
          len = env.findSentinel(address, sentinel.bytes) + 1;
        } else {
          len = 1;
        }
      }
      const byteSize = Target[SIZE];
      // get view of memory that pointer points to
      const dv = env.findMemory(address, len * byteSize);
      // create the target
      target = this[SLOTS][0] = Target.call(this, dv);
      if (target[POINTER_VISITOR]) {
        // acquire objects pointed to by pointers in target
        const isMutatable = (pointer.constructor.const) ? () => false : () => true;
        target[POINTER_VISITOR](callback, { vivificate: true, isMutatable });
      }
    }
    args[POINTER_VISITOR](callback, { vivificate: true });
  }
}

/* NODE-ONLY */
export class NodeEnvironment extends Environment {
  // C++ code will patch in these functions:
  //
  // getBufferAddress
  // allocateFixedMemory
  // freeFixedMemory
  // obtainFixedView
  // copyBytes
  // findSentinel

  getAlignmentExtra(align) {
    return (align <= 16) ? 0 : align;
  }

  allocateRelocatableMemory(len, align) {
    const dv = this.createAlignedBuffer(len, align);
    this.registerMemory(dv);
    return dv;
  }

  freeRelocatableMemory(address, len, align) {
    this.unregisterMemory(address);
  }

  allocateShadowMemory(len, align) {
    return this.createAlignedBuffer(len, align);
  }

  freeShadowMemory(address, len, align) {
    // nothing needs to happen
  }

  isFixed(dv) {
    return dv.buffer instanceof SharedArrayBuffer;
  }

  getTargetAddress(target, cluster) {
    const dv = target[MEMORY];
    if (cluster) {
      // pointer is pointing to buffer with overlapping views
      if (cluster.misaligned === undefined) {
        const address = this.getBufferAddress(dv.buffer);
        // ensure that all pointers are properly aligned
        for (const target of cluster.targets) {
          const offset = target[MEMORY].byteOffset;
          const align = target.constructor[ALIGN];
          const viewAddress = add(address, offset);
          if (isMisaligned(viewAddress, align)) {
            cluster.misaligned = true;
            break;
          }
        }
        if (cluster.misaligned === undefined)  {
          cluster.misaligned = false;
          cluster.address = address;
        }
      }
      return (cluster.misaligned) ? false : cluster.address + dv.byteOffset;
    } else {
      const align = target.constructor[ALIGN];
      const address = this.getViewAddress(dv);
      if (isMisaligned(address, align)) {
        return false;
      }
      this.registerMemory(dv);
      return  address;
    }
  }

  createAlignedBuffer(len, align) {
    // allocate extra memory for alignment purpose when align is larger than the default
    const extra = (align > 16) ? align : 0;
    const buffer = new ArrayBuffer(len + extra);
    let offset = 0;
    if (extra) {
      const address = this.getBufferAddress(buffer);
      const aligned = getAlignedAddress(address, align);
      offset = aligned - address;
    }
    return new DataView(buffer, Number(offset), len);
  }

  invokeFactory(thunk) {
    initializeErrorSets();
    const result = thunk.call(this);
    if (typeof(result) === 'string') {
      // an error message
      throwZigError(result);
    }
    // factory function returns a structure object
    let module = result.constructor;
    // attach __zigar object
    const initPromise = Promise.resolve();
    module.__zigar = {
      init: () => initPromise,
      abandon: () => initPromise.then(() => {
        if (module) {
          this.releaseModule(module);
        }
        module = null;
      }),
      released: () => initPromise.then(() => !module),
    };
    return module;
  }

  invokeThunk(thunk, args) {
    let err;
    if (args[POINTER_VISITOR]) {
      // create an object where information concerning pointers can be stored
      this.startContext();
      // copy addresses of garbage-collectible objects into memory
      this.updatePointerAddresses(args);
      this.updateShadows();
      err = thunk.call(this, args[MEMORY]);
      // create objects that pointers point to
      this.updateShadowTargets();
      this.acquirePointerTargets(args);
      this.releaseShadows();
      // restore the previous context if there's one
      this.endContext();
    } else {
      // don't need to do any of that if there're no pointers
      err = thunk.call(this, args[MEMORY]);
    }

    // errors returned by exported Zig functions are normally written into the
    // argument object and get thrown when we access its retval property (a zig error union)
    // error strings returned by the thunk are due to problems in the thunking process
    // (i.e. bugs in export.zig)
    if (err) {
      throwZigError(err);
    }
    return args.retval;
  }

  releaseModule(module) {
    const released = new Map();
    const replacement = function() {
      throw new Error(`Shared library was abandoned`);
    };
    const releaseClass = (cls) => {
      if (!cls || released.get(cls)) {
        return;
      }
      released.set(cls, true);
      // release static variables--vivificators return pointers
      const vivificators = cls[CHILD_VIVIFICATOR];
      if (vivificators) {
        for (const vivificator of Object.values(vivificators)) {
          const ptr = vivificator.call(cls);
          if (ptr) {
            releaseObject(ptr);
          }
        }
      }
      for (const [ name, { value, get, set }  ] of Object.entries(Object.getOwnPropertyDescriptors(cls))) {
        if (typeof(value) === 'function') {
          // release thunk of static function
          value[THUNK_REPLACER]?.(replacement);
        } else if (get && !set) {
          // the getter might return a type/class/constuctor
          const child = cls[name];
          if (typeof(child) === 'function') {
            releaseClass(child);
          }
        }
      }
      for (const { value } of Object.values(Object.getOwnPropertyDescriptors(cls.prototype))) {
        if (typeof(value) === 'function') {
          // release thunk of instance function
          value[THUNK_REPLACER]?.(replacement);
        }
      }
    };
    const releaseObject = (obj) => {
      if (!obj || released.get(obj)) {
        return;
      }
      released.set(obj, true);
      const dv = obj[MEMORY];
      if (dv.buffer instanceof SharedArrayBuffer) {
        // create new buffer and copy content from fixed memory
        const ta = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        const ta2 = new Uint8Array(ta);
        const dv2 = new DataView(ta2.buffer);
        obj[MEMORY] = dv2;
      }
      const slots = obj[SLOTS];
      if (slots) {
        for (const child of Object.values(slots)) {
          // deal with pointers in structs
          if (child.hasOwnProperty(POINTER_VISITOR)) {
            releaseObject(child);
          }
        }
        if (obj.hasOwnProperty(POINTER_VISITOR)) {
          // a pointer--release what it's pointing to
          releaseObject(obj[SLOTS][0]);
        } else {
          // force recreation of child objects so they'll use non-fixed memory
          obj[SLOTS] = {};
        }
      }
    };
    releaseClass(module);
  }
}
/* NODE-ONLY-END */

/* WASM-ONLY */
export class WebAssemblyEnvironment extends Environment {
  imports = {
    defineStructures: { argType: '', returnType: 'v' },
    allocateFixedMemory: { argType: 'ii', returnType: 'v' },
    freeFixedMemory: { argType: 'iii' },
    allocateShadowMemory: { argType: 'cii', returnType: 'v' },
    freeShadowMemory: { argType: 'ciii' },
    runThunk: { argType: 'iv', returnType: 'v' },
    isRuntimeSafetyActive: { argType: '', returnType: 'b' },
  };
  exports = {
    allocateRelocatableMemory: { argType: 'ii', returnType: 'v' },
    freeRelocatableMemory: { argType: 'iii' },
    createString: { argType: 'ii', returnType: 'v' },
    createObject: { argType: 'vv', returnType: 's' },
    createView: { argType: 'ii', returnType: 'v' },
    castView: { argType: 'vv', returnType: 'v' },
    readSlot: { argType: 'vi', returnType: 'v' },
    writeSlot: { argType: 'viv' },
    getViewAddress: { argType: 'v', returnType: 'i' },
    beginDefinition: { returnType: 'v' },
    insertInteger: { argType: 'vsi', alias: 'insertProperty' },
    insertBoolean: { argType: 'vsb', alias: 'insertProperty' },
    insertString: { argType: 'vss', alias: 'insertProperty' },
    insertObject: { argType: 'vsv', alias: 'insertProperty' },
    beginStructure: { argType: 'v', returnType: 'v' },
    attachMember: { argType: 'vvb' },
    attachMethod: { argType: 'vvb' },
    createTemplate: { argType: 'v', returnType: 'v' },
    attachTemplate: { argType: 'vvb' },
    finalizeStructure: { argType: 'v' },
    writeToConsole: { argType: 'v' },
    startCall: { argType: 'iv', returnType: 'i' },
    endCall: { argType: 'iv', returnType: 'i' },
  };
  nextValueIndex = 1;
  valueTable = { 0: null };
  valueIndices = new Map;
  memory = null;
  /* COMPTIME-ONLY */
  structures = [];
  /* COMPTIME-ONLY-END */
  /* RUNTIME-ONLY */
  variables = [];
  /* RUNTIME-ONLY-END */

  constructor() {
    super();
  }

  allocateRelocatableMemory(len, align) {
    // allocate memory in both JS and WASM space
    const constructor = { [ALIGN]: align };
    const copier = getMemoryCopier(len);
    const dv = this.createBuffer(len);
    const shadowDV = this.allocateShadowMemory(len, align);
    // create a shadow for the relocatable memory
    const object = { constructor, [MEMORY]: dv, [MEMORY_COPIER]: copier };
    const shadow = { constructor, [MEMORY]: shadowDV, [MEMORY_COPIER]: copier };
    this.addShadow(shadow, object);
    return shadowDV;
  }

  freeRelocatableMemory(address, len, align) {
    const dv = this.findMemory(address, len);
    this.removeShadow(dv);
    this.unregisterMemory(address);
    this.freeShadowMemory(address, len, align);
  }

  getBufferAddress(buffer) {
    /* DEV-TEST */
    if (buffer !== this.memory.buffer) {
      throw new Error('Cannot obtain address of relocatable buffer');
    }
    /* DEV-TEST-END */
    return 0;
  }

  obtainFixedView(address, len) {
    const { memory } = this;
    const dv = new DataView(memory.buffer, address, len);
    dv[MEMORY] = { memory, address, len };
    return dv;
  }

  isFixed(dv) {
    return dv.buffer === this.memory.buffer;
  }

  copyBytes(dst, address, len) {
    const src = this.obtainFixedView(address, len);
    const copy = getCopyFunction(len);
    copy(dst, src);
  }

  /* COMPTIME-ONLY */
  createView(address, len, ptrAlign, copy) {
    const dv = this.createRelocatableBuffer(len, ptrAlign);
    this.copyBytes(dv, address, len);
    if (!copy) {
      dv.address = address;
    }
    return dv;
  }
  /* COMPTIME-ONLY-END */

  createString(address, len) {
    const { buffer } = this.memory;
    const ta = new Uint8Array(buffer, address, len);
    return decodeText(ta);
  }

  getTargetAddress(target, cluster) {
    const dv = target[MEMORY];
    if (this.isFixed(dv)) {
      return this.getViewAddress(dv);
    } else if (dv.byteLength === 0) {
      return 0;
    } else {
      // relocatable buffers always need shadowing
      return false;
    }
  }

  releaseObjects() {
    if (this.nextValueIndex !== 1) {
      this.nextValueIndex = 1;
      this.valueTable = { 0: null };
      this.valueIndices = new Map();
    }
  }

  getObjectIndex(object) {
    if (object) {
      let index = this.valueIndices.get(object);
      if (index === undefined) {
        index = this.nextValueIndex++;
        this.valueIndices.set(object, index);
        this.valueTable[index] = object;
      }
      return index;
    } else {
      return 0;
    }
  }

  fromWebAssembly(type, arg) {
    switch (type) {
      case 'v':
      case 's': return this.valueTable[arg];
      case 'i': return arg;
      case 'b': return !!arg;
    }
  }

  toWebAssembly(type, arg) {
    switch (type) {
      case 'v':
      case 's': return this.getObjectIndex(arg);
      case 'i': return arg;
      case 'b': return arg ? 1 : 0;
    }
  }

  exportFunction(fn, argType = '', returnType = '') {
    if (!fn) {
      return () => {};
    }
    return (...args) => {
      args = args.map((arg, i) => this.fromWebAssembly(argType.charAt(i), arg));
      const retval = fn.apply(this, args);
      return this.toWebAssembly(returnType, retval);
    };
  }

  importFunction(fn, argType = '', returnType = '') {
    let needCallContext = false;
    if (argType.startsWith('c')) {
      needCallContext = true;
      argType = argType.slice(1);
    }
    return (...args) => {
      args = args.map((arg, i) => this.toWebAssembly(argType.charAt(i), arg));
      if (needCallContext) {
        args = [ this.context.call, ...args ];
      }
      const retval = fn.apply(this, args);
      return this.fromWebAssembly(returnType, retval);
    };
  }

  exportFunctions() {
    const imports = {};
    for (const [ name, { argType, returnType, alias } ] of Object.entries(this.exports)) {
      const fn = this[alias ?? name];
      imports[`_${name}`] = this.exportFunction(fn, argType, returnType);
    }
    return imports;
  }

  importFunctions(exports) {
    for (const [ name, fn ] of Object.entries(exports)) {
      const info = this.imports[name];
      if (info) {
        const { argType, returnType } = info;
        this[name] = this.importFunction(fn, argType, returnType);
      }
    }
  }

  releaseFunctions() {
    const throwError = function() {
      throw new Error('WebAssembly instance was abandoned');
    };
    for (const { name } of Object.values(this.imports)) {
      if (this[name]) {
        this[name] = throwError;
      }
    }
  }

  async instantiateWebAssembly(source) {
    const env = this.exportFunctions();
    if (source[Symbol.toStringTag] === 'Response') {
      return WebAssembly.instantiateStreaming(source, { env });
    } else {
      const buffer = await source;
      return WebAssembly.instantiate(buffer, { env });
    }
  }

  async loadWebAssembly(source) {
    const { instance } = await this.instantiateWebAssembly(source);
    this.memory = instance.exports.memory;
    this.importFunctions(instance.exports);
    // create a WeakRef so that we know whether the instance is gc'ed or not
    const weakRef = new WeakRef(instance);
    return {
      abandon: () => {
        this.releaseFunctions();
        this.unlinkVariables();
        this.memory = null;
      },
      released: () => {
        return !weakRef.deref();
      }
    }
  }

  startCall(call, args) {
    this.startContext();
    // call context, use by allocateShadowMemory and freeShadowMemory
    this.context.call = call;
    if (args) {
      if (args[POINTER_VISITOR]) {
        this.updatePointerAddresses(args);
      }
      // return address of shadow for argumnet struct
      const address = this.getShadowAddress(args);
      this.updateShadows();
      return address;
    }
    // can't be 0 since that sets off Zig's runtime safety check
    return 0xaaaaaaaa;
  }

  endCall(call, args) {
    if (args) {
      this.updateShadowTargets();
      if (args[POINTER_VISITOR]) {
        debugger;
        this.acquirePointerTargets(args);
      }
      this.releaseShadows();
    }
    // restore the previous context if there's one
    this.endContext();
  }

  /* COMPTIME-ONLY */
  runFactory(options) {
    const {
      omitFunctions = false
    } = options;
    if (omitFunctions) {
      this.attachMethod = () => {};
    }
    initializeErrorSets();
    const result = this.defineStructures();
    if (typeof(result) === 'string') {
      throwZigError(result);
    }
    this.fixOverlappingMemory();
    return {
      structures: this.structures,
      runtimeSafety: this.isRuntimeSafetyActive(),
    };
  }

  beginDefinition() {
    return {};
  }

  insertProperty(def, name, value) {
    def[name] = value;
  }

  fixOverlappingMemory() {
    // look for buffers that requires linkage
    const list = [];
    const find = (object) => {
      if (!object) {
        return;
      }
      if (object[MEMORY]) {
        const dv = object[MEMORY];
        const { address } = dv;
        if (address) {
          list.push({ address, length: dv.byteLength, owner: object, replaced: false });
        }
      }
      if (object[SLOTS]) {
        for (const child of Object.values(object[SLOTS])) {
          find(child);
        }
      }
    };
    for (const structure of this.structures) {
      find(structure.instance.template);
      find(structure.static.template);
    }
    // larger memory blocks come first
    list.sort((a, b) => b.length - a.length);
    for (const a of list) {
      for (const b of list) {
        if (a !== b && !a.replaced) {
          if (a.address <= b.address && b.address + b.length <= a.address + a.length) {
            // B is inside A--replace it with a view of A's buffer
            const dv = a.owner[MEMORY];
            const offset = b.address - a.address + dv.byteOffset;
            const newDV = new DataView(dv.buffer, offset, b.length);
            newDV.address = b.address;
            b.owner[MEMORY] = newDV;
            b.replaced = true;
          }
        }
      }
    }
  }

  finalizeStructure(s) {
    super.finalizeStructure(s);
    this.structures.push(s);
  }
  /* COMPTIME-ONLY-END */

  /* RUNTIME-ONLY */
  finalizeStructures(structures) {
    const createTemplate = (placeholder) => {
      const template = {};
      if (placeholder.memory) {
        const { array, offset, length } = placeholder.memory;
        template[MEMORY] = new DataView(array.buffer, offset, length);
      }
      if (placeholder.slots) {
        template[SLOTS] = insertObjects({}, placeholder.slots);
      }
      return template;
    };
    const insertObjects = (dest, placeholders) => {
      for (const [ slot, placeholder ] of Object.entries(placeholders)) {
        dest[slot] = createObject(placeholder);
      }
      return dest;
    };
    const createObject = (placeholder) => {
      let dv;
      if (placeholder.memory) {
        const { array, offset, length } = placeholder.memory;
        dv = new DataView(array.buffer, offset, length);
      } else {
        const { byteSize } = placeholder.structure;
        dv = new DataView(new ArrayBuffer(byteSize));
      }
      const { constructor } = placeholder.structure;
      const object = constructor.call(ENVIRONMENT, dv);
      if (placeholder.slots) {
        insertObjects(object[SLOTS], placeholder.slots);
      }
      if (placeholder.address !== undefined) {
        // need to replace dataview with one pointing to WASM memory later,
        // when the VM is up and running
        this.variables.push({ address: placeholder.address, object });
      }
      return object;
    };
    initializeErrorSets();
    for (const structure of structures) {
      for (const target of [ structure.static, structure.instance ]) {
        // first create the actual template using the provided placeholder
        if (target.template) {
          target.template = createTemplate(target.template);
        }
      }
      super.finalizeStructure(structure);
      // place structure into its assigned slot
      this.slots[structure.slot] = structure;
    }

    let resolve, reject;
    const promise = new Promise((r1, r2) => {
      resolve = r1;
      reject = r2;
    });
    this.runThunk = function(index, argStruct) {
      // wait for linking to occur, then call function again
      // this.runThunk should have been replaced
      return promise.then(() => this.runThunk(index, argStruct));
    };
    return { resolve, reject };
  }

  async linkWebAssembly(source, params) {
    const {
      writeBack = true,
    } = params;
    const zigar = await this.loadWebAssembly(source);
    this.linkVariables(writeBack);
    return zigar;
  }

  linkVariables(writeBack) {
    for (const { object, address } of this.variables) {
      this.linkObject(object, address, writeBack);
    }
  }

  linkObject(object, address, writeBack) {
    const len = object.constructor[SIZE];
    if (len === 0) {
      return;
    }
    const wasmDV = this.obtainFixedView(address, len);
    if (writeBack) {
      const dest = Object.create(object.constructor.prototype);
      dest[MEMORY] = wasmDV;
      dest[MEMORY_COPIER](object);
    }
    object[MEMORY] = wasmDV;
  }

  unlinkVariables() {
    for (const { object } of this.variables) {
      this.unlinkObject(object);
    }
  }

  unlinkObject(object) {
    const len = object.constructor[SIZE];
    if (len === 0 || !this.isFixed(object[MEMORY])) {
      return;
    }
    const relocDV = this.createRelocatableBuffer(len);
    const dest = Object.create(object.constructor.prototype);
    dest[MEMORY] = relocDV;
    dest[MEMORY_COPIER](object);
    object[MEMORY] = relocDV;
  }

  invokeThunk(thunk, args) {
    // WASM thunks aren't functions--they're indices into the function table 0
    // wasm-exporter.zig will invoke startCall() with the context address and the args
    // we can't do pointer fix up here since we need the context in order to allocate
    // memory from the WebAssembly allocator; point target acquisition will happen in
    // endCall()
    const err = this.runThunk(thunk, args);

    // errors returned by exported Zig functions are normally written into the
    // argument object and get thrown when we access its retval property (a zig error union)
    // error strings returned by the thunk are due to problems in the thunking process
    // (i.e. bugs in export.zig)
    if (err) {
      throwZigError(err);
    }
    return args.retval;
  }
  /* RUNTIME-ONLY */
}
/* WASM-ONLY-END */

export class CallContext {
  pointerProcessed = new Map();
  memoryList = [];
  shadowMap = null;
  /* WASM-ONLY */
  call = 0;
  /* WASM-ONLY-END */
}

export function findSortedIndex(array, value, cb) {
  let low = 0;
  let high = array.length;
  if (high === 0) {
    return 0;
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const value2 = cb(array[mid]);
    if (value2 <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return high;
}

function findMemoryIndex(array, address) {
  return findSortedIndex(array, address, m => m.address);
}

function add(address, len) {
  return address + ((typeof(address) === 'bigint') ? BigInt(len) : len);
}

function subtract(address, len) {
  return address - ((typeof(address) === 'bigint') ? BigInt(len) : len);
}

export function isMisaligned(address, align) {
  if (typeof(address) === 'bigint') {
    address = Number(address & 0xFFFFFFFFn);
  }
  const mask = align - 1;
  return (address & mask) !== 0;
}

export function getAlignedAddress(address, align) {
  let mask;
  if (typeof(address) === 'bigint') {
    align = BigInt(align);
    mask = ~(align - 1n);
  } else {
    mask = ~(align - 1);
  }
  return (address & mask) + align;
}