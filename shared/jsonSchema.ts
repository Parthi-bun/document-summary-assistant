/**
 * Helpers for turning a zod schema into a JSON Schema that OpenAI-compatible
 * providers accept in strict structured-output mode.
 *
 * Strict mode is deliberately restrictive: it understands the structural
 * keywords (type/properties/required/items/enum/anyOf/$defs/$ref/description)
 * and rejects validation keywords such as minLength or minItems. It also
 * requires every object to set additionalProperties:false and to list every
 * property in `required`. zod emits the validation keywords, so we strip them
 * here rather than weakening the zod schema — runtime validation still uses the
 * full zod contract after the reply comes back.
 */

/** Keywords a strict structured-output schema must not contain. */
const UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'default',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minProperties',
  'maxProperties',
]);

type JsonObject = Record<string, unknown>;

/**
 * Recursively strips unsupported keywords and enforces the two structural rules
 * strict mode requires on every object node.
 */
export function toStrictJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrictJsonSchema);
  if (schema === null || typeof schema !== 'object') return schema;

  const source = schema as JsonObject;
  const result: JsonObject = {};

  for (const [key, value] of Object.entries(source)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    result[key] = toStrictJsonSchema(value);
  }

  if (result.type === 'object') {
    // Strict mode requires both of these on every object node.
    result.additionalProperties = false;
    const properties = result.properties;
    if (properties && typeof properties === 'object') {
      result.required = Object.keys(properties);
    }
  }

  return result;
}
