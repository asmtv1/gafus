const isFlag = key => /(?:ENABLE|DISABLE|FEATURE|ROLLOUT|SHADOW|ALLOW|LEGACY|FALLBACK|MODE|EXPERIMENT|PERCENT|PILOT)/.test(key);

export function buildFlagCatalog(groups) {
  const catalog = new Map();
  for (const group of groups) {
    if (![group.owner, group.fallback, group.removal].every(value => typeof value === "string" && value.trim()) || !group.keys?.length) {
      throw Error("Incomplete flag policy");
    }
    for (const key of group.keys) {
      if (catalog.has(key)) throw Error("Duplicate flag " + key);
      catalog.set(key, group);
    }
  }
  return catalog;
}

export function readFlagSelectors(source) {
  const keys = new Set();
  const add = key => { if (key && isFlag(key)) keys.add(key); };
  for (const match of source.matchAll(/\b(?:process\.env|import\.meta\.env|env)\s*(?:(?:\.|\?\.)([A-Z][A-Z0-9_]+)|(?:\?\.)?\[["']([A-Z][A-Z0-9_]+)["']\])/g)) {
    add(match[1] || match[2]);
  }
  // Environment destructuring (including renamed and defaulted properties).
  for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*(?:process\.env|import\.meta\.env)\b/g)) {
    for (const property of match[1].split(",")) {
      add(property.trim().match(/^([A-Z][A-Z0-9_]*)\s*(?::|=|$)/)?.[1]);
    }
  }
  return keys;
}

export function compareFlagCatalog(catalog, actual) {
  return {
    missing: [...actual.keys()].filter(key => !catalog.has(key)).sort(),
    stale: [...catalog.keys()].filter(key => !actual.has(key)).sort(),
  };
}
