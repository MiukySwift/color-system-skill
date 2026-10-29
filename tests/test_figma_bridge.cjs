// Live API behavior still requires MCP verification; this mock tests stored values, aliases, retries, and rollback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const scripts = Object.fromEntries(['inspect', 'apply', 'verify'].map(op =>
  [op, new AsyncFunction('figma', fs.readFileSync(path.join(process.argv[2], op + '.js'), 'utf8'))]));
const expectedCount = Number(process.argv[3]);

function mock(options = {}) {
  let serial = 0, writes = 0;
  const collections = new Map(), variables = new Map();
  const next = prefix => `${prefix}:${++serial}`;
  const api = {
    async getLocalVariableCollectionsAsync() { return [...collections.values()]; },
    async getLocalVariablesAsync() { return [...variables.values()]; },
    async getVariableByIdAsync(id) { return variables.get(id) || null; },
    async getVariableCollectionByIdAsync(id) { return collections.get(id) || null; },
    createVariableCollection(name) {
      writes++;
      const modeId = next('Mode');
      const c = {id: next('Collection'), name, defaultModeId: modeId,
        modes: [{name: 'Mode 1', modeId}], variableIds: [],
        renameMode(id, name) { writes++; this.modes.find(m => m.modeId === id).name = name; },
        addMode(name) {
          if (options.modeLimit && this.modes.length >= options.modeLimit) throw new Error('Mode limit');
          writes++;
          const modeId = next('Mode'); this.modes.push({name, modeId}); return modeId;
        },
        removeMode(id) {
          writes++; this.modes = this.modes.filter(m => m.modeId !== id);
          for (const variableId of this.variableIds) delete variables.get(variableId).valuesByMode[id];
        },
        remove() {
          writes++;
          for (const id of [...this.variableIds]) variables.get(id)?.remove();
          collections.delete(this.id);
        }
      };
      collections.set(c.id, c); return c;
    },
    createVariable(name, collection, type) {
      writes++;
      const v = {id: next('Variable'), name, variableCollectionId: collection.id, resolvedType: type,
        scopes: ['ALL_SCOPES'], codeSyntax: {}, valuesByMode: {},
        setVariableCodeSyntax(platform, value) { writes++; this.codeSyntax[platform] = value; },
        setValueForMode(id, value) {
          writes++;
          if (options.failName === this.name) throw new Error('Injected write failure');
          assert(collection.modes.some(m => m.modeId === id));
          if (value.type === 'VARIABLE_ALIAS') assert(variables.has(value.id));
          this.valuesByMode[id] = structuredClone(value);
        },
        remove() {
          writes++; variables.delete(this.id);
          collection.variableIds = collection.variableIds.filter(id => id !== this.id);
        }
      };
      variables.set(v.id, v); collection.variableIds.push(v.id); return v;
    },
    createVariableAlias(variable) { return {type: 'VARIABLE_ALIAS', id: variable.id}; }
  };
  return {figma: {editorType: 'figma', variables: api}, collections, variables,
    get writes() { return writes; }, options};
}

(async () => {
  const m = mock();
  let r = await scripts.inspect(m.figma);
  assert.equal(r.status, 'ready'); assert.equal(m.writes, 0);
  assert.equal(r.missingVariables.length, expectedCount);
  r = await scripts.apply(m.figma);
  assert.equal(r.status, 'verified'); assert.equal(r.createdVariableIds.length, expectedCount);
  assert.equal(r.counts.primitive + r.counts.semantic, expectedCount);
  assert.equal(r.counts.semanticAliases, 90);
  assert.equal(r.createdCollectionIds.length, 2);
  assert.equal(m.variables.size, expectedCount);
  const before = m.writes;
  r = await scripts.apply(m.figma);
  assert.equal(r.status, 'verified'); assert.equal(r.createdVariableIds.length, 0);
  assert.equal(m.writes, before); // The second execution performs no writes.
  assert.equal((await scripts.verify(m.figma)).status, 'verified');

  // Require actual alias IDs; another same-value semantic variable is not an equivalent target.
  const semantic = [...m.collections.values()].find(c => c.name === 'Semantic');
  const primitive = [...m.collections.values()].find(c => c.name === 'Primitive');
  const pick = name => [...m.variables.values()].find(v => v.name === name && v.variableCollectionId === semantic.id);
  const accent = pick('font/accent');
  const light = semantic.defaultModeId;
  const previous = accent.valuesByMode[light];
  accent.valuesByMode[light] = {type: 'VARIABLE_ALIAS', id: pick('brand/on-brand-background').id};
  let writes = m.writes;
  assert.equal((await scripts.apply(m.figma)).status, 'conflict');
  assert.equal(m.writes, writes);
  accent.valuesByMode[light] = previous;

  // Find conflicts elsewhere before filling gaps; never write first and report conflicts later.
  pick('lines/focus-success').remove();
  const original = m.variables.get(primitive.variableIds[0]);
  original.valuesByMode[primitive.defaultModeId].a = 0.3;
  writes = m.writes;
  assert.equal((await scripts.apply(m.figma)).status, 'conflict');
  assert.equal(m.writes, writes);
  original.valuesByMode[primitive.defaultModeId].a = 1;
  assert.equal((await scripts.verify(m.figma)).status, 'incomplete');
  assert.equal((await scripts.apply(m.figma)).createdVariableIds.length, 1);

  // Compatible existing collections can gain Dark mode without rewriting their Light values.
  const dark = semantic.modes.find(m => m.name === 'Dark').modeId;
  semantic.removeMode(dark);
  r = await scripts.apply(m.figma);
  assert.equal(r.status, 'verified'); assert.equal(r.addedModes.length, 1);
  assert.equal(r.createdVariableIds.length, 0);

  // Mode limits and partial failures roll back only new data, preserving existing objects.
  for (const options of [{modeLimit: 1}, {failName: 'font/error'}]) {
    const broken = mock(options);
    const keep = broken.figma.variables.createVariableCollection('User colors');
    r = await scripts.apply(broken.figma);
    assert.equal(r.status, 'failed'); assert.equal(r.rollbackComplete, true);
    assert.deepEqual([...broken.collections.keys()], [keep.id]);
    assert.equal(broken.variables.size, 0);
  }
  // A failed gap-fill must also preserve all preexisting variables and IDs.
  pick('font/error').remove();
  const existingIds = [...m.variables.keys()];
  m.options.failName = 'font/error';
  r = await scripts.apply(m.figma);
  assert.equal(r.status, 'failed'); assert.equal(r.rollbackComplete, true);
  assert.deepEqual([...m.variables.keys()], existingIds);
  delete m.options.failName;
  assert.equal((await scripts.apply(m.figma)).status, 'verified');

  // Ambiguous collection names permit neither creation nor overwrite.
  m.figma.variables.createVariableCollection('Primitive');
  writes = m.writes;
  assert.equal((await scripts.apply(m.figma)).status, 'conflict');
  assert.equal(m.writes, writes);
  console.log('Figma bridge behavior checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
