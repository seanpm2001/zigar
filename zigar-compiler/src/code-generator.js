import { MEMORY, SLOTS } from '../../zigar-runtime/src/symbol.js';
import { MemberType, getMemberFeature } from '../../zigar-runtime/src/member.js';
import { StructureType, getStructureFeature } from '../../zigar-runtime/src/structure.js';

export function generateCodeForWASM(structures, params) {
  const {
    runtimeURL,
    loadWASM,
    topLevelAwait = true,
    omitExports = false,
  } = params;
  const features = getStructureFeatures(structures);
  const exports = getExports(structures);
  const lines = [];
  const add = manageIndentation(lines);
  add(`import {`);
  for (const name of [ 'loadModule', ...features ]) {
    add(`${name},`);
  }
  add(`} from ${JSON.stringify(runtimeURL)};`);
  // reduce file size by only including code of features actually used
  // dead-code remover will take out code not referenced here
  add(`\n// activate features`);
  for (const feature of features) {
    add(`${feature}();`);
  }
  add(`\n// initiate loading and compilation of WASM bytecodes`);
  add(`const source = ${loadWASM ?? null};`);
  // write out the structures as object literals 
  lines.push(...generateStructureDefinitions(structures));
  lines.push(...generateLoadStatements('source', JSON.stringify(!topLevelAwait)));
  lines.push(...generateExportStatements(exports, omitExports));
  if (topLevelAwait && loadWASM) {
    add(`await __zigar.init();`);
  }
  const code = lines.join;
  return { code, exports, structures };
}

export function generateCodeForNode(structures, params) {
  const {
    runtimeURL,
    libPath,
    omitExports = false,
  } = params;
  const exports = getExports(structures);
  const lines = [];
  const add = manageIndentation(lines);
  add(`import { loadModule } from ${JSON.stringify(runtimeURL)}`);
  // all features are enabled by default for Node
  lines.push(...generateStructureDefinitions(structures));
  lines.push(...generateLoadStatements(JSON.stringify(libPath), 'false'));
  lines.push(...generateExportStatements(exports, omitExports));
  const code = lines.join;
  return { code, exports, structures };  
}

function generateLoadStatements(source, writeback) {
  const lines = [];
  const add = manageIndentation(lines);
  add(`const env = loadModule(${source});`);
  add(`env.recreateStructures(structures);`);
  add(`env.linkVariables(${writeback});`);
  add(`const __zigar = env.getControlObject();`);
  return lines;
}

function generateExportStatements(exports, omitExports) {
  const lines = [];
  const add = manageIndentation(lines);
  add(`const {`);
  // the first export is always default, and the last __zigar
  for (const name of exports.slice(1, -1)) {
    add(`${name},`);
  }
  add(`} = module;`);
  if (!omitExports) {
    add(`export {`);
    add(`__module as default`);
    for (const name of exports.slice(1)) {
      add(`${name},`);
    }
    add(`};`);
  }
  return lines;
}

function generateStructureDefinitions(structures, params) {
  const lines = [];
  const add = manageIndentation(lines);
  const defaultStructure = {
    constructor: null,
    typedArray: null,
    type: StructureType.Primitive,
    name: undefined,
    byteSize: 4,
    align: 2,
    isConst: false,
    hasPointer: false,
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
  };
  const defaultMember = {
    type: MemberType.Void,
    isRequired: true,
  };
  add(`\n// define structures`);
  // default structure
  add(`const s = {`);
  for (const [ name, value ] of Object.entries(defaultStructure)) {
    switch (name) {
      case 'instance':
      case 'static':
        addStructureContent(name, value);
        break;
      default:
        add(`${name}: ${JSON.stringify(value)},`);
    }
  }
  add(`};`);
  // default member
  add(`const m = {`);
  for (const [ name, value ] of Object.entries(defaultMember)) {
    add(`${name}: ${JSON.stringify(value)},`);
  }
  add(`};`);

  // create empty objects first, to allow structs to reference themselves
  const structureNames = new Map();
  const structureMap = new Map();
  const methodNames = new Map();
  const arrayBufferNames = new Map();
  let arrayBufferCount = 0;
  let methodCount = 0;
  for (const [ index, structure ] of structures.entries()) {
    const varname = `s${index}`;
    structureNames.set(structure, varname);
    structureMap.set(structure.constructor, structure);
  }
  const varnames = [ ...structureNames.values() ];
  const initializations = varnames.map(n => `${n} = {}`);
  for (let i = 0; i < initializations.length; i += 10) {
    const slice = initializations.slice(i, i + 10);
    add(`const ${slice.join(', ')};`);
  }

  const addBuffers = (object) => {
    if (object) {
      const { [MEMORY]: dv, [SLOTS]: slots } = object;
      if (dv && !arrayBufferNames.get(dv.buffer)) {
        const varname = `a${arrayBufferCount++}`;
        arrayBufferNames.set(dv.buffer, varname);
        if (dv.byteLength > 0) {
          const ta = new Uint8Array(dv.buffer);
          add(`const ${varname} = new Uint8Array([ ${ta.join(', ')} ]);`);
        } else {
          add(`const ${varname} = new Uint8Array();`);
        }
      }
      if (slots) {
        for (const [ slot, child ] of Object.entries(slots)) {
          addBuffers(child);
        }
      }
    }
  };
  const addObject = (name, object) => {
    if (object) {
      const structure = structureMap.get(object.constructor);
      const { [MEMORY]: dv, [SLOTS]: slots } = object;
      add(`${name}: {`);
      if (structure) {
        add(`structure: ${structureNames.get(structure)},`);
      }
      if (dv) {
        const buffer = arrayBufferNames.get(dv.buffer);
        const pairs = [ `array: ${buffer}` ];
        if (dv.byteLength < dv.buffer.byteLength) {
          pairs.push(`offset: ${dv.byteOffset}`);
          pairs.push(`length: ${dv.byteLength}`);
        }
        add(`memory: { ${pairs.join(', ')} },`);
        if (dv.hasOwnProperty('address')) {
          add(`address: ${dv.address},`);
        }
      }
      if (slots && Object.keys(slots).length > 0) {
        add(`slots: {`);
        for (const [ slot, child ] of Object.entries(slots)) {
          addObject(slot, child);
        }
        add(`},`);
      }
      add(`},`);
    } else {
      add(`${name}: null`);
    }
  };
  const addStructureContent = (name, { members, methods, template }) => {
    add(`${name}: {`);
    if (members.length > 0) {
      add(`members: [`);
      for (const member of members) {
        add(`{`);
        add(`...m,`);
        for (const [ name, value ] of Object.entries(member)) {
          if (isDifferent(value, defaultMember[name])) {
            switch (name) {
              case 'structure':
                add(`${name}: ${structureNames.get(value)},`);
                break;
              default:
                add(`${name}: ${JSON.stringify(value)},`);
            }
          }
        }
        add(`},`);
      }
      add(`],`);
    } else {
      add(`members: [],`);
    }
    const list = methods.map(m => methodNames.get(m));
    if (list.length > 0) {
      add(`methods: [ ${list.join(', ')} ],`);
    } else {
      add(`methods: [],`);
    }
    addObject('template', template);
    add(`},`);
  };
  const addStructure = (varname, structure) => {
    addBuffers(structure.instance.template);
    addBuffers(structure.static.template);
    // add static members; instance methods are also static methods, so
    // we don't need to add them separately
    for (const method of structure.static.methods) {
      const varname = `f${methodCount++}`;
      methodNames.set(method, varname);
      add(`const ${varname} = {`);
      for (const [ name, value ] of Object.entries(method)) {
        switch (name) {
          case 'argStruct':
            add(`${name}: ${structureNames.get(value)},`);
            break;
          default:
            add(`${name}: ${JSON.stringify(value)},`);
        }
      }
      add(`};`);
    }
    //  no need to add them separately
    add(`Object.assign(${varname}, {`);
    add(`...s,`);
    for (const [ name, value ] of Object.entries(structure)) {
      if (isDifferent(value, defaultStructure[name])) {
        switch (name) {
          case 'constructor':
          case 'sentinel':
            break;
          case 'instance':
          case 'static':
            addStructureContent(name, value);
            break;
          default:
            add(`${name}: ${JSON.stringify(value)},`);
        }
      }
    }
    add(`});`);
  };
  for (const [ index, structure ] of structures.entries()) {
    const varname = structureNames.get(structure);
    addStructure(varname, structure);
  }
  if (varnames.length <= 10) {
    add(`const structures = [ ${varnames.join(', ') } ];`);
  } else {
    add(`const structures = [`);
    for (let i = 0; i < varnames.length; i += 10) {
      const slice = varnames.slice(i, i + 10);
      add(`${slice.join(', ')},`);
    }
    add(`];`);
  }
  const root = structures[structures.length - 1];
  add(`const __module = ${structureNames.get(root)}.constructor;`);
  return lines;
} 

function getStructureFeatures(structures) {
  const structureFeatures = {}, memberFeatures = {};
  for (const structure of structures) {
    structureFeatures[ getStructureFeature(structure) ] = true;
    for (const members of [ structure.instance.members, structure.static.members ]) {
      for (const member of members) {
        const feature = getMemberFeature(member);
        if (feature) {
          memberFeatures[feature] = true;
        }
      }
    }
    if (structure.type === StructureType.Pointer) {
      // pointer need uint support
      memberFeatures.useUint = true;
    }
  }
  if (memberFeatures.useIntEx) {
    delete memberFeatures.useInt;
  }
  if (memberFeatures.useUintEx) {
    delete memberFeatures.useUint;
  }
  if (memberFeatures.useEnumerationItemEx) {
    delete memberFeatures.useEnumerationItem;
  }
  if (memberFeatures.useFloatEx) {
    delete memberFeatures.useFloat;
  }
  if (memberFeatures.useBoolEx) {
    delete memberFeatures.useBool;
  }
  return [ ...Object.keys(structureFeatures), ...Object.keys(memberFeatures) ];
}

function getExports(structures) {
  const root = structures[structures.length - 1];
  for (const member of root.static.members) {
    // only read-only properties are exportable
    let readOnly = false;
    if (member.type === MemberType.Type) {
      readOnly = true;
    } else if (member.type === MemberType.Object && member.structure.type === StructureType.Pointer) {
      if (member.structure.isConst) {
        readOnly = true;
      }
    }
    if (readOnly && /^[$\w]+$/.test(member.name)) {
      exportables.push(member.name);
    }
  }
  return [ 'default', ...exportables, '__zigar' ];
}

function manageIndentation(lines) {
  let indent = 0;
  return (s) => {
    if (/^\s*[\]\}]/.test(s)) {
      indent--;
    }
    lines.push(' '.repeat(indent * 2) + s);
    if (/[\[\{]\s*$/.test(s)) {
      indent++;
    }
  };
}

function isDifferent(value, def) {
  if (value === def) {
    return false;
  }
  if (def == null) {
    return value != null;
  }
  if (typeof(def) === 'object' && typeof(value) === 'object') {
    const valueKeys = Object.keys(value);
    const defKeys = Object.keys(def);
    if (valueKeys.length !== defKeys.length) {
      return true;
    }
    for (const key of defKeys) {
      if (isDifferent(value[key], def[key])) {
        return true;
      }
    }
    return false;
  }
  return true;
}
