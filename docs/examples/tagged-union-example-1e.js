import { a, Number } from './tagged-union-example-1.zig';

console.log(Number.tag(a) === Number.tag.integer);
console.log(`${Number.tag(a)}`);