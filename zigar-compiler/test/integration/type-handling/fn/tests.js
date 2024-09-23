import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { capture, captureError } from '../../test-utils.js';

use(chaiAsPromised);

export function addTests(importModule, options) {
  const importTest = async (name, options) => {
      const url = new URL(`./${name}.zig`, import.meta.url).href;
      return importModule(url, options);
  };
  describe('Function', function() {
    it('should handle function as static variables', async function() {
      this.timeout(300000);
      const { default: module, hello, hello2, hello3, world } = await importTest('as-static-variables');
      expect(module.func['*']).to.be.a('function');
      const lines = await capture(() => {
        module.func['*']();
        module.func = world;
        module.func['*']();
      });
      expect(lines).to.eql([ 'hello', 'world' ]);
      expect(hello).to.be.a('function');
      expect(hello2).to.be.a('function');
      expect(hello3).to.be.a('function');
      const name = ' \nthis is a totally weird function name!! :-)';
      const f = module[name];
      expect(f).to.be.a('function');
      const [ line ] = await capture(() => f())
      expect(line).to.equal('Hello world');
      expect(hello.valueOf()).to.equal(hello);
      expect(JSON.stringify(hello)).to.equal(undefined);
    })
    it('should call functions passed as arguments', async function() {
      this.timeout(300000);
      const {
        default: module,
        __zigar,
        call1, call2, call3, call4,
        hello, world
      } = await importTest('as-function-parameters', { multithreaded: true });
      const lines1 = await capture(() => {
        call1(hello);
        call1(world);
      });
      expect(lines1).to.eql([ 'hello', 'world' ]);
      const jsFn1 = () => {
        console.log('hello');
        console.log('world');
      };
      const lines2 = await capture(() => {
        call1(jsFn1);
      });
      expect(lines2).to.eql([ 'hello', 'world' ]);
      await captureError(() => {
        expect(() => call2(() => { throw new Error('Doh!')})).to.throw(Error)
          .with.property('message').that.equal('Unexpected');
      })
      const jsFn2 = (number) => {
        console.log(`number = ${number}`);
        return number * 2;
      };
      let result;
      const lines3 = await capture(() => {
        result = call3(jsFn2);
      });
      call3(() => 0);
      expect(lines3).to.eql([ 'number = 1234' ]);
      expect(result).to.equal(1234 * 2);
      __zigar.multithread(true);
      try {
        const lines4 = await capture(async () => {
          call4(jsFn2);
          await new Promise(r => setTimeout(r, 100));
        });
        expect(lines4).to.eql([ 'number = 1234' ]);
        expect(module.call4_result).to.equal(1234 * 2);
        const jsFn3 = async (number) => {
          console.log(`number = ${number}`);
          return number * 3;
        };
        const lines5 = await capture(async () => {
          call4(jsFn3);
          await new Promise(r => setTimeout(r, 100));
        });
        expect(lines5).to.eql([ 'number = 1234' ]);
        expect(module.call4_result).to.equal(1234 * 3);
      } finally {
        __zigar.multithread(false);
      }
    })
    it('should return callable function', async function() {
      this.timeout(300000);
      const { getFunction } = await importTest('as-return-value');
      const ptr = getFunction();
      const f = ptr['*'];
      expect(f).to.be.a('function');
      const lines = await capture(() => {
        f();
      });
      expect(lines).to.eql([ 'hello' ]);
    })
    it('should return functions in array', async function() {
      this.timeout(300000);
      const { array, getFunctions } = await importTest('array-of');
      const lines1 = await capture(() => {
        for (const ptr of array) {
          ptr['*']();
        }
      });
      expect(lines1).to.eql([ 'hello', 'hello', 'world', 'hello' ]);
      const result = getFunctions();
      const lines2 = await capture(() => {
        for (const ptr of result) {
          ptr['*']();
        }
      });
      expect(lines2).to.eql([ 'world', 'world', 'hello', 'world' ]);
    })
    it('should return struct containing function pointers', async function() {
      this.timeout(300000);
      const { StructA, getStruct, default: module } = await importTest('in-struct');
      expect(module).to.have.property('struct_a');
      expect(module.struct_a).to.be.instanceOf(StructA);
      expect(module.struct_a.number).to.equal(1234);
      expect(module.struct_a.function1['*']).to.be.a('function');
      expect(module.struct_a.function2['*']).to.be.a('function');
      const lines1 = await capture(() => {
        module.struct_a.function1['*']();
        module.struct_a.function2['*']();
      });
      expect(lines1).to.eql([ 'hello', 'world' ]);
      const result = getStruct();
      const lines2 = await capture(() => {
        result.function1['*']();
        result.function2['*']();
      });
      expect(lines2).to.eql([ 'world', 'hello' ]);
      module.struct_a = result;
      const lines3 = await capture(() => {
        module.struct_a.function1['*']();
        module.struct_a.function2['*']();
      });
      expect(lines3).to.eql([ 'world', 'hello' ]);
    })
    it('should not compile code with function in packed struct', async function() {
      this.timeout(300000);
      await expect(importTest('in-packed-struct')).to.eventually.be.rejected;
    })
    it('should handle function pointer as comptime field', async function() {
      this.timeout(300000);
      const { default: module, StructA, print } = await importTest('as-comptime-field');
      expect(module.struct_a.function['*']).to.be.a('function');
      const b = new StructA({ number: 500 });
      expect(b.function['*']).to.be.a('function');
      const [ line ] = await capture(() => print(b));
      expect(line).to.match(/as\-comptime\-field\.StructA{ \.number = 500, \.function = fn\s*\(\) void@/);
    })
    it('should export bare union containing function pointers', async function() {
      this.timeout(300000);
      const { default: module } = await importTest('in-bare-union');
      expect(module).to.have.property('union_a');
      expect(module).to.have.property('union_b');
      expect(module.union_b.number).to.equal(123);
      expect(() => module.union_a.function['*']).to.throw(TypeError);
    })
    it('should export tagged union containing function pointers', async function() {
      this.timeout(300000);
      const { default: module } = await importTest('in-tagged-union');
      expect(module).to.have.property('union_a');
      expect(module).to.have.property('union_b');
      expect(module.union_b.number).to.equal(123);
      expect(module.union_a.function['*']).to.be.a('function');
      expect(() => module.union_b.function['*']).to.throw(TypeError);
    })
    it('should handle function in optional', async function() {
      this.timeout(300000);
      const { default: module, getFunction } = await importTest('in-optional');
      expect(module.optional['*']).to.be.a('function');
      const lines1 = await capture(() => {
        module.optional['*']();
      });
      expect(lines1).to.eql([ 'hello' ]);
      const result1 = getFunction(0);
      const lines2 = await capture(() => {
        result1['*']();
      });
      expect(lines2).to.eql([ 'hello' ]);
      const result2 = getFunction(1);
      const lines3 = await capture(() => {
        result2['*']();
      });
      expect(lines3).to.eql([ 'world' ]);
      const result3 = getFunction(2);
      expect(result3).to.be.null;
    })
    it('should handle function in error union', async function() {
      this.timeout(300000);
      const { default: module, getFunction, Error } = await importTest('in-error-union');
      expect(module.error_union['*']).to.be.a('function');
      const lines1 = await capture(() => {
        module.error_union['*']();
      });
      expect(lines1).to.eql([ 'hello' ]);
      expect(lines1).to.eql([ 'hello' ]);
      const result1 = getFunction(0);
      const lines2 = await capture(() => {
        result1['*']();
      });
      expect(lines2).to.eql([ 'hello' ]);
      const result2 = getFunction(1);
      const lines3 = await capture(() => {
        result2['*']();
      });
      expect(lines3).to.eql([ 'world' ]);
      expect(() => getFunction(2)).to.throw(Error.gold_fish_died);
      expect(() => getFunction(4)).to.throw(Error.no_money);
    })
    it('should not compile code containing function vector', async function() {
      this.timeout(300000);
      await expect(importTest('vector-of')).to.eventually.be.rejected;
    })
  })
}
