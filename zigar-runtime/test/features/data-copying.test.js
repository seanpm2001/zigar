import { expect } from 'chai';
import { defineClass } from '../../src/environment.js';
import { CACHE, FIXED, MEMORY, RESTORE } from '../../src/symbols.js';
import { defineProperties, defineValue, ObjectCache } from '../../src/utils.js';

import Baseline from '../../src/features/baseline.js';
import DataCopying, {
  getCopyFunction,
  getResetFunction,
  isNeededByStructure,
} from '../../src/features/data-copying.js';
import MemoryMapping from '../../src/features/memory-mapping.js';
import ViewManagement from '../../src/features/view-management.js';

const Env = defineClass('FeatureTest', [ Baseline, DataCopying, MemoryMapping, ViewManagement ]);

describe('Feature: data-copying', function() {
  describe('isNeededByStructure', function() {
    it('should return true', function() {
      expect(isNeededByStructure()).to.be.true;
    })
  })
  describe('getCopyFunction', function() {
    it('should return optimal function for copying buffers of various sizes', function() {
      const functions = [];
      for (let size = 1; size <= 64; size++) {
        const src = new DataView(new ArrayBuffer(size));
        for (let i = 0; i < size; i++) {
          src.setInt8(i, i);
        }
        const dest = new DataView(new ArrayBuffer(size));
        const f = getCopyFunction(size);
        if (!functions.includes(f)) {
          functions.push(f);
        }
        f(dest, src);
        for (let i = 0; i < size; i++) {
          expect(dest.getInt8(i)).to.equal(i);
        }
      }
      for (let size = 1; size <= 64; size++) {
        const src = new DataView(new ArrayBuffer(size * 16));
        for (let i = 0; i < size; i++) {
          src.setInt8(i, i);
        }
        const dest = new DataView(new ArrayBuffer(size * 16));
        const f = getCopyFunction(size, true);
        if (!functions.includes(f)) {
          functions.push(f);
        }
        f(dest, src);
        for (let i = 0; i < size; i++) {
          expect(dest.getInt8(i)).to.equal(i);
        }
      }
      expect(functions).to.have.lengthOf(10);
    })
    it('should return function for copying buffers of unknown size', function() {
      const src = new DataView(new ArrayBuffer(23));
      for (let i = 0; i < 23; i++) {
        src.setInt8(i, i);
      }
      const dest = new DataView(new ArrayBuffer(23));
      const f = getCopyFunction(undefined);
      f(dest, src);
      for (let i = 0; i < 23; i++) {
        expect(dest.getInt8(i)).to.equal(i);
      }
    })
  })
  describe('getResetFunction', function() {
    it('should return optimal function for clearing buffers of various sizes', function() {
      const functions = [];
      for (let size = 1; size <= 64; size++) {
        const dest = new DataView(new ArrayBuffer(size));
        for (let i = 0; i < size; i++) {
          dest.setInt8(i, i);
        }
        const f = getResetFunction(size);
        if (!functions.includes(f)) {
          functions.push(f);
        }
        f(dest, 0, size);
        for (let i = 0; i < size; i++) {
          expect(dest.getInt8(i)).to.equal(0);
        }
      }
      expect(functions).to.have.lengthOf(10);
    })
  })
  describe('defineRestorer', function() {
    it('should restore WASM memory buffer that has become detached', function() {
      const env = new Env();
      const memory = env.memory = new WebAssembly.Memory({ initial: 1 });
      const dv = new DataView(memory.buffer, 1000, 8);
      dv[FIXED] = { address: 1000, len: 8 };
      const constructor = function() {};
      defineProperties(constructor, {
        [CACHE]: defineValue(new ObjectCache()),
      });
      const object = defineProperties(new constructor(), {
        [MEMORY]: defineValue(dv),
        [RESTORE]: env.defineRestorer(),
      });
      memory.grow(1);
      expect(() => dv.getInt8(0)).to.throw(TypeError);
      object[RESTORE]();
      expect(object[MEMORY]).to.not.equal(dv);
      expect(() => object[MEMORY].getInt8(0)).to.not.throw();
      expect(constructor[CACHE].find(object[MEMORY])).to.equal(object);
    })
    it('should add align to new buffer when previous buffer has one attached', function() {
      const env = new Env();

      const memory = env.memory = new WebAssembly.Memory({ initial: 1 });
      const dv = new DataView(memory.buffer, 1000, 8);
      dv[FIXED] = { address: 1000, len: 8, align: 4 };
      const constructor = function() {};
      defineProperties(constructor, {
        [CACHE]: defineValue(new ObjectCache()),
      });
      const object = defineProperties(new constructor(), {
        [MEMORY]: defineValue(dv),
        [RESTORE]: env.defineRestorer(),
      });
      memory.grow(1);
      expect(() => dv.getInt8(0)).to.throw(TypeError);
      object[RESTORE]();
      expect(object[MEMORY]).to.not.equal(dv);
      expect(() => object[MEMORY].getInt8(0)).to.not.throw();
      expect(object[MEMORY][FIXED].align).to.equal(4);
    })
  })
})
