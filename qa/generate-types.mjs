import fs from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';

const directory = new URL('../packages/contracts/', import.meta.url);
for (const name of ['Dataset', 'Plan', 'Certificate']) {
  const schema = JSON.parse(await fs.readFile(new URL(`${name}.schema.json`, directory), 'utf8'));
  // The TS compiler consumes draft-07 tuple items; Pydantic emits 2020-12 prefixItems.
  function adapt(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(adapt);
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, adapt(item)]));
    if (result.prefixItems) { result.items = result.prefixItems; result.additionalItems = false; delete result.prefixItems; }
    return result;
  }
  const output = await compile(adapt(schema), name, { bannerComment: '/* Generated from executable Python serialization schemas. Run scripts/export_contracts.py then qa/generate-types.mjs. */' });
  await fs.writeFile(new URL(`${name}.ts`, directory), output);
}
console.log('Generated Dataset, Plan and Certificate TypeScript contracts');
