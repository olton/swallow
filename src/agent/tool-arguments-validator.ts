import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';

import { SdkError } from '../errors/index.js';
import type { JsonObject, ToolDefinition } from '../types/types.js';

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateToolArguments(
  tool: ToolDefinition,
  args: unknown,
  cache: Map<string, ValidateFunction>
): void {
  if (tool.parameters === undefined) {
    return;
  }

  const schema = normalizeSchema(tool.parameters);
  const schemaKey = stableStringify(schema);

  const validate = ensureValidator(schemaKey, schema, cache);

  const ok = validate(args);
  if (ok) {
    return;
  }

  const details = ajv.errorsText(validate.errors, {
    separator: '; ',
    dataVar: 'toolArgs',
  });
  throw new SdkError(`Tool arguments failed JSON Schema validation for '${tool.name}': ${details}`);
}

function ensureValidator(
  schemaKey: string,
  schema: JsonObject,
  cache: Map<string, ValidateFunction>
): ValidateFunction {
  const cached = cache.get(schemaKey);
  if (cached) {
    return cached;
  }

  const compiled = ajv.compile(schema);
  cache.set(schemaKey, compiled);
  return compiled;
}

function normalizeSchema(schema: JsonObject): JsonObject {
  const hasType = Object.prototype.hasOwnProperty.call(schema, 'type');
  if (hasType) {
    return schema;
  }

  return {
    type: 'object',
    ...schema,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
