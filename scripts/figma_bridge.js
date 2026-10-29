// Plain JavaScript for use_figma. No persistent state, local file access, or network access.
async function syncColorSystem(figma, system, operation) {
  if (!["inspect", "apply", "verify"].includes(operation)) throw new Error("Unknown operation");
  if (figma.editorType !== "figma") throw new Error("Use a Figma Design file");
  if (system.schemaVersion !== "3.0.0") throw new Error("Unsupported schemaVersion");

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  // Broad discovery reads identity fields only; inspect target details using resolved IDs.
  const inventory = (await figma.variables.getLocalVariablesAsync()).map(v => ({
    id: v.id, name: v.name, resolvedType: v.resolvedType, collectionId: v.variableCollectionId
  }));
  const conflicts = [], collectionMap = {}, variableMap = {}, modeMap = {};
  const missingCollections = [], missingVariables = [], missingModes = [];
  const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-6;
  const sameScopes = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const rgba = value => ({
    r: parseInt(value.hex.slice(1, 3), 16) / 255,
    g: parseInt(value.hex.slice(3, 5), 16) / 255,
    b: parseInt(value.hex.slice(5, 7), 16) / 255, a: value.alpha
  });
  const isColor = (actual, value) => {
    const expected = rgba(value);
    return actual && ["r", "g", "b", "a"].every(k => near(actual[k], expected[k]));
  };

  // Resolve collection and variable identities before checking cross-collection aliases.
  for (const spec of system.collections) {
    const matches = collections.filter(c => c.name === spec.name);
    if (matches.length > 1) {
      conflicts.push(`Duplicate collection name: ${spec.name}`);
      continue;
    }
    const collection = matches[0];
    if (!collection) {
      missingCollections.push(spec.key);
      missingModes.push(...spec.modes.map(mode => `${spec.key}:${mode}`));
      missingVariables.push(...spec.variables.map(v => `${spec.key}:${v.name}`));
      continue;
    }
    collectionMap[spec.key] = collection;
    modeMap[spec.key] = {};
    const modeNames = collection.modes.map(m => m.name);
    if (modeNames.length !== new Set(modeNames).size ||
        modeNames.some(name => !spec.modes.includes(name))) {
      conflicts.push(`Unexpected or duplicate modes: ${spec.name}`);
    }
    const defaultMode = collection.modes.find(m => m.modeId === collection.defaultModeId);
    if (!defaultMode || defaultMode.name !== spec.modes[0]) {
      conflicts.push(`Default mode must be ${spec.modes[0]}: ${spec.name}`);
    }
    for (const mode of spec.modes) {
      const found = collection.modes.find(m => m.name === mode);
      if (found) modeMap[spec.key][mode] = found.modeId;
      else missingModes.push(`${spec.key}:${mode}`);
    }
    const local = inventory.filter(v => v.collectionId === collection.id);
    const desired = new Set(spec.variables.map(v => v.name));
    for (const v of local) {
      if (!desired.has(v.name)) conflicts.push(`Unexpected variable: ${spec.name}/${v.name}`);
    }
    for (const v of spec.variables) {
      const key = `${spec.key}:${v.name}`;
      const matches = local.filter(item => item.name === v.name);
      if (matches.length > 1) conflicts.push(`Duplicate variable: ${key}`);
      else if (matches.length === 0) missingVariables.push(key);
      else {
        const found = await figma.variables.getVariableByIdAsync(matches[0].id);
        if (!found) conflicts.push(`Variable disappeared: ${key}`);
        else variableMap[key] = found;
      }
    }
  }

  for (const spec of system.collections) {
    for (const v of spec.variables) {
      const key = `${spec.key}:${v.name}`, existing = variableMap[key];
      if (!existing) continue;
      if (existing.resolvedType !== "COLOR") conflicts.push(`Type mismatch: ${key}`);
      if (!sameScopes(existing.scopes, v.scopes)) conflicts.push(`Scope mismatch: ${key}`);
      if (existing.codeSyntax.WEB !== v.codeSyntax.WEB) conflicts.push(`WEB syntax mismatch: ${key}`);
      const values = existing.valuesByMode;
      for (const mode of spec.modes) {
        const modeId = modeMap[spec.key][mode];
        if (!modeId) continue;
        const actual = values[modeId], value = v.values[mode];
        if (value.alias) {
          if (actual?.type !== "VARIABLE_ALIAS" || actual.id !== variableMap[value.alias]?.id) {
            conflicts.push(`Alias mismatch: ${key}/${mode}`);
          }
        } else if (!isColor(actual, value)) conflicts.push(`RGBA mismatch: ${key}/${mode}`);
      }
    }
  }

  const plan = {conflicts, missingCollections, missingVariables, missingModes};
  if (operation === "inspect") {
    return {status: conflicts.length ? "conflict" : "ready", ...plan};
  }
  if (conflicts.length) return {status: "conflict", ...plan};
  if (operation === "verify" && (missingCollections.length || missingVariables.length || missingModes.length)) {
    return {status: "incomplete", ...plan};
  }

  const createdCollections = [], createdVariables = [], addedModes = [];
  try {
    if (operation === "apply") {
      // Create all modes first so account mode-limit failures occur before variable writes.
      for (const spec of system.collections) {
        let collection = collectionMap[spec.key];
        if (!collection) {
          collection = figma.variables.createVariableCollection(spec.name);
          createdCollections.push(collection.id);
          collectionMap[spec.key] = collection;
          collection.renameMode(collection.defaultModeId, spec.modes[0]);
          modeMap[spec.key] = {[spec.modes[0]]: collection.defaultModeId};
        }
        for (const mode of spec.modes) {
          if (!modeMap[spec.key][mode]) {
            const modeId = collection.addMode(mode);
            addedModes.push({collectionId: collection.id, modeId});
            modeMap[spec.key][mode] = modeId;
          }
        }
      }
      // Create all Primitives before establishing semantic aliases with actual Variable IDs.
      for (const spec of system.collections) {
        for (const v of spec.variables) {
          const key = `${spec.key}:${v.name}`;
          let variable = variableMap[key];
          const isNew = !variable;
          if (isNew) {
            variable = figma.variables.createVariable(v.name, collectionMap[spec.key], "COLOR");
            createdVariables.push(variable.id);
            variableMap[key] = variable;
            variable.scopes = v.scopes;
            variable.setVariableCodeSyntax("WEB", v.codeSyntax.WEB);
          }
          for (const mode of spec.modes) {
            const modeId = modeMap[spec.key][mode];
            // Preserve compatible existing values; populate only modes added during this call.
            const modeWasAdded = addedModes.some(m =>
              m.collectionId === collectionMap[spec.key].id && m.modeId === modeId);
            if (!isNew && !modeWasAdded) continue;
            const value = v.values[mode];
            const target = value.alias && variableMap[value.alias];
            if (value.alias && !target) throw new Error(`Missing alias target: ${value.alias}`);
            variable.setValueForMode(modeId, value.alias
              ? figma.variables.createVariableAlias(target) : rgba(value));
          }
        }
      }
    }

    // Read back exact IDs to verify actual RGBA, alpha, aliases, scopes, code syntax, and modes.
    const verificationErrors = [];
    for (const spec of system.collections) {
      const c = await figma.variables.getVariableCollectionByIdAsync(collectionMap[spec.key].id);
      if (!c || c.variableIds.length !== spec.variables.length ||
          c.modes.length !== spec.modes.length ||
          c.modes.find(m => m.modeId === c.defaultModeId)?.name !== spec.modes[0]) {
        verificationErrors.push(`Collection structure: ${spec.key}`);
      }
      for (const v of spec.variables) {
        const key = `${spec.key}:${v.name}`;
        const actual = await figma.variables.getVariableByIdAsync(variableMap[key].id);
        if (!actual || actual.name !== v.name || actual.resolvedType !== "COLOR" ||
            actual.variableCollectionId !== c?.id || !sameScopes(actual.scopes, v.scopes) ||
            actual.codeSyntax.WEB !== v.codeSyntax.WEB) {
          verificationErrors.push(`Variable structure: ${key}`);
          continue;
        }
        for (const mode of spec.modes) {
          const modeId = c.modes.find(m => m.name === mode)?.modeId;
          const value = v.values[mode], stored = actual.valuesByMode[modeId];
          const ok = value.alias
            ? stored?.type === "VARIABLE_ALIAS" && stored.id === variableMap[value.alias]?.id
            : isColor(stored, value);
          if (!ok) verificationErrors.push(`Value mismatch: ${key}/${mode}`);
        }
      }
    }
    if (verificationErrors.length) throw new Error(JSON.stringify(verificationErrors));
    return {
      status: "verified", createdCollectionIds: createdCollections, createdVariableIds: createdVariables,
      addedModes, collectionIds: Object.fromEntries(Object.entries(collectionMap).map(([k,v]) => [k,v.id])),
      modeIds: modeMap,
      variableIds: Object.fromEntries(Object.entries(variableMap).map(([k,v]) => [k,v.id])),
      counts: {
        ...Object.fromEntries(system.collections.map(c => [c.key, c.variables.length])),
        semanticAliases: system.collections.flatMap(c => c.variables)
          .reduce((total, v) => total + Object.values(v.values).filter(value => value.alias).length, 0)
      }
    };
  } catch (error) {
    // Roll back only exact IDs created by this call; never remove preexisting data or delete by name.
    const cleanupErrors = [];
    for (const id of [...createdVariables].reverse()) {
      try { (await figma.variables.getVariableByIdAsync(id))?.remove(); }
      catch (e) { cleanupErrors.push({id, error: String(e)}); }
    }
    for (const {collectionId, modeId} of [...addedModes].reverse()) {
      if (createdCollections.includes(collectionId)) continue;
      try { (await figma.variables.getVariableCollectionByIdAsync(collectionId))?.removeMode(modeId); }
      catch (e) { cleanupErrors.push({id: modeId, collectionId, error: String(e)}); }
    }
    for (const id of [...createdCollections].reverse()) {
      try { (await figma.variables.getVariableCollectionByIdAsync(id))?.remove(); }
      catch (e) { cleanupErrors.push({id, error: String(e)}); }
    }
    return {status: "failed", error: String(error), rollbackComplete: cleanupErrors.length === 0,
      createdCollectionIds: createdCollections, createdVariableIds: createdVariables, addedModes, cleanupErrors};
  }
}
