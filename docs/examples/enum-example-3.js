import { Owner } from './enum-example-3.zig';

const owner = new Owner({ pet: 'kangaroo', car: 'Toyota', computer: 'Dell' });
console.log(owner.valueOf());
console.log(`size = ${owner.dataView.byteLength}`);
