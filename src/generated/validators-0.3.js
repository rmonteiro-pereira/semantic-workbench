// generated, do not edit
import * as semanticDraft030Runtime0Module from 'ajv/dist/runtime/ucs2length.js';
import * as mappingsDraft030Runtime0Module from 'ajv/dist/runtime/ucs2length.js';
import * as mappingsDraft030Runtime1Module from 'ajv/dist/runtime/equal.js';
const generatedSemanticDraft030 = (() => {
  const semanticDraft030Runtime0 = semanticDraft030Runtime0Module.default?.__esModule ? semanticDraft030Runtime0Module.default : semanticDraft030Runtime0Module;

  const ossieSemanticModelDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/apache/ossie/core-spec/ossie-schema.json',
    title: 'Apache Ossie Core Metadata Specification',
    description: 'JSON Schema for validating a single Apache Ossie semantic model document',
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Apache Ossie specification version' },
      name: { $ref: '#/$defs/SemanticModel/properties/name' },
      description: { $ref: '#/$defs/SemanticModel/properties/description' },
      ai_context: { $ref: '#/$defs/SemanticModel/properties/ai_context' },
      datasets: { $ref: '#/$defs/SemanticModel/properties/datasets' },
      relationships: { $ref: '#/$defs/SemanticModel/properties/relationships' },
      metrics: { $ref: '#/$defs/SemanticModel/properties/metrics' },
      nonportable_extensions: { $ref: '#/$defs/SemanticModel/properties/nonportable_extensions' },
    },
    required: ['version', 'name', 'datasets'],
    additionalProperties: false,
    $defs: {
      Dialect: {
        type: 'string',
        minLength: 1,
        examples: ['OSSIE_SQL_2026', 'ANSI_SQL', 'DB_DIALECT', 'BI_EXPRESSION', 'SEMANTIC_MODEL_EXPRESSION', 'PROGRAMMING_LANGUAGE'],
        description:
          'Expression language a metric or field expression is declared in. Any non-empty string is accepted. OSSIE_SQL_2026 is the only dialect this specification defines; others are opaque to Ossie. See extensions/dialects.md.',
      },
      Vendor: {
        type: 'string',
        minLength: 1,
        examples: ['BI_TOOL', 'DB_VENDOR', 'SEMANTIC_LAYER'],
        description: 'Vendor name for non-portable extensions. Any non-empty string is accepted. See extensions/vendors.md.',
      },
      AIContext: {
        description: 'Additional context for AI tools',
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              instructions: { type: 'string', description: 'Instructions for AI on how to use this entity' },
              synonyms: { type: 'array', items: { type: 'string' }, description: 'Alternative names and terms' },
              examples: { type: 'array', items: { type: 'string' }, description: 'Sample questions or use cases' },
            },
            additionalProperties: true,
          },
        ],
      },
      NonportableExtension: {
        type: 'object',
        description: 'Vendor-specific state that Ossie carries and does not interpret. Portable behavior does not depend on it.',
        properties: {
          vendor_name: { $ref: '#/$defs/Vendor' },
          data: {
            type: 'object',
            description:
              'Vendor-specific data as a structured object. The core schema does not reference the structure under data: no reserved key and no common sub-key. Keys are entirely vendor-defined. Values must be JSON-representable. Ossie carries the object but does not interpret it. See core-spec/spec.md#non-portable-extensions.',
          },
        },
        required: ['vendor_name', 'data'],
        additionalProperties: false,
      },
      DialectExpression: {
        type: 'object',
        description: 'Expression in a specific dialect',
        properties: { dialect: { $ref: '#/$defs/Dialect' }, expression: { type: 'string', minLength: 1, description: 'SQL or dialect-specific expression' } },
        required: ['dialect', 'expression'],
        additionalProperties: false,
      },
      Expression: {
        type: 'object',
        description: 'Expression definition with multi-dialect support',
        properties: {
          sql: {
            type: 'string',
            minLength: 1,
            description: 'Primary, portable expression written in OSSIE_SQL_2026. When both this field and an OSSIE_SQL_2026 entry in `dialects` are present, this field is authoritative.',
          },
          dialects: { type: 'array', items: { $ref: '#/$defs/DialectExpression' }, minItems: 1 },
        },
        anyOf: [{ required: ['sql'] }, { required: ['dialects'] }],
        additionalProperties: false,
      },
      DataType: {
        type: 'string',
        enum: ['String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'Time', 'DateTime', 'DateTimeTz', 'Opaque'],
        description:
          'Logical data type for fields and metrics, independent of role (e.g. dimension vs fact) and physical representation. `Decimal` is exact base-10 with unspecified precision and scale; `Float` is approximate. `DateTime` has no timezone or offset, while `DateTimeTz` identifies an instant using offset or timezone context but does not guarantee preservation of a named timezone. Omit `datatype` when unknown. `Opaque` means the type is outside the portable vocabulary. A vendor may record its own type name under `nonportable_extensions`; that record is not part of the portable type.',
      },
      Dimension: {
        type: 'object',
        description: 'Dimension metadata',
        properties: {
          is_time: {
            type: 'boolean',
            description:
              "Temporal-role marker. When true, consumers that distinguish time dimensions (e.g. for time-series analysis or temporal filtering) should treat this field as a time dimension. This is a *role* flag, independent of the field's data type: a field with `is_time: true` may carry any `datatype` (e.g. `Integer` for a year grain, `String` for a month name, as well as temporal data types). When `is_time` is unset, it defaults to `true` if `datatype` is one of `Date`, `Time`, `DateTime`, or `DateTimeTz`, and `false` otherwise. Set `is_time: false` explicitly to opt a temporal-typed column (such as an audit timestamp) out of time-dimension treatment.",
          },
        },
        additionalProperties: false,
      },
      Field: {
        type: 'object',
        description: 'Row-level attribute for grouping, filtering, and metric expressions',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the field within the dataset' },
          expression: { $ref: '#/$defs/Expression' },
          dimension: { $ref: '#/$defs/Dimension' },
          label: { type: 'string', description: 'Label for categorization' },
          description: { type: 'string', description: 'Human-readable description' },
          datatype: { $ref: '#/$defs/DataType' },
          ai_context: { $ref: '#/$defs/AIContext' },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'expression'],
        additionalProperties: false,
      },
      Dataset: {
        type: 'object',
        description: 'Logical dataset representing a business entity (fact or dimension table)',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the dataset' },
          source: { type: 'string', minLength: 1, description: 'Reference to underlying physical table/view (database.schema.table) or query' },
          primary_key: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true, description: 'Dataset fields that uniquely identify rows, each named once' },
          unique_keys: {
            type: 'array',
            items: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
            minItems: 1,
            description: 'Array of unique key definitions, each a list of dataset fields naming each field once',
          },
          description: { type: 'string', description: 'Human-readable description' },
          ai_context: { $ref: '#/$defs/AIContext' },
          fields: {
            type: 'array',
            items: { $ref: '#/$defs/Field' },
            description: "The dataset's declared fields. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
          },
          metrics: {
            type: 'array',
            items: { $ref: '#/$defs/Metric' },
            description:
              "Dataset-scoped metrics: measures defined on this dataset's relation that semantically belong to the dataset. A metric aggregates the dataset's rows, or derives from measures of the dataset's source. The expression references this dataset's declared fields by single-part (unqualified) name, and columns of the dataset's source as source.column. When the source is a measure relation, it may evaluate a source measure with AGG(source.measure). It must resolve entirely within this dataset; an expression that must reference another dataset belongs in the model-scoped metrics instead. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
          },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'source'],
        additionalProperties: false,
      },
      Relationship: {
        type: 'object',
        description: 'Foreign key relationship between datasets',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the relationship' },
          from: { type: 'string', minLength: 1, description: 'Dataset on the many side of the relationship' },
          to: { type: 'string', minLength: 1, description: 'Dataset on the one side of the relationship' },
          from_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'from' dataset (foreign key fields)" },
          to_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'to' dataset (primary or unique key fields)" },
          ai_context: { $ref: '#/$defs/AIContext' },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'from', 'to', 'from_columns', 'to_columns'],
        additionalProperties: false,
      },
      Metric: {
        type: 'object',
        description: 'Quantitative measure defined on business data',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the metric' },
          expression: { $ref: '#/$defs/Expression' },
          description: { type: 'string', description: 'Human-readable description of what the metric measures' },
          datatype: { $ref: '#/$defs/DataType' },
          ai_context: { $ref: '#/$defs/AIContext' },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'expression'],
        additionalProperties: false,
      },
      SemanticModel: {
        type: 'object',
        description: 'Top-level container representing a complete semantic model',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the semantic model' },
          description: { type: 'string', description: 'Human-readable description' },
          ai_context: { $ref: '#/$defs/AIContext' },
          datasets: { type: 'array', items: { $ref: '#/$defs/Dataset' }, minItems: 1, description: 'Collection of logical datasets' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines how datasets are connected' },
          metrics: {
            type: 'array',
            items: { $ref: '#/$defs/Metric' },
            description:
              'Model-scoped metrics: aggregations that span datasets or need to be aware of cross-dataset concepts. Expressions reference fields by multi-part name (dataset.field) and may combine fields from more than one dataset. They may evaluate a dataset-scoped metric with AGG(dataset.metric). Names must be unique across the model. See core-spec/spec.md#metric-scoping.',
          },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'datasets'],
        additionalProperties: false,
      },
    },
  };
  const ossieSemanticModelDraft030SemanticModelNameSchema = { type: 'string', minLength: 1, description: 'Unique identifier for the semantic model' };
  const ossieSemanticModelDraft030SemanticModelDescriptionSchema = { type: 'string', description: 'Human-readable description' };
  const ossieSemanticModelDraft030AIContextSchema = {
    description: 'Additional context for AI tools',
    oneOf: [
      { type: 'string' },
      {
        type: 'object',
        properties: {
          instructions: { type: 'string', description: 'Instructions for AI on how to use this entity' },
          synonyms: { type: 'array', items: { type: 'string' }, description: 'Alternative names and terms' },
          examples: { type: 'array', items: { type: 'string' }, description: 'Sample questions or use cases' },
        },
        additionalProperties: true,
      },
    ],
  };
  const func1 = semanticDraft030Runtime0.default;
  const CollectionLogicalDatasetsSchema = { type: 'array', items: { $ref: '#/$defs/Dataset' }, minItems: 1, description: 'Collection of logical datasets' };
  const LogicalDatasetRepresentingBusinessSchema = {
    type: 'object',
    description: 'Logical dataset representing a business entity (fact or dimension table)',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the dataset' },
      source: { type: 'string', minLength: 1, description: 'Reference to underlying physical table/view (database.schema.table) or query' },
      primary_key: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true, description: 'Dataset fields that uniquely identify rows, each named once' },
      unique_keys: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
        minItems: 1,
        description: 'Array of unique key definitions, each a list of dataset fields naming each field once',
      },
      description: { type: 'string', description: 'Human-readable description' },
      ai_context: { $ref: '#/$defs/AIContext' },
      fields: {
        type: 'array',
        items: { $ref: '#/$defs/Field' },
        description: "The dataset's declared fields. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
      },
      metrics: {
        type: 'array',
        items: { $ref: '#/$defs/Metric' },
        description:
          "Dataset-scoped metrics: measures defined on this dataset's relation that semantically belong to the dataset. A metric aggregates the dataset's rows, or derives from measures of the dataset's source. The expression references this dataset's declared fields by single-part (unqualified) name, and columns of the dataset's source as source.column. When the source is a measure relation, it may evaluate a source measure with AGG(source.measure). It must resolve entirely within this dataset; an expression that must reference another dataset belongs in the model-scoped metrics instead. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
      },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'source'],
    additionalProperties: false,
  };
  const func2 = Object.prototype.hasOwnProperty;
  const RowLevelAttributeGroupingSchema = {
    type: 'object',
    description: 'Row-level attribute for grouping, filtering, and metric expressions',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the field within the dataset' },
      expression: { $ref: '#/$defs/Expression' },
      dimension: { $ref: '#/$defs/Dimension' },
      label: { type: 'string', description: 'Label for categorization' },
      description: { type: 'string', description: 'Human-readable description' },
      datatype: { $ref: '#/$defs/DataType' },
      ai_context: { $ref: '#/$defs/AIContext' },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'expression'],
    additionalProperties: false,
  };
  const DimensionMetadataSchema = {
    type: 'object',
    description: 'Dimension metadata',
    properties: {
      is_time: {
        type: 'boolean',
        description:
          "Temporal-role marker. When true, consumers that distinguish time dimensions (e.g. for time-series analysis or temporal filtering) should treat this field as a time dimension. This is a *role* flag, independent of the field's data type: a field with `is_time: true` may carry any `datatype` (e.g. `Integer` for a year grain, `String` for a month name, as well as temporal data types). When `is_time` is unset, it defaults to `true` if `datatype` is one of `Date`, `Time`, `DateTime`, or `DateTimeTz`, and `false` otherwise. Set `is_time: false` explicitly to opt a temporal-typed column (such as an audit timestamp) out of time-dimension treatment.",
      },
    },
    additionalProperties: false,
  };
  const LogicalDataTypeFieldsSchema = {
    type: 'string',
    enum: ['String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'Time', 'DateTime', 'DateTimeTz', 'Opaque'],
    description:
      'Logical data type for fields and metrics, independent of role (e.g. dimension vs fact) and physical representation. `Decimal` is exact base-10 with unspecified precision and scale; `Float` is approximate. `DateTime` has no timezone or offset, while `DateTimeTz` identifies an instant using offset or timezone context but does not guarantee preservation of a named timezone. Omit `datatype` when unknown. `Opaque` means the type is outside the portable vocabulary. A vendor may record its own type name under `nonportable_extensions`; that record is not part of the portable type.',
  };
  const ExpressionDefinitionMultiDialectSchema = {
    type: 'object',
    description: 'Expression definition with multi-dialect support',
    properties: {
      sql: {
        type: 'string',
        minLength: 1,
        description: 'Primary, portable expression written in OSSIE_SQL_2026. When both this field and an OSSIE_SQL_2026 entry in `dialects` are present, this field is authoritative.',
      },
      dialects: { type: 'array', items: { $ref: '#/$defs/DialectExpression' }, minItems: 1 },
    },
    anyOf: [{ required: ['sql'] }, { required: ['dialects'] }],
    additionalProperties: false,
  };
  const ExpressionSpecificDialectSchema = {
    type: 'object',
    description: 'Expression in a specific dialect',
    properties: { dialect: { $ref: '#/$defs/Dialect' }, expression: { type: 'string', minLength: 1, description: 'SQL or dialect-specific expression' } },
    required: ['dialect', 'expression'],
    additionalProperties: false,
  };
  const ExpressionLanguageMetricFieldSchema = {
    type: 'string',
    minLength: 1,
    examples: ['OSSIE_SQL_2026', 'ANSI_SQL', 'DB_DIALECT', 'BI_EXPRESSION', 'SEMANTIC_MODEL_EXPRESSION', 'PROGRAMMING_LANGUAGE'],
    description:
      'Expression language a metric or field expression is declared in. Any non-empty string is accepted. OSSIE_SQL_2026 is the only dialect this specification defines; others are opaque to Ossie. See extensions/dialects.md.',
  };

  function validate25(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate25.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.dialect === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'dialect' }, message: "must have required property '" + 'dialect' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.expression === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'dialect' || key0 === 'expression')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.dialect !== undefined) {
        let data0 = data.dialect;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/dialect',
              schemaPath: '#/$defs/Dialect/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/dialect', schemaPath: '#/$defs/Dialect/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data1 = data.expression;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err5 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/properties/expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/expression', schemaPath: '#/properties/expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate25.errors = vErrors;
    return errors === 0;
  }
  validate25.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate24(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate24.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.sql === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'sql' }, message: "must have required property '" + 'sql' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.dialects === undefined) {
        const err1 = { instancePath, schemaPath: '#/anyOf/1/required', keyword: 'required', params: { missingProperty: 'dialects' }, message: "must have required property '" + 'dialects' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      for (const key0 in data) {
        if (!(key0 === 'sql' || key0 === 'dialects')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.sql !== undefined) {
        let data0 = data.sql;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err4 = {
              instancePath: instancePath + '/sql',
              schemaPath: '#/properties/sql/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/sql', schemaPath: '#/properties/sql/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.dialects !== undefined) {
        let data1 = data.dialects;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err6 = {
              instancePath: instancePath + '/dialects',
              schemaPath: '#/properties/dialects/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate25(data1[i0], { instancePath: instancePath + '/dialects/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/dialects', schemaPath: '#/properties/dialects/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
    } else {
      const err8 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    validate24.errors = vErrors;
    return errors === 0;
  }
  validate24.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const VendorSpecificStateOssieSchema = {
    type: 'object',
    description: 'Vendor-specific state that Ossie carries and does not interpret. Portable behavior does not depend on it.',
    properties: {
      vendor_name: { $ref: '#/$defs/Vendor' },
      data: {
        type: 'object',
        description:
          'Vendor-specific data as a structured object. The core schema does not reference the structure under data: no reserved key and no common sub-key. Keys are entirely vendor-defined. Values must be JSON-representable. Ossie carries the object but does not interpret it. See core-spec/spec.md#non-portable-extensions.',
      },
    },
    required: ['vendor_name', 'data'],
    additionalProperties: false,
  };
  const VendorNameNonPortableSchema = {
    type: 'string',
    minLength: 1,
    examples: ['BI_TOOL', 'DB_VENDOR', 'SEMANTIC_LAYER'],
    description: 'Vendor name for non-portable extensions. Any non-empty string is accepted. See extensions/vendors.md.',
  };

  function validate28(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate28.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.vendor_name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'vendor_name' }, message: "must have required property '" + 'vendor_name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.data === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'data' }, message: "must have required property '" + 'data' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'vendor_name' || key0 === 'data')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.vendor_name !== undefined) {
        let data0 = data.vendor_name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/vendor_name',
              schemaPath: '#/$defs/Vendor/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/vendor_name', schemaPath: '#/$defs/Vendor/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.data !== undefined) {
        let data1 = data.data;
        if (!(data1 && typeof data1 == 'object' && !Array.isArray(data1))) {
          const err5 = { instancePath: instancePath + '/data', schemaPath: '#/properties/data/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
    } else {
      const err6 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    validate28.errors = vErrors;
    return errors === 0;
  }
  validate28.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate23(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate23.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.expression === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (
          !(
            key0 === 'name' ||
            key0 === 'expression' ||
            key0 === 'dimension' ||
            key0 === 'label' ||
            key0 === 'description' ||
            key0 === 'datatype' ||
            key0 === 'ai_context' ||
            key0 === 'nonportable_extensions'
          )
        ) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        if (!validate24(data.expression, { instancePath: instancePath + '/expression', parentData: data, parentDataProperty: 'expression', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
          errors = vErrors.length;
        }
      }
      if (data.dimension !== undefined) {
        let data2 = data.dimension;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
          for (const key1 in data2) {
            if (!(key1 === 'is_time')) {
              const err5 = {
                instancePath: instancePath + '/dimension',
                schemaPath: '#/$defs/Dimension/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
          if (data2.is_time !== undefined) {
            if (typeof data2.is_time !== 'boolean') {
              const err6 = {
                instancePath: instancePath + '/dimension/is_time',
                schemaPath: '#/$defs/Dimension/properties/is_time/type',
                keyword: 'type',
                params: { type: 'boolean' },
                message: 'must be boolean',
              };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/dimension', schemaPath: '#/$defs/Dimension/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.label !== undefined) {
        if (typeof data.label !== 'string') {
          const err8 = { instancePath: instancePath + '/label', schemaPath: '#/properties/label/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err9 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.datatype !== undefined) {
        let data6 = data.datatype;
        if (typeof data6 !== 'string') {
          const err10 = { instancePath: instancePath + '/datatype', schemaPath: '#/$defs/DataType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (
          !(
            data6 === 'String' ||
            data6 === 'Integer' ||
            data6 === 'Decimal' ||
            data6 === 'Float' ||
            data6 === 'Boolean' ||
            data6 === 'Date' ||
            data6 === 'Time' ||
            data6 === 'DateTime' ||
            data6 === 'DateTimeTz' ||
            data6 === 'Opaque'
          )
        ) {
          const err11 = {
            instancePath: instancePath + '/datatype',
            schemaPath: '#/$defs/DataType/enum',
            keyword: 'enum',
            params: { allowedValues: LogicalDataTypeFieldsSchema.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data7 = data.ai_context;
        const _errs20 = errors;
        let valid5 = false;
        let passing0 = null;
        const _errs21 = errors;
        if (typeof data7 !== 'string') {
          const err12 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0) {
          valid5 = true;
          passing0 = 0;
        }
        const _errs23 = errors;
        if (data7 && typeof data7 == 'object' && !Array.isArray(data7)) {
          if (data7.instructions !== undefined) {
            if (typeof data7.instructions !== 'string') {
              const err13 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          if (data7.synonyms !== undefined) {
            let data9 = data7.synonyms;
            if (Array.isArray(data9)) {
              const len0 = data9.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data9[i0] !== 'string') {
                  const err14 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              }
            } else {
              const err15 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data7.examples !== undefined) {
            let data11 = data7.examples;
            if (Array.isArray(data11)) {
              const len1 = data11.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data11[i1] !== 'string') {
                  const err16 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
        } else {
          const err18 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs23 === errors;
        if (_valid0 && valid5) {
          valid5 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid5 = true;
            passing0 = 1;
          }
        }
        if (!valid5) {
          const err19 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        } else {
          errors = _errs20;
          if (vErrors !== null) {
            if (_errs20) {
              vErrors.length = _errs20;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data13 = data.nonportable_extensions;
        if (Array.isArray(data13)) {
          const len2 = data13.length;
          for (let i2 = 0; i2 < len2; i2++) {
            if (!validate28(data13[i2], { instancePath: instancePath + '/nonportable_extensions/' + i2, parentData: data13, parentDataProperty: i2, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err20 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
    } else {
      const err21 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err21];
      } else {
        vErrors.push(err21);
      }
      errors++;
    }
    validate23.errors = vErrors;
    return errors === 0;
  }
  validate23.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const QuantitativeMeasureDefinedBusinessSchema = {
    type: 'object',
    description: 'Quantitative measure defined on business data',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the metric' },
      expression: { $ref: '#/$defs/Expression' },
      description: { type: 'string', description: 'Human-readable description of what the metric measures' },
      datatype: { $ref: '#/$defs/DataType' },
      ai_context: { $ref: '#/$defs/AIContext' },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'expression'],
    additionalProperties: false,
  };

  function validate31(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate31.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.expression === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'expression' || key0 === 'description' || key0 === 'datatype' || key0 === 'ai_context' || key0 === 'nonportable_extensions')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        if (!validate24(data.expression, { instancePath: instancePath + '/expression', parentData: data, parentDataProperty: 'expression', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
          errors = vErrors.length;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.datatype !== undefined) {
        let data3 = data.datatype;
        if (typeof data3 !== 'string') {
          const err6 = { instancePath: instancePath + '/datatype', schemaPath: '#/$defs/DataType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (
          !(
            data3 === 'String' ||
            data3 === 'Integer' ||
            data3 === 'Decimal' ||
            data3 === 'Float' ||
            data3 === 'Boolean' ||
            data3 === 'Date' ||
            data3 === 'Time' ||
            data3 === 'DateTime' ||
            data3 === 'DateTimeTz' ||
            data3 === 'Opaque'
          )
        ) {
          const err7 = {
            instancePath: instancePath + '/datatype',
            schemaPath: '#/$defs/DataType/enum',
            keyword: 'enum',
            params: { allowedValues: LogicalDataTypeFieldsSchema.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data4 = data.ai_context;
        const _errs12 = errors;
        let valid3 = false;
        let passing0 = null;
        const _errs13 = errors;
        if (typeof data4 !== 'string') {
          const err8 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        if (_valid0) {
          valid3 = true;
          passing0 = 0;
        }
        const _errs15 = errors;
        if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
          if (data4.instructions !== undefined) {
            if (typeof data4.instructions !== 'string') {
              const err9 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          if (data4.synonyms !== undefined) {
            let data6 = data4.synonyms;
            if (Array.isArray(data6)) {
              const len0 = data6.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data6[i0] !== 'string') {
                  const err10 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
              }
            } else {
              const err11 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data4.examples !== undefined) {
            let data8 = data4.examples;
            if (Array.isArray(data8)) {
              const len1 = data8.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data8[i1] !== 'string') {
                  const err12 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
            } else {
              const err13 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        } else {
          const err14 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        var _valid0 = _errs15 === errors;
        if (_valid0 && valid3) {
          valid3 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid3 = true;
            passing0 = 1;
          }
        }
        if (!valid3) {
          const err15 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        } else {
          errors = _errs12;
          if (vErrors !== null) {
            if (_errs12) {
              vErrors.length = _errs12;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data10 = data.nonportable_extensions;
        if (Array.isArray(data10)) {
          const len2 = data10.length;
          for (let i2 = 0; i2 < len2; i2++) {
            if (!validate28(data10[i2], { instancePath: instancePath + '/nonportable_extensions/' + i2, parentData: data10, parentDataProperty: i2, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err16 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
    } else {
      const err17 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    }
    validate31.errors = vErrors;
    return errors === 0;
  }
  validate31.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate22(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate22.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.source === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'source' }, message: "must have required property '" + 'source' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func2.call(LogicalDatasetRepresentingBusinessSchema.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.source !== undefined) {
        let data1 = data.source;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err5 = {
              instancePath: instancePath + '/source',
              schemaPath: '#/properties/source/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/source', schemaPath: '#/properties/source/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.primary_key !== undefined) {
        let data2 = data.primary_key;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err7 = {
              instancePath: instancePath + '/primary_key',
              schemaPath: '#/properties/primary_key/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (typeof data2[i0] !== 'string') {
              const err8 = {
                instancePath: instancePath + '/primary_key/' + i0,
                schemaPath: '#/properties/primary_key/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
          let i1 = data2.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data2[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err9 = {
                  instancePath: instancePath + '/primary_key',
                  schemaPath: '#/properties/primary_key/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/primary_key', schemaPath: '#/properties/primary_key/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
      if (data.unique_keys !== undefined) {
        let data4 = data.unique_keys;
        if (Array.isArray(data4)) {
          if (data4.length < 1) {
            const err11 = {
              instancePath: instancePath + '/unique_keys',
              schemaPath: '#/properties/unique_keys/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          const len1 = data4.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data5 = data4[i2];
            if (Array.isArray(data5)) {
              if (data5.length < 1) {
                const err12 = {
                  instancePath: instancePath + '/unique_keys/' + i2,
                  schemaPath: '#/properties/unique_keys/items/minItems',
                  keyword: 'minItems',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 items',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              const len2 = data5.length;
              for (let i3 = 0; i3 < len2; i3++) {
                if (typeof data5[i3] !== 'string') {
                  const err13 = {
                    instancePath: instancePath + '/unique_keys/' + i2 + '/' + i3,
                    schemaPath: '#/properties/unique_keys/items/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
              let i4 = data5.length;
              let j1;
              if (i4 > 1) {
                const indices1 = {};
                for (; i4--;) {
                  let item1 = data5[i4];
                  if (typeof item1 !== 'string') {
                    continue;
                  }
                  if (typeof indices1[item1] == 'number') {
                    j1 = indices1[item1];
                    const err14 = {
                      instancePath: instancePath + '/unique_keys/' + i2,
                      schemaPath: '#/properties/unique_keys/items/uniqueItems',
                      keyword: 'uniqueItems',
                      params: { i: i4, j: j1 },
                      message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                    };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                    break;
                  }
                  indices1[item1] = i4;
                }
              }
            } else {
              const err15 = {
                instancePath: instancePath + '/unique_keys/' + i2,
                schemaPath: '#/properties/unique_keys/items/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/unique_keys', schemaPath: '#/properties/unique_keys/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err17 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data8 = data.ai_context;
        const _errs20 = errors;
        let valid10 = false;
        let passing0 = null;
        const _errs21 = errors;
        if (typeof data8 !== 'string') {
          const err18 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0) {
          valid10 = true;
          passing0 = 0;
        }
        const _errs23 = errors;
        if (data8 && typeof data8 == 'object' && !Array.isArray(data8)) {
          if (data8.instructions !== undefined) {
            if (typeof data8.instructions !== 'string') {
              const err19 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data8.synonyms !== undefined) {
            let data10 = data8.synonyms;
            if (Array.isArray(data10)) {
              const len3 = data10.length;
              for (let i5 = 0; i5 < len3; i5++) {
                if (typeof data10[i5] !== 'string') {
                  const err20 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i5,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            } else {
              const err21 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data8.examples !== undefined) {
            let data12 = data8.examples;
            if (Array.isArray(data12)) {
              const len4 = data12.length;
              for (let i6 = 0; i6 < len4; i6++) {
                if (typeof data12[i6] !== 'string') {
                  const err22 = {
                    instancePath: instancePath + '/ai_context/examples/' + i6,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
            } else {
              const err23 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        var _valid0 = _errs23 === errors;
        if (_valid0 && valid10) {
          valid10 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid10 = true;
            passing0 = 1;
          }
        }
        if (!valid10) {
          const err25 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        } else {
          errors = _errs20;
          if (vErrors !== null) {
            if (_errs20) {
              vErrors.length = _errs20;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.fields !== undefined) {
        let data14 = data.fields;
        if (Array.isArray(data14)) {
          const len5 = data14.length;
          for (let i7 = 0; i7 < len5; i7++) {
            if (!validate23(data14[i7], { instancePath: instancePath + '/fields/' + i7, parentData: data14, parentDataProperty: i7, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err26 = { instancePath: instancePath + '/fields', schemaPath: '#/properties/fields/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.metrics !== undefined) {
        let data16 = data.metrics;
        if (Array.isArray(data16)) {
          const len6 = data16.length;
          for (let i8 = 0; i8 < len6; i8++) {
            if (!validate31(data16[i8], { instancePath: instancePath + '/metrics/' + i8, parentData: data16, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err27 = { instancePath: instancePath + '/metrics', schemaPath: '#/properties/metrics/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data18 = data.nonportable_extensions;
        if (Array.isArray(data18)) {
          const len7 = data18.length;
          for (let i9 = 0; i9 < len7; i9++) {
            if (!validate28(data18[i9], { instancePath: instancePath + '/nonportable_extensions/' + i9, parentData: data18, parentDataProperty: i9, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err28 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
    } else {
      const err29 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err29];
      } else {
        vErrors.push(err29);
      }
      errors++;
    }
    validate22.errors = vErrors;
    return errors === 0;
  }
  validate22.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate21(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate21.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      if (data.length < 1) {
        const err0 = { instancePath, schemaPath: '#/minItems', keyword: 'minItems', params: { limit: 1 }, message: 'must NOT have fewer than 1 items' };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate22(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err1 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    validate21.errors = vErrors;
    return errors === 0;
  }
  validate21.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  const DefinesHowDatasetsConnectedSchema = { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines how datasets are connected' };
  const ForeignKeyRelationshipBetweenSchema = {
    type: 'object',
    description: 'Foreign key relationship between datasets',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the relationship' },
      from: { type: 'string', minLength: 1, description: 'Dataset on the many side of the relationship' },
      to: { type: 'string', minLength: 1, description: 'Dataset on the one side of the relationship' },
      from_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'from' dataset (foreign key fields)" },
      to_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'to' dataset (primary or unique key fields)" },
      ai_context: { $ref: '#/$defs/AIContext' },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'from', 'to', 'from_columns', 'to_columns'],
    additionalProperties: false,
  };

  function validate39(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate39.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.from === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'from' }, message: "must have required property '" + 'from' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.to === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'to' }, message: "must have required property '" + 'to' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (data.from_columns === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'from_columns' }, message: "must have required property '" + 'from_columns' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (data.to_columns === undefined) {
        const err4 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'to_columns' }, message: "must have required property '" + 'to_columns' + "'" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'from' || key0 === 'to' || key0 === 'from_columns' || key0 === 'to_columns' || key0 === 'ai_context' || key0 === 'nonportable_extensions')) {
          const err5 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err6 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        } else {
          const err7 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.from !== undefined) {
        let data1 = data.from;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err8 = {
              instancePath: instancePath + '/from',
              schemaPath: '#/properties/from/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/from', schemaPath: '#/properties/from/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.to !== undefined) {
        let data2 = data.to;
        if (typeof data2 === 'string') {
          if (func1(data2) < 1) {
            const err10 = { instancePath: instancePath + '/to', schemaPath: '#/properties/to/minLength', keyword: 'minLength', params: { limit: 1 }, message: 'must NOT have fewer than 1 characters' };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        } else {
          const err11 = { instancePath: instancePath + '/to', schemaPath: '#/properties/to/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.from_columns !== undefined) {
        let data3 = data.from_columns;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err12 = {
              instancePath: instancePath + '/from_columns',
              schemaPath: '#/properties/from_columns/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (typeof data3[i0] !== 'string') {
              const err13 = {
                instancePath: instancePath + '/from_columns/' + i0,
                schemaPath: '#/properties/from_columns/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        } else {
          const err14 = { instancePath: instancePath + '/from_columns', schemaPath: '#/properties/from_columns/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
      if (data.to_columns !== undefined) {
        let data5 = data.to_columns;
        if (Array.isArray(data5)) {
          if (data5.length < 1) {
            const err15 = {
              instancePath: instancePath + '/to_columns',
              schemaPath: '#/properties/to_columns/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (typeof data5[i1] !== 'string') {
              const err16 = {
                instancePath: instancePath + '/to_columns/' + i1,
                schemaPath: '#/properties/to_columns/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        } else {
          const err17 = { instancePath: instancePath + '/to_columns', schemaPath: '#/properties/to_columns/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data7 = data.ai_context;
        const _errs18 = errors;
        let valid6 = false;
        let passing0 = null;
        const _errs19 = errors;
        if (typeof data7 !== 'string') {
          const err18 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs19 === errors;
        if (_valid0) {
          valid6 = true;
          passing0 = 0;
        }
        const _errs21 = errors;
        if (data7 && typeof data7 == 'object' && !Array.isArray(data7)) {
          if (data7.instructions !== undefined) {
            if (typeof data7.instructions !== 'string') {
              const err19 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data7.synonyms !== undefined) {
            let data9 = data7.synonyms;
            if (Array.isArray(data9)) {
              const len2 = data9.length;
              for (let i2 = 0; i2 < len2; i2++) {
                if (typeof data9[i2] !== 'string') {
                  const err20 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i2,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            } else {
              const err21 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data7.examples !== undefined) {
            let data11 = data7.examples;
            if (Array.isArray(data11)) {
              const len3 = data11.length;
              for (let i3 = 0; i3 < len3; i3++) {
                if (typeof data11[i3] !== 'string') {
                  const err22 = {
                    instancePath: instancePath + '/ai_context/examples/' + i3,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
            } else {
              const err23 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0 && valid6) {
          valid6 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid6 = true;
            passing0 = 1;
          }
        }
        if (!valid6) {
          const err25 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        } else {
          errors = _errs18;
          if (vErrors !== null) {
            if (_errs18) {
              vErrors.length = _errs18;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data13 = data.nonportable_extensions;
        if (Array.isArray(data13)) {
          const len4 = data13.length;
          for (let i4 = 0; i4 < len4; i4++) {
            if (!validate28(data13[i4], { instancePath: instancePath + '/nonportable_extensions/' + i4, parentData: data13, parentDataProperty: i4, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err26 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
    } else {
      const err27 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err27];
      } else {
        vErrors.push(err27);
      }
      errors++;
    }
    validate39.errors = vErrors;
    return errors === 0;
  }
  validate39.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate38(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate38.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate39(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate38.errors = vErrors;
    return errors === 0;
  }
  validate38.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  const ModelScopedMetricsAggregationsSchema = {
    type: 'array',
    items: { $ref: '#/$defs/Metric' },
    description:
      'Model-scoped metrics: aggregations that span datasets or need to be aware of cross-dataset concepts. Expressions reference fields by multi-part name (dataset.field) and may combine fields from more than one dataset. They may evaluate a dataset-scoped metric with AGG(dataset.metric). Names must be unique across the model. See core-spec/spec.md#metric-scoping.',
  };

  function validate43(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate43.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate31(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate43.errors = vErrors;
    return errors === 0;
  }
  validate43.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  const OssieSemanticModelDraft030SchemaComponent = { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } };

  function validate46(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate46.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate28(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate46.errors = vErrors;
    return errors === 0;
  }
  validate46.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  function validate20(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="https://github.com/apache/ossie/core-spec/ossie-schema.json" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate20.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.version === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.datasets === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'datasets' }, message: "must have required property '" + 'datasets' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      for (const key0 in data) {
        if (
          !(
            key0 === 'version' ||
            key0 === 'name' ||
            key0 === 'description' ||
            key0 === 'ai_context' ||
            key0 === 'datasets' ||
            key0 === 'relationships' ||
            key0 === 'metrics' ||
            key0 === 'nonportable_extensions'
          )
        ) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data0 = data.version;
        if (typeof data0 !== 'string') {
          const err4 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data0) {
          const err5 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err6 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/$defs/SemanticModel/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        } else {
          const err7 = { instancePath: instancePath + '/name', schemaPath: '#/$defs/SemanticModel/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err8 = {
            instancePath: instancePath + '/description',
            schemaPath: '#/$defs/SemanticModel/properties/description/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data3 = data.ai_context;
        const _errs12 = errors;
        let valid4 = false;
        let passing0 = null;
        const _errs13 = errors;
        if (typeof data3 !== 'string') {
          const err9 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/0/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        if (_valid0) {
          valid4 = true;
          passing0 = 0;
        }
        const _errs15 = errors;
        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
          if (data3.instructions !== undefined) {
            if (typeof data3.instructions !== 'string') {
              const err10 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data3.synonyms !== undefined) {
            let data5 = data3.synonyms;
            if (Array.isArray(data5)) {
              const len0 = data5.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data5[i0] !== 'string') {
                  const err11 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
              }
            } else {
              const err12 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data3.examples !== undefined) {
            let data7 = data3.examples;
            if (Array.isArray(data7)) {
              const len1 = data7.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data7[i1] !== 'string') {
                  const err13 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
            } else {
              const err14 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
        } else {
          const err15 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        var _valid0 = _errs15 === errors;
        if (_valid0 && valid4) {
          valid4 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid4 = true;
            passing0 = 1;
          }
        }
        if (!valid4) {
          const err16 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        } else {
          errors = _errs12;
          if (vErrors !== null) {
            if (_errs12) {
              vErrors.length = _errs12;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.datasets !== undefined) {
        if (!validate21(data.datasets, { instancePath: instancePath + '/datasets', parentData: data, parentDataProperty: 'datasets', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
          errors = vErrors.length;
        }
      }
      if (data.relationships !== undefined) {
        if (!validate38(data.relationships, { instancePath: instancePath + '/relationships', parentData: data, parentDataProperty: 'relationships', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
          errors = vErrors.length;
        }
      }
      if (data.metrics !== undefined) {
        if (!validate43(data.metrics, { instancePath: instancePath + '/metrics', parentData: data, parentDataProperty: 'metrics', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate43.errors : vErrors.concat(validate43.errors);
          errors = vErrors.length;
        }
      }
      if (data.nonportable_extensions !== undefined) {
        if (
          !validate46(data.nonportable_extensions, { instancePath: instancePath + '/nonportable_extensions', parentData: data, parentDataProperty: 'nonportable_extensions', rootData, dynamicAnchors })
        ) {
          vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err17 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    }
    validate20.errors = vErrors;
    return errors === 0;
  }
  validate20.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  return { semanticDraft030: validate20 };
})();
const generatedMappingsDraft030 = (() => {
  const mappingsDraft030Runtime0 = mappingsDraft030Runtime0Module.default?.__esModule ? mappingsDraft030Runtime0Module.default : mappingsDraft030Runtime0Module;
  const mappingsDraft030Runtime1 = mappingsDraft030Runtime1Module.default?.__esModule ? mappingsDraft030Runtime1Module.default : mappingsDraft030Runtime1Module;

  const ossieMappingDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/apache/ossie/ontology/mapping.json',
    title: 'Apache Ossie Mapping Specification',
    description:
      "JSON Schema for validating a standalone Apache Ossie mapping document: the constructs of one semantic model mapped onto one ontology, as its own document rather than embedded inside the ontology's ontology_mappings.",
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Mapping specification version' },
      name: { type: 'string', minLength: 1, description: 'Unique identifier for this mapping' },
      description: { type: 'string', description: 'Human-readable description of this mapping' },
      ontology_ref: { $ref: '#/$defs/DocumentReference', description: 'Reference to the ontology document this mapping targets' },
      semantic_model_ref: { $ref: '#/$defs/DocumentReference', description: 'Reference to the semantic model document this mapping draws from' },
      concept_mappings: {
        type: 'array',
        items: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json#/$defs/ConceptMapping' },
        description: 'Maps logical model constructs to some concept and its relationships in the referenced ontology',
      },
      nonportable_extensions: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/SemanticModel/properties/nonportable_extensions' },
    },
    required: ['version', 'name', 'ontology_ref', 'semantic_model_ref', 'concept_mappings'],
    additionalProperties: false,
    $defs: {
      DocumentReference: {
        type: 'object',
        description: 'Reference to another Ossie document by its logical name, with an iri saying where to resolve it from',
        properties: {
          name: { type: 'string', minLength: 1, description: "Must equal the referenced document's own 'name'; carries this reference's checkable identity regardless of location" },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Where to resolve the referenced document from: a relative reference resolved against the mapping document's own location or base IRI, or an absolute IRI",
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  };
  const ossieMappingDraft030DocumentReferenceSchema = {
    type: 'object',
    description: 'Reference to another Ossie document by its logical name, with an iri saying where to resolve it from',
    properties: {
      name: { type: 'string', minLength: 1, description: "Must equal the referenced document's own 'name'; carries this reference's checkable identity regardless of location" },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Where to resolve the referenced document from: a relative reference resolved against the mapping document's own location or base IRI, or an absolute IRI",
      },
    },
    required: ['name'],
    additionalProperties: false,
  };
  const func1 = mappingsDraft030Runtime0.default;
  const MappingsLogicalModelConstructsSchema = {
    type: 'object',
    description: 'Mappings from logical model constructs to some ontology component',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
      object_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/ObjectMapping' },
        description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
      },
      link_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/LinkMapping' },
        description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
      },
    },
    required: ['concept'],
    anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
    additionalProperties: false,
  };
  const PatternLogicalLevelExpressionsSchema = {
    type: 'object',
    description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
      expression: { $ref: '#/$defs/Expression' },
    },
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const ossieOntologyDraft030ExpressionSchema = { type: 'string', minLength: 1, description: 'ANSI SQL expression' };
  const MappingLogicalModelConstructsSchema = {
    type: 'object',
    description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
      expression: { $ref: '#/$defs/Expression' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
    },
    required: ['relationship'],
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const wrapper0 = { validate: validate61 };

  function validate61(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate61.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.relationship === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'relationship' }, message: "must have required property '" + 'relationship' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'expression' || key0 === 'referent_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data1 = data.expression;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err7 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        } else {
          const err8 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data2 = data.referent_mappings;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err9 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper0.validate(data2[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate61.errors = vErrors;
    return errors === 0;
  }
  validate61.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate60(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate60.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'referent_mappings' || key0 === 'expression')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err4 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data1 = data.referent_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err6 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate61(data1[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data3 = data.expression;
        if (typeof data3 === 'string') {
          if (func1(data3) < 1) {
            const err8 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
    } else {
      const err10 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    validate60.errors = vErrors;
    return errors === 0;
  }
  validate60.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MappingLogicalSchemaLinksSchema = {
    type: 'object',
    description: 'Mapping from logical schema to the links of relationships in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
      object_mapping: { $ref: '#/$defs/ObjectMapping' },
      children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
    },
    required: ['object_mapping'],
    additionalProperties: false,
  };
  const wrapper1 = { validate: validate64 };

  function validate64(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate64.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mapping === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'object_mapping' }, message: "must have required property '" + 'object_mapping' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'object_mapping' || key0 === 'children')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.object_mapping !== undefined) {
        if (!validate60(data.object_mapping, { instancePath: instancePath + '/object_mapping', parentData: data, parentDataProperty: 'object_mapping', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
          errors = vErrors.length;
        }
      }
      if (data.children !== undefined) {
        let data2 = data.children;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper1.validate(data2[i0], { instancePath: instancePath + '/children/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper1.validate.errors : vErrors.concat(wrapper1.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err4 = { instancePath: instancePath + '/children', schemaPath: '#/properties/children/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
    } else {
      const err5 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    validate64.errors = vErrors;
    return errors === 0;
  }
  validate64.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate69(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate69.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mappings === undefined) {
        const err0 = {
          instancePath,
          schemaPath: '#/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: 'object_mappings' },
          message: "must have required property '" + 'object_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.link_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'link_mappings' },
          message: "must have required property '" + 'link_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'object_mappings' || key0 === 'link_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.object_mappings !== undefined) {
        let data1 = data.object_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err7 = {
              instancePath: instancePath + '/object_mappings',
              schemaPath: '#/properties/object_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate60(data1[i0], { instancePath: instancePath + '/object_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err8 = { instancePath: instancePath + '/object_mappings', schemaPath: '#/properties/object_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.link_mappings !== undefined) {
        let data3 = data.link_mappings;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err9 = {
              instancePath: instancePath + '/link_mappings',
              schemaPath: '#/properties/link_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len1 = data3.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (!validate64(data3[i1], { instancePath: instancePath + '/link_mappings/' + i1, parentData: data3, parentDataProperty: i1, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/link_mappings', schemaPath: '#/properties/link_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate69.errors = vErrors;
    return errors === 0;
  }
  validate69.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const OssieMappingDraft030SchemaComponent = { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } };
  const VendorSpecificStateOssieSchema = {
    type: 'object',
    description: 'Vendor-specific state that Ossie carries and does not interpret. Portable behavior does not depend on it.',
    properties: {
      vendor_name: { $ref: '#/$defs/Vendor' },
      data: {
        type: 'object',
        description:
          'Vendor-specific data as a structured object. The core schema does not reference the structure under data: no reserved key and no common sub-key. Keys are entirely vendor-defined. Values must be JSON-representable. Ossie carries the object but does not interpret it. See core-spec/spec.md#non-portable-extensions.',
      },
    },
    required: ['vendor_name', 'data'],
    additionalProperties: false,
  };
  const VendorNameNonPortableSchema = {
    type: 'string',
    minLength: 1,
    examples: ['BI_TOOL', 'DB_VENDOR', 'SEMANTIC_LAYER'],
    description: 'Vendor name for non-portable extensions. Any non-empty string is accepted. See extensions/vendors.md.',
  };

  function validate30(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate30.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.vendor_name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'vendor_name' }, message: "must have required property '" + 'vendor_name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.data === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'data' }, message: "must have required property '" + 'data' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'vendor_name' || key0 === 'data')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.vendor_name !== undefined) {
        let data0 = data.vendor_name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/vendor_name',
              schemaPath: '#/$defs/Vendor/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/vendor_name', schemaPath: '#/$defs/Vendor/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.data !== undefined) {
        let data1 = data.data;
        if (!(data1 && typeof data1 == 'object' && !Array.isArray(data1))) {
          const err5 = { instancePath: instancePath + '/data', schemaPath: '#/properties/data/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
    } else {
      const err6 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    validate30.errors = vErrors;
    return errors === 0;
  }
  validate30.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate73(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate73.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate30(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate73.errors = vErrors;
    return errors === 0;
  }
  validate73.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  function validate20(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="https://github.com/apache/ossie/ontology/mapping.json" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate20.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.version === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.ontology_ref === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'ontology_ref' }, message: "must have required property '" + 'ontology_ref' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (data.semantic_model_ref === undefined) {
        const err3 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'semantic_model_ref' },
          message: "must have required property '" + 'semantic_model_ref' + "'",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (data.concept_mappings === undefined) {
        const err4 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'concept_mappings' },
          message: "must have required property '" + 'concept_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      for (const key0 in data) {
        if (
          !(
            key0 === 'version' ||
            key0 === 'name' ||
            key0 === 'description' ||
            key0 === 'ontology_ref' ||
            key0 === 'semantic_model_ref' ||
            key0 === 'concept_mappings' ||
            key0 === 'nonportable_extensions'
          )
        ) {
          const err5 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data0 = data.version;
        if (typeof data0 !== 'string') {
          const err6 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data0) {
          const err7 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err8 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err10 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
      if (data.ontology_ref !== undefined) {
        let data3 = data.ontology_ref;
        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
          if (data3.name === undefined) {
            const err11 = {
              instancePath: instancePath + '/ontology_ref',
              schemaPath: '#/$defs/DocumentReference/required',
              keyword: 'required',
              params: { missingProperty: 'name' },
              message: "must have required property '" + 'name' + "'",
            };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          for (const key1 in data3) {
            if (!(key1 === 'name' || key1 === 'iri')) {
              const err12 = {
                instancePath: instancePath + '/ontology_ref',
                schemaPath: '#/$defs/DocumentReference/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data3.name !== undefined) {
            let data4 = data3.name;
            if (typeof data4 === 'string') {
              if (func1(data4) < 1) {
                const err13 = {
                  instancePath: instancePath + '/ontology_ref/name',
                  schemaPath: '#/$defs/DocumentReference/properties/name/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            } else {
              const err14 = {
                instancePath: instancePath + '/ontology_ref/name',
                schemaPath: '#/$defs/DocumentReference/properties/name/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data3.iri !== undefined) {
            let data5 = data3.iri;
            if (typeof data5 === 'string') {
              if (func1(data5) < 1) {
                const err15 = {
                  instancePath: instancePath + '/ontology_ref/iri',
                  schemaPath: '#/$defs/DocumentReference/properties/iri/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            } else {
              const err16 = {
                instancePath: instancePath + '/ontology_ref/iri',
                schemaPath: '#/$defs/DocumentReference/properties/iri/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        } else {
          const err17 = { instancePath: instancePath + '/ontology_ref', schemaPath: '#/$defs/DocumentReference/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
      if (data.semantic_model_ref !== undefined) {
        let data6 = data.semantic_model_ref;
        if (data6 && typeof data6 == 'object' && !Array.isArray(data6)) {
          if (data6.name === undefined) {
            const err18 = {
              instancePath: instancePath + '/semantic_model_ref',
              schemaPath: '#/$defs/DocumentReference/required',
              keyword: 'required',
              params: { missingProperty: 'name' },
              message: "must have required property '" + 'name' + "'",
            };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          for (const key2 in data6) {
            if (!(key2 === 'name' || key2 === 'iri')) {
              const err19 = {
                instancePath: instancePath + '/semantic_model_ref',
                schemaPath: '#/$defs/DocumentReference/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key2 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data6.name !== undefined) {
            let data7 = data6.name;
            if (typeof data7 === 'string') {
              if (func1(data7) < 1) {
                const err20 = {
                  instancePath: instancePath + '/semantic_model_ref/name',
                  schemaPath: '#/$defs/DocumentReference/properties/name/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            } else {
              const err21 = {
                instancePath: instancePath + '/semantic_model_ref/name',
                schemaPath: '#/$defs/DocumentReference/properties/name/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data6.iri !== undefined) {
            let data8 = data6.iri;
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err22 = {
                  instancePath: instancePath + '/semantic_model_ref/iri',
                  schemaPath: '#/$defs/DocumentReference/properties/iri/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            } else {
              const err23 = {
                instancePath: instancePath + '/semantic_model_ref/iri',
                schemaPath: '#/$defs/DocumentReference/properties/iri/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/semantic_model_ref', schemaPath: '#/$defs/DocumentReference/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.concept_mappings !== undefined) {
        let data9 = data.concept_mappings;
        if (Array.isArray(data9)) {
          const len0 = data9.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate69(data9[i0], { instancePath: instancePath + '/concept_mappings/' + i0, parentData: data9, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate69.errors : vErrors.concat(validate69.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err25 = { instancePath: instancePath + '/concept_mappings', schemaPath: '#/properties/concept_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.nonportable_extensions !== undefined) {
        if (
          !validate73(data.nonportable_extensions, { instancePath: instancePath + '/nonportable_extensions', parentData: data, parentDataProperty: 'nonportable_extensions', rootData, dynamicAnchors })
        ) {
          vErrors = vErrors === null ? validate73.errors : vErrors.concat(validate73.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err26 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err26];
      } else {
        vErrors.push(err26);
      }
      errors++;
    }
    validate20.errors = vErrors;
    return errors === 0;
  }
  validate20.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const ossieMappingDraft030ReferencedSchema = { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json#/$defs/OntologyMap' };
  const MapConstructsLogicalModelSchema = {
    type: 'object',
    description: 'Map from the constructs of some logical model to some ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
      description: { type: 'string', description: 'Human-readable description of this ontology map' },
      semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
      concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
    },
    required: ['semantic_model', 'concept_mappings'],
    additionalProperties: false,
  };
  const ApacheOssieCoreMetadataSpecificationSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/apache/ossie/core-spec/ossie-schema.json',
    title: 'Apache Ossie Core Metadata Specification',
    description: 'JSON Schema for validating a single Apache Ossie semantic model document',
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Apache Ossie specification version' },
      name: { $ref: '#/$defs/SemanticModel/properties/name' },
      description: { $ref: '#/$defs/SemanticModel/properties/description' },
      ai_context: { $ref: '#/$defs/SemanticModel/properties/ai_context' },
      datasets: { $ref: '#/$defs/SemanticModel/properties/datasets' },
      relationships: { $ref: '#/$defs/SemanticModel/properties/relationships' },
      metrics: { $ref: '#/$defs/SemanticModel/properties/metrics' },
      nonportable_extensions: { $ref: '#/$defs/SemanticModel/properties/nonportable_extensions' },
    },
    required: ['version', 'name', 'datasets'],
    additionalProperties: false,
    $defs: {
      Dialect: {
        type: 'string',
        minLength: 1,
        examples: ['OSSIE_SQL_2026', 'ANSI_SQL', 'DB_DIALECT', 'BI_EXPRESSION', 'SEMANTIC_MODEL_EXPRESSION', 'PROGRAMMING_LANGUAGE'],
        description:
          'Expression language a metric or field expression is declared in. Any non-empty string is accepted. OSSIE_SQL_2026 is the only dialect this specification defines; others are opaque to Ossie. See extensions/dialects.md.',
      },
      Vendor: {
        type: 'string',
        minLength: 1,
        examples: ['BI_TOOL', 'DB_VENDOR', 'SEMANTIC_LAYER'],
        description: 'Vendor name for non-portable extensions. Any non-empty string is accepted. See extensions/vendors.md.',
      },
      AIContext: {
        description: 'Additional context for AI tools',
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              instructions: { type: 'string', description: 'Instructions for AI on how to use this entity' },
              synonyms: { type: 'array', items: { type: 'string' }, description: 'Alternative names and terms' },
              examples: { type: 'array', items: { type: 'string' }, description: 'Sample questions or use cases' },
            },
            additionalProperties: true,
          },
        ],
      },
      NonportableExtension: {
        type: 'object',
        description: 'Vendor-specific state that Ossie carries and does not interpret. Portable behavior does not depend on it.',
        properties: {
          vendor_name: { $ref: '#/$defs/Vendor' },
          data: {
            type: 'object',
            description:
              'Vendor-specific data as a structured object. The core schema does not reference the structure under data: no reserved key and no common sub-key. Keys are entirely vendor-defined. Values must be JSON-representable. Ossie carries the object but does not interpret it. See core-spec/spec.md#non-portable-extensions.',
          },
        },
        required: ['vendor_name', 'data'],
        additionalProperties: false,
      },
      DialectExpression: {
        type: 'object',
        description: 'Expression in a specific dialect',
        properties: { dialect: { $ref: '#/$defs/Dialect' }, expression: { type: 'string', minLength: 1, description: 'SQL or dialect-specific expression' } },
        required: ['dialect', 'expression'],
        additionalProperties: false,
      },
      Expression: {
        type: 'object',
        description: 'Expression definition with multi-dialect support',
        properties: {
          sql: {
            type: 'string',
            minLength: 1,
            description: 'Primary, portable expression written in OSSIE_SQL_2026. When both this field and an OSSIE_SQL_2026 entry in `dialects` are present, this field is authoritative.',
          },
          dialects: { type: 'array', items: { $ref: '#/$defs/DialectExpression' }, minItems: 1 },
        },
        anyOf: [{ required: ['sql'] }, { required: ['dialects'] }],
        additionalProperties: false,
      },
      DataType: {
        type: 'string',
        enum: ['String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'Time', 'DateTime', 'DateTimeTz', 'Opaque'],
        description:
          'Logical data type for fields and metrics, independent of role (e.g. dimension vs fact) and physical representation. `Decimal` is exact base-10 with unspecified precision and scale; `Float` is approximate. `DateTime` has no timezone or offset, while `DateTimeTz` identifies an instant using offset or timezone context but does not guarantee preservation of a named timezone. Omit `datatype` when unknown. `Opaque` means the type is outside the portable vocabulary. A vendor may record its own type name under `nonportable_extensions`; that record is not part of the portable type.',
      },
      Dimension: {
        type: 'object',
        description: 'Dimension metadata',
        properties: {
          is_time: {
            type: 'boolean',
            description:
              "Temporal-role marker. When true, consumers that distinguish time dimensions (e.g. for time-series analysis or temporal filtering) should treat this field as a time dimension. This is a *role* flag, independent of the field's data type: a field with `is_time: true` may carry any `datatype` (e.g. `Integer` for a year grain, `String` for a month name, as well as temporal data types). When `is_time` is unset, it defaults to `true` if `datatype` is one of `Date`, `Time`, `DateTime`, or `DateTimeTz`, and `false` otherwise. Set `is_time: false` explicitly to opt a temporal-typed column (such as an audit timestamp) out of time-dimension treatment.",
          },
        },
        additionalProperties: false,
      },
      Field: {
        type: 'object',
        description: 'Row-level attribute for grouping, filtering, and metric expressions',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the field within the dataset' },
          expression: { $ref: '#/$defs/Expression' },
          dimension: { $ref: '#/$defs/Dimension' },
          label: { type: 'string', description: 'Label for categorization' },
          description: { type: 'string', description: 'Human-readable description' },
          datatype: { $ref: '#/$defs/DataType' },
          ai_context: { $ref: '#/$defs/AIContext' },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'expression'],
        additionalProperties: false,
      },
      Dataset: {
        type: 'object',
        description: 'Logical dataset representing a business entity (fact or dimension table)',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the dataset' },
          source: { type: 'string', minLength: 1, description: 'Reference to underlying physical table/view (database.schema.table) or query' },
          primary_key: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true, description: 'Dataset fields that uniquely identify rows, each named once' },
          unique_keys: {
            type: 'array',
            items: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
            minItems: 1,
            description: 'Array of unique key definitions, each a list of dataset fields naming each field once',
          },
          description: { type: 'string', description: 'Human-readable description' },
          ai_context: { $ref: '#/$defs/AIContext' },
          fields: {
            type: 'array',
            items: { $ref: '#/$defs/Field' },
            description: "The dataset's declared fields. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
          },
          metrics: {
            type: 'array',
            items: { $ref: '#/$defs/Metric' },
            description:
              "Dataset-scoped metrics: measures defined on this dataset's relation that semantically belong to the dataset. A metric aggregates the dataset's rows, or derives from measures of the dataset's source. The expression references this dataset's declared fields by single-part (unqualified) name, and columns of the dataset's source as source.column. When the source is a measure relation, it may evaluate a source measure with AGG(source.measure). It must resolve entirely within this dataset; an expression that must reference another dataset belongs in the model-scoped metrics instead. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
          },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'source'],
        additionalProperties: false,
      },
      Relationship: {
        type: 'object',
        description: 'Foreign key relationship between datasets',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the relationship' },
          from: { type: 'string', minLength: 1, description: 'Dataset on the many side of the relationship' },
          to: { type: 'string', minLength: 1, description: 'Dataset on the one side of the relationship' },
          from_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'from' dataset (foreign key fields)" },
          to_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'to' dataset (primary or unique key fields)" },
          ai_context: { $ref: '#/$defs/AIContext' },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'from', 'to', 'from_columns', 'to_columns'],
        additionalProperties: false,
      },
      Metric: {
        type: 'object',
        description: 'Quantitative measure defined on business data',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the metric' },
          expression: { $ref: '#/$defs/Expression' },
          description: { type: 'string', description: 'Human-readable description of what the metric measures' },
          datatype: { $ref: '#/$defs/DataType' },
          ai_context: { $ref: '#/$defs/AIContext' },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'expression'],
        additionalProperties: false,
      },
      SemanticModel: {
        type: 'object',
        description: 'Top-level container representing a complete semantic model',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Unique identifier for the semantic model' },
          description: { type: 'string', description: 'Human-readable description' },
          ai_context: { $ref: '#/$defs/AIContext' },
          datasets: { type: 'array', items: { $ref: '#/$defs/Dataset' }, minItems: 1, description: 'Collection of logical datasets' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines how datasets are connected' },
          metrics: {
            type: 'array',
            items: { $ref: '#/$defs/Metric' },
            description:
              'Model-scoped metrics: aggregations that span datasets or need to be aware of cross-dataset concepts. Expressions reference fields by multi-part name (dataset.field) and may combine fields from more than one dataset. They may evaluate a dataset-scoped metric with AGG(dataset.metric). Names must be unique across the model. See core-spec/spec.md#metric-scoping.',
          },
          nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
        },
        required: ['name', 'datasets'],
        additionalProperties: false,
      },
    },
  };
  const UniqueIdentifierSemanticModelSchema = { type: 'string', minLength: 1, description: 'Unique identifier for the semantic model' };
  const HumanReadableDescriptionSchema = { type: 'string', description: 'Human-readable description' };
  const ossieSemanticModelDraft030AIContextSchema = {
    description: 'Additional context for AI tools',
    oneOf: [
      { type: 'string' },
      {
        type: 'object',
        properties: {
          instructions: { type: 'string', description: 'Instructions for AI on how to use this entity' },
          synonyms: { type: 'array', items: { type: 'string' }, description: 'Alternative names and terms' },
          examples: { type: 'array', items: { type: 'string' }, description: 'Sample questions or use cases' },
        },
        additionalProperties: true,
      },
    ],
  };
  const CollectionLogicalDatasetsSchema = { type: 'array', items: { $ref: '#/$defs/Dataset' }, minItems: 1, description: 'Collection of logical datasets' };
  const LogicalDatasetRepresentingBusinessSchema = {
    type: 'object',
    description: 'Logical dataset representing a business entity (fact or dimension table)',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the dataset' },
      source: { type: 'string', minLength: 1, description: 'Reference to underlying physical table/view (database.schema.table) or query' },
      primary_key: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true, description: 'Dataset fields that uniquely identify rows, each named once' },
      unique_keys: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
        minItems: 1,
        description: 'Array of unique key definitions, each a list of dataset fields naming each field once',
      },
      description: { type: 'string', description: 'Human-readable description' },
      ai_context: { $ref: '#/$defs/AIContext' },
      fields: {
        type: 'array',
        items: { $ref: '#/$defs/Field' },
        description: "The dataset's declared fields. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
      },
      metrics: {
        type: 'array',
        items: { $ref: '#/$defs/Metric' },
        description:
          "Dataset-scoped metrics: measures defined on this dataset's relation that semantically belong to the dataset. A metric aggregates the dataset's rows, or derives from measures of the dataset's source. The expression references this dataset's declared fields by single-part (unqualified) name, and columns of the dataset's source as source.column. When the source is a measure relation, it may evaluate a source measure with AGG(source.measure). It must resolve entirely within this dataset; an expression that must reference another dataset belongs in the model-scoped metrics instead. Within the dataset, field names and metric names share one namespace and must all be unique across the two.",
      },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'source'],
    additionalProperties: false,
  };
  const func6 = Object.prototype.hasOwnProperty;
  const RowLevelAttributeGroupingSchema = {
    type: 'object',
    description: 'Row-level attribute for grouping, filtering, and metric expressions',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the field within the dataset' },
      expression: { $ref: '#/$defs/Expression' },
      dimension: { $ref: '#/$defs/Dimension' },
      label: { type: 'string', description: 'Label for categorization' },
      description: { type: 'string', description: 'Human-readable description' },
      datatype: { $ref: '#/$defs/DataType' },
      ai_context: { $ref: '#/$defs/AIContext' },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'expression'],
    additionalProperties: false,
  };
  const DimensionMetadataSchema = {
    type: 'object',
    description: 'Dimension metadata',
    properties: {
      is_time: {
        type: 'boolean',
        description:
          "Temporal-role marker. When true, consumers that distinguish time dimensions (e.g. for time-series analysis or temporal filtering) should treat this field as a time dimension. This is a *role* flag, independent of the field's data type: a field with `is_time: true` may carry any `datatype` (e.g. `Integer` for a year grain, `String` for a month name, as well as temporal data types). When `is_time` is unset, it defaults to `true` if `datatype` is one of `Date`, `Time`, `DateTime`, or `DateTimeTz`, and `false` otherwise. Set `is_time: false` explicitly to opt a temporal-typed column (such as an audit timestamp) out of time-dimension treatment.",
      },
    },
    additionalProperties: false,
  };
  const LogicalDataTypeFieldsSchema = {
    type: 'string',
    enum: ['String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'Time', 'DateTime', 'DateTimeTz', 'Opaque'],
    description:
      'Logical data type for fields and metrics, independent of role (e.g. dimension vs fact) and physical representation. `Decimal` is exact base-10 with unspecified precision and scale; `Float` is approximate. `DateTime` has no timezone or offset, while `DateTimeTz` identifies an instant using offset or timezone context but does not guarantee preservation of a named timezone. Omit `datatype` when unknown. `Opaque` means the type is outside the portable vocabulary. A vendor may record its own type name under `nonportable_extensions`; that record is not part of the portable type.',
  };
  const ExpressionDefinitionMultiDialectSchema = {
    type: 'object',
    description: 'Expression definition with multi-dialect support',
    properties: {
      sql: {
        type: 'string',
        minLength: 1,
        description: 'Primary, portable expression written in OSSIE_SQL_2026. When both this field and an OSSIE_SQL_2026 entry in `dialects` are present, this field is authoritative.',
      },
      dialects: { type: 'array', items: { $ref: '#/$defs/DialectExpression' }, minItems: 1 },
    },
    anyOf: [{ required: ['sql'] }, { required: ['dialects'] }],
    additionalProperties: false,
  };
  const ExpressionSpecificDialectSchema = {
    type: 'object',
    description: 'Expression in a specific dialect',
    properties: { dialect: { $ref: '#/$defs/Dialect' }, expression: { type: 'string', minLength: 1, description: 'SQL or dialect-specific expression' } },
    required: ['dialect', 'expression'],
    additionalProperties: false,
  };
  const ExpressionLanguageMetricFieldSchema = {
    type: 'string',
    minLength: 1,
    examples: ['OSSIE_SQL_2026', 'ANSI_SQL', 'DB_DIALECT', 'BI_EXPRESSION', 'SEMANTIC_MODEL_EXPRESSION', 'PROGRAMMING_LANGUAGE'],
    description:
      'Expression language a metric or field expression is declared in. Any non-empty string is accepted. OSSIE_SQL_2026 is the only dialect this specification defines; others are opaque to Ossie. See extensions/dialects.md.',
  };

  function validate27(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate27.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.dialect === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'dialect' }, message: "must have required property '" + 'dialect' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.expression === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'dialect' || key0 === 'expression')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.dialect !== undefined) {
        let data0 = data.dialect;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/dialect',
              schemaPath: '#/$defs/Dialect/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/dialect', schemaPath: '#/$defs/Dialect/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data1 = data.expression;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err5 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/properties/expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/expression', schemaPath: '#/properties/expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate27.errors = vErrors;
    return errors === 0;
  }
  validate27.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate26(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate26.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.sql === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'sql' }, message: "must have required property '" + 'sql' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.dialects === undefined) {
        const err1 = { instancePath, schemaPath: '#/anyOf/1/required', keyword: 'required', params: { missingProperty: 'dialects' }, message: "must have required property '" + 'dialects' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      for (const key0 in data) {
        if (!(key0 === 'sql' || key0 === 'dialects')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.sql !== undefined) {
        let data0 = data.sql;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err4 = {
              instancePath: instancePath + '/sql',
              schemaPath: '#/properties/sql/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/sql', schemaPath: '#/properties/sql/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.dialects !== undefined) {
        let data1 = data.dialects;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err6 = {
              instancePath: instancePath + '/dialects',
              schemaPath: '#/properties/dialects/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate27(data1[i0], { instancePath: instancePath + '/dialects/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/dialects', schemaPath: '#/properties/dialects/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
    } else {
      const err8 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    validate26.errors = vErrors;
    return errors === 0;
  }
  validate26.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate25(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate25.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.expression === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (
          !(
            key0 === 'name' ||
            key0 === 'expression' ||
            key0 === 'dimension' ||
            key0 === 'label' ||
            key0 === 'description' ||
            key0 === 'datatype' ||
            key0 === 'ai_context' ||
            key0 === 'nonportable_extensions'
          )
        ) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        if (!validate26(data.expression, { instancePath: instancePath + '/expression', parentData: data, parentDataProperty: 'expression', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
          errors = vErrors.length;
        }
      }
      if (data.dimension !== undefined) {
        let data2 = data.dimension;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
          for (const key1 in data2) {
            if (!(key1 === 'is_time')) {
              const err5 = {
                instancePath: instancePath + '/dimension',
                schemaPath: '#/$defs/Dimension/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
          if (data2.is_time !== undefined) {
            if (typeof data2.is_time !== 'boolean') {
              const err6 = {
                instancePath: instancePath + '/dimension/is_time',
                schemaPath: '#/$defs/Dimension/properties/is_time/type',
                keyword: 'type',
                params: { type: 'boolean' },
                message: 'must be boolean',
              };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/dimension', schemaPath: '#/$defs/Dimension/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.label !== undefined) {
        if (typeof data.label !== 'string') {
          const err8 = { instancePath: instancePath + '/label', schemaPath: '#/properties/label/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err9 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.datatype !== undefined) {
        let data6 = data.datatype;
        if (typeof data6 !== 'string') {
          const err10 = { instancePath: instancePath + '/datatype', schemaPath: '#/$defs/DataType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (
          !(
            data6 === 'String' ||
            data6 === 'Integer' ||
            data6 === 'Decimal' ||
            data6 === 'Float' ||
            data6 === 'Boolean' ||
            data6 === 'Date' ||
            data6 === 'Time' ||
            data6 === 'DateTime' ||
            data6 === 'DateTimeTz' ||
            data6 === 'Opaque'
          )
        ) {
          const err11 = {
            instancePath: instancePath + '/datatype',
            schemaPath: '#/$defs/DataType/enum',
            keyword: 'enum',
            params: { allowedValues: LogicalDataTypeFieldsSchema.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data7 = data.ai_context;
        const _errs20 = errors;
        let valid5 = false;
        let passing0 = null;
        const _errs21 = errors;
        if (typeof data7 !== 'string') {
          const err12 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0) {
          valid5 = true;
          passing0 = 0;
        }
        const _errs23 = errors;
        if (data7 && typeof data7 == 'object' && !Array.isArray(data7)) {
          if (data7.instructions !== undefined) {
            if (typeof data7.instructions !== 'string') {
              const err13 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          if (data7.synonyms !== undefined) {
            let data9 = data7.synonyms;
            if (Array.isArray(data9)) {
              const len0 = data9.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data9[i0] !== 'string') {
                  const err14 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              }
            } else {
              const err15 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
          if (data7.examples !== undefined) {
            let data11 = data7.examples;
            if (Array.isArray(data11)) {
              const len1 = data11.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data11[i1] !== 'string') {
                  const err16 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
        } else {
          const err18 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs23 === errors;
        if (_valid0 && valid5) {
          valid5 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid5 = true;
            passing0 = 1;
          }
        }
        if (!valid5) {
          const err19 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        } else {
          errors = _errs20;
          if (vErrors !== null) {
            if (_errs20) {
              vErrors.length = _errs20;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data13 = data.nonportable_extensions;
        if (Array.isArray(data13)) {
          const len2 = data13.length;
          for (let i2 = 0; i2 < len2; i2++) {
            if (!validate30(data13[i2], { instancePath: instancePath + '/nonportable_extensions/' + i2, parentData: data13, parentDataProperty: i2, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err20 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
    } else {
      const err21 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err21];
      } else {
        vErrors.push(err21);
      }
      errors++;
    }
    validate25.errors = vErrors;
    return errors === 0;
  }
  validate25.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const QuantitativeMeasureDefinedBusinessSchema = {
    type: 'object',
    description: 'Quantitative measure defined on business data',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the metric' },
      expression: { $ref: '#/$defs/Expression' },
      description: { type: 'string', description: 'Human-readable description of what the metric measures' },
      datatype: { $ref: '#/$defs/DataType' },
      ai_context: { $ref: '#/$defs/AIContext' },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'expression'],
    additionalProperties: false,
  };

  function validate33(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate33.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.expression === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'expression' || key0 === 'description' || key0 === 'datatype' || key0 === 'ai_context' || key0 === 'nonportable_extensions')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        if (!validate26(data.expression, { instancePath: instancePath + '/expression', parentData: data, parentDataProperty: 'expression', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
          errors = vErrors.length;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.datatype !== undefined) {
        let data3 = data.datatype;
        if (typeof data3 !== 'string') {
          const err6 = { instancePath: instancePath + '/datatype', schemaPath: '#/$defs/DataType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (
          !(
            data3 === 'String' ||
            data3 === 'Integer' ||
            data3 === 'Decimal' ||
            data3 === 'Float' ||
            data3 === 'Boolean' ||
            data3 === 'Date' ||
            data3 === 'Time' ||
            data3 === 'DateTime' ||
            data3 === 'DateTimeTz' ||
            data3 === 'Opaque'
          )
        ) {
          const err7 = {
            instancePath: instancePath + '/datatype',
            schemaPath: '#/$defs/DataType/enum',
            keyword: 'enum',
            params: { allowedValues: LogicalDataTypeFieldsSchema.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data4 = data.ai_context;
        const _errs12 = errors;
        let valid3 = false;
        let passing0 = null;
        const _errs13 = errors;
        if (typeof data4 !== 'string') {
          const err8 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        if (_valid0) {
          valid3 = true;
          passing0 = 0;
        }
        const _errs15 = errors;
        if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
          if (data4.instructions !== undefined) {
            if (typeof data4.instructions !== 'string') {
              const err9 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          if (data4.synonyms !== undefined) {
            let data6 = data4.synonyms;
            if (Array.isArray(data6)) {
              const len0 = data6.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data6[i0] !== 'string') {
                  const err10 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
              }
            } else {
              const err11 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data4.examples !== undefined) {
            let data8 = data4.examples;
            if (Array.isArray(data8)) {
              const len1 = data8.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data8[i1] !== 'string') {
                  const err12 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
            } else {
              const err13 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        } else {
          const err14 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        var _valid0 = _errs15 === errors;
        if (_valid0 && valid3) {
          valid3 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid3 = true;
            passing0 = 1;
          }
        }
        if (!valid3) {
          const err15 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        } else {
          errors = _errs12;
          if (vErrors !== null) {
            if (_errs12) {
              vErrors.length = _errs12;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data10 = data.nonportable_extensions;
        if (Array.isArray(data10)) {
          const len2 = data10.length;
          for (let i2 = 0; i2 < len2; i2++) {
            if (!validate30(data10[i2], { instancePath: instancePath + '/nonportable_extensions/' + i2, parentData: data10, parentDataProperty: i2, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err16 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
    } else {
      const err17 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    }
    validate33.errors = vErrors;
    return errors === 0;
  }
  validate33.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate24(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate24.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.source === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'source' }, message: "must have required property '" + 'source' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(LogicalDatasetRepresentingBusinessSchema.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.source !== undefined) {
        let data1 = data.source;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err5 = {
              instancePath: instancePath + '/source',
              schemaPath: '#/properties/source/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/source', schemaPath: '#/properties/source/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.primary_key !== undefined) {
        let data2 = data.primary_key;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err7 = {
              instancePath: instancePath + '/primary_key',
              schemaPath: '#/properties/primary_key/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (typeof data2[i0] !== 'string') {
              const err8 = {
                instancePath: instancePath + '/primary_key/' + i0,
                schemaPath: '#/properties/primary_key/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
          let i1 = data2.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data2[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err9 = {
                  instancePath: instancePath + '/primary_key',
                  schemaPath: '#/properties/primary_key/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/primary_key', schemaPath: '#/properties/primary_key/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
      if (data.unique_keys !== undefined) {
        let data4 = data.unique_keys;
        if (Array.isArray(data4)) {
          if (data4.length < 1) {
            const err11 = {
              instancePath: instancePath + '/unique_keys',
              schemaPath: '#/properties/unique_keys/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          const len1 = data4.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data5 = data4[i2];
            if (Array.isArray(data5)) {
              if (data5.length < 1) {
                const err12 = {
                  instancePath: instancePath + '/unique_keys/' + i2,
                  schemaPath: '#/properties/unique_keys/items/minItems',
                  keyword: 'minItems',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 items',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              const len2 = data5.length;
              for (let i3 = 0; i3 < len2; i3++) {
                if (typeof data5[i3] !== 'string') {
                  const err13 = {
                    instancePath: instancePath + '/unique_keys/' + i2 + '/' + i3,
                    schemaPath: '#/properties/unique_keys/items/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
              let i4 = data5.length;
              let j1;
              if (i4 > 1) {
                const indices1 = {};
                for (; i4--;) {
                  let item1 = data5[i4];
                  if (typeof item1 !== 'string') {
                    continue;
                  }
                  if (typeof indices1[item1] == 'number') {
                    j1 = indices1[item1];
                    const err14 = {
                      instancePath: instancePath + '/unique_keys/' + i2,
                      schemaPath: '#/properties/unique_keys/items/uniqueItems',
                      keyword: 'uniqueItems',
                      params: { i: i4, j: j1 },
                      message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                    };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                    break;
                  }
                  indices1[item1] = i4;
                }
              }
            } else {
              const err15 = {
                instancePath: instancePath + '/unique_keys/' + i2,
                schemaPath: '#/properties/unique_keys/items/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/unique_keys', schemaPath: '#/properties/unique_keys/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err17 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data8 = data.ai_context;
        const _errs20 = errors;
        let valid10 = false;
        let passing0 = null;
        const _errs21 = errors;
        if (typeof data8 !== 'string') {
          const err18 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0) {
          valid10 = true;
          passing0 = 0;
        }
        const _errs23 = errors;
        if (data8 && typeof data8 == 'object' && !Array.isArray(data8)) {
          if (data8.instructions !== undefined) {
            if (typeof data8.instructions !== 'string') {
              const err19 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data8.synonyms !== undefined) {
            let data10 = data8.synonyms;
            if (Array.isArray(data10)) {
              const len3 = data10.length;
              for (let i5 = 0; i5 < len3; i5++) {
                if (typeof data10[i5] !== 'string') {
                  const err20 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i5,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            } else {
              const err21 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data8.examples !== undefined) {
            let data12 = data8.examples;
            if (Array.isArray(data12)) {
              const len4 = data12.length;
              for (let i6 = 0; i6 < len4; i6++) {
                if (typeof data12[i6] !== 'string') {
                  const err22 = {
                    instancePath: instancePath + '/ai_context/examples/' + i6,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
            } else {
              const err23 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        var _valid0 = _errs23 === errors;
        if (_valid0 && valid10) {
          valid10 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid10 = true;
            passing0 = 1;
          }
        }
        if (!valid10) {
          const err25 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        } else {
          errors = _errs20;
          if (vErrors !== null) {
            if (_errs20) {
              vErrors.length = _errs20;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.fields !== undefined) {
        let data14 = data.fields;
        if (Array.isArray(data14)) {
          const len5 = data14.length;
          for (let i7 = 0; i7 < len5; i7++) {
            if (!validate25(data14[i7], { instancePath: instancePath + '/fields/' + i7, parentData: data14, parentDataProperty: i7, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err26 = { instancePath: instancePath + '/fields', schemaPath: '#/properties/fields/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.metrics !== undefined) {
        let data16 = data.metrics;
        if (Array.isArray(data16)) {
          const len6 = data16.length;
          for (let i8 = 0; i8 < len6; i8++) {
            if (!validate33(data16[i8], { instancePath: instancePath + '/metrics/' + i8, parentData: data16, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err27 = { instancePath: instancePath + '/metrics', schemaPath: '#/properties/metrics/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data18 = data.nonportable_extensions;
        if (Array.isArray(data18)) {
          const len7 = data18.length;
          for (let i9 = 0; i9 < len7; i9++) {
            if (!validate30(data18[i9], { instancePath: instancePath + '/nonportable_extensions/' + i9, parentData: data18, parentDataProperty: i9, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err28 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
    } else {
      const err29 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err29];
      } else {
        vErrors.push(err29);
      }
      errors++;
    }
    validate24.errors = vErrors;
    return errors === 0;
  }
  validate24.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate23(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate23.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      if (data.length < 1) {
        const err0 = { instancePath, schemaPath: '#/minItems', keyword: 'minItems', params: { limit: 1 }, message: 'must NOT have fewer than 1 items' };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate24(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err1 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    validate23.errors = vErrors;
    return errors === 0;
  }
  validate23.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  const DefinesHowDatasetsConnectedSchema = { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines how datasets are connected' };
  const ForeignKeyRelationshipBetweenSchema = {
    type: 'object',
    description: 'Foreign key relationship between datasets',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the relationship' },
      from: { type: 'string', minLength: 1, description: 'Dataset on the many side of the relationship' },
      to: { type: 'string', minLength: 1, description: 'Dataset on the one side of the relationship' },
      from_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'from' dataset (foreign key fields)" },
      to_columns: { type: 'array', items: { type: 'string' }, minItems: 1, description: "Array of field names in the 'to' dataset (primary or unique key fields)" },
      ai_context: { $ref: '#/$defs/AIContext' },
      nonportable_extensions: { type: 'array', items: { $ref: '#/$defs/NonportableExtension' } },
    },
    required: ['name', 'from', 'to', 'from_columns', 'to_columns'],
    additionalProperties: false,
  };

  function validate41(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate41.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.from === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'from' }, message: "must have required property '" + 'from' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.to === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'to' }, message: "must have required property '" + 'to' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (data.from_columns === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'from_columns' }, message: "must have required property '" + 'from_columns' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (data.to_columns === undefined) {
        const err4 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'to_columns' }, message: "must have required property '" + 'to_columns' + "'" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'from' || key0 === 'to' || key0 === 'from_columns' || key0 === 'to_columns' || key0 === 'ai_context' || key0 === 'nonportable_extensions')) {
          const err5 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err6 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        } else {
          const err7 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.from !== undefined) {
        let data1 = data.from;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err8 = {
              instancePath: instancePath + '/from',
              schemaPath: '#/properties/from/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/from', schemaPath: '#/properties/from/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.to !== undefined) {
        let data2 = data.to;
        if (typeof data2 === 'string') {
          if (func1(data2) < 1) {
            const err10 = { instancePath: instancePath + '/to', schemaPath: '#/properties/to/minLength', keyword: 'minLength', params: { limit: 1 }, message: 'must NOT have fewer than 1 characters' };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        } else {
          const err11 = { instancePath: instancePath + '/to', schemaPath: '#/properties/to/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.from_columns !== undefined) {
        let data3 = data.from_columns;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err12 = {
              instancePath: instancePath + '/from_columns',
              schemaPath: '#/properties/from_columns/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (typeof data3[i0] !== 'string') {
              const err13 = {
                instancePath: instancePath + '/from_columns/' + i0,
                schemaPath: '#/properties/from_columns/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        } else {
          const err14 = { instancePath: instancePath + '/from_columns', schemaPath: '#/properties/from_columns/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
      if (data.to_columns !== undefined) {
        let data5 = data.to_columns;
        if (Array.isArray(data5)) {
          if (data5.length < 1) {
            const err15 = {
              instancePath: instancePath + '/to_columns',
              schemaPath: '#/properties/to_columns/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (typeof data5[i1] !== 'string') {
              const err16 = {
                instancePath: instancePath + '/to_columns/' + i1,
                schemaPath: '#/properties/to_columns/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        } else {
          const err17 = { instancePath: instancePath + '/to_columns', schemaPath: '#/properties/to_columns/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data7 = data.ai_context;
        const _errs18 = errors;
        let valid6 = false;
        let passing0 = null;
        const _errs19 = errors;
        if (typeof data7 !== 'string') {
          const err18 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/0/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        var _valid0 = _errs19 === errors;
        if (_valid0) {
          valid6 = true;
          passing0 = 0;
        }
        const _errs21 = errors;
        if (data7 && typeof data7 == 'object' && !Array.isArray(data7)) {
          if (data7.instructions !== undefined) {
            if (typeof data7.instructions !== 'string') {
              const err19 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          if (data7.synonyms !== undefined) {
            let data9 = data7.synonyms;
            if (Array.isArray(data9)) {
              const len2 = data9.length;
              for (let i2 = 0; i2 < len2; i2++) {
                if (typeof data9[i2] !== 'string') {
                  const err20 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i2,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            } else {
              const err21 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          if (data7.examples !== undefined) {
            let data11 = data7.examples;
            if (Array.isArray(data11)) {
              const len3 = data11.length;
              for (let i3 = 0; i3 < len3; i3++) {
                if (typeof data11[i3] !== 'string') {
                  const err22 = {
                    instancePath: instancePath + '/ai_context/examples/' + i3,
                    schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
            } else {
              const err23 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/ai_context', schemaPath: '#/$defs/AIContext/oneOf/1/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        var _valid0 = _errs21 === errors;
        if (_valid0 && valid6) {
          valid6 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid6 = true;
            passing0 = 1;
          }
        }
        if (!valid6) {
          const err25 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        } else {
          errors = _errs18;
          if (vErrors !== null) {
            if (_errs18) {
              vErrors.length = _errs18;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.nonportable_extensions !== undefined) {
        let data13 = data.nonportable_extensions;
        if (Array.isArray(data13)) {
          const len4 = data13.length;
          for (let i4 = 0; i4 < len4; i4++) {
            if (!validate30(data13[i4], { instancePath: instancePath + '/nonportable_extensions/' + i4, parentData: data13, parentDataProperty: i4, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err26 = {
            instancePath: instancePath + '/nonportable_extensions',
            schemaPath: '#/properties/nonportable_extensions/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
    } else {
      const err27 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err27];
      } else {
        vErrors.push(err27);
      }
      errors++;
    }
    validate41.errors = vErrors;
    return errors === 0;
  }
  validate41.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate40(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate40.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate41(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate40.errors = vErrors;
    return errors === 0;
  }
  validate40.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  const ModelScopedMetricsAggregationsSchema = {
    type: 'array',
    items: { $ref: '#/$defs/Metric' },
    description:
      'Model-scoped metrics: aggregations that span datasets or need to be aware of cross-dataset concepts. Expressions reference fields by multi-part name (dataset.field) and may combine fields from more than one dataset. They may evaluate a dataset-scoped metric with AGG(dataset.metric). Names must be unique across the model. See core-spec/spec.md#metric-scoping.',
  };

  function validate45(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate45.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate33(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate45.errors = vErrors;
    return errors === 0;
  }
  validate45.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  function validate48(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate48.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (Array.isArray(data)) {
      const len0 = data.length;
      for (let i0 = 0; i0 < len0; i0++) {
        if (!validate30(data[i0], { instancePath: instancePath + '/' + i0, parentData: data, parentDataProperty: i0, rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err0 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    validate48.errors = vErrors;
    return errors === 0;
  }
  validate48.evaluated = { items: true, dynamicProps: false, dynamicItems: false };

  function validate22(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="https://github.com/apache/ossie/core-spec/ossie-schema.json" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate22.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.version === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.datasets === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'datasets' }, message: "must have required property '" + 'datasets' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      for (const key0 in data) {
        if (
          !(
            key0 === 'version' ||
            key0 === 'name' ||
            key0 === 'description' ||
            key0 === 'ai_context' ||
            key0 === 'datasets' ||
            key0 === 'relationships' ||
            key0 === 'metrics' ||
            key0 === 'nonportable_extensions'
          )
        ) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data0 = data.version;
        if (typeof data0 !== 'string') {
          const err4 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data0) {
          const err5 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err6 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/$defs/SemanticModel/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        } else {
          const err7 = { instancePath: instancePath + '/name', schemaPath: '#/$defs/SemanticModel/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err8 = {
            instancePath: instancePath + '/description',
            schemaPath: '#/$defs/SemanticModel/properties/description/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data3 = data.ai_context;
        const _errs12 = errors;
        let valid4 = false;
        let passing0 = null;
        const _errs13 = errors;
        if (typeof data3 !== 'string') {
          const err9 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/0/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        if (_valid0) {
          valid4 = true;
          passing0 = 0;
        }
        const _errs15 = errors;
        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
          if (data3.instructions !== undefined) {
            if (typeof data3.instructions !== 'string') {
              const err10 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data3.synonyms !== undefined) {
            let data5 = data3.synonyms;
            if (Array.isArray(data5)) {
              const len0 = data5.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data5[i0] !== 'string') {
                  const err11 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
              }
            } else {
              const err12 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data3.examples !== undefined) {
            let data7 = data3.examples;
            if (Array.isArray(data7)) {
              const len1 = data7.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data7[i1] !== 'string') {
                  const err13 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
            } else {
              const err14 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
        } else {
          const err15 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf/1/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        var _valid0 = _errs15 === errors;
        if (_valid0 && valid4) {
          valid4 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid4 = true;
            passing0 = 1;
          }
        }
        if (!valid4) {
          const err16 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: '#/$defs/SemanticModel/properties/ai_context/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        } else {
          errors = _errs12;
          if (vErrors !== null) {
            if (_errs12) {
              vErrors.length = _errs12;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.datasets !== undefined) {
        if (!validate23(data.datasets, { instancePath: instancePath + '/datasets', parentData: data, parentDataProperty: 'datasets', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
          errors = vErrors.length;
        }
      }
      if (data.relationships !== undefined) {
        if (!validate40(data.relationships, { instancePath: instancePath + '/relationships', parentData: data, parentDataProperty: 'relationships', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
          errors = vErrors.length;
        }
      }
      if (data.metrics !== undefined) {
        if (!validate45(data.metrics, { instancePath: instancePath + '/metrics', parentData: data, parentDataProperty: 'metrics', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
          errors = vErrors.length;
        }
      }
      if (data.nonportable_extensions !== undefined) {
        if (
          !validate48(data.nonportable_extensions, { instancePath: instancePath + '/nonportable_extensions', parentData: data, parentDataProperty: 'nonportable_extensions', rootData, dynamicAnchors })
        ) {
          vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
          errors = vErrors.length;
        }
      }
    } else {
      const err17 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    }
    validate22.errors = vErrors;
    return errors === 0;
  }
  validate22.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate59(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate59.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mappings === undefined) {
        const err0 = {
          instancePath,
          schemaPath: '#/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: 'object_mappings' },
          message: "must have required property '" + 'object_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.link_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'link_mappings' },
          message: "must have required property '" + 'link_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'object_mappings' || key0 === 'link_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.object_mappings !== undefined) {
        let data1 = data.object_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err7 = {
              instancePath: instancePath + '/object_mappings',
              schemaPath: '#/properties/object_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate60(data1[i0], { instancePath: instancePath + '/object_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err8 = { instancePath: instancePath + '/object_mappings', schemaPath: '#/properties/object_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.link_mappings !== undefined) {
        let data3 = data.link_mappings;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err9 = {
              instancePath: instancePath + '/link_mappings',
              schemaPath: '#/properties/link_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len1 = data3.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (!validate64(data3[i1], { instancePath: instancePath + '/link_mappings/' + i1, parentData: data3, parentDataProperty: i1, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/link_mappings', schemaPath: '#/properties/link_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate59.errors = vErrors;
    return errors === 0;
  }
  validate59.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate77(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate77.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.semantic_model === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'semantic_model' }, message: "must have required property '" + 'semantic_model' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.concept_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'concept_mappings' },
          message: "must have required property '" + 'concept_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'description' || key0 === 'semantic_model' || key0 === 'concept_mappings')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.semantic_model !== undefined) {
        if (!validate22(data.semantic_model, { instancePath: instancePath + '/semantic_model', parentData: data, parentDataProperty: 'semantic_model', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
      if (data.concept_mappings !== undefined) {
        let data3 = data.concept_mappings;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate59(data3[i0], { instancePath: instancePath + '/concept_mappings/' + i0, parentData: data3, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept_mappings', schemaPath: '#/properties/concept_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate77.errors = vErrors;
    return errors === 0;
  }
  validate77.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate76(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate76.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (!validate77(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })) {
      vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
      errors = vErrors.length;
    }
    validate76.errors = vErrors;
    return errors === 0;
  }
  validate76.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const ossieOntologyDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/apache/ossie/ontology/ontology.json',
    title: 'Apache Ossie Ontology Metadata Specification',
    description: 'JSON Schema for validating Apache Ossie ontology definitions',
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Ontology specification version' },
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the ontology' },
      description: { type: 'string', description: 'Human-readable description' },
      ai_context: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this ontology' },
      ontology: { type: 'array', items: { $ref: '#/$defs/OntologyComponent' }, minItems: 1, description: 'Components that define the concepts and relationships in this ontology' },
      ontology_mappings: {
        type: 'array',
        description:
          'Deprecated. Embedded ontology maps, accepted only so existing documents continue to validate; write mappings as standalone documents validated against ontology/mapping.json instead.',
        deprecated: true,
        items: { $ref: '#/$defs/OntologyMap' },
      },
      annotations: { $ref: '#/$defs/Annotations' },
      prefixes: {
        type: 'object',
        description: "Maps namespace prefixes to the IRIs they abbreviate, enabling QName expansion (e.g., 'foaf' -> 'http://xmlns.com/foaf/0.1/').",
        additionalProperties: { type: 'string', minLength: 1, format: 'iri' },
      },
    },
    required: ['version', 'name', 'ontology'],
    additionalProperties: false,
    $defs: {
      Annotations: {
        type: 'object',
        description:
          'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
        additionalProperties: true,
      },
      OntologyComponent: {
        type: 'object',
        description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
          type: { $ref: '#/$defs/ConceptType' },
          description: { type: 'string', description: 'Human-readable description of the concept' },
          extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
        },
        required: ['concept', 'type'],
        additionalProperties: false,
      },
      Expression: { type: 'string', minLength: 1, description: 'ANSI SQL expression' },
      Relationship: {
        type: 'object',
        description: 'Relationship between concepts in the ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
          description: { type: 'string', description: 'Human-readable description of the relationship' },
          roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
          multiplicity: { $ref: '#/$defs/Multiplicity' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
          verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
        },
        required: ['name', 'verbalizes'],
        additionalProperties: false,
      },
      ConceptMapping: {
        type: 'object',
        description: 'Mappings from logical model constructs to some ontology component',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
          object_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/ObjectMapping' },
            description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
          },
          link_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/LinkMapping' },
            description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
          },
        },
        required: ['concept'],
        anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
        additionalProperties: false,
      },
      ConceptType: { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' },
      ReferentMapping: {
        type: 'object',
        description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
          expression: { $ref: '#/$defs/Expression' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
        },
        required: ['relationship'],
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      Role: {
        type: 'object',
        description: 'Role in some relationship (the container)',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
          name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
        },
        required: ['concept'],
        additionalProperties: false,
      },
      ObjectMapping: {
        type: 'object',
        description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
          expression: { $ref: '#/$defs/Expression' },
        },
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      LinkMapping: {
        type: 'object',
        description: 'Mapping from logical schema to the links of relationships in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
          object_mapping: { $ref: '#/$defs/ObjectMapping' },
          children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
        },
        required: ['object_mapping'],
        additionalProperties: false,
      },
      Multiplicity: { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' },
      OntologyMap: {
        type: 'object',
        description: 'Map from the constructs of some logical model to some ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
          description: { type: 'string', description: 'Human-readable description of this ontology map' },
          semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
          concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
        },
        required: ['semantic_model', 'concept_mappings'],
        additionalProperties: false,
      },
    },
  };
  const ossieOntologyDraft030AnnotationsSchema = {
    type: 'object',
    description:
      'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
    additionalProperties: true,
  };
  const func0 = mappingsDraft030Runtime1.default;
  const OntologyComponentDefinesSingleSchema = {
    type: 'object',
    description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
      type: { $ref: '#/$defs/ConceptType' },
      description: { type: 'string', description: 'Human-readable description of the concept' },
      extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
      relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
    },
    required: ['concept', 'type'],
    additionalProperties: false,
  };
  const ConceptEitherEntityTypeSchema = { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' };
  const RelationshipBetweenConceptsOntologySchema = {
    type: 'object',
    description: 'Relationship between concepts in the ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
      description: { type: 'string', description: 'Human-readable description of the relationship' },
      roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
      multiplicity: { $ref: '#/$defs/Multiplicity' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
      verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
    },
    required: ['name', 'verbalizes'],
    additionalProperties: false,
  };
  const RelationshipMultiplicitySchema = { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' };
  const RoleRelationshipContainerSchema = {
    type: 'object',
    description: 'Role in some relationship (the container)',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
      name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
    },
    required: ['concept'],
    additionalProperties: false,
  };

  function validate53(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate53.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'name' || key0 === 'annotations')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err4 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data2 = data.annotations;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        } else {
          const err6 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate53.errors = vErrors;
    return errors === 0;
  }
  validate53.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate52(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate52.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.verbalizes === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'verbalizes' }, message: "must have required property '" + 'verbalizes' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(RelationshipBetweenConceptsOntologySchema.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.roles !== undefined) {
        let data2 = data.roles;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate53(data2[i0], { instancePath: instancePath + '/roles/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate53.errors : vErrors.concat(validate53.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/roles', schemaPath: '#/properties/roles/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.multiplicity !== undefined) {
        let data4 = data.multiplicity;
        if (typeof data4 !== 'string') {
          const err7 = { instancePath: instancePath + '/multiplicity', schemaPath: '#/$defs/Multiplicity/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!(data4 === 'ManyToOne' || data4 === 'OneToOne')) {
          const err8 = {
            instancePath: instancePath + '/multiplicity',
            schemaPath: '#/$defs/Multiplicity/enum',
            keyword: 'enum',
            params: { allowedValues: RelationshipMultiplicitySchema.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data6 = data5[i1];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err9 = {
                  instancePath: instancePath + '/derived_by/' + i1,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = { instancePath: instancePath + '/derived_by/' + i1, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          let i2 = data5.length;
          let j0;
          if (i2 > 1) {
            outer0: for (; i2--;) {
              for (j0 = i2; j0--;) {
                if (func0(data5[i2], data5[j0])) {
                  const err11 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i2, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i2 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err12 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data7 = data.requires;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i3 = 0; i3 < len2; i3++) {
            let data8 = data7[i3];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err13 = {
                  instancePath: instancePath + '/requires/' + i3,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            } else {
              const err14 = { instancePath: instancePath + '/requires/' + i3, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          let i4 = data7.length;
          let j1;
          if (i4 > 1) {
            outer1: for (; i4--;) {
              for (j1 = i4; j1--;) {
                if (func0(data7[i4], data7[j1])) {
                  const err15 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i4, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.verbalizes !== undefined) {
        let data9 = data.verbalizes;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i5 = 0; i5 < len3; i5++) {
            let data10 = data9[i5];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err17 = {
                  instancePath: instancePath + '/verbalizes/' + i5,
                  schemaPath: '#/properties/verbalizes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = {
                instancePath: instancePath + '/verbalizes/' + i5,
                schemaPath: '#/properties/verbalizes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          let i6 = data9.length;
          let j2;
          if (i6 > 1) {
            const indices0 = {};
            for (; i6--;) {
              let item0 = data9[i6];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j2 = indices0[item0];
                const err19 = {
                  instancePath: instancePath + '/verbalizes',
                  schemaPath: '#/properties/verbalizes/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i6, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i6 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
                break;
              }
              indices0[item0] = i6;
            }
          }
        } else {
          const err20 = { instancePath: instancePath + '/verbalizes', schemaPath: '#/properties/verbalizes/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data11 = data.annotations;
        if (data11 && typeof data11 == 'object' && !Array.isArray(data11)) {
        } else {
          const err21 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data12 = data.iri;
        if (typeof data12 === 'string') {
          if (func1(data12) < 1) {
            const err22 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        } else {
          const err23 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
    } else {
      const err24 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err24];
      } else {
        vErrors.push(err24);
      }
      errors++;
    }
    validate52.errors = vErrors;
    return errors === 0;
  }
  validate52.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate51(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate51.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.type === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'type' }, message: "must have required property '" + 'type' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(OntologyComponentDefinesSingleSchema.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.type !== undefined) {
        let data1 = data.type;
        if (typeof data1 !== 'string') {
          const err5 = { instancePath: instancePath + '/type', schemaPath: '#/$defs/ConceptType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (!(data1 === 'EntityType' || data1 === 'ValueType')) {
          const err6 = {
            instancePath: instancePath + '/type',
            schemaPath: '#/$defs/ConceptType/enum',
            keyword: 'enum',
            params: { allowedValues: ConceptEitherEntityTypeSchema.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err7 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.extends !== undefined) {
        let data3 = data.extends;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            let data4 = data3[i0];
            if (typeof data4 === 'string') {
              if (func1(data4) < 1) {
                const err8 = {
                  instancePath: instancePath + '/extends/' + i0,
                  schemaPath: '#/properties/extends/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            } else {
              const err9 = { instancePath: instancePath + '/extends/' + i0, schemaPath: '#/properties/extends/items/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          let i1 = data3.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data3[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err10 = {
                  instancePath: instancePath + '/extends',
                  schemaPath: '#/properties/extends/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err11 = { instancePath: instancePath + '/extends', schemaPath: '#/properties/extends/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data6 = data5[i2];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err12 = {
                  instancePath: instancePath + '/derived_by/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            } else {
              const err13 = { instancePath: instancePath + '/derived_by/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          let i3 = data5.length;
          let j1;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j1 = i3; j1--;) {
                if (func0(data5[i3], data5[j1])) {
                  const err14 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err15 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      if (data.identify_by !== undefined) {
        let data7 = data.identify_by;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i4 = 0; i4 < len2; i4++) {
            let data8 = data7[i4];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err16 = {
                  instancePath: instancePath + '/identify_by/' + i4,
                  schemaPath: '#/properties/identify_by/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/identify_by/' + i4,
                schemaPath: '#/properties/identify_by/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          let i5 = data7.length;
          let j2;
          if (i5 > 1) {
            const indices1 = {};
            for (; i5--;) {
              let item1 = data7[i5];
              if (typeof item1 !== 'string') {
                continue;
              }
              if (typeof indices1[item1] == 'number') {
                j2 = indices1[item1];
                const err18 = {
                  instancePath: instancePath + '/identify_by',
                  schemaPath: '#/properties/identify_by/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i5, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i5 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
                break;
              }
              indices1[item1] = i5;
            }
          }
        } else {
          const err19 = { instancePath: instancePath + '/identify_by', schemaPath: '#/properties/identify_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i6 = 0; i6 < len3; i6++) {
            let data10 = data9[i6];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err20 = {
                  instancePath: instancePath + '/requires/' + i6,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            } else {
              const err21 = { instancePath: instancePath + '/requires/' + i6, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          let i7 = data9.length;
          let j3;
          if (i7 > 1) {
            outer1: for (; i7--;) {
              for (j3 = i7; j3--;) {
                if (func0(data9[i7], data9[j3])) {
                  const err22 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i7, j: j3 },
                    message: 'must NOT have duplicate items (items ## ' + j3 + ' and ' + i7 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.relationships !== undefined) {
        let data11 = data.relationships;
        if (Array.isArray(data11)) {
          const len4 = data11.length;
          for (let i8 = 0; i8 < len4; i8++) {
            if (!validate52(data11[i8], { instancePath: instancePath + '/relationships/' + i8, parentData: data11, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/relationships', schemaPath: '#/properties/relationships/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data13 = data.annotations;
        if (data13 && typeof data13 == 'object' && !Array.isArray(data13)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data14 = data.iri;
        if (typeof data14 === 'string') {
          if (func1(data14) < 1) {
            const err26 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        } else {
          const err27 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
    } else {
      const err28 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err28];
      } else {
        vErrors.push(err28);
      }
      errors++;
    }
    validate51.errors = vErrors;
    return errors === 0;
  }
  validate51.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate57(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate57.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.semantic_model === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'semantic_model' }, message: "must have required property '" + 'semantic_model' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.concept_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'concept_mappings' },
          message: "must have required property '" + 'concept_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'description' || key0 === 'semantic_model' || key0 === 'concept_mappings')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.semantic_model !== undefined) {
        if (!validate22(data.semantic_model, { instancePath: instancePath + '/semantic_model', parentData: data, parentDataProperty: 'semantic_model', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
      if (data.concept_mappings !== undefined) {
        let data3 = data.concept_mappings;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate59(data3[i0], { instancePath: instancePath + '/concept_mappings/' + i0, parentData: data3, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept_mappings', schemaPath: '#/properties/concept_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate57.errors = vErrors;
    return errors === 0;
  }
  validate57.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const formats0 = /^[a-z][a-z\d+.-]*:[^\s]+$/i;

  function validate21(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="https://github.com/apache/ossie/ontology/ontology.json" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate21.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.version === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.ontology === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'ontology' }, message: "must have required property '" + 'ontology' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(ossieOntologyDraft030Schema.properties, key0)) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data0 = data.version;
        if (typeof data0 !== 'string') {
          const err4 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data0) {
          const err5 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err6 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        } else {
          const err7 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err8 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data3 = data.ai_context;
        const _errs10 = errors;
        let valid2 = false;
        let passing0 = null;
        const _errs11 = errors;
        if (typeof data3 !== 'string') {
          const err9 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/0/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        var _valid0 = _errs11 === errors;
        if (_valid0) {
          valid2 = true;
          passing0 = 0;
        }
        const _errs13 = errors;
        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
          if (data3.instructions !== undefined) {
            if (typeof data3.instructions !== 'string') {
              const err10 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          if (data3.synonyms !== undefined) {
            let data5 = data3.synonyms;
            if (Array.isArray(data5)) {
              const len0 = data5.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data5[i0] !== 'string') {
                  const err11 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
              }
            } else {
              const err12 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          if (data3.examples !== undefined) {
            let data7 = data3.examples;
            if (Array.isArray(data7)) {
              const len1 = data7.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data7[i1] !== 'string') {
                  const err13 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
            } else {
              const err14 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
        } else {
          const err15 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        var _valid0 = _errs13 === errors;
        if (_valid0 && valid2) {
          valid2 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid2 = true;
            passing0 = 1;
          }
        }
        if (!valid2) {
          const err16 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        } else {
          errors = _errs10;
          if (vErrors !== null) {
            if (_errs10) {
              vErrors.length = _errs10;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len2 = data9.length;
          for (let i2 = 0; i2 < len2; i2++) {
            let data10 = data9[i2];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err17 = {
                  instancePath: instancePath + '/requires/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = { instancePath: instancePath + '/requires/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          let i3 = data9.length;
          let j0;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j0 = i3; j0--;) {
                if (func0(data9[i3], data9[j0])) {
                  const err19 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err20 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.ontology !== undefined) {
        let data11 = data.ontology;
        if (Array.isArray(data11)) {
          if (data11.length < 1) {
            const err21 = {
              instancePath: instancePath + '/ontology',
              schemaPath: '#/properties/ontology/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          const len3 = data11.length;
          for (let i4 = 0; i4 < len3; i4++) {
            if (!validate51(data11[i4], { instancePath: instancePath + '/ontology/' + i4, parentData: data11, parentDataProperty: i4, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate51.errors : vErrors.concat(validate51.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err22 = { instancePath: instancePath + '/ontology', schemaPath: '#/properties/ontology/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      }
      if (data.ontology_mappings !== undefined) {
        let data13 = data.ontology_mappings;
        if (Array.isArray(data13)) {
          const len4 = data13.length;
          for (let i5 = 0; i5 < len4; i5++) {
            if (!validate57(data13[i5], { instancePath: instancePath + '/ontology_mappings/' + i5, parentData: data13, parentDataProperty: i5, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate57.errors : vErrors.concat(validate57.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/ontology_mappings', schemaPath: '#/properties/ontology_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data15 = data.annotations;
        if (data15 && typeof data15 == 'object' && !Array.isArray(data15)) {
        } else {
          const err24 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.prefixes !== undefined) {
        let data16 = data.prefixes;
        if (data16 && typeof data16 == 'object' && !Array.isArray(data16)) {
          for (const key1 in data16) {
            let data17 = data16[key1];
            if (typeof data17 === 'string') {
              if (func1(data17) < 1) {
                const err25 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
              if (!formats0.test(data17)) {
                const err26 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/format',
                  keyword: 'format',
                  params: { format: 'iri' },
                  message: 'must match format "' + 'iri' + '"',
                };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            } else {
              const err27 = {
                instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                schemaPath: '#/properties/prefixes/additionalProperties/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          }
        } else {
          const err28 = { instancePath: instancePath + '/prefixes', schemaPath: '#/properties/prefixes/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
    } else {
      const err29 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err29];
      } else {
        vErrors.push(err29);
      }
      errors++;
    }
    validate21.errors = vErrors;
    return errors === 0;
  }
  validate21.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const tesseraOntologyDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:semantic-workbench:tessera-ontology:1:ossie-0.3.0.dev0',
    title: 'Apache Ossie Ontology Metadata Specification',
    description: 'JSON Schema for validating Apache Ossie ontology definitions',
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Ontology specification version' },
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the ontology' },
      description: { type: 'string', description: 'Human-readable description' },
      ai_context: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this ontology' },
      ontology: { type: 'array', items: { $ref: '#/$defs/OntologyComponent' }, minItems: 1, description: 'Components that define the concepts and relationships in this ontology' },
      ontology_mappings: {
        type: 'array',
        description:
          'Deprecated. Embedded ontology maps, accepted only so existing documents continue to validate; write mappings as standalone documents validated against ontology/mapping.json instead.',
        deprecated: true,
        items: { $ref: '#/$defs/OntologyMap' },
      },
      annotations: { $ref: '#/$defs/Annotations' },
      prefixes: {
        type: 'object',
        description: "Maps namespace prefixes to the IRIs they abbreviate, enabling QName expansion (e.g., 'foaf' -> 'http://xmlns.com/foaf/0.1/').",
        additionalProperties: { type: 'string', minLength: 1, format: 'iri' },
      },
      tessera: { type: 'integer', const: 1, description: 'Marks the document as Tessera revision 1.' },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
    },
    required: ['tessera', 'version', 'name', 'ontology'],
    additionalProperties: false,
    $defs: {
      Annotations: {
        type: 'object',
        description:
          'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
        additionalProperties: true,
      },
      OntologyComponent: {
        type: 'object',
        description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
          type: { $ref: '#/$defs/ConceptType' },
          description: { type: 'string', description: 'Human-readable description of the concept' },
          extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
        },
        required: ['concept', 'type'],
        additionalProperties: false,
      },
      Expression: { type: 'string', minLength: 1, description: 'ANSI SQL expression' },
      Relationship: {
        type: 'object',
        description: 'Relationship between concepts in the ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
          description: { type: 'string', description: 'Human-readable description of the relationship' },
          roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
          multiplicity: { $ref: '#/$defs/Multiplicity' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
          verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
        },
        required: ['name', 'verbalizes'],
        additionalProperties: false,
      },
      ConceptMapping: {
        type: 'object',
        description: 'Mappings from logical model constructs to some ontology component',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
          object_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/ObjectMapping' },
            description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
          },
          link_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/LinkMapping' },
            description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
          },
        },
        required: ['concept'],
        anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
        additionalProperties: false,
      },
      ConceptType: { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' },
      ReferentMapping: {
        type: 'object',
        description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
          expression: { $ref: '#/$defs/Expression' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
        },
        required: ['relationship'],
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      Role: {
        type: 'object',
        description: 'Role in some relationship (the container)',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
          name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
        },
        required: ['concept'],
        additionalProperties: false,
      },
      ObjectMapping: {
        type: 'object',
        description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
          expression: { $ref: '#/$defs/Expression' },
        },
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      LinkMapping: {
        type: 'object',
        description: 'Mapping from logical schema to the links of relationships in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
          object_mapping: { $ref: '#/$defs/ObjectMapping' },
          children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
        },
        required: ['object_mapping'],
        additionalProperties: false,
      },
      Multiplicity: { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' },
      OntologyMap: {
        type: 'object',
        description: 'Map from the constructs of some logical model to some ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
          description: { type: 'string', description: 'Human-readable description of this ontology map' },
          semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
          concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
        },
        required: ['semantic_model', 'concept_mappings'],
        additionalProperties: false,
      },
    },
    $comment:
      'Workbench schema derived from the pinned Ossie 0.3.0.dev0 ontology schema for Tessera revision 1. It is not part of the Ossie standard. Regenerate it with scripts/derive-tessera-schema.ts.',
  };
  const tesseraOntologyDraft030ExpressionSchema = { type: 'string', minLength: 1, description: 'ANSI SQL expression' };
  const tesseraOntologyDraft030AnnotationsSchema = {
    type: 'object',
    description:
      'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
    additionalProperties: true,
  };
  const OntologyComponentDefinesSingleSchema2 = {
    type: 'object',
    description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
      type: { $ref: '#/$defs/ConceptType' },
      description: { type: 'string', description: 'Human-readable description of the concept' },
      extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
      relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
    },
    required: ['concept', 'type'],
    additionalProperties: false,
  };
  const ConceptEitherEntityTypeSchema2 = { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' };
  const RelationshipBetweenConceptsOntologySchema2 = {
    type: 'object',
    description: 'Relationship between concepts in the ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
      description: { type: 'string', description: 'Human-readable description of the relationship' },
      roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
      multiplicity: { $ref: '#/$defs/Multiplicity' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
      verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
    },
    required: ['name', 'verbalizes'],
    additionalProperties: false,
  };
  const RelationshipMultiplicitySchema2 = { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' };
  const RoleRelationshipContainerSchema2 = {
    type: 'object',
    description: 'Role in some relationship (the container)',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
      name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
    },
    required: ['concept'],
    additionalProperties: false,
  };

  function validate84(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate84.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'name' || key0 === 'annotations')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err4 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data2 = data.annotations;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        } else {
          const err6 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate84.errors = vErrors;
    return errors === 0;
  }
  validate84.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate83(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate83.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.verbalizes === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'verbalizes' }, message: "must have required property '" + 'verbalizes' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(RelationshipBetweenConceptsOntologySchema2.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.roles !== undefined) {
        let data2 = data.roles;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate84(data2[i0], { instancePath: instancePath + '/roles/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate84.errors : vErrors.concat(validate84.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/roles', schemaPath: '#/properties/roles/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.multiplicity !== undefined) {
        let data4 = data.multiplicity;
        if (typeof data4 !== 'string') {
          const err7 = { instancePath: instancePath + '/multiplicity', schemaPath: '#/$defs/Multiplicity/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!(data4 === 'ManyToOne' || data4 === 'OneToOne')) {
          const err8 = {
            instancePath: instancePath + '/multiplicity',
            schemaPath: '#/$defs/Multiplicity/enum',
            keyword: 'enum',
            params: { allowedValues: RelationshipMultiplicitySchema2.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data6 = data5[i1];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err9 = {
                  instancePath: instancePath + '/derived_by/' + i1,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = { instancePath: instancePath + '/derived_by/' + i1, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          let i2 = data5.length;
          let j0;
          if (i2 > 1) {
            outer0: for (; i2--;) {
              for (j0 = i2; j0--;) {
                if (func0(data5[i2], data5[j0])) {
                  const err11 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i2, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i2 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err12 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data7 = data.requires;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i3 = 0; i3 < len2; i3++) {
            let data8 = data7[i3];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err13 = {
                  instancePath: instancePath + '/requires/' + i3,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            } else {
              const err14 = { instancePath: instancePath + '/requires/' + i3, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          let i4 = data7.length;
          let j1;
          if (i4 > 1) {
            outer1: for (; i4--;) {
              for (j1 = i4; j1--;) {
                if (func0(data7[i4], data7[j1])) {
                  const err15 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i4, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.verbalizes !== undefined) {
        let data9 = data.verbalizes;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i5 = 0; i5 < len3; i5++) {
            let data10 = data9[i5];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err17 = {
                  instancePath: instancePath + '/verbalizes/' + i5,
                  schemaPath: '#/properties/verbalizes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = {
                instancePath: instancePath + '/verbalizes/' + i5,
                schemaPath: '#/properties/verbalizes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          let i6 = data9.length;
          let j2;
          if (i6 > 1) {
            const indices0 = {};
            for (; i6--;) {
              let item0 = data9[i6];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j2 = indices0[item0];
                const err19 = {
                  instancePath: instancePath + '/verbalizes',
                  schemaPath: '#/properties/verbalizes/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i6, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i6 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
                break;
              }
              indices0[item0] = i6;
            }
          }
        } else {
          const err20 = { instancePath: instancePath + '/verbalizes', schemaPath: '#/properties/verbalizes/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data11 = data.annotations;
        if (data11 && typeof data11 == 'object' && !Array.isArray(data11)) {
        } else {
          const err21 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data12 = data.iri;
        if (typeof data12 === 'string') {
          if (func1(data12) < 1) {
            const err22 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        } else {
          const err23 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data13 = data.tessera_notes;
        if (typeof data13 === 'string') {
          if (func1(data13) > 10000) {
            const err24 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (func1(data13) < 1) {
            const err25 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        } else {
          const err26 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
    } else {
      const err27 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err27];
      } else {
        vErrors.push(err27);
      }
      errors++;
    }
    validate83.errors = vErrors;
    return errors === 0;
  }
  validate83.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate82(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate82.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.type === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'type' }, message: "must have required property '" + 'type' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(OntologyComponentDefinesSingleSchema2.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.type !== undefined) {
        let data1 = data.type;
        if (typeof data1 !== 'string') {
          const err5 = { instancePath: instancePath + '/type', schemaPath: '#/$defs/ConceptType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (!(data1 === 'EntityType' || data1 === 'ValueType')) {
          const err6 = {
            instancePath: instancePath + '/type',
            schemaPath: '#/$defs/ConceptType/enum',
            keyword: 'enum',
            params: { allowedValues: ConceptEitherEntityTypeSchema2.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err7 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.extends !== undefined) {
        let data3 = data.extends;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            let data4 = data3[i0];
            if (typeof data4 === 'string') {
              if (func1(data4) < 1) {
                const err8 = {
                  instancePath: instancePath + '/extends/' + i0,
                  schemaPath: '#/properties/extends/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            } else {
              const err9 = { instancePath: instancePath + '/extends/' + i0, schemaPath: '#/properties/extends/items/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          let i1 = data3.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data3[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err10 = {
                  instancePath: instancePath + '/extends',
                  schemaPath: '#/properties/extends/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err11 = { instancePath: instancePath + '/extends', schemaPath: '#/properties/extends/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data6 = data5[i2];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err12 = {
                  instancePath: instancePath + '/derived_by/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            } else {
              const err13 = { instancePath: instancePath + '/derived_by/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          let i3 = data5.length;
          let j1;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j1 = i3; j1--;) {
                if (func0(data5[i3], data5[j1])) {
                  const err14 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err15 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      if (data.identify_by !== undefined) {
        let data7 = data.identify_by;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i4 = 0; i4 < len2; i4++) {
            let data8 = data7[i4];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err16 = {
                  instancePath: instancePath + '/identify_by/' + i4,
                  schemaPath: '#/properties/identify_by/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/identify_by/' + i4,
                schemaPath: '#/properties/identify_by/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          let i5 = data7.length;
          let j2;
          if (i5 > 1) {
            const indices1 = {};
            for (; i5--;) {
              let item1 = data7[i5];
              if (typeof item1 !== 'string') {
                continue;
              }
              if (typeof indices1[item1] == 'number') {
                j2 = indices1[item1];
                const err18 = {
                  instancePath: instancePath + '/identify_by',
                  schemaPath: '#/properties/identify_by/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i5, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i5 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
                break;
              }
              indices1[item1] = i5;
            }
          }
        } else {
          const err19 = { instancePath: instancePath + '/identify_by', schemaPath: '#/properties/identify_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i6 = 0; i6 < len3; i6++) {
            let data10 = data9[i6];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err20 = {
                  instancePath: instancePath + '/requires/' + i6,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            } else {
              const err21 = { instancePath: instancePath + '/requires/' + i6, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          let i7 = data9.length;
          let j3;
          if (i7 > 1) {
            outer1: for (; i7--;) {
              for (j3 = i7; j3--;) {
                if (func0(data9[i7], data9[j3])) {
                  const err22 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i7, j: j3 },
                    message: 'must NOT have duplicate items (items ## ' + j3 + ' and ' + i7 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.relationships !== undefined) {
        let data11 = data.relationships;
        if (Array.isArray(data11)) {
          const len4 = data11.length;
          for (let i8 = 0; i8 < len4; i8++) {
            if (!validate83(data11[i8], { instancePath: instancePath + '/relationships/' + i8, parentData: data11, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate83.errors : vErrors.concat(validate83.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/relationships', schemaPath: '#/properties/relationships/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data13 = data.annotations;
        if (data13 && typeof data13 == 'object' && !Array.isArray(data13)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data14 = data.iri;
        if (typeof data14 === 'string') {
          if (func1(data14) < 1) {
            const err26 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        } else {
          const err27 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data15 = data.tessera_notes;
        if (typeof data15 === 'string') {
          if (func1(data15) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          if (func1(data15) < 1) {
            const err29 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        } else {
          const err30 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
    } else {
      const err31 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err31];
      } else {
        vErrors.push(err31);
      }
      errors++;
    }
    validate82.errors = vErrors;
    return errors === 0;
  }
  validate82.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MapConstructsLogicalModelSchema2 = {
    type: 'object',
    description: 'Map from the constructs of some logical model to some ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
      description: { type: 'string', description: 'Human-readable description of this ontology map' },
      semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
      concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
    },
    required: ['semantic_model', 'concept_mappings'],
    additionalProperties: false,
  };
  const MappingsLogicalModelConstructsSchema2 = {
    type: 'object',
    description: 'Mappings from logical model constructs to some ontology component',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
      object_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/ObjectMapping' },
        description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
      },
      link_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/LinkMapping' },
        description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
      },
    },
    required: ['concept'],
    anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
    additionalProperties: false,
  };
  const PatternLogicalLevelExpressionsSchema2 = {
    type: 'object',
    description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
      expression: { $ref: '#/$defs/Expression' },
    },
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const MappingLogicalModelConstructsSchema2 = {
    type: 'object',
    description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
      expression: { $ref: '#/$defs/Expression' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
    },
    required: ['relationship'],
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const wrapper2 = { validate: validate92 };

  function validate92(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate92.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.relationship === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'relationship' }, message: "must have required property '" + 'relationship' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'expression' || key0 === 'referent_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data1 = data.expression;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err7 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        } else {
          const err8 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data2 = data.referent_mappings;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err9 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper2.validate(data2[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper2.validate.errors : vErrors.concat(wrapper2.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate92.errors = vErrors;
    return errors === 0;
  }
  validate92.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate91(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate91.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'referent_mappings' || key0 === 'expression')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err4 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data1 = data.referent_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err6 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate92(data1[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate92.errors : vErrors.concat(validate92.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data3 = data.expression;
        if (typeof data3 === 'string') {
          if (func1(data3) < 1) {
            const err8 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
    } else {
      const err10 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    validate91.errors = vErrors;
    return errors === 0;
  }
  validate91.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MappingLogicalSchemaLinksSchema2 = {
    type: 'object',
    description: 'Mapping from logical schema to the links of relationships in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
      object_mapping: { $ref: '#/$defs/ObjectMapping' },
      children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
    },
    required: ['object_mapping'],
    additionalProperties: false,
  };
  const wrapper3 = { validate: validate95 };

  function validate95(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate95.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mapping === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'object_mapping' }, message: "must have required property '" + 'object_mapping' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'object_mapping' || key0 === 'children')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.object_mapping !== undefined) {
        if (!validate91(data.object_mapping, { instancePath: instancePath + '/object_mapping', parentData: data, parentDataProperty: 'object_mapping', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate91.errors : vErrors.concat(validate91.errors);
          errors = vErrors.length;
        }
      }
      if (data.children !== undefined) {
        let data2 = data.children;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper3.validate(data2[i0], { instancePath: instancePath + '/children/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper3.validate.errors : vErrors.concat(wrapper3.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err4 = { instancePath: instancePath + '/children', schemaPath: '#/properties/children/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
    } else {
      const err5 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    validate95.errors = vErrors;
    return errors === 0;
  }
  validate95.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate90(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate90.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mappings === undefined) {
        const err0 = {
          instancePath,
          schemaPath: '#/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: 'object_mappings' },
          message: "must have required property '" + 'object_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.link_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'link_mappings' },
          message: "must have required property '" + 'link_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'object_mappings' || key0 === 'link_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.object_mappings !== undefined) {
        let data1 = data.object_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err7 = {
              instancePath: instancePath + '/object_mappings',
              schemaPath: '#/properties/object_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate91(data1[i0], { instancePath: instancePath + '/object_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate91.errors : vErrors.concat(validate91.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err8 = { instancePath: instancePath + '/object_mappings', schemaPath: '#/properties/object_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.link_mappings !== undefined) {
        let data3 = data.link_mappings;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err9 = {
              instancePath: instancePath + '/link_mappings',
              schemaPath: '#/properties/link_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len1 = data3.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (!validate95(data3[i1], { instancePath: instancePath + '/link_mappings/' + i1, parentData: data3, parentDataProperty: i1, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate95.errors : vErrors.concat(validate95.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/link_mappings', schemaPath: '#/properties/link_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate90.errors = vErrors;
    return errors === 0;
  }
  validate90.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate88(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate88.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.semantic_model === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'semantic_model' }, message: "must have required property '" + 'semantic_model' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.concept_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'concept_mappings' },
          message: "must have required property '" + 'concept_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'description' || key0 === 'semantic_model' || key0 === 'concept_mappings')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.semantic_model !== undefined) {
        if (!validate22(data.semantic_model, { instancePath: instancePath + '/semantic_model', parentData: data, parentDataProperty: 'semantic_model', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
      if (data.concept_mappings !== undefined) {
        let data3 = data.concept_mappings;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate90(data3[i0], { instancePath: instancePath + '/concept_mappings/' + i0, parentData: data3, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept_mappings', schemaPath: '#/properties/concept_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate88.errors = vErrors;
    return errors === 0;
  }
  validate88.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate81(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="urn:semantic-workbench:tessera-ontology:1:ossie-0.3.0.dev0" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate81.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.tessera === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'tessera' }, message: "must have required property '" + 'tessera' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.version === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (data.ontology === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'ontology' }, message: "must have required property '" + 'ontology' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(tesseraOntologyDraft030Schema.properties, key0)) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data0 = data.version;
        if (typeof data0 !== 'string') {
          const err5 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data0) {
          const err6 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err7 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        } else {
          const err8 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err9 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data3 = data.ai_context;
        const _errs11 = errors;
        let valid2 = false;
        let passing0 = null;
        const _errs12 = errors;
        if (typeof data3 !== 'string') {
          const err10 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/0/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        var _valid0 = _errs12 === errors;
        if (_valid0) {
          valid2 = true;
          passing0 = 0;
        }
        const _errs14 = errors;
        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
          if (data3.instructions !== undefined) {
            if (typeof data3.instructions !== 'string') {
              const err11 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data3.synonyms !== undefined) {
            let data5 = data3.synonyms;
            if (Array.isArray(data5)) {
              const len0 = data5.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data5[i0] !== 'string') {
                  const err12 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
            } else {
              const err13 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          if (data3.examples !== undefined) {
            let data7 = data3.examples;
            if (Array.isArray(data7)) {
              const len1 = data7.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data7[i1] !== 'string') {
                  const err14 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              }
            } else {
              const err15 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        } else {
          const err16 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        var _valid0 = _errs14 === errors;
        if (_valid0 && valid2) {
          valid2 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid2 = true;
            passing0 = 1;
          }
        }
        if (!valid2) {
          const err17 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        } else {
          errors = _errs11;
          if (vErrors !== null) {
            if (_errs11) {
              vErrors.length = _errs11;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len2 = data9.length;
          for (let i2 = 0; i2 < len2; i2++) {
            let data10 = data9[i2];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err18 = {
                  instancePath: instancePath + '/requires/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            } else {
              const err19 = { instancePath: instancePath + '/requires/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          let i3 = data9.length;
          let j0;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j0 = i3; j0--;) {
                if (func0(data9[i3], data9[j0])) {
                  const err20 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err21 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.ontology !== undefined) {
        let data11 = data.ontology;
        if (Array.isArray(data11)) {
          if (data11.length < 1) {
            const err22 = {
              instancePath: instancePath + '/ontology',
              schemaPath: '#/properties/ontology/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          const len3 = data11.length;
          for (let i4 = 0; i4 < len3; i4++) {
            if (!validate82(data11[i4], { instancePath: instancePath + '/ontology/' + i4, parentData: data11, parentDataProperty: i4, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate82.errors : vErrors.concat(validate82.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/ontology', schemaPath: '#/properties/ontology/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.ontology_mappings !== undefined) {
        let data13 = data.ontology_mappings;
        if (Array.isArray(data13)) {
          const len4 = data13.length;
          for (let i5 = 0; i5 < len4; i5++) {
            if (!validate88(data13[i5], { instancePath: instancePath + '/ontology_mappings/' + i5, parentData: data13, parentDataProperty: i5, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate88.errors : vErrors.concat(validate88.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/ontology_mappings', schemaPath: '#/properties/ontology_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data15 = data.annotations;
        if (data15 && typeof data15 == 'object' && !Array.isArray(data15)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.prefixes !== undefined) {
        let data16 = data.prefixes;
        if (data16 && typeof data16 == 'object' && !Array.isArray(data16)) {
          for (const key1 in data16) {
            let data17 = data16[key1];
            if (typeof data17 === 'string') {
              if (func1(data17) < 1) {
                const err26 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              if (!formats0.test(data17)) {
                const err27 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/format',
                  keyword: 'format',
                  params: { format: 'iri' },
                  message: 'must match format "' + 'iri' + '"',
                };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            } else {
              const err28 = {
                instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                schemaPath: '#/properties/prefixes/additionalProperties/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          }
        } else {
          const err29 = { instancePath: instancePath + '/prefixes', schemaPath: '#/properties/prefixes/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      }
      if (data.tessera !== undefined) {
        let data18 = data.tessera;
        if (!(typeof data18 == 'number' && !(data18 % 1) && !isNaN(data18))) {
          const err30 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/type', keyword: 'type', params: { type: 'integer' }, message: 'must be integer' };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        if (1 !== data18) {
          const err31 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/const', keyword: 'const', params: { allowedValue: 1 }, message: 'must be equal to constant' };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data19 = data.tessera_notes;
        if (typeof data19 === 'string') {
          if (func1(data19) > 10000) {
            const err32 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          if (func1(data19) < 1) {
            const err33 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        } else {
          const err34 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
    } else {
      const err35 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err35];
      } else {
        vErrors.push(err35);
      }
      errors++;
    }
    validate81.errors = vErrors;
    return errors === 0;
  }
  validate81.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const tesseraOntologyRevisionTwoDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:semantic-workbench:tessera-ontology:2:ossie-0.3.0.dev0',
    title: 'Apache Ossie Ontology Metadata Specification',
    description: 'JSON Schema for validating Apache Ossie ontology definitions',
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Ontology specification version' },
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the ontology' },
      description: { type: 'string', description: 'Human-readable description' },
      ai_context: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this ontology' },
      ontology: { type: 'array', items: { $ref: '#/$defs/OntologyComponent' }, minItems: 1, description: 'Components that define the concepts and relationships in this ontology' },
      ontology_mappings: {
        type: 'array',
        description:
          'Deprecated. Embedded ontology maps, accepted only so existing documents continue to validate; write mappings as standalone documents validated against ontology/mapping.json instead.',
        deprecated: true,
        items: { $ref: '#/$defs/OntologyMap' },
      },
      annotations: { $ref: '#/$defs/Annotations' },
      prefixes: {
        type: 'object',
        description: "Maps namespace prefixes to the IRIs they abbreviate, enabling QName expansion (e.g., 'foaf' -> 'http://xmlns.com/foaf/0.1/').",
        additionalProperties: { type: 'string', minLength: 1, format: 'iri' },
      },
      tessera: { type: 'integer', const: 2, description: 'Marks the document as Tessera revision 2.' },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
    },
    required: ['tessera', 'version', 'name', 'ontology'],
    additionalProperties: false,
    $defs: {
      Annotations: {
        type: 'object',
        description:
          'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
        additionalProperties: true,
      },
      OntologyComponent: {
        type: 'object',
        description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
          type: { $ref: '#/$defs/ConceptType' },
          description: { type: 'string', description: 'Human-readable description of the concept' },
          extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
          tessera_attributes: {
            type: 'array',
            maxItems: 200,
            items: { type: 'string', minLength: 1 },
            description: 'Tessera addition since revision 2: a list of at most 200 relationship names of the concept, in the order they are shown.',
          },
          tessera_ai_context: {
            type: ['string', 'object'],
            maxLength: 10000,
            properties: {
              instructions: { type: 'string', maxLength: 10000 },
              synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
              examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
            },
            additionalProperties: false,
            description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
          },
          tessera_governance: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              owner: { type: 'string', minLength: 1, maxLength: 200 },
              steward: { type: 'string', minLength: 1, maxLength: 200 },
              classification: { type: 'string', minLength: 1, maxLength: 200 },
              replaced_by: { type: 'string', minLength: 1 },
              deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
            },
            description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
          },
        },
        required: ['concept', 'type'],
        additionalProperties: false,
      },
      Expression: { type: 'string', minLength: 1, description: 'ANSI SQL expression' },
      Relationship: {
        type: 'object',
        description: 'Relationship between concepts in the ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
          description: { type: 'string', description: 'Human-readable description of the relationship' },
          roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
          multiplicity: { $ref: '#/$defs/Multiplicity' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
          verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
          tessera_ai_context: {
            type: ['string', 'object'],
            maxLength: 10000,
            properties: {
              instructions: { type: 'string', maxLength: 10000 },
              synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
              examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
            },
            additionalProperties: false,
            description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
          },
          tessera_governance: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              owner: { type: 'string', minLength: 1, maxLength: 200 },
              steward: { type: 'string', minLength: 1, maxLength: 200 },
              classification: { type: 'string', minLength: 1, maxLength: 200 },
              replaced_by: { type: 'string', minLength: 1 },
              deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
            },
            description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
          },
        },
        required: ['name', 'verbalizes'],
        additionalProperties: false,
      },
      ConceptMapping: {
        type: 'object',
        description: 'Mappings from logical model constructs to some ontology component',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
          object_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/ObjectMapping' },
            description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
          },
          link_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/LinkMapping' },
            description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
          },
        },
        required: ['concept'],
        anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
        additionalProperties: false,
      },
      ConceptType: { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' },
      ReferentMapping: {
        type: 'object',
        description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
          expression: { $ref: '#/$defs/Expression' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
        },
        required: ['relationship'],
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      Role: {
        type: 'object',
        description: 'Role in some relationship (the container)',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
          name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
        },
        required: ['concept'],
        additionalProperties: false,
      },
      ObjectMapping: {
        type: 'object',
        description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
          expression: { $ref: '#/$defs/Expression' },
        },
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      LinkMapping: {
        type: 'object',
        description: 'Mapping from logical schema to the links of relationships in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
          object_mapping: { $ref: '#/$defs/ObjectMapping' },
          children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
        },
        required: ['object_mapping'],
        additionalProperties: false,
      },
      Multiplicity: { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' },
      OntologyMap: {
        type: 'object',
        description: 'Map from the constructs of some logical model to some ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
          description: { type: 'string', description: 'Human-readable description of this ontology map' },
          semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
          concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
        },
        required: ['semantic_model', 'concept_mappings'],
        additionalProperties: false,
      },
    },
    $comment:
      'Workbench schema derived from the pinned Ossie 0.3.0.dev0 ontology schema for Tessera revision 2. It is not part of the Ossie standard. Regenerate it with scripts/derive-tessera-schema.ts.',
  };
  const tesseraOntologyRevisionTwoDraft030ExpressionSchema = { type: 'string', minLength: 1, description: 'ANSI SQL expression' };
  const tesseraOntologyRevisionTwoDraft030AnnotationsSchema = {
    type: 'object',
    description:
      'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
    additionalProperties: true,
  };
  const OntologyComponentDefinesSingleSchema3 = {
    type: 'object',
    description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
      type: { $ref: '#/$defs/ConceptType' },
      description: { type: 'string', description: 'Human-readable description of the concept' },
      extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
      relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_attributes: {
        type: 'array',
        maxItems: 200,
        items: { type: 'string', minLength: 1 },
        description: 'Tessera addition since revision 2: a list of at most 200 relationship names of the concept, in the order they are shown.',
      },
      tessera_ai_context: {
        type: ['string', 'object'],
        maxLength: 10000,
        properties: {
          instructions: { type: 'string', maxLength: 10000 },
          synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
          examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        },
        additionalProperties: false,
        description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
      },
      tessera_governance: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner: { type: 'string', minLength: 1, maxLength: 200 },
          steward: { type: 'string', minLength: 1, maxLength: 200 },
          classification: { type: 'string', minLength: 1, maxLength: 200 },
          replaced_by: { type: 'string', minLength: 1 },
          deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
      },
    },
    required: ['concept', 'type'],
    additionalProperties: false,
  };
  const ConceptEitherEntityTypeSchema3 = { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' };
  const RelationshipBetweenConceptsOntologySchema3 = {
    type: 'object',
    description: 'Relationship between concepts in the ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
      description: { type: 'string', description: 'Human-readable description of the relationship' },
      roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
      multiplicity: { $ref: '#/$defs/Multiplicity' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
      verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_ai_context: {
        type: ['string', 'object'],
        maxLength: 10000,
        properties: {
          instructions: { type: 'string', maxLength: 10000 },
          synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
          examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        },
        additionalProperties: false,
        description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
      },
      tessera_governance: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner: { type: 'string', minLength: 1, maxLength: 200 },
          steward: { type: 'string', minLength: 1, maxLength: 200 },
          classification: { type: 'string', minLength: 1, maxLength: 200 },
          replaced_by: { type: 'string', minLength: 1 },
          deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
      },
    },
    required: ['name', 'verbalizes'],
    additionalProperties: false,
  };
  const RelationshipMultiplicitySchema3 = { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' };
  const RoleRelationshipContainerSchema3 = {
    type: 'object',
    description: 'Role in some relationship (the container)',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
      name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
    },
    required: ['concept'],
    additionalProperties: false,
  };

  function validate103(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate103.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'name' || key0 === 'annotations')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err4 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data2 = data.annotations;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        } else {
          const err6 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate103.errors = vErrors;
    return errors === 0;
  }
  validate103.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate102(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate102.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.verbalizes === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'verbalizes' }, message: "must have required property '" + 'verbalizes' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(RelationshipBetweenConceptsOntologySchema3.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.roles !== undefined) {
        let data2 = data.roles;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate103(data2[i0], { instancePath: instancePath + '/roles/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate103.errors : vErrors.concat(validate103.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/roles', schemaPath: '#/properties/roles/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.multiplicity !== undefined) {
        let data4 = data.multiplicity;
        if (typeof data4 !== 'string') {
          const err7 = { instancePath: instancePath + '/multiplicity', schemaPath: '#/$defs/Multiplicity/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!(data4 === 'ManyToOne' || data4 === 'OneToOne')) {
          const err8 = {
            instancePath: instancePath + '/multiplicity',
            schemaPath: '#/$defs/Multiplicity/enum',
            keyword: 'enum',
            params: { allowedValues: RelationshipMultiplicitySchema3.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data6 = data5[i1];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err9 = {
                  instancePath: instancePath + '/derived_by/' + i1,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = { instancePath: instancePath + '/derived_by/' + i1, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          let i2 = data5.length;
          let j0;
          if (i2 > 1) {
            outer0: for (; i2--;) {
              for (j0 = i2; j0--;) {
                if (func0(data5[i2], data5[j0])) {
                  const err11 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i2, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i2 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err12 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data7 = data.requires;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i3 = 0; i3 < len2; i3++) {
            let data8 = data7[i3];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err13 = {
                  instancePath: instancePath + '/requires/' + i3,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            } else {
              const err14 = { instancePath: instancePath + '/requires/' + i3, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          let i4 = data7.length;
          let j1;
          if (i4 > 1) {
            outer1: for (; i4--;) {
              for (j1 = i4; j1--;) {
                if (func0(data7[i4], data7[j1])) {
                  const err15 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i4, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.verbalizes !== undefined) {
        let data9 = data.verbalizes;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i5 = 0; i5 < len3; i5++) {
            let data10 = data9[i5];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err17 = {
                  instancePath: instancePath + '/verbalizes/' + i5,
                  schemaPath: '#/properties/verbalizes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = {
                instancePath: instancePath + '/verbalizes/' + i5,
                schemaPath: '#/properties/verbalizes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          let i6 = data9.length;
          let j2;
          if (i6 > 1) {
            const indices0 = {};
            for (; i6--;) {
              let item0 = data9[i6];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j2 = indices0[item0];
                const err19 = {
                  instancePath: instancePath + '/verbalizes',
                  schemaPath: '#/properties/verbalizes/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i6, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i6 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
                break;
              }
              indices0[item0] = i6;
            }
          }
        } else {
          const err20 = { instancePath: instancePath + '/verbalizes', schemaPath: '#/properties/verbalizes/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data11 = data.annotations;
        if (data11 && typeof data11 == 'object' && !Array.isArray(data11)) {
        } else {
          const err21 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data12 = data.iri;
        if (typeof data12 === 'string') {
          if (func1(data12) < 1) {
            const err22 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        } else {
          const err23 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data13 = data.tessera_notes;
        if (typeof data13 === 'string') {
          if (func1(data13) > 10000) {
            const err24 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (func1(data13) < 1) {
            const err25 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        } else {
          const err26 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.tessera_ai_context !== undefined) {
        let data14 = data.tessera_ai_context;
        if (typeof data14 !== 'string' && !(data14 && typeof data14 == 'object' && !Array.isArray(data14))) {
          const err27 = {
            instancePath: instancePath + '/tessera_ai_context',
            schemaPath: '#/properties/tessera_ai_context/type',
            keyword: 'type',
            params: { type: RelationshipBetweenConceptsOntologySchema3.properties.tessera_ai_context.type },
            message: 'must be string,object',
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (typeof data14 === 'string') {
          if (func1(data14) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_ai_context',
              schemaPath: '#/properties/tessera_ai_context/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data14 && typeof data14 == 'object' && !Array.isArray(data14)) {
          for (const key1 in data14) {
            if (!(key1 === 'instructions' || key1 === 'synonyms' || key1 === 'examples')) {
              const err29 = {
                instancePath: instancePath + '/tessera_ai_context',
                schemaPath: '#/properties/tessera_ai_context/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
          if (data14.instructions !== undefined) {
            let data15 = data14.instructions;
            if (typeof data15 === 'string') {
              if (func1(data15) > 10000) {
                const err30 = {
                  instancePath: instancePath + '/tessera_ai_context/instructions',
                  schemaPath: '#/properties/tessera_ai_context/properties/instructions/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 10000 },
                  message: 'must NOT have more than 10000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            } else {
              const err31 = {
                instancePath: instancePath + '/tessera_ai_context/instructions',
                schemaPath: '#/properties/tessera_ai_context/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
          if (data14.synonyms !== undefined) {
            let data16 = data14.synonyms;
            if (Array.isArray(data16)) {
              const len4 = data16.length;
              for (let i7 = 0; i7 < len4; i7++) {
                let data17 = data16[i7];
                if (typeof data17 === 'string') {
                  if (func1(data17) > 10000) {
                    const err32 = {
                      instancePath: instancePath + '/tessera_ai_context/synonyms/' + i7,
                      schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                } else {
                  const err33 = {
                    instancePath: instancePath + '/tessera_ai_context/synonyms/' + i7,
                    schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
              }
            } else {
              const err34 = {
                instancePath: instancePath + '/tessera_ai_context/synonyms',
                schemaPath: '#/properties/tessera_ai_context/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
          if (data14.examples !== undefined) {
            let data18 = data14.examples;
            if (Array.isArray(data18)) {
              const len5 = data18.length;
              for (let i8 = 0; i8 < len5; i8++) {
                let data19 = data18[i8];
                if (typeof data19 === 'string') {
                  if (func1(data19) > 10000) {
                    const err35 = {
                      instancePath: instancePath + '/tessera_ai_context/examples/' + i8,
                      schemaPath: '#/properties/tessera_ai_context/properties/examples/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                } else {
                  const err36 = {
                    instancePath: instancePath + '/tessera_ai_context/examples/' + i8,
                    schemaPath: '#/properties/tessera_ai_context/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              }
            } else {
              const err37 = {
                instancePath: instancePath + '/tessera_ai_context/examples',
                schemaPath: '#/properties/tessera_ai_context/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
        }
      }
      if (data.tessera_governance !== undefined) {
        let data20 = data.tessera_governance;
        if (data20 && typeof data20 == 'object' && !Array.isArray(data20)) {
          if (data20.status !== undefined) {
            if (typeof data20.status !== 'string') {
              const err38 = {
                instancePath: instancePath + '/tessera_governance/status',
                schemaPath: '#/properties/tessera_governance/properties/status/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
          if (data20.owner !== undefined) {
            let data22 = data20.owner;
            if (typeof data22 === 'string') {
              if (func1(data22) > 200) {
                const err39 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
              if (func1(data22) < 1) {
                const err40 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            } else {
              const err41 = {
                instancePath: instancePath + '/tessera_governance/owner',
                schemaPath: '#/properties/tessera_governance/properties/owner/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          if (data20.steward !== undefined) {
            let data23 = data20.steward;
            if (typeof data23 === 'string') {
              if (func1(data23) > 200) {
                const err42 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              if (func1(data23) < 1) {
                const err43 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            } else {
              const err44 = {
                instancePath: instancePath + '/tessera_governance/steward',
                schemaPath: '#/properties/tessera_governance/properties/steward/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          }
          if (data20.classification !== undefined) {
            let data24 = data20.classification;
            if (typeof data24 === 'string') {
              if (func1(data24) > 200) {
                const err45 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (func1(data24) < 1) {
                const err46 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            } else {
              const err47 = {
                instancePath: instancePath + '/tessera_governance/classification',
                schemaPath: '#/properties/tessera_governance/properties/classification/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
          if (data20.replaced_by !== undefined) {
            let data25 = data20.replaced_by;
            if (typeof data25 === 'string') {
              if (func1(data25) < 1) {
                const err48 = {
                  instancePath: instancePath + '/tessera_governance/replaced_by',
                  schemaPath: '#/properties/tessera_governance/properties/replaced_by/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            } else {
              const err49 = {
                instancePath: instancePath + '/tessera_governance/replaced_by',
                schemaPath: '#/properties/tessera_governance/properties/replaced_by/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
          if (data20.deprecation_reason !== undefined) {
            let data26 = data20.deprecation_reason;
            if (typeof data26 === 'string') {
              if (func1(data26) > 2000) {
                const err50 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 2000 },
                  message: 'must NOT have more than 2000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (func1(data26) < 1) {
                const err51 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            } else {
              const err52 = {
                instancePath: instancePath + '/tessera_governance/deprecation_reason',
                schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
        } else {
          const err53 = {
            instancePath: instancePath + '/tessera_governance',
            schemaPath: '#/properties/tessera_governance/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err53];
          } else {
            vErrors.push(err53);
          }
          errors++;
        }
      }
    } else {
      const err54 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err54];
      } else {
        vErrors.push(err54);
      }
      errors++;
    }
    validate102.errors = vErrors;
    return errors === 0;
  }
  validate102.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate101(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate101.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.type === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'type' }, message: "must have required property '" + 'type' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(OntologyComponentDefinesSingleSchema3.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.type !== undefined) {
        let data1 = data.type;
        if (typeof data1 !== 'string') {
          const err5 = { instancePath: instancePath + '/type', schemaPath: '#/$defs/ConceptType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (!(data1 === 'EntityType' || data1 === 'ValueType')) {
          const err6 = {
            instancePath: instancePath + '/type',
            schemaPath: '#/$defs/ConceptType/enum',
            keyword: 'enum',
            params: { allowedValues: ConceptEitherEntityTypeSchema3.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err7 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.extends !== undefined) {
        let data3 = data.extends;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            let data4 = data3[i0];
            if (typeof data4 === 'string') {
              if (func1(data4) < 1) {
                const err8 = {
                  instancePath: instancePath + '/extends/' + i0,
                  schemaPath: '#/properties/extends/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            } else {
              const err9 = { instancePath: instancePath + '/extends/' + i0, schemaPath: '#/properties/extends/items/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          let i1 = data3.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data3[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err10 = {
                  instancePath: instancePath + '/extends',
                  schemaPath: '#/properties/extends/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err11 = { instancePath: instancePath + '/extends', schemaPath: '#/properties/extends/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data6 = data5[i2];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err12 = {
                  instancePath: instancePath + '/derived_by/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            } else {
              const err13 = { instancePath: instancePath + '/derived_by/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          let i3 = data5.length;
          let j1;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j1 = i3; j1--;) {
                if (func0(data5[i3], data5[j1])) {
                  const err14 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err15 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      if (data.identify_by !== undefined) {
        let data7 = data.identify_by;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i4 = 0; i4 < len2; i4++) {
            let data8 = data7[i4];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err16 = {
                  instancePath: instancePath + '/identify_by/' + i4,
                  schemaPath: '#/properties/identify_by/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/identify_by/' + i4,
                schemaPath: '#/properties/identify_by/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          let i5 = data7.length;
          let j2;
          if (i5 > 1) {
            const indices1 = {};
            for (; i5--;) {
              let item1 = data7[i5];
              if (typeof item1 !== 'string') {
                continue;
              }
              if (typeof indices1[item1] == 'number') {
                j2 = indices1[item1];
                const err18 = {
                  instancePath: instancePath + '/identify_by',
                  schemaPath: '#/properties/identify_by/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i5, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i5 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
                break;
              }
              indices1[item1] = i5;
            }
          }
        } else {
          const err19 = { instancePath: instancePath + '/identify_by', schemaPath: '#/properties/identify_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i6 = 0; i6 < len3; i6++) {
            let data10 = data9[i6];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err20 = {
                  instancePath: instancePath + '/requires/' + i6,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            } else {
              const err21 = { instancePath: instancePath + '/requires/' + i6, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          let i7 = data9.length;
          let j3;
          if (i7 > 1) {
            outer1: for (; i7--;) {
              for (j3 = i7; j3--;) {
                if (func0(data9[i7], data9[j3])) {
                  const err22 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i7, j: j3 },
                    message: 'must NOT have duplicate items (items ## ' + j3 + ' and ' + i7 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.relationships !== undefined) {
        let data11 = data.relationships;
        if (Array.isArray(data11)) {
          const len4 = data11.length;
          for (let i8 = 0; i8 < len4; i8++) {
            if (!validate102(data11[i8], { instancePath: instancePath + '/relationships/' + i8, parentData: data11, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate102.errors : vErrors.concat(validate102.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/relationships', schemaPath: '#/properties/relationships/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data13 = data.annotations;
        if (data13 && typeof data13 == 'object' && !Array.isArray(data13)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data14 = data.iri;
        if (typeof data14 === 'string') {
          if (func1(data14) < 1) {
            const err26 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        } else {
          const err27 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data15 = data.tessera_notes;
        if (typeof data15 === 'string') {
          if (func1(data15) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          if (func1(data15) < 1) {
            const err29 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        } else {
          const err30 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
      if (data.tessera_attributes !== undefined) {
        let data16 = data.tessera_attributes;
        if (Array.isArray(data16)) {
          if (data16.length > 200) {
            const err31 = {
              instancePath: instancePath + '/tessera_attributes',
              schemaPath: '#/properties/tessera_attributes/maxItems',
              keyword: 'maxItems',
              params: { limit: 200 },
              message: 'must NOT have more than 200 items',
            };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
          const len5 = data16.length;
          for (let i9 = 0; i9 < len5; i9++) {
            let data17 = data16[i9];
            if (typeof data17 === 'string') {
              if (func1(data17) < 1) {
                const err32 = {
                  instancePath: instancePath + '/tessera_attributes/' + i9,
                  schemaPath: '#/properties/tessera_attributes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            } else {
              const err33 = {
                instancePath: instancePath + '/tessera_attributes/' + i9,
                schemaPath: '#/properties/tessera_attributes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
        } else {
          const err34 = {
            instancePath: instancePath + '/tessera_attributes',
            schemaPath: '#/properties/tessera_attributes/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
      if (data.tessera_ai_context !== undefined) {
        let data18 = data.tessera_ai_context;
        if (typeof data18 !== 'string' && !(data18 && typeof data18 == 'object' && !Array.isArray(data18))) {
          const err35 = {
            instancePath: instancePath + '/tessera_ai_context',
            schemaPath: '#/properties/tessera_ai_context/type',
            keyword: 'type',
            params: { type: OntologyComponentDefinesSingleSchema3.properties.tessera_ai_context.type },
            message: 'must be string,object',
          };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        if (typeof data18 === 'string') {
          if (func1(data18) > 10000) {
            const err36 = {
              instancePath: instancePath + '/tessera_ai_context',
              schemaPath: '#/properties/tessera_ai_context/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data18 && typeof data18 == 'object' && !Array.isArray(data18)) {
          for (const key1 in data18) {
            if (!(key1 === 'instructions' || key1 === 'synonyms' || key1 === 'examples')) {
              const err37 = {
                instancePath: instancePath + '/tessera_ai_context',
                schemaPath: '#/properties/tessera_ai_context/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
          if (data18.instructions !== undefined) {
            let data19 = data18.instructions;
            if (typeof data19 === 'string') {
              if (func1(data19) > 10000) {
                const err38 = {
                  instancePath: instancePath + '/tessera_ai_context/instructions',
                  schemaPath: '#/properties/tessera_ai_context/properties/instructions/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 10000 },
                  message: 'must NOT have more than 10000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            } else {
              const err39 = {
                instancePath: instancePath + '/tessera_ai_context/instructions',
                schemaPath: '#/properties/tessera_ai_context/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
          if (data18.synonyms !== undefined) {
            let data20 = data18.synonyms;
            if (Array.isArray(data20)) {
              const len6 = data20.length;
              for (let i10 = 0; i10 < len6; i10++) {
                let data21 = data20[i10];
                if (typeof data21 === 'string') {
                  if (func1(data21) > 10000) {
                    const err40 = {
                      instancePath: instancePath + '/tessera_ai_context/synonyms/' + i10,
                      schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                } else {
                  const err41 = {
                    instancePath: instancePath + '/tessera_ai_context/synonyms/' + i10,
                    schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              }
            } else {
              const err42 = {
                instancePath: instancePath + '/tessera_ai_context/synonyms',
                schemaPath: '#/properties/tessera_ai_context/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          }
          if (data18.examples !== undefined) {
            let data22 = data18.examples;
            if (Array.isArray(data22)) {
              const len7 = data22.length;
              for (let i11 = 0; i11 < len7; i11++) {
                let data23 = data22[i11];
                if (typeof data23 === 'string') {
                  if (func1(data23) > 10000) {
                    const err43 = {
                      instancePath: instancePath + '/tessera_ai_context/examples/' + i11,
                      schemaPath: '#/properties/tessera_ai_context/properties/examples/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                } else {
                  const err44 = {
                    instancePath: instancePath + '/tessera_ai_context/examples/' + i11,
                    schemaPath: '#/properties/tessera_ai_context/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              }
            } else {
              const err45 = {
                instancePath: instancePath + '/tessera_ai_context/examples',
                schemaPath: '#/properties/tessera_ai_context/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
          }
        }
      }
      if (data.tessera_governance !== undefined) {
        let data24 = data.tessera_governance;
        if (data24 && typeof data24 == 'object' && !Array.isArray(data24)) {
          if (data24.status !== undefined) {
            if (typeof data24.status !== 'string') {
              const err46 = {
                instancePath: instancePath + '/tessera_governance/status',
                schemaPath: '#/properties/tessera_governance/properties/status/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
          }
          if (data24.owner !== undefined) {
            let data26 = data24.owner;
            if (typeof data26 === 'string') {
              if (func1(data26) > 200) {
                const err47 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              if (func1(data26) < 1) {
                const err48 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            } else {
              const err49 = {
                instancePath: instancePath + '/tessera_governance/owner',
                schemaPath: '#/properties/tessera_governance/properties/owner/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
          if (data24.steward !== undefined) {
            let data27 = data24.steward;
            if (typeof data27 === 'string') {
              if (func1(data27) > 200) {
                const err50 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (func1(data27) < 1) {
                const err51 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            } else {
              const err52 = {
                instancePath: instancePath + '/tessera_governance/steward',
                schemaPath: '#/properties/tessera_governance/properties/steward/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
          if (data24.classification !== undefined) {
            let data28 = data24.classification;
            if (typeof data28 === 'string') {
              if (func1(data28) > 200) {
                const err53 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err53];
                } else {
                  vErrors.push(err53);
                }
                errors++;
              }
              if (func1(data28) < 1) {
                const err54 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            } else {
              const err55 = {
                instancePath: instancePath + '/tessera_governance/classification',
                schemaPath: '#/properties/tessera_governance/properties/classification/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err55];
              } else {
                vErrors.push(err55);
              }
              errors++;
            }
          }
          if (data24.replaced_by !== undefined) {
            let data29 = data24.replaced_by;
            if (typeof data29 === 'string') {
              if (func1(data29) < 1) {
                const err56 = {
                  instancePath: instancePath + '/tessera_governance/replaced_by',
                  schemaPath: '#/properties/tessera_governance/properties/replaced_by/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            } else {
              const err57 = {
                instancePath: instancePath + '/tessera_governance/replaced_by',
                schemaPath: '#/properties/tessera_governance/properties/replaced_by/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          }
          if (data24.deprecation_reason !== undefined) {
            let data30 = data24.deprecation_reason;
            if (typeof data30 === 'string') {
              if (func1(data30) > 2000) {
                const err58 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 2000 },
                  message: 'must NOT have more than 2000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
              if (func1(data30) < 1) {
                const err59 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            } else {
              const err60 = {
                instancePath: instancePath + '/tessera_governance/deprecation_reason',
                schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
          }
        } else {
          const err61 = {
            instancePath: instancePath + '/tessera_governance',
            schemaPath: '#/properties/tessera_governance/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err61];
          } else {
            vErrors.push(err61);
          }
          errors++;
        }
      }
    } else {
      const err62 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err62];
      } else {
        vErrors.push(err62);
      }
      errors++;
    }
    validate101.errors = vErrors;
    return errors === 0;
  }
  validate101.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MapConstructsLogicalModelSchema3 = {
    type: 'object',
    description: 'Map from the constructs of some logical model to some ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
      description: { type: 'string', description: 'Human-readable description of this ontology map' },
      semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
      concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
    },
    required: ['semantic_model', 'concept_mappings'],
    additionalProperties: false,
  };
  const MappingsLogicalModelConstructsSchema3 = {
    type: 'object',
    description: 'Mappings from logical model constructs to some ontology component',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
      object_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/ObjectMapping' },
        description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
      },
      link_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/LinkMapping' },
        description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
      },
    },
    required: ['concept'],
    anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
    additionalProperties: false,
  };
  const PatternLogicalLevelExpressionsSchema3 = {
    type: 'object',
    description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
      expression: { $ref: '#/$defs/Expression' },
    },
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const MappingLogicalModelConstructsSchema3 = {
    type: 'object',
    description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
      expression: { $ref: '#/$defs/Expression' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
    },
    required: ['relationship'],
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const wrapper4 = { validate: validate111 };

  function validate111(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate111.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.relationship === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'relationship' }, message: "must have required property '" + 'relationship' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'expression' || key0 === 'referent_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data1 = data.expression;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err7 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        } else {
          const err8 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data2 = data.referent_mappings;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err9 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper4.validate(data2[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper4.validate.errors : vErrors.concat(wrapper4.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate111.errors = vErrors;
    return errors === 0;
  }
  validate111.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate110(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate110.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'referent_mappings' || key0 === 'expression')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err4 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data1 = data.referent_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err6 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate111(data1[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate111.errors : vErrors.concat(validate111.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data3 = data.expression;
        if (typeof data3 === 'string') {
          if (func1(data3) < 1) {
            const err8 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
    } else {
      const err10 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    validate110.errors = vErrors;
    return errors === 0;
  }
  validate110.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MappingLogicalSchemaLinksSchema3 = {
    type: 'object',
    description: 'Mapping from logical schema to the links of relationships in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
      object_mapping: { $ref: '#/$defs/ObjectMapping' },
      children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
    },
    required: ['object_mapping'],
    additionalProperties: false,
  };
  const wrapper5 = { validate: validate114 };

  function validate114(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate114.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mapping === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'object_mapping' }, message: "must have required property '" + 'object_mapping' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'object_mapping' || key0 === 'children')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.object_mapping !== undefined) {
        if (!validate110(data.object_mapping, { instancePath: instancePath + '/object_mapping', parentData: data, parentDataProperty: 'object_mapping', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
          errors = vErrors.length;
        }
      }
      if (data.children !== undefined) {
        let data2 = data.children;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper5.validate(data2[i0], { instancePath: instancePath + '/children/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper5.validate.errors : vErrors.concat(wrapper5.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err4 = { instancePath: instancePath + '/children', schemaPath: '#/properties/children/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
    } else {
      const err5 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    validate114.errors = vErrors;
    return errors === 0;
  }
  validate114.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate109(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate109.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mappings === undefined) {
        const err0 = {
          instancePath,
          schemaPath: '#/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: 'object_mappings' },
          message: "must have required property '" + 'object_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.link_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'link_mappings' },
          message: "must have required property '" + 'link_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'object_mappings' || key0 === 'link_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.object_mappings !== undefined) {
        let data1 = data.object_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err7 = {
              instancePath: instancePath + '/object_mappings',
              schemaPath: '#/properties/object_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate110(data1[i0], { instancePath: instancePath + '/object_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate110.errors : vErrors.concat(validate110.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err8 = { instancePath: instancePath + '/object_mappings', schemaPath: '#/properties/object_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.link_mappings !== undefined) {
        let data3 = data.link_mappings;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err9 = {
              instancePath: instancePath + '/link_mappings',
              schemaPath: '#/properties/link_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len1 = data3.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (!validate114(data3[i1], { instancePath: instancePath + '/link_mappings/' + i1, parentData: data3, parentDataProperty: i1, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate114.errors : vErrors.concat(validate114.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/link_mappings', schemaPath: '#/properties/link_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate109.errors = vErrors;
    return errors === 0;
  }
  validate109.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate107(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate107.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.semantic_model === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'semantic_model' }, message: "must have required property '" + 'semantic_model' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.concept_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'concept_mappings' },
          message: "must have required property '" + 'concept_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'description' || key0 === 'semantic_model' || key0 === 'concept_mappings')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.semantic_model !== undefined) {
        if (!validate22(data.semantic_model, { instancePath: instancePath + '/semantic_model', parentData: data, parentDataProperty: 'semantic_model', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
      if (data.concept_mappings !== undefined) {
        let data3 = data.concept_mappings;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate109(data3[i0], { instancePath: instancePath + '/concept_mappings/' + i0, parentData: data3, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate109.errors : vErrors.concat(validate109.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept_mappings', schemaPath: '#/properties/concept_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate107.errors = vErrors;
    return errors === 0;
  }
  validate107.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate100(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="urn:semantic-workbench:tessera-ontology:2:ossie-0.3.0.dev0" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate100.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.tessera === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'tessera' }, message: "must have required property '" + 'tessera' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.version === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      if (data.ontology === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'ontology' }, message: "must have required property '" + 'ontology' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(tesseraOntologyRevisionTwoDraft030Schema.properties, key0)) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data0 = data.version;
        if (typeof data0 !== 'string') {
          const err5 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data0) {
          const err6 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err7 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        } else {
          const err8 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err9 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data3 = data.ai_context;
        const _errs11 = errors;
        let valid2 = false;
        let passing0 = null;
        const _errs12 = errors;
        if (typeof data3 !== 'string') {
          const err10 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/0/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        var _valid0 = _errs12 === errors;
        if (_valid0) {
          valid2 = true;
          passing0 = 0;
        }
        const _errs14 = errors;
        if (data3 && typeof data3 == 'object' && !Array.isArray(data3)) {
          if (data3.instructions !== undefined) {
            if (typeof data3.instructions !== 'string') {
              const err11 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data3.synonyms !== undefined) {
            let data5 = data3.synonyms;
            if (Array.isArray(data5)) {
              const len0 = data5.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data5[i0] !== 'string') {
                  const err12 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
              }
            } else {
              const err13 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          if (data3.examples !== undefined) {
            let data7 = data3.examples;
            if (Array.isArray(data7)) {
              const len1 = data7.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data7[i1] !== 'string') {
                  const err14 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
              }
            } else {
              const err15 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        } else {
          const err16 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        var _valid0 = _errs14 === errors;
        if (_valid0 && valid2) {
          valid2 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid0) {
            valid2 = true;
            passing0 = 1;
          }
        }
        if (!valid2) {
          const err17 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        } else {
          errors = _errs11;
          if (vErrors !== null) {
            if (_errs11) {
              vErrors.length = _errs11;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len2 = data9.length;
          for (let i2 = 0; i2 < len2; i2++) {
            let data10 = data9[i2];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err18 = {
                  instancePath: instancePath + '/requires/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            } else {
              const err19 = { instancePath: instancePath + '/requires/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
          let i3 = data9.length;
          let j0;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j0 = i3; j0--;) {
                if (func0(data9[i3], data9[j0])) {
                  const err20 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err21 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.ontology !== undefined) {
        let data11 = data.ontology;
        if (Array.isArray(data11)) {
          if (data11.length < 1) {
            const err22 = {
              instancePath: instancePath + '/ontology',
              schemaPath: '#/properties/ontology/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          const len3 = data11.length;
          for (let i4 = 0; i4 < len3; i4++) {
            if (!validate101(data11[i4], { instancePath: instancePath + '/ontology/' + i4, parentData: data11, parentDataProperty: i4, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate101.errors : vErrors.concat(validate101.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/ontology', schemaPath: '#/properties/ontology/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.ontology_mappings !== undefined) {
        let data13 = data.ontology_mappings;
        if (Array.isArray(data13)) {
          const len4 = data13.length;
          for (let i5 = 0; i5 < len4; i5++) {
            if (!validate107(data13[i5], { instancePath: instancePath + '/ontology_mappings/' + i5, parentData: data13, parentDataProperty: i5, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate107.errors : vErrors.concat(validate107.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/ontology_mappings', schemaPath: '#/properties/ontology_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data15 = data.annotations;
        if (data15 && typeof data15 == 'object' && !Array.isArray(data15)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.prefixes !== undefined) {
        let data16 = data.prefixes;
        if (data16 && typeof data16 == 'object' && !Array.isArray(data16)) {
          for (const key1 in data16) {
            let data17 = data16[key1];
            if (typeof data17 === 'string') {
              if (func1(data17) < 1) {
                const err26 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              if (!formats0.test(data17)) {
                const err27 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/format',
                  keyword: 'format',
                  params: { format: 'iri' },
                  message: 'must match format "' + 'iri' + '"',
                };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            } else {
              const err28 = {
                instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                schemaPath: '#/properties/prefixes/additionalProperties/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          }
        } else {
          const err29 = { instancePath: instancePath + '/prefixes', schemaPath: '#/properties/prefixes/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      }
      if (data.tessera !== undefined) {
        let data18 = data.tessera;
        if (!(typeof data18 == 'number' && !(data18 % 1) && !isNaN(data18))) {
          const err30 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/type', keyword: 'type', params: { type: 'integer' }, message: 'must be integer' };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        if (2 !== data18) {
          const err31 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/const', keyword: 'const', params: { allowedValue: 2 }, message: 'must be equal to constant' };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data19 = data.tessera_notes;
        if (typeof data19 === 'string') {
          if (func1(data19) > 10000) {
            const err32 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          if (func1(data19) < 1) {
            const err33 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        } else {
          const err34 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
    } else {
      const err35 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err35];
      } else {
        vErrors.push(err35);
      }
      errors++;
    }
    validate100.errors = vErrors;
    return errors === 0;
  }
  validate100.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const tesseraPartDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:semantic-workbench:tessera-part:3:ossie-0.3.0.dev0',
    $comment: 'Workbench ontology fragment schema derived from the pinned Ossie ontology schema.',
    type: 'object',
    additionalProperties: false,
    required: ['tessera', 'tessera_part', 'ontology'],
    properties: {
      tessera: { type: 'integer', const: 3, description: 'Marks the document as Tessera revision 3.' },
      tessera_part: { const: true, description: 'Tessera addition since revision 3: the part marker.' },
      ontology: { type: 'array', items: { $ref: '#/$defs/OntologyComponent' }, minItems: 0, description: 'Components that define the concepts and relationships in this ontology' },
    },
    $defs: {
      Annotations: {
        type: 'object',
        description:
          'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
        additionalProperties: true,
      },
      OntologyComponent: {
        type: 'object',
        description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
          type: { $ref: '#/$defs/ConceptType' },
          description: { type: 'string', description: 'Human-readable description of the concept' },
          extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
          tessera_attributes: {
            type: 'array',
            maxItems: 200,
            items: { type: 'string', minLength: 1 },
            description: 'Tessera addition since revision 2: a list of at most 200 relationship names of the concept, in the order they are shown.',
          },
          tessera_ai_context: {
            type: ['string', 'object'],
            maxLength: 10000,
            properties: {
              instructions: { type: 'string', maxLength: 10000 },
              synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
              examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
            },
            additionalProperties: false,
            description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
          },
          tessera_governance: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              owner: { type: 'string', minLength: 1, maxLength: 200 },
              steward: { type: 'string', minLength: 1, maxLength: 200 },
              classification: { type: 'string', minLength: 1, maxLength: 200 },
              replaced_by: { type: 'string', minLength: 1 },
              deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
            },
            description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
          },
        },
        required: ['concept', 'type'],
        additionalProperties: false,
      },
      Expression: { type: 'string', minLength: 1, description: 'ANSI SQL expression' },
      Relationship: {
        type: 'object',
        description: 'Relationship between concepts in the ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
          description: { type: 'string', description: 'Human-readable description of the relationship' },
          roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
          multiplicity: { $ref: '#/$defs/Multiplicity' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
          verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
          tessera_ai_context: {
            type: ['string', 'object'],
            maxLength: 10000,
            properties: {
              instructions: { type: 'string', maxLength: 10000 },
              synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
              examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
            },
            additionalProperties: false,
            description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
          },
          tessera_governance: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              owner: { type: 'string', minLength: 1, maxLength: 200 },
              steward: { type: 'string', minLength: 1, maxLength: 200 },
              classification: { type: 'string', minLength: 1, maxLength: 200 },
              replaced_by: { type: 'string', minLength: 1 },
              deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
            },
            description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
          },
        },
        required: ['name', 'verbalizes'],
        additionalProperties: false,
      },
      ConceptMapping: {
        type: 'object',
        description: 'Mappings from logical model constructs to some ontology component',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
          object_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/ObjectMapping' },
            description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
          },
          link_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/LinkMapping' },
            description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
          },
        },
        required: ['concept'],
        anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
        additionalProperties: false,
      },
      ConceptType: { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' },
      ReferentMapping: {
        type: 'object',
        description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
          expression: { $ref: '#/$defs/Expression' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
        },
        required: ['relationship'],
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      Role: {
        type: 'object',
        description: 'Role in some relationship (the container)',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
          name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
        },
        required: ['concept'],
        additionalProperties: false,
      },
      ObjectMapping: {
        type: 'object',
        description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
          expression: { $ref: '#/$defs/Expression' },
        },
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      LinkMapping: {
        type: 'object',
        description: 'Mapping from logical schema to the links of relationships in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
          object_mapping: { $ref: '#/$defs/ObjectMapping' },
          children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
        },
        required: ['object_mapping'],
        additionalProperties: false,
      },
      Multiplicity: { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' },
      OntologyMap: {
        type: 'object',
        description: 'Map from the constructs of some logical model to some ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
          description: { type: 'string', description: 'Human-readable description of this ontology map' },
          semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
          concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
        },
        required: ['semantic_model', 'concept_mappings'],
        additionalProperties: false,
      },
    },
  };
  const OntologyComponentDefinesSingleSchema4 = {
    type: 'object',
    description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
      type: { $ref: '#/$defs/ConceptType' },
      description: { type: 'string', description: 'Human-readable description of the concept' },
      extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
      relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_attributes: {
        type: 'array',
        maxItems: 200,
        items: { type: 'string', minLength: 1 },
        description: 'Tessera addition since revision 2: a list of at most 200 relationship names of the concept, in the order they are shown.',
      },
      tessera_ai_context: {
        type: ['string', 'object'],
        maxLength: 10000,
        properties: {
          instructions: { type: 'string', maxLength: 10000 },
          synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
          examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        },
        additionalProperties: false,
        description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
      },
      tessera_governance: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner: { type: 'string', minLength: 1, maxLength: 200 },
          steward: { type: 'string', minLength: 1, maxLength: 200 },
          classification: { type: 'string', minLength: 1, maxLength: 200 },
          replaced_by: { type: 'string', minLength: 1 },
          deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
      },
    },
    required: ['concept', 'type'],
    additionalProperties: false,
  };
  const ConceptEitherEntityTypeSchema4 = { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' };
  const ANSISQLExpressionSchema = { type: 'string', minLength: 1, description: 'ANSI SQL expression' };
  const OpenSetAnnotationsCarryingSchema = {
    type: 'object',
    description:
      'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
    additionalProperties: true,
  };
  const RelationshipBetweenConceptsOntologySchema4 = {
    type: 'object',
    description: 'Relationship between concepts in the ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
      description: { type: 'string', description: 'Human-readable description of the relationship' },
      roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
      multiplicity: { $ref: '#/$defs/Multiplicity' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
      verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_ai_context: {
        type: ['string', 'object'],
        maxLength: 10000,
        properties: {
          instructions: { type: 'string', maxLength: 10000 },
          synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
          examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        },
        additionalProperties: false,
        description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
      },
      tessera_governance: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner: { type: 'string', minLength: 1, maxLength: 200 },
          steward: { type: 'string', minLength: 1, maxLength: 200 },
          classification: { type: 'string', minLength: 1, maxLength: 200 },
          replaced_by: { type: 'string', minLength: 1 },
          deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
      },
    },
    required: ['name', 'verbalizes'],
    additionalProperties: false,
  };
  const RelationshipMultiplicitySchema4 = { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' };
  const RoleRelationshipContainerSchema4 = {
    type: 'object',
    description: 'Role in some relationship (the container)',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
      name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
    },
    required: ['concept'],
    additionalProperties: false,
  };

  function validate122(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate122.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'name' || key0 === 'annotations')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err4 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data2 = data.annotations;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        } else {
          const err6 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate122.errors = vErrors;
    return errors === 0;
  }
  validate122.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate121(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate121.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.verbalizes === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'verbalizes' }, message: "must have required property '" + 'verbalizes' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(RelationshipBetweenConceptsOntologySchema4.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.roles !== undefined) {
        let data2 = data.roles;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate122(data2[i0], { instancePath: instancePath + '/roles/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate122.errors : vErrors.concat(validate122.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/roles', schemaPath: '#/properties/roles/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.multiplicity !== undefined) {
        let data4 = data.multiplicity;
        if (typeof data4 !== 'string') {
          const err7 = { instancePath: instancePath + '/multiplicity', schemaPath: '#/$defs/Multiplicity/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!(data4 === 'ManyToOne' || data4 === 'OneToOne')) {
          const err8 = {
            instancePath: instancePath + '/multiplicity',
            schemaPath: '#/$defs/Multiplicity/enum',
            keyword: 'enum',
            params: { allowedValues: RelationshipMultiplicitySchema4.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data6 = data5[i1];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err9 = {
                  instancePath: instancePath + '/derived_by/' + i1,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = { instancePath: instancePath + '/derived_by/' + i1, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          let i2 = data5.length;
          let j0;
          if (i2 > 1) {
            outer0: for (; i2--;) {
              for (j0 = i2; j0--;) {
                if (func0(data5[i2], data5[j0])) {
                  const err11 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i2, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i2 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err12 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data7 = data.requires;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i3 = 0; i3 < len2; i3++) {
            let data8 = data7[i3];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err13 = {
                  instancePath: instancePath + '/requires/' + i3,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            } else {
              const err14 = { instancePath: instancePath + '/requires/' + i3, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          let i4 = data7.length;
          let j1;
          if (i4 > 1) {
            outer1: for (; i4--;) {
              for (j1 = i4; j1--;) {
                if (func0(data7[i4], data7[j1])) {
                  const err15 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i4, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.verbalizes !== undefined) {
        let data9 = data.verbalizes;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i5 = 0; i5 < len3; i5++) {
            let data10 = data9[i5];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err17 = {
                  instancePath: instancePath + '/verbalizes/' + i5,
                  schemaPath: '#/properties/verbalizes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = {
                instancePath: instancePath + '/verbalizes/' + i5,
                schemaPath: '#/properties/verbalizes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          let i6 = data9.length;
          let j2;
          if (i6 > 1) {
            const indices0 = {};
            for (; i6--;) {
              let item0 = data9[i6];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j2 = indices0[item0];
                const err19 = {
                  instancePath: instancePath + '/verbalizes',
                  schemaPath: '#/properties/verbalizes/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i6, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i6 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
                break;
              }
              indices0[item0] = i6;
            }
          }
        } else {
          const err20 = { instancePath: instancePath + '/verbalizes', schemaPath: '#/properties/verbalizes/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data11 = data.annotations;
        if (data11 && typeof data11 == 'object' && !Array.isArray(data11)) {
        } else {
          const err21 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data12 = data.iri;
        if (typeof data12 === 'string') {
          if (func1(data12) < 1) {
            const err22 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        } else {
          const err23 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data13 = data.tessera_notes;
        if (typeof data13 === 'string') {
          if (func1(data13) > 10000) {
            const err24 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (func1(data13) < 1) {
            const err25 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        } else {
          const err26 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.tessera_ai_context !== undefined) {
        let data14 = data.tessera_ai_context;
        if (typeof data14 !== 'string' && !(data14 && typeof data14 == 'object' && !Array.isArray(data14))) {
          const err27 = {
            instancePath: instancePath + '/tessera_ai_context',
            schemaPath: '#/properties/tessera_ai_context/type',
            keyword: 'type',
            params: { type: RelationshipBetweenConceptsOntologySchema4.properties.tessera_ai_context.type },
            message: 'must be string,object',
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (typeof data14 === 'string') {
          if (func1(data14) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_ai_context',
              schemaPath: '#/properties/tessera_ai_context/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data14 && typeof data14 == 'object' && !Array.isArray(data14)) {
          for (const key1 in data14) {
            if (!(key1 === 'instructions' || key1 === 'synonyms' || key1 === 'examples')) {
              const err29 = {
                instancePath: instancePath + '/tessera_ai_context',
                schemaPath: '#/properties/tessera_ai_context/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
          if (data14.instructions !== undefined) {
            let data15 = data14.instructions;
            if (typeof data15 === 'string') {
              if (func1(data15) > 10000) {
                const err30 = {
                  instancePath: instancePath + '/tessera_ai_context/instructions',
                  schemaPath: '#/properties/tessera_ai_context/properties/instructions/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 10000 },
                  message: 'must NOT have more than 10000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            } else {
              const err31 = {
                instancePath: instancePath + '/tessera_ai_context/instructions',
                schemaPath: '#/properties/tessera_ai_context/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
          if (data14.synonyms !== undefined) {
            let data16 = data14.synonyms;
            if (Array.isArray(data16)) {
              const len4 = data16.length;
              for (let i7 = 0; i7 < len4; i7++) {
                let data17 = data16[i7];
                if (typeof data17 === 'string') {
                  if (func1(data17) > 10000) {
                    const err32 = {
                      instancePath: instancePath + '/tessera_ai_context/synonyms/' + i7,
                      schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                } else {
                  const err33 = {
                    instancePath: instancePath + '/tessera_ai_context/synonyms/' + i7,
                    schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
              }
            } else {
              const err34 = {
                instancePath: instancePath + '/tessera_ai_context/synonyms',
                schemaPath: '#/properties/tessera_ai_context/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
          if (data14.examples !== undefined) {
            let data18 = data14.examples;
            if (Array.isArray(data18)) {
              const len5 = data18.length;
              for (let i8 = 0; i8 < len5; i8++) {
                let data19 = data18[i8];
                if (typeof data19 === 'string') {
                  if (func1(data19) > 10000) {
                    const err35 = {
                      instancePath: instancePath + '/tessera_ai_context/examples/' + i8,
                      schemaPath: '#/properties/tessera_ai_context/properties/examples/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                } else {
                  const err36 = {
                    instancePath: instancePath + '/tessera_ai_context/examples/' + i8,
                    schemaPath: '#/properties/tessera_ai_context/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              }
            } else {
              const err37 = {
                instancePath: instancePath + '/tessera_ai_context/examples',
                schemaPath: '#/properties/tessera_ai_context/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
        }
      }
      if (data.tessera_governance !== undefined) {
        let data20 = data.tessera_governance;
        if (data20 && typeof data20 == 'object' && !Array.isArray(data20)) {
          if (data20.status !== undefined) {
            if (typeof data20.status !== 'string') {
              const err38 = {
                instancePath: instancePath + '/tessera_governance/status',
                schemaPath: '#/properties/tessera_governance/properties/status/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
          if (data20.owner !== undefined) {
            let data22 = data20.owner;
            if (typeof data22 === 'string') {
              if (func1(data22) > 200) {
                const err39 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
              if (func1(data22) < 1) {
                const err40 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            } else {
              const err41 = {
                instancePath: instancePath + '/tessera_governance/owner',
                schemaPath: '#/properties/tessera_governance/properties/owner/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          if (data20.steward !== undefined) {
            let data23 = data20.steward;
            if (typeof data23 === 'string') {
              if (func1(data23) > 200) {
                const err42 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              if (func1(data23) < 1) {
                const err43 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            } else {
              const err44 = {
                instancePath: instancePath + '/tessera_governance/steward',
                schemaPath: '#/properties/tessera_governance/properties/steward/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          }
          if (data20.classification !== undefined) {
            let data24 = data20.classification;
            if (typeof data24 === 'string') {
              if (func1(data24) > 200) {
                const err45 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (func1(data24) < 1) {
                const err46 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            } else {
              const err47 = {
                instancePath: instancePath + '/tessera_governance/classification',
                schemaPath: '#/properties/tessera_governance/properties/classification/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
          if (data20.replaced_by !== undefined) {
            let data25 = data20.replaced_by;
            if (typeof data25 === 'string') {
              if (func1(data25) < 1) {
                const err48 = {
                  instancePath: instancePath + '/tessera_governance/replaced_by',
                  schemaPath: '#/properties/tessera_governance/properties/replaced_by/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            } else {
              const err49 = {
                instancePath: instancePath + '/tessera_governance/replaced_by',
                schemaPath: '#/properties/tessera_governance/properties/replaced_by/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
          if (data20.deprecation_reason !== undefined) {
            let data26 = data20.deprecation_reason;
            if (typeof data26 === 'string') {
              if (func1(data26) > 2000) {
                const err50 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 2000 },
                  message: 'must NOT have more than 2000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (func1(data26) < 1) {
                const err51 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            } else {
              const err52 = {
                instancePath: instancePath + '/tessera_governance/deprecation_reason',
                schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
        } else {
          const err53 = {
            instancePath: instancePath + '/tessera_governance',
            schemaPath: '#/properties/tessera_governance/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err53];
          } else {
            vErrors.push(err53);
          }
          errors++;
        }
      }
    } else {
      const err54 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err54];
      } else {
        vErrors.push(err54);
      }
      errors++;
    }
    validate121.errors = vErrors;
    return errors === 0;
  }
  validate121.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate120(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate120.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.type === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'type' }, message: "must have required property '" + 'type' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(OntologyComponentDefinesSingleSchema4.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.type !== undefined) {
        let data1 = data.type;
        if (typeof data1 !== 'string') {
          const err5 = { instancePath: instancePath + '/type', schemaPath: '#/$defs/ConceptType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (!(data1 === 'EntityType' || data1 === 'ValueType')) {
          const err6 = {
            instancePath: instancePath + '/type',
            schemaPath: '#/$defs/ConceptType/enum',
            keyword: 'enum',
            params: { allowedValues: ConceptEitherEntityTypeSchema4.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err7 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.extends !== undefined) {
        let data3 = data.extends;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            let data4 = data3[i0];
            if (typeof data4 === 'string') {
              if (func1(data4) < 1) {
                const err8 = {
                  instancePath: instancePath + '/extends/' + i0,
                  schemaPath: '#/properties/extends/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            } else {
              const err9 = { instancePath: instancePath + '/extends/' + i0, schemaPath: '#/properties/extends/items/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          let i1 = data3.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data3[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err10 = {
                  instancePath: instancePath + '/extends',
                  schemaPath: '#/properties/extends/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err11 = { instancePath: instancePath + '/extends', schemaPath: '#/properties/extends/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data6 = data5[i2];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err12 = {
                  instancePath: instancePath + '/derived_by/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            } else {
              const err13 = { instancePath: instancePath + '/derived_by/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          let i3 = data5.length;
          let j1;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j1 = i3; j1--;) {
                if (func0(data5[i3], data5[j1])) {
                  const err14 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err15 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      if (data.identify_by !== undefined) {
        let data7 = data.identify_by;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i4 = 0; i4 < len2; i4++) {
            let data8 = data7[i4];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err16 = {
                  instancePath: instancePath + '/identify_by/' + i4,
                  schemaPath: '#/properties/identify_by/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/identify_by/' + i4,
                schemaPath: '#/properties/identify_by/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          let i5 = data7.length;
          let j2;
          if (i5 > 1) {
            const indices1 = {};
            for (; i5--;) {
              let item1 = data7[i5];
              if (typeof item1 !== 'string') {
                continue;
              }
              if (typeof indices1[item1] == 'number') {
                j2 = indices1[item1];
                const err18 = {
                  instancePath: instancePath + '/identify_by',
                  schemaPath: '#/properties/identify_by/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i5, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i5 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
                break;
              }
              indices1[item1] = i5;
            }
          }
        } else {
          const err19 = { instancePath: instancePath + '/identify_by', schemaPath: '#/properties/identify_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i6 = 0; i6 < len3; i6++) {
            let data10 = data9[i6];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err20 = {
                  instancePath: instancePath + '/requires/' + i6,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            } else {
              const err21 = { instancePath: instancePath + '/requires/' + i6, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          let i7 = data9.length;
          let j3;
          if (i7 > 1) {
            outer1: for (; i7--;) {
              for (j3 = i7; j3--;) {
                if (func0(data9[i7], data9[j3])) {
                  const err22 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i7, j: j3 },
                    message: 'must NOT have duplicate items (items ## ' + j3 + ' and ' + i7 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.relationships !== undefined) {
        let data11 = data.relationships;
        if (Array.isArray(data11)) {
          const len4 = data11.length;
          for (let i8 = 0; i8 < len4; i8++) {
            if (!validate121(data11[i8], { instancePath: instancePath + '/relationships/' + i8, parentData: data11, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate121.errors : vErrors.concat(validate121.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/relationships', schemaPath: '#/properties/relationships/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data13 = data.annotations;
        if (data13 && typeof data13 == 'object' && !Array.isArray(data13)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data14 = data.iri;
        if (typeof data14 === 'string') {
          if (func1(data14) < 1) {
            const err26 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        } else {
          const err27 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data15 = data.tessera_notes;
        if (typeof data15 === 'string') {
          if (func1(data15) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          if (func1(data15) < 1) {
            const err29 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        } else {
          const err30 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
      if (data.tessera_attributes !== undefined) {
        let data16 = data.tessera_attributes;
        if (Array.isArray(data16)) {
          if (data16.length > 200) {
            const err31 = {
              instancePath: instancePath + '/tessera_attributes',
              schemaPath: '#/properties/tessera_attributes/maxItems',
              keyword: 'maxItems',
              params: { limit: 200 },
              message: 'must NOT have more than 200 items',
            };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
          const len5 = data16.length;
          for (let i9 = 0; i9 < len5; i9++) {
            let data17 = data16[i9];
            if (typeof data17 === 'string') {
              if (func1(data17) < 1) {
                const err32 = {
                  instancePath: instancePath + '/tessera_attributes/' + i9,
                  schemaPath: '#/properties/tessera_attributes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            } else {
              const err33 = {
                instancePath: instancePath + '/tessera_attributes/' + i9,
                schemaPath: '#/properties/tessera_attributes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
        } else {
          const err34 = {
            instancePath: instancePath + '/tessera_attributes',
            schemaPath: '#/properties/tessera_attributes/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
      if (data.tessera_ai_context !== undefined) {
        let data18 = data.tessera_ai_context;
        if (typeof data18 !== 'string' && !(data18 && typeof data18 == 'object' && !Array.isArray(data18))) {
          const err35 = {
            instancePath: instancePath + '/tessera_ai_context',
            schemaPath: '#/properties/tessera_ai_context/type',
            keyword: 'type',
            params: { type: OntologyComponentDefinesSingleSchema4.properties.tessera_ai_context.type },
            message: 'must be string,object',
          };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        if (typeof data18 === 'string') {
          if (func1(data18) > 10000) {
            const err36 = {
              instancePath: instancePath + '/tessera_ai_context',
              schemaPath: '#/properties/tessera_ai_context/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data18 && typeof data18 == 'object' && !Array.isArray(data18)) {
          for (const key1 in data18) {
            if (!(key1 === 'instructions' || key1 === 'synonyms' || key1 === 'examples')) {
              const err37 = {
                instancePath: instancePath + '/tessera_ai_context',
                schemaPath: '#/properties/tessera_ai_context/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
          if (data18.instructions !== undefined) {
            let data19 = data18.instructions;
            if (typeof data19 === 'string') {
              if (func1(data19) > 10000) {
                const err38 = {
                  instancePath: instancePath + '/tessera_ai_context/instructions',
                  schemaPath: '#/properties/tessera_ai_context/properties/instructions/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 10000 },
                  message: 'must NOT have more than 10000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            } else {
              const err39 = {
                instancePath: instancePath + '/tessera_ai_context/instructions',
                schemaPath: '#/properties/tessera_ai_context/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
          if (data18.synonyms !== undefined) {
            let data20 = data18.synonyms;
            if (Array.isArray(data20)) {
              const len6 = data20.length;
              for (let i10 = 0; i10 < len6; i10++) {
                let data21 = data20[i10];
                if (typeof data21 === 'string') {
                  if (func1(data21) > 10000) {
                    const err40 = {
                      instancePath: instancePath + '/tessera_ai_context/synonyms/' + i10,
                      schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                } else {
                  const err41 = {
                    instancePath: instancePath + '/tessera_ai_context/synonyms/' + i10,
                    schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              }
            } else {
              const err42 = {
                instancePath: instancePath + '/tessera_ai_context/synonyms',
                schemaPath: '#/properties/tessera_ai_context/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          }
          if (data18.examples !== undefined) {
            let data22 = data18.examples;
            if (Array.isArray(data22)) {
              const len7 = data22.length;
              for (let i11 = 0; i11 < len7; i11++) {
                let data23 = data22[i11];
                if (typeof data23 === 'string') {
                  if (func1(data23) > 10000) {
                    const err43 = {
                      instancePath: instancePath + '/tessera_ai_context/examples/' + i11,
                      schemaPath: '#/properties/tessera_ai_context/properties/examples/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                } else {
                  const err44 = {
                    instancePath: instancePath + '/tessera_ai_context/examples/' + i11,
                    schemaPath: '#/properties/tessera_ai_context/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              }
            } else {
              const err45 = {
                instancePath: instancePath + '/tessera_ai_context/examples',
                schemaPath: '#/properties/tessera_ai_context/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
          }
        }
      }
      if (data.tessera_governance !== undefined) {
        let data24 = data.tessera_governance;
        if (data24 && typeof data24 == 'object' && !Array.isArray(data24)) {
          if (data24.status !== undefined) {
            if (typeof data24.status !== 'string') {
              const err46 = {
                instancePath: instancePath + '/tessera_governance/status',
                schemaPath: '#/properties/tessera_governance/properties/status/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
          }
          if (data24.owner !== undefined) {
            let data26 = data24.owner;
            if (typeof data26 === 'string') {
              if (func1(data26) > 200) {
                const err47 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              if (func1(data26) < 1) {
                const err48 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            } else {
              const err49 = {
                instancePath: instancePath + '/tessera_governance/owner',
                schemaPath: '#/properties/tessera_governance/properties/owner/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
          if (data24.steward !== undefined) {
            let data27 = data24.steward;
            if (typeof data27 === 'string') {
              if (func1(data27) > 200) {
                const err50 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (func1(data27) < 1) {
                const err51 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            } else {
              const err52 = {
                instancePath: instancePath + '/tessera_governance/steward',
                schemaPath: '#/properties/tessera_governance/properties/steward/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
          if (data24.classification !== undefined) {
            let data28 = data24.classification;
            if (typeof data28 === 'string') {
              if (func1(data28) > 200) {
                const err53 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err53];
                } else {
                  vErrors.push(err53);
                }
                errors++;
              }
              if (func1(data28) < 1) {
                const err54 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            } else {
              const err55 = {
                instancePath: instancePath + '/tessera_governance/classification',
                schemaPath: '#/properties/tessera_governance/properties/classification/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err55];
              } else {
                vErrors.push(err55);
              }
              errors++;
            }
          }
          if (data24.replaced_by !== undefined) {
            let data29 = data24.replaced_by;
            if (typeof data29 === 'string') {
              if (func1(data29) < 1) {
                const err56 = {
                  instancePath: instancePath + '/tessera_governance/replaced_by',
                  schemaPath: '#/properties/tessera_governance/properties/replaced_by/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            } else {
              const err57 = {
                instancePath: instancePath + '/tessera_governance/replaced_by',
                schemaPath: '#/properties/tessera_governance/properties/replaced_by/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          }
          if (data24.deprecation_reason !== undefined) {
            let data30 = data24.deprecation_reason;
            if (typeof data30 === 'string') {
              if (func1(data30) > 2000) {
                const err58 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 2000 },
                  message: 'must NOT have more than 2000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
              if (func1(data30) < 1) {
                const err59 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            } else {
              const err60 = {
                instancePath: instancePath + '/tessera_governance/deprecation_reason',
                schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
          }
        } else {
          const err61 = {
            instancePath: instancePath + '/tessera_governance',
            schemaPath: '#/properties/tessera_governance/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err61];
          } else {
            vErrors.push(err61);
          }
          errors++;
        }
      }
    } else {
      const err62 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err62];
      } else {
        vErrors.push(err62);
      }
      errors++;
    }
    validate120.errors = vErrors;
    return errors === 0;
  }
  validate120.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate119(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="urn:semantic-workbench:tessera-part:3:ossie-0.3.0.dev0" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate119.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.tessera === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'tessera' }, message: "must have required property '" + 'tessera' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.tessera_part === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'tessera_part' }, message: "must have required property '" + 'tessera_part' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      if (data.ontology === undefined) {
        const err2 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'ontology' }, message: "must have required property '" + 'ontology' + "'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'tessera' || key0 === 'tessera_part' || key0 === 'ontology')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.tessera !== undefined) {
        let data0 = data.tessera;
        if (!(typeof data0 == 'number' && !(data0 % 1) && !isNaN(data0))) {
          const err4 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/type', keyword: 'type', params: { type: 'integer' }, message: 'must be integer' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (3 !== data0) {
          const err5 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/const', keyword: 'const', params: { allowedValue: 3 }, message: 'must be equal to constant' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.tessera_part !== undefined) {
        if (true !== data.tessera_part) {
          const err6 = {
            instancePath: instancePath + '/tessera_part',
            schemaPath: '#/properties/tessera_part/const',
            keyword: 'const',
            params: { allowedValue: true },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.ontology !== undefined) {
        let data2 = data.ontology;
        if (Array.isArray(data2)) {
          if (data2.length < 0) {
            const err7 = {
              instancePath: instancePath + '/ontology',
              schemaPath: '#/properties/ontology/minItems',
              keyword: 'minItems',
              params: { limit: 0 },
              message: 'must NOT have fewer than 0 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate120(data2[i0], { instancePath: instancePath + '/ontology/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate120.errors : vErrors.concat(validate120.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err8 = { instancePath: instancePath + '/ontology', schemaPath: '#/properties/ontology/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    } else {
      const err9 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    validate119.errors = vErrors;
    return errors === 0;
  }
  validate119.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const tesseraOntologyRevisionThreeDraft030Schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:semantic-workbench:tessera-ontology:3:ossie-0.3.0.dev0',
    title: 'Apache Ossie Ontology Metadata Specification',
    description: 'JSON Schema for validating Apache Ossie ontology definitions',
    type: 'object',
    properties: {
      version: { type: 'string', const: '0.3.0.dev0', description: 'Ontology specification version' },
      name: { type: 'string', minLength: 1, description: 'Unique identifier for the ontology' },
      description: { type: 'string', description: 'Human-readable description' },
      ai_context: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this ontology' },
      ontology: { type: 'array', items: { $ref: '#/$defs/OntologyComponent' }, minItems: 0, description: 'Components that define the concepts and relationships in this ontology' },
      ontology_mappings: {
        type: 'array',
        description:
          'Deprecated. Embedded ontology maps, accepted only so existing documents continue to validate; write mappings as standalone documents validated against ontology/mapping.json instead.',
        deprecated: true,
        items: { $ref: '#/$defs/OntologyMap' },
      },
      annotations: { $ref: '#/$defs/Annotations' },
      prefixes: {
        type: 'object',
        description: "Maps namespace prefixes to the IRIs they abbreviate, enabling QName expansion (e.g., 'foaf' -> 'http://xmlns.com/foaf/0.1/').",
        additionalProperties: { type: 'string', minLength: 1, format: 'iri' },
      },
      tessera: { type: 'integer', const: 3, description: 'Marks the document as Tessera revision 3.' },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_includes: {
        type: 'array',
        minItems: 1,
        maxItems: 200,
        uniqueItems: true,
        items: { type: 'string', minLength: 1 },
        description: 'Tessera addition since revision 3: an ordered list of project-relative part files.',
      },
      tessera_exports: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 }, description: 'Tessera addition since revision 3: a list of public concept names.' },
      tessera_imports: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['project', 'alias', 'concepts'],
          properties: {
            project: { type: 'string', minLength: 1 },
            ontology: { type: 'string', minLength: 1 },
            alias: { type: 'string', pattern: '^[A-Za-z0-9_]+$' },
            concepts: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } },
            version: { oneOf: [{ const: 'latest' }, { type: 'object', required: ['pin'], additionalProperties: false, properties: { pin: { type: 'string', minLength: 1 } } }] },
          },
        },
        description: 'Tessera addition since revision 3: a list of provider declarations with explicit concept allow-lists.',
      },
    },
    required: ['tessera', 'version', 'name', 'ontology'],
    additionalProperties: false,
    $defs: {
      Annotations: {
        type: 'object',
        description:
          'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
        additionalProperties: true,
      },
      OntologyComponent: {
        type: 'object',
        description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
          type: { $ref: '#/$defs/ConceptType' },
          description: { type: 'string', description: 'Human-readable description of the concept' },
          extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
          relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
          tessera_attributes: {
            type: 'array',
            maxItems: 200,
            items: { type: 'string', minLength: 1 },
            description: 'Tessera addition since revision 2: a list of at most 200 relationship names of the concept, in the order they are shown.',
          },
          tessera_ai_context: {
            type: ['string', 'object'],
            maxLength: 10000,
            properties: {
              instructions: { type: 'string', maxLength: 10000 },
              synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
              examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
            },
            additionalProperties: false,
            description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
          },
          tessera_governance: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              owner: { type: 'string', minLength: 1, maxLength: 200 },
              steward: { type: 'string', minLength: 1, maxLength: 200 },
              classification: { type: 'string', minLength: 1, maxLength: 200 },
              replaced_by: { type: 'string', minLength: 1 },
              deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
            },
            description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
          },
        },
        required: ['concept', 'type'],
        additionalProperties: false,
      },
      Expression: { type: 'string', minLength: 1, description: 'ANSI SQL expression' },
      Relationship: {
        type: 'object',
        description: 'Relationship between concepts in the ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
          description: { type: 'string', description: 'Human-readable description of the relationship' },
          roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
          multiplicity: { $ref: '#/$defs/Multiplicity' },
          derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
          requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
          verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
          iri: {
            type: 'string',
            minLength: 1,
            description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
          },
          tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
          tessera_ai_context: {
            type: ['string', 'object'],
            maxLength: 10000,
            properties: {
              instructions: { type: 'string', maxLength: 10000 },
              synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
              examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
            },
            additionalProperties: false,
            description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
          },
          tessera_governance: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              owner: { type: 'string', minLength: 1, maxLength: 200 },
              steward: { type: 'string', minLength: 1, maxLength: 200 },
              classification: { type: 'string', minLength: 1, maxLength: 200 },
              replaced_by: { type: 'string', minLength: 1 },
              deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
            },
            description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
          },
        },
        required: ['name', 'verbalizes'],
        additionalProperties: false,
      },
      ConceptMapping: {
        type: 'object',
        description: 'Mappings from logical model constructs to some ontology component',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
          object_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/ObjectMapping' },
            description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
          },
          link_mappings: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/LinkMapping' },
            description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
          },
        },
        required: ['concept'],
        anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
        additionalProperties: false,
      },
      ConceptType: { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' },
      ReferentMapping: {
        type: 'object',
        description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
          expression: { $ref: '#/$defs/Expression' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
        },
        required: ['relationship'],
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      Role: {
        type: 'object',
        description: 'Role in some relationship (the container)',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
          name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
          annotations: { $ref: '#/$defs/Annotations' },
        },
        required: ['concept'],
        additionalProperties: false,
      },
      ObjectMapping: {
        type: 'object',
        description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
        properties: {
          concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
          referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
          expression: { $ref: '#/$defs/Expression' },
        },
        anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
        additionalProperties: false,
      },
      LinkMapping: {
        type: 'object',
        description: 'Mapping from logical schema to the links of relationships in the ontology',
        properties: {
          relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
          object_mapping: { $ref: '#/$defs/ObjectMapping' },
          children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
        },
        required: ['object_mapping'],
        additionalProperties: false,
      },
      Multiplicity: { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' },
      OntologyMap: {
        type: 'object',
        description: 'Map from the constructs of some logical model to some ontology',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
          description: { type: 'string', description: 'Human-readable description of this ontology map' },
          semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
          concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
        },
        required: ['semantic_model', 'concept_mappings'],
        additionalProperties: false,
      },
    },
    $comment:
      'Workbench schema derived from the pinned Ossie 0.3.0.dev0 ontology schema for Tessera revision 3. It is not part of the Ossie standard. Regenerate it with scripts/derive-tessera-schema.ts.',
    allOf: [{ anyOf: [{ required: ['tessera_includes'] }, { properties: { ontology: { minItems: 1 } } }] }],
  };
  const tesseraOntologyRevisionThreeDraft030ExpressionSchema = { type: 'string', minLength: 1, description: 'ANSI SQL expression' };
  const tesseraOntologyRevisionThreeDraft030AnnotationsSchema = {
    type: 'object',
    description:
      'Open set of annotations for carrying data that is not covered by the core ontology spec, for example when importing an ontology from an external format such as OWL/RDF. Keys are free-form and values may be any JSON; the spec does not interpret their structure.',
    additionalProperties: true,
  };
  const OntologyComponentDefinesSingleSchema5 = {
    type: 'object',
    description: 'Ontology component that defines a single concept and any relationships that are keyed primarily by that concept',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Unique name of the concept defined by this component' },
      type: { $ref: '#/$defs/ConceptType' },
      description: { type: 'string', description: 'Human-readable description of the concept' },
      extends: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Indicates that this concept extends one or more other concepts' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      identify_by: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Names of relationships to use as the preferred identifier of this concept' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this concept' },
      relationships: { type: 'array', items: { $ref: '#/$defs/Relationship' }, description: 'Defines relationships that pertain primarily to the concept defined in this component' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this concept, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_attributes: {
        type: 'array',
        maxItems: 200,
        items: { type: 'string', minLength: 1 },
        description: 'Tessera addition since revision 2: a list of at most 200 relationship names of the concept, in the order they are shown.',
      },
      tessera_ai_context: {
        type: ['string', 'object'],
        maxLength: 10000,
        properties: {
          instructions: { type: 'string', maxLength: 10000 },
          synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
          examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        },
        additionalProperties: false,
        description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
      },
      tessera_governance: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner: { type: 'string', minLength: 1, maxLength: 200 },
          steward: { type: 'string', minLength: 1, maxLength: 200 },
          classification: { type: 'string', minLength: 1, maxLength: 200 },
          replaced_by: { type: 'string', minLength: 1 },
          deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
      },
    },
    required: ['concept', 'type'],
    additionalProperties: false,
  };
  const ConceptEitherEntityTypeSchema5 = { type: 'string', enum: ['EntityType', 'ValueType'], description: 'A concept is either an entity type or a value type' };
  const RelationshipBetweenConceptsOntologySchema5 = {
    type: 'object',
    description: 'Relationship between concepts in the ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of the relationship' },
      description: { type: 'string', description: 'Human-readable description of the relationship' },
      roles: { type: 'array', items: { $ref: '#/$defs/Role' }, description: 'Additional roles in this relationship' },
      multiplicity: { $ref: '#/$defs/Multiplicity' },
      derived_by: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that define how this concept is derived' },
      requires: { type: 'array', items: { $ref: '#/$defs/Expression' }, uniqueItems: true, description: 'Expressions that constrain the population of this relationship' },
      verbalizes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true, description: 'Natural language expressions that verbalize this relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
      iri: {
        type: 'string',
        minLength: 1,
        description: "Optional global identifier for this relationship, expressed as a full IRI or as a QName (prefix:local) resolved against the ontology-level 'prefixes' map.",
      },
      tessera_notes: { type: 'string', minLength: 1, maxLength: 10000, description: 'Tessera addition since revision 1: a non-empty string of at most 10,000 characters.' },
      tessera_ai_context: {
        type: ['string', 'object'],
        maxLength: 10000,
        properties: {
          instructions: { type: 'string', maxLength: 10000 },
          synonyms: { type: 'array', items: { type: 'string', maxLength: 10000 } },
          examples: { type: 'array', items: { type: 'string', maxLength: 10000 } },
        },
        additionalProperties: false,
        description: 'Tessera addition since revision 2: a text, or an object with instructions, synonyms and examples, each text at most 10,000 characters.',
      },
      tessera_governance: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          owner: { type: 'string', minLength: 1, maxLength: 200 },
          steward: { type: 'string', minLength: 1, maxLength: 200 },
          classification: { type: 'string', minLength: 1, maxLength: 200 },
          replaced_by: { type: 'string', minLength: 1 },
          deprecation_reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
        description: 'Tessera addition since revision 2: an object with at least one of status, owner, steward, classification, replaced_by, deprecation_reason.',
      },
    },
    required: ['name', 'verbalizes'],
    additionalProperties: false,
  };
  const RelationshipMultiplicitySchema5 = { type: 'string', enum: ['ManyToOne', 'OneToOne'], description: 'Relationship multiplicity' };
  const RoleRelationshipContainerSchema5 = {
    type: 'object',
    description: 'Role in some relationship (the container)',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept playing this role' },
      name: { type: 'string', minLength: 1, description: 'Optional name of this role, used when the same concept plays multiple roles in the same relationship' },
      annotations: { $ref: '#/$defs/Annotations' },
    },
    required: ['concept'],
    additionalProperties: false,
  };

  function validate129(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate129.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'name' || key0 === 'annotations')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data1 = data.name;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err4 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data2 = data.annotations;
        if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        } else {
          const err6 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate129.errors = vErrors;
    return errors === 0;
  }
  validate129.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate128(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate128.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.name === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.verbalizes === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'verbalizes' }, message: "must have required property '" + 'verbalizes' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(RelationshipBetweenConceptsOntologySchema5.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.roles !== undefined) {
        let data2 = data.roles;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate129(data2[i0], { instancePath: instancePath + '/roles/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate129.errors : vErrors.concat(validate129.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/roles', schemaPath: '#/properties/roles/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.multiplicity !== undefined) {
        let data4 = data.multiplicity;
        if (typeof data4 !== 'string') {
          const err7 = { instancePath: instancePath + '/multiplicity', schemaPath: '#/$defs/Multiplicity/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!(data4 === 'ManyToOne' || data4 === 'OneToOne')) {
          const err8 = {
            instancePath: instancePath + '/multiplicity',
            schemaPath: '#/$defs/Multiplicity/enum',
            keyword: 'enum',
            params: { allowedValues: RelationshipMultiplicitySchema5.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data6 = data5[i1];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err9 = {
                  instancePath: instancePath + '/derived_by/' + i1,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            } else {
              const err10 = { instancePath: instancePath + '/derived_by/' + i1, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
          let i2 = data5.length;
          let j0;
          if (i2 > 1) {
            outer0: for (; i2--;) {
              for (j0 = i2; j0--;) {
                if (func0(data5[i2], data5[j0])) {
                  const err11 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i2, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i2 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err12 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data7 = data.requires;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i3 = 0; i3 < len2; i3++) {
            let data8 = data7[i3];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err13 = {
                  instancePath: instancePath + '/requires/' + i3,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            } else {
              const err14 = { instancePath: instancePath + '/requires/' + i3, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          let i4 = data7.length;
          let j1;
          if (i4 > 1) {
            outer1: for (; i4--;) {
              for (j1 = i4; j1--;) {
                if (func0(data7[i4], data7[j1])) {
                  const err15 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i4, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i4 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err16 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      }
      if (data.verbalizes !== undefined) {
        let data9 = data.verbalizes;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i5 = 0; i5 < len3; i5++) {
            let data10 = data9[i5];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err17 = {
                  instancePath: instancePath + '/verbalizes/' + i5,
                  schemaPath: '#/properties/verbalizes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            } else {
              const err18 = {
                instancePath: instancePath + '/verbalizes/' + i5,
                schemaPath: '#/properties/verbalizes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          let i6 = data9.length;
          let j2;
          if (i6 > 1) {
            const indices0 = {};
            for (; i6--;) {
              let item0 = data9[i6];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j2 = indices0[item0];
                const err19 = {
                  instancePath: instancePath + '/verbalizes',
                  schemaPath: '#/properties/verbalizes/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i6, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i6 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
                break;
              }
              indices0[item0] = i6;
            }
          }
        } else {
          const err20 = { instancePath: instancePath + '/verbalizes', schemaPath: '#/properties/verbalizes/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data11 = data.annotations;
        if (data11 && typeof data11 == 'object' && !Array.isArray(data11)) {
        } else {
          const err21 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data12 = data.iri;
        if (typeof data12 === 'string') {
          if (func1(data12) < 1) {
            const err22 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        } else {
          const err23 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data13 = data.tessera_notes;
        if (typeof data13 === 'string') {
          if (func1(data13) > 10000) {
            const err24 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (func1(data13) < 1) {
            const err25 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        } else {
          const err26 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.tessera_ai_context !== undefined) {
        let data14 = data.tessera_ai_context;
        if (typeof data14 !== 'string' && !(data14 && typeof data14 == 'object' && !Array.isArray(data14))) {
          const err27 = {
            instancePath: instancePath + '/tessera_ai_context',
            schemaPath: '#/properties/tessera_ai_context/type',
            keyword: 'type',
            params: { type: RelationshipBetweenConceptsOntologySchema5.properties.tessera_ai_context.type },
            message: 'must be string,object',
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (typeof data14 === 'string') {
          if (func1(data14) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_ai_context',
              schemaPath: '#/properties/tessera_ai_context/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data14 && typeof data14 == 'object' && !Array.isArray(data14)) {
          for (const key1 in data14) {
            if (!(key1 === 'instructions' || key1 === 'synonyms' || key1 === 'examples')) {
              const err29 = {
                instancePath: instancePath + '/tessera_ai_context',
                schemaPath: '#/properties/tessera_ai_context/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
          if (data14.instructions !== undefined) {
            let data15 = data14.instructions;
            if (typeof data15 === 'string') {
              if (func1(data15) > 10000) {
                const err30 = {
                  instancePath: instancePath + '/tessera_ai_context/instructions',
                  schemaPath: '#/properties/tessera_ai_context/properties/instructions/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 10000 },
                  message: 'must NOT have more than 10000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            } else {
              const err31 = {
                instancePath: instancePath + '/tessera_ai_context/instructions',
                schemaPath: '#/properties/tessera_ai_context/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
          if (data14.synonyms !== undefined) {
            let data16 = data14.synonyms;
            if (Array.isArray(data16)) {
              const len4 = data16.length;
              for (let i7 = 0; i7 < len4; i7++) {
                let data17 = data16[i7];
                if (typeof data17 === 'string') {
                  if (func1(data17) > 10000) {
                    const err32 = {
                      instancePath: instancePath + '/tessera_ai_context/synonyms/' + i7,
                      schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err32];
                    } else {
                      vErrors.push(err32);
                    }
                    errors++;
                  }
                } else {
                  const err33 = {
                    instancePath: instancePath + '/tessera_ai_context/synonyms/' + i7,
                    schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
              }
            } else {
              const err34 = {
                instancePath: instancePath + '/tessera_ai_context/synonyms',
                schemaPath: '#/properties/tessera_ai_context/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
          if (data14.examples !== undefined) {
            let data18 = data14.examples;
            if (Array.isArray(data18)) {
              const len5 = data18.length;
              for (let i8 = 0; i8 < len5; i8++) {
                let data19 = data18[i8];
                if (typeof data19 === 'string') {
                  if (func1(data19) > 10000) {
                    const err35 = {
                      instancePath: instancePath + '/tessera_ai_context/examples/' + i8,
                      schemaPath: '#/properties/tessera_ai_context/properties/examples/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err35];
                    } else {
                      vErrors.push(err35);
                    }
                    errors++;
                  }
                } else {
                  const err36 = {
                    instancePath: instancePath + '/tessera_ai_context/examples/' + i8,
                    schemaPath: '#/properties/tessera_ai_context/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              }
            } else {
              const err37 = {
                instancePath: instancePath + '/tessera_ai_context/examples',
                schemaPath: '#/properties/tessera_ai_context/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
        }
      }
      if (data.tessera_governance !== undefined) {
        let data20 = data.tessera_governance;
        if (data20 && typeof data20 == 'object' && !Array.isArray(data20)) {
          if (data20.status !== undefined) {
            if (typeof data20.status !== 'string') {
              const err38 = {
                instancePath: instancePath + '/tessera_governance/status',
                schemaPath: '#/properties/tessera_governance/properties/status/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
          if (data20.owner !== undefined) {
            let data22 = data20.owner;
            if (typeof data22 === 'string') {
              if (func1(data22) > 200) {
                const err39 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
              if (func1(data22) < 1) {
                const err40 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            } else {
              const err41 = {
                instancePath: instancePath + '/tessera_governance/owner',
                schemaPath: '#/properties/tessera_governance/properties/owner/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          if (data20.steward !== undefined) {
            let data23 = data20.steward;
            if (typeof data23 === 'string') {
              if (func1(data23) > 200) {
                const err42 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
              if (func1(data23) < 1) {
                const err43 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            } else {
              const err44 = {
                instancePath: instancePath + '/tessera_governance/steward',
                schemaPath: '#/properties/tessera_governance/properties/steward/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          }
          if (data20.classification !== undefined) {
            let data24 = data20.classification;
            if (typeof data24 === 'string') {
              if (func1(data24) > 200) {
                const err45 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (func1(data24) < 1) {
                const err46 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            } else {
              const err47 = {
                instancePath: instancePath + '/tessera_governance/classification',
                schemaPath: '#/properties/tessera_governance/properties/classification/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
          if (data20.replaced_by !== undefined) {
            let data25 = data20.replaced_by;
            if (typeof data25 === 'string') {
              if (func1(data25) < 1) {
                const err48 = {
                  instancePath: instancePath + '/tessera_governance/replaced_by',
                  schemaPath: '#/properties/tessera_governance/properties/replaced_by/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            } else {
              const err49 = {
                instancePath: instancePath + '/tessera_governance/replaced_by',
                schemaPath: '#/properties/tessera_governance/properties/replaced_by/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
          if (data20.deprecation_reason !== undefined) {
            let data26 = data20.deprecation_reason;
            if (typeof data26 === 'string') {
              if (func1(data26) > 2000) {
                const err50 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 2000 },
                  message: 'must NOT have more than 2000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (func1(data26) < 1) {
                const err51 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            } else {
              const err52 = {
                instancePath: instancePath + '/tessera_governance/deprecation_reason',
                schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
        } else {
          const err53 = {
            instancePath: instancePath + '/tessera_governance',
            schemaPath: '#/properties/tessera_governance/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err53];
          } else {
            vErrors.push(err53);
          }
          errors++;
        }
      }
    } else {
      const err54 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err54];
      } else {
        vErrors.push(err54);
      }
      errors++;
    }
    validate128.errors = vErrors;
    return errors === 0;
  }
  validate128.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate127(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate127.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.type === undefined) {
        const err1 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'type' }, message: "must have required property '" + 'type' + "'" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(OntologyComponentDefinesSingleSchema5.properties, key0)) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.type !== undefined) {
        let data1 = data.type;
        if (typeof data1 !== 'string') {
          const err5 = { instancePath: instancePath + '/type', schemaPath: '#/$defs/ConceptType/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (!(data1 === 'EntityType' || data1 === 'ValueType')) {
          const err6 = {
            instancePath: instancePath + '/type',
            schemaPath: '#/$defs/ConceptType/enum',
            keyword: 'enum',
            params: { allowedValues: ConceptEitherEntityTypeSchema5.enum },
            message: 'must be equal to one of the allowed values',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err7 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.extends !== undefined) {
        let data3 = data.extends;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            let data4 = data3[i0];
            if (typeof data4 === 'string') {
              if (func1(data4) < 1) {
                const err8 = {
                  instancePath: instancePath + '/extends/' + i0,
                  schemaPath: '#/properties/extends/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            } else {
              const err9 = { instancePath: instancePath + '/extends/' + i0, schemaPath: '#/properties/extends/items/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
          let i1 = data3.length;
          let j0;
          if (i1 > 1) {
            const indices0 = {};
            for (; i1--;) {
              let item0 = data3[i1];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j0 = indices0[item0];
                const err10 = {
                  instancePath: instancePath + '/extends',
                  schemaPath: '#/properties/extends/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i1, j: j0 },
                  message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i1 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
                break;
              }
              indices0[item0] = i1;
            }
          }
        } else {
          const err11 = { instancePath: instancePath + '/extends', schemaPath: '#/properties/extends/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.derived_by !== undefined) {
        let data5 = data.derived_by;
        if (Array.isArray(data5)) {
          const len1 = data5.length;
          for (let i2 = 0; i2 < len1; i2++) {
            let data6 = data5[i2];
            if (typeof data6 === 'string') {
              if (func1(data6) < 1) {
                const err12 = {
                  instancePath: instancePath + '/derived_by/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            } else {
              const err13 = { instancePath: instancePath + '/derived_by/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          let i3 = data5.length;
          let j1;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j1 = i3; j1--;) {
                if (func0(data5[i3], data5[j1])) {
                  const err14 = {
                    instancePath: instancePath + '/derived_by',
                    schemaPath: '#/properties/derived_by/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j1 },
                    message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err15 = { instancePath: instancePath + '/derived_by', schemaPath: '#/properties/derived_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
      if (data.identify_by !== undefined) {
        let data7 = data.identify_by;
        if (Array.isArray(data7)) {
          const len2 = data7.length;
          for (let i4 = 0; i4 < len2; i4++) {
            let data8 = data7[i4];
            if (typeof data8 === 'string') {
              if (func1(data8) < 1) {
                const err16 = {
                  instancePath: instancePath + '/identify_by/' + i4,
                  schemaPath: '#/properties/identify_by/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            } else {
              const err17 = {
                instancePath: instancePath + '/identify_by/' + i4,
                schemaPath: '#/properties/identify_by/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          }
          let i5 = data7.length;
          let j2;
          if (i5 > 1) {
            const indices1 = {};
            for (; i5--;) {
              let item1 = data7[i5];
              if (typeof item1 !== 'string') {
                continue;
              }
              if (typeof indices1[item1] == 'number') {
                j2 = indices1[item1];
                const err18 = {
                  instancePath: instancePath + '/identify_by',
                  schemaPath: '#/properties/identify_by/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i5, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i5 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
                break;
              }
              indices1[item1] = i5;
            }
          }
        } else {
          const err19 = { instancePath: instancePath + '/identify_by', schemaPath: '#/properties/identify_by/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
      if (data.requires !== undefined) {
        let data9 = data.requires;
        if (Array.isArray(data9)) {
          const len3 = data9.length;
          for (let i6 = 0; i6 < len3; i6++) {
            let data10 = data9[i6];
            if (typeof data10 === 'string') {
              if (func1(data10) < 1) {
                const err20 = {
                  instancePath: instancePath + '/requires/' + i6,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            } else {
              const err21 = { instancePath: instancePath + '/requires/' + i6, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
          let i7 = data9.length;
          let j3;
          if (i7 > 1) {
            outer1: for (; i7--;) {
              for (j3 = i7; j3--;) {
                if (func0(data9[i7], data9[j3])) {
                  const err22 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i7, j: j3 },
                    message: 'must NOT have duplicate items (items ## ' + j3 + ' and ' + i7 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                  break outer1;
                }
              }
            }
          }
        } else {
          const err23 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.relationships !== undefined) {
        let data11 = data.relationships;
        if (Array.isArray(data11)) {
          const len4 = data11.length;
          for (let i8 = 0; i8 < len4; i8++) {
            if (!validate128(data11[i8], { instancePath: instancePath + '/relationships/' + i8, parentData: data11, parentDataProperty: i8, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate128.errors : vErrors.concat(validate128.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/relationships', schemaPath: '#/properties/relationships/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data13 = data.annotations;
        if (data13 && typeof data13 == 'object' && !Array.isArray(data13)) {
        } else {
          const err25 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.iri !== undefined) {
        let data14 = data.iri;
        if (typeof data14 === 'string') {
          if (func1(data14) < 1) {
            const err26 = {
              instancePath: instancePath + '/iri',
              schemaPath: '#/properties/iri/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        } else {
          const err27 = { instancePath: instancePath + '/iri', schemaPath: '#/properties/iri/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data15 = data.tessera_notes;
        if (typeof data15 === 'string') {
          if (func1(data15) > 10000) {
            const err28 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          if (func1(data15) < 1) {
            const err29 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        } else {
          const err30 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
      if (data.tessera_attributes !== undefined) {
        let data16 = data.tessera_attributes;
        if (Array.isArray(data16)) {
          if (data16.length > 200) {
            const err31 = {
              instancePath: instancePath + '/tessera_attributes',
              schemaPath: '#/properties/tessera_attributes/maxItems',
              keyword: 'maxItems',
              params: { limit: 200 },
              message: 'must NOT have more than 200 items',
            };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
          const len5 = data16.length;
          for (let i9 = 0; i9 < len5; i9++) {
            let data17 = data16[i9];
            if (typeof data17 === 'string') {
              if (func1(data17) < 1) {
                const err32 = {
                  instancePath: instancePath + '/tessera_attributes/' + i9,
                  schemaPath: '#/properties/tessera_attributes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            } else {
              const err33 = {
                instancePath: instancePath + '/tessera_attributes/' + i9,
                schemaPath: '#/properties/tessera_attributes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
        } else {
          const err34 = {
            instancePath: instancePath + '/tessera_attributes',
            schemaPath: '#/properties/tessera_attributes/type',
            keyword: 'type',
            params: { type: 'array' },
            message: 'must be array',
          };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
      if (data.tessera_ai_context !== undefined) {
        let data18 = data.tessera_ai_context;
        if (typeof data18 !== 'string' && !(data18 && typeof data18 == 'object' && !Array.isArray(data18))) {
          const err35 = {
            instancePath: instancePath + '/tessera_ai_context',
            schemaPath: '#/properties/tessera_ai_context/type',
            keyword: 'type',
            params: { type: OntologyComponentDefinesSingleSchema5.properties.tessera_ai_context.type },
            message: 'must be string,object',
          };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        if (typeof data18 === 'string') {
          if (func1(data18) > 10000) {
            const err36 = {
              instancePath: instancePath + '/tessera_ai_context',
              schemaPath: '#/properties/tessera_ai_context/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data18 && typeof data18 == 'object' && !Array.isArray(data18)) {
          for (const key1 in data18) {
            if (!(key1 === 'instructions' || key1 === 'synonyms' || key1 === 'examples')) {
              const err37 = {
                instancePath: instancePath + '/tessera_ai_context',
                schemaPath: '#/properties/tessera_ai_context/additionalProperties',
                keyword: 'additionalProperties',
                params: { additionalProperty: key1 },
                message: 'must NOT have additional properties',
              };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
          if (data18.instructions !== undefined) {
            let data19 = data18.instructions;
            if (typeof data19 === 'string') {
              if (func1(data19) > 10000) {
                const err38 = {
                  instancePath: instancePath + '/tessera_ai_context/instructions',
                  schemaPath: '#/properties/tessera_ai_context/properties/instructions/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 10000 },
                  message: 'must NOT have more than 10000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            } else {
              const err39 = {
                instancePath: instancePath + '/tessera_ai_context/instructions',
                schemaPath: '#/properties/tessera_ai_context/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
          if (data18.synonyms !== undefined) {
            let data20 = data18.synonyms;
            if (Array.isArray(data20)) {
              const len6 = data20.length;
              for (let i10 = 0; i10 < len6; i10++) {
                let data21 = data20[i10];
                if (typeof data21 === 'string') {
                  if (func1(data21) > 10000) {
                    const err40 = {
                      instancePath: instancePath + '/tessera_ai_context/synonyms/' + i10,
                      schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                } else {
                  const err41 = {
                    instancePath: instancePath + '/tessera_ai_context/synonyms/' + i10,
                    schemaPath: '#/properties/tessera_ai_context/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              }
            } else {
              const err42 = {
                instancePath: instancePath + '/tessera_ai_context/synonyms',
                schemaPath: '#/properties/tessera_ai_context/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          }
          if (data18.examples !== undefined) {
            let data22 = data18.examples;
            if (Array.isArray(data22)) {
              const len7 = data22.length;
              for (let i11 = 0; i11 < len7; i11++) {
                let data23 = data22[i11];
                if (typeof data23 === 'string') {
                  if (func1(data23) > 10000) {
                    const err43 = {
                      instancePath: instancePath + '/tessera_ai_context/examples/' + i11,
                      schemaPath: '#/properties/tessera_ai_context/properties/examples/items/maxLength',
                      keyword: 'maxLength',
                      params: { limit: 10000 },
                      message: 'must NOT have more than 10000 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                } else {
                  const err44 = {
                    instancePath: instancePath + '/tessera_ai_context/examples/' + i11,
                    schemaPath: '#/properties/tessera_ai_context/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
              }
            } else {
              const err45 = {
                instancePath: instancePath + '/tessera_ai_context/examples',
                schemaPath: '#/properties/tessera_ai_context/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
          }
        }
      }
      if (data.tessera_governance !== undefined) {
        let data24 = data.tessera_governance;
        if (data24 && typeof data24 == 'object' && !Array.isArray(data24)) {
          if (data24.status !== undefined) {
            if (typeof data24.status !== 'string') {
              const err46 = {
                instancePath: instancePath + '/tessera_governance/status',
                schemaPath: '#/properties/tessera_governance/properties/status/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
          }
          if (data24.owner !== undefined) {
            let data26 = data24.owner;
            if (typeof data26 === 'string') {
              if (func1(data26) > 200) {
                const err47 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              if (func1(data26) < 1) {
                const err48 = {
                  instancePath: instancePath + '/tessera_governance/owner',
                  schemaPath: '#/properties/tessera_governance/properties/owner/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            } else {
              const err49 = {
                instancePath: instancePath + '/tessera_governance/owner',
                schemaPath: '#/properties/tessera_governance/properties/owner/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          }
          if (data24.steward !== undefined) {
            let data27 = data24.steward;
            if (typeof data27 === 'string') {
              if (func1(data27) > 200) {
                const err50 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (func1(data27) < 1) {
                const err51 = {
                  instancePath: instancePath + '/tessera_governance/steward',
                  schemaPath: '#/properties/tessera_governance/properties/steward/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            } else {
              const err52 = {
                instancePath: instancePath + '/tessera_governance/steward',
                schemaPath: '#/properties/tessera_governance/properties/steward/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
          if (data24.classification !== undefined) {
            let data28 = data24.classification;
            if (typeof data28 === 'string') {
              if (func1(data28) > 200) {
                const err53 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 200 },
                  message: 'must NOT have more than 200 characters',
                };
                if (vErrors === null) {
                  vErrors = [err53];
                } else {
                  vErrors.push(err53);
                }
                errors++;
              }
              if (func1(data28) < 1) {
                const err54 = {
                  instancePath: instancePath + '/tessera_governance/classification',
                  schemaPath: '#/properties/tessera_governance/properties/classification/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
            } else {
              const err55 = {
                instancePath: instancePath + '/tessera_governance/classification',
                schemaPath: '#/properties/tessera_governance/properties/classification/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err55];
              } else {
                vErrors.push(err55);
              }
              errors++;
            }
          }
          if (data24.replaced_by !== undefined) {
            let data29 = data24.replaced_by;
            if (typeof data29 === 'string') {
              if (func1(data29) < 1) {
                const err56 = {
                  instancePath: instancePath + '/tessera_governance/replaced_by',
                  schemaPath: '#/properties/tessera_governance/properties/replaced_by/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            } else {
              const err57 = {
                instancePath: instancePath + '/tessera_governance/replaced_by',
                schemaPath: '#/properties/tessera_governance/properties/replaced_by/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
          }
          if (data24.deprecation_reason !== undefined) {
            let data30 = data24.deprecation_reason;
            if (typeof data30 === 'string') {
              if (func1(data30) > 2000) {
                const err58 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/maxLength',
                  keyword: 'maxLength',
                  params: { limit: 2000 },
                  message: 'must NOT have more than 2000 characters',
                };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
              if (func1(data30) < 1) {
                const err59 = {
                  instancePath: instancePath + '/tessera_governance/deprecation_reason',
                  schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            } else {
              const err60 = {
                instancePath: instancePath + '/tessera_governance/deprecation_reason',
                schemaPath: '#/properties/tessera_governance/properties/deprecation_reason/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
          }
        } else {
          const err61 = {
            instancePath: instancePath + '/tessera_governance',
            schemaPath: '#/properties/tessera_governance/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err61];
          } else {
            vErrors.push(err61);
          }
          errors++;
        }
      }
    } else {
      const err62 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err62];
      } else {
        vErrors.push(err62);
      }
      errors++;
    }
    validate127.errors = vErrors;
    return errors === 0;
  }
  validate127.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MapConstructsLogicalModelSchema4 = {
    type: 'object',
    description: 'Map from the constructs of some logical model to some ontology',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Name of this ontology map' },
      description: { type: 'string', description: 'Human-readable description of this ontology map' },
      semantic_model: { $ref: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json' },
      concept_mappings: { type: 'array', items: { $ref: '#/$defs/ConceptMapping' }, description: 'Maps logical model constructs to some concept and its relationships in the ontology' },
    },
    required: ['semantic_model', 'concept_mappings'],
    additionalProperties: false,
  };
  const MappingsLogicalModelConstructsSchema4 = {
    type: 'object',
    description: 'Mappings from logical model constructs to some ontology component',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose part of the ontology we are mapping to' },
      object_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/ObjectMapping' },
        description: 'Mappings from logical constructs that populate the concept in this component. Valid only when the concept is an entity type',
      },
      link_mappings: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/LinkMapping' },
        description: 'Mappings from logical model relationships to ontology relationships pertaining to the mapped concept',
      },
    },
    required: ['concept'],
    anyOf: [{ required: ['object_mappings'] }, { required: ['link_mappings'] }],
    additionalProperties: false,
  };
  const PatternLogicalLevelExpressionsSchema4 = {
    type: 'object',
    description: 'Pattern of logical-level expressions for identifying objects of some concept using the values in one or more fields',
    properties: {
      concept: { type: 'string', minLength: 1, description: 'Name of the concept whose objects we are mapping to' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' }, description: 'Maps logical-model constructs to referent relationships of this entity type' },
      expression: { $ref: '#/$defs/Expression' },
    },
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const MappingLogicalModelConstructsSchema4 = {
    type: 'object',
    description: 'Mapping from logical model constructs to a relationship used to references some entity type in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of referent relationship' },
      expression: { $ref: '#/$defs/Expression' },
      referent_mappings: { type: 'array', minItems: 1, items: { $ref: '#/$defs/ReferentMapping' } },
    },
    required: ['relationship'],
    anyOf: [{ required: ['expression'] }, { required: ['referent_mappings'] }],
    additionalProperties: false,
  };
  const wrapper6 = { validate: validate137 };

  function validate137(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate137.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.relationship === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'relationship' }, message: "must have required property '" + 'relationship' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'expression' || key0 === 'referent_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data1 = data.expression;
        if (typeof data1 === 'string') {
          if (func1(data1) < 1) {
            const err7 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        } else {
          const err8 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data2 = data.referent_mappings;
        if (Array.isArray(data2)) {
          if (data2.length < 1) {
            const err9 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper6.validate(data2[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper6.validate.errors : vErrors.concat(wrapper6.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate137.errors = vErrors;
    return errors === 0;
  }
  validate137.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate136(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate136.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.expression === undefined) {
        const err0 = { instancePath, schemaPath: '#/anyOf/0/required', keyword: 'required', params: { missingProperty: 'expression' }, message: "must have required property '" + 'expression' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.referent_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'referent_mappings' },
          message: "must have required property '" + 'referent_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'referent_mappings' || key0 === 'expression')) {
          const err3 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err4 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        } else {
          const err5 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.referent_mappings !== undefined) {
        let data1 = data.referent_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err6 = {
              instancePath: instancePath + '/referent_mappings',
              schemaPath: '#/properties/referent_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate137(data1[i0], { instancePath: instancePath + '/referent_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate137.errors : vErrors.concat(validate137.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err7 = { instancePath: instancePath + '/referent_mappings', schemaPath: '#/properties/referent_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.expression !== undefined) {
        let data3 = data.expression;
        if (typeof data3 === 'string') {
          if (func1(data3) < 1) {
            const err8 = {
              instancePath: instancePath + '/expression',
              schemaPath: '#/$defs/Expression/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        } else {
          const err9 = { instancePath: instancePath + '/expression', schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
    } else {
      const err10 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    validate136.errors = vErrors;
    return errors === 0;
  }
  validate136.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const MappingLogicalSchemaLinksSchema4 = {
    type: 'object',
    description: 'Mapping from logical schema to the links of relationships in the ontology',
    properties: {
      relationship: { type: 'string', minLength: 1, description: 'Name of relationship being populated by this mapping node' },
      object_mapping: { $ref: '#/$defs/ObjectMapping' },
      children: { type: 'array', items: { $ref: '#/$defs/LinkMapping' }, description: 'Relationship maps at the next level in this hierarchy' },
    },
    required: ['object_mapping'],
    additionalProperties: false,
  };
  const wrapper7 = { validate: validate140 };

  function validate140(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate140.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mapping === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'object_mapping' }, message: "must have required property '" + 'object_mapping' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'relationship' || key0 === 'object_mapping' || key0 === 'children')) {
          const err1 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
      if (data.relationship !== undefined) {
        let data0 = data.relationship;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err2 = {
              instancePath: instancePath + '/relationship',
              schemaPath: '#/properties/relationship/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        } else {
          const err3 = { instancePath: instancePath + '/relationship', schemaPath: '#/properties/relationship/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      }
      if (data.object_mapping !== undefined) {
        if (!validate136(data.object_mapping, { instancePath: instancePath + '/object_mapping', parentData: data, parentDataProperty: 'object_mapping', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate136.errors : vErrors.concat(validate136.errors);
          errors = vErrors.length;
        }
      }
      if (data.children !== undefined) {
        let data2 = data.children;
        if (Array.isArray(data2)) {
          const len0 = data2.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!wrapper7.validate(data2[i0], { instancePath: instancePath + '/children/' + i0, parentData: data2, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? wrapper7.validate.errors : vErrors.concat(wrapper7.validate.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err4 = { instancePath: instancePath + '/children', schemaPath: '#/properties/children/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
    } else {
      const err5 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    validate140.errors = vErrors;
    return errors === 0;
  }
  validate140.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate135(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate135.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs1 = errors;
    let valid0 = false;
    const _errs2 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.object_mappings === undefined) {
        const err0 = {
          instancePath,
          schemaPath: '#/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: 'object_mappings' },
          message: "must have required property '" + 'object_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs2 === errors;
    valid0 = valid0 || _valid0;
    const _errs3 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.link_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/anyOf/1/required',
          keyword: 'required',
          params: { missingProperty: 'link_mappings' },
          message: "must have required property '" + 'link_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    var _valid0 = _errs3 === errors;
    valid0 = valid0 || _valid0;
    if (!valid0) {
      const err2 = { instancePath, schemaPath: '#/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs1;
      if (vErrors !== null) {
        if (_errs1) {
          vErrors.length = _errs1;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.concept === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'concept' }, message: "must have required property '" + 'concept' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'concept' || key0 === 'object_mappings' || key0 === 'link_mappings')) {
          const err4 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.concept !== undefined) {
        let data0 = data.concept;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err5 = {
              instancePath: instancePath + '/concept',
              schemaPath: '#/properties/concept/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept', schemaPath: '#/properties/concept/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
      if (data.object_mappings !== undefined) {
        let data1 = data.object_mappings;
        if (Array.isArray(data1)) {
          if (data1.length < 1) {
            const err7 = {
              instancePath: instancePath + '/object_mappings',
              schemaPath: '#/properties/object_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          const len0 = data1.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate136(data1[i0], { instancePath: instancePath + '/object_mappings/' + i0, parentData: data1, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate136.errors : vErrors.concat(validate136.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err8 = { instancePath: instancePath + '/object_mappings', schemaPath: '#/properties/object_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
      if (data.link_mappings !== undefined) {
        let data3 = data.link_mappings;
        if (Array.isArray(data3)) {
          if (data3.length < 1) {
            const err9 = {
              instancePath: instancePath + '/link_mappings',
              schemaPath: '#/properties/link_mappings/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          const len1 = data3.length;
          for (let i1 = 0; i1 < len1; i1++) {
            if (!validate140(data3[i1], { instancePath: instancePath + '/link_mappings/' + i1, parentData: data3, parentDataProperty: i1, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate140.errors : vErrors.concat(validate140.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err10 = { instancePath: instancePath + '/link_mappings', schemaPath: '#/properties/link_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    } else {
      const err11 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    validate135.errors = vErrors;
    return errors === 0;
  }
  validate135.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  function validate133(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate133.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.semantic_model === undefined) {
        const err0 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'semantic_model' }, message: "must have required property '" + 'semantic_model' + "'" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      if (data.concept_mappings === undefined) {
        const err1 = {
          instancePath,
          schemaPath: '#/required',
          keyword: 'required',
          params: { missingProperty: 'concept_mappings' },
          message: "must have required property '" + 'concept_mappings' + "'",
        };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!(key0 === 'name' || key0 === 'description' || key0 === 'semantic_model' || key0 === 'concept_mappings')) {
          const err2 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data0 = data.name;
        if (typeof data0 === 'string') {
          if (func1(data0) < 1) {
            const err3 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        } else {
          const err4 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err5 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
      if (data.semantic_model !== undefined) {
        if (!validate22(data.semantic_model, { instancePath: instancePath + '/semantic_model', parentData: data, parentDataProperty: 'semantic_model', rootData, dynamicAnchors })) {
          vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
          errors = vErrors.length;
        }
      }
      if (data.concept_mappings !== undefined) {
        let data3 = data.concept_mappings;
        if (Array.isArray(data3)) {
          const len0 = data3.length;
          for (let i0 = 0; i0 < len0; i0++) {
            if (!validate135(data3[i0], { instancePath: instancePath + '/concept_mappings/' + i0, parentData: data3, parentDataProperty: i0, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate135.errors : vErrors.concat(validate135.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err6 = { instancePath: instancePath + '/concept_mappings', schemaPath: '#/properties/concept_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      }
    } else {
      const err7 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    validate133.errors = vErrors;
    return errors === 0;
  }
  validate133.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  const pattern4 = new RegExp('^[A-Za-z0-9_]+$', 'u');

  function validate126(data, { instancePath = '', parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
    /*# sourceURL="urn:semantic-workbench:tessera-ontology:3:ossie-0.3.0.dev0" */
    let vErrors = null;
    let errors = 0;
    const evaluated0 = validate126.evaluated;
    if (evaluated0.dynamicProps) {
      evaluated0.props = undefined;
    }
    if (evaluated0.dynamicItems) {
      evaluated0.items = undefined;
    }
    const _errs3 = errors;
    let valid1 = false;
    const _errs4 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.tessera_includes === undefined) {
        const err0 = {
          instancePath,
          schemaPath: '#/allOf/0/anyOf/0/required',
          keyword: 'required',
          params: { missingProperty: 'tessera_includes' },
          message: "must have required property '" + 'tessera_includes' + "'",
        };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    var _valid0 = _errs4 === errors;
    valid1 = valid1 || _valid0;
    const _errs5 = errors;
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.ontology !== undefined) {
        let data0 = data.ontology;
        if (Array.isArray(data0)) {
          if (data0.length < 1) {
            const err1 = {
              instancePath: instancePath + '/ontology',
              schemaPath: '#/allOf/0/anyOf/1/properties/ontology/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
      }
    }
    var _valid0 = _errs5 === errors;
    valid1 = valid1 || _valid0;
    if (_valid0) {
      var props0 = {};
      props0.ontology = true;
    }
    if (!valid1) {
      const err2 = { instancePath, schemaPath: '#/allOf/0/anyOf', keyword: 'anyOf', params: {}, message: 'must match a schema in anyOf' };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    } else {
      errors = _errs3;
      if (vErrors !== null) {
        if (_errs3) {
          vErrors.length = _errs3;
        } else {
          vErrors = null;
        }
      }
    }
    if (data && typeof data == 'object' && !Array.isArray(data)) {
      if (data.tessera === undefined) {
        const err3 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'tessera' }, message: "must have required property '" + 'tessera' + "'" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
      if (data.version === undefined) {
        const err4 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'version' }, message: "must have required property '" + 'version' + "'" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
      if (data.name === undefined) {
        const err5 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'name' }, message: "must have required property '" + 'name' + "'" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      if (data.ontology === undefined) {
        const err6 = { instancePath, schemaPath: '#/required', keyword: 'required', params: { missingProperty: 'ontology' }, message: "must have required property '" + 'ontology' + "'" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      for (const key0 in data) {
        if (!func6.call(tesseraOntologyRevisionThreeDraft030Schema.properties, key0)) {
          const err7 = { instancePath, schemaPath: '#/additionalProperties', keyword: 'additionalProperties', params: { additionalProperty: key0 }, message: 'must NOT have additional properties' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      }
      if (data.version !== undefined) {
        let data1 = data.version;
        if (typeof data1 !== 'string') {
          const err8 = { instancePath: instancePath + '/version', schemaPath: '#/properties/version/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if ('0.3.0.dev0' !== data1) {
          const err9 = {
            instancePath: instancePath + '/version',
            schemaPath: '#/properties/version/const',
            keyword: 'const',
            params: { allowedValue: '0.3.0.dev0' },
            message: 'must be equal to constant',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
      if (data.name !== undefined) {
        let data2 = data.name;
        if (typeof data2 === 'string') {
          if (func1(data2) < 1) {
            const err10 = {
              instancePath: instancePath + '/name',
              schemaPath: '#/properties/name/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        } else {
          const err11 = { instancePath: instancePath + '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
      if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
          const err12 = { instancePath: instancePath + '/description', schemaPath: '#/properties/description/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
      if (data.ai_context !== undefined) {
        let data4 = data.ai_context;
        const _errs16 = errors;
        let valid5 = false;
        let passing0 = null;
        const _errs17 = errors;
        if (typeof data4 !== 'string') {
          const err13 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/0/type',
            keyword: 'type',
            params: { type: 'string' },
            message: 'must be string',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        var _valid1 = _errs17 === errors;
        if (_valid1) {
          valid5 = true;
          passing0 = 0;
        }
        const _errs19 = errors;
        if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
          if (data4.instructions !== undefined) {
            if (typeof data4.instructions !== 'string') {
              const err14 = {
                instancePath: instancePath + '/ai_context/instructions',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/instructions/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data4.synonyms !== undefined) {
            let data6 = data4.synonyms;
            if (Array.isArray(data6)) {
              const len0 = data6.length;
              for (let i0 = 0; i0 < len0; i0++) {
                if (typeof data6[i0] !== 'string') {
                  const err15 = {
                    instancePath: instancePath + '/ai_context/synonyms/' + i0,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
              }
            } else {
              const err16 = {
                instancePath: instancePath + '/ai_context/synonyms',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/synonyms/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data4.examples !== undefined) {
            let data8 = data4.examples;
            if (Array.isArray(data8)) {
              const len1 = data8.length;
              for (let i1 = 0; i1 < len1; i1++) {
                if (typeof data8[i1] !== 'string') {
                  const err17 = {
                    instancePath: instancePath + '/ai_context/examples/' + i1,
                    schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/items/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
              }
            } else {
              const err18 = {
                instancePath: instancePath + '/ai_context/examples',
                schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/properties/examples/type',
                keyword: 'type',
                params: { type: 'array' },
                message: 'must be array',
              };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
        } else {
          const err19 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf/1/type',
            keyword: 'type',
            params: { type: 'object' },
            message: 'must be object',
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        var _valid1 = _errs19 === errors;
        if (_valid1 && valid5) {
          valid5 = false;
          passing0 = [passing0, 1];
        } else {
          if (_valid1) {
            valid5 = true;
            passing0 = 1;
          }
        }
        if (!valid5) {
          const err20 = {
            instancePath: instancePath + '/ai_context',
            schemaPath: 'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json#/$defs/AIContext/oneOf',
            keyword: 'oneOf',
            params: { passingSchemas: passing0 },
            message: 'must match exactly one schema in oneOf',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        } else {
          errors = _errs16;
          if (vErrors !== null) {
            if (_errs16) {
              vErrors.length = _errs16;
            } else {
              vErrors = null;
            }
          }
        }
      }
      if (data.requires !== undefined) {
        let data10 = data.requires;
        if (Array.isArray(data10)) {
          const len2 = data10.length;
          for (let i2 = 0; i2 < len2; i2++) {
            let data11 = data10[i2];
            if (typeof data11 === 'string') {
              if (func1(data11) < 1) {
                const err21 = {
                  instancePath: instancePath + '/requires/' + i2,
                  schemaPath: '#/$defs/Expression/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            } else {
              const err22 = { instancePath: instancePath + '/requires/' + i2, schemaPath: '#/$defs/Expression/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
          let i3 = data10.length;
          let j0;
          if (i3 > 1) {
            outer0: for (; i3--;) {
              for (j0 = i3; j0--;) {
                if (func0(data10[i3], data10[j0])) {
                  const err23 = {
                    instancePath: instancePath + '/requires',
                    schemaPath: '#/properties/requires/uniqueItems',
                    keyword: 'uniqueItems',
                    params: { i: i3, j: j0 },
                    message: 'must NOT have duplicate items (items ## ' + j0 + ' and ' + i3 + ' are identical)',
                  };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                  break outer0;
                }
              }
            }
          }
        } else {
          const err24 = { instancePath: instancePath + '/requires', schemaPath: '#/properties/requires/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.ontology !== undefined) {
        let data12 = data.ontology;
        if (Array.isArray(data12)) {
          if (data12.length < 0) {
            const err25 = {
              instancePath: instancePath + '/ontology',
              schemaPath: '#/properties/ontology/minItems',
              keyword: 'minItems',
              params: { limit: 0 },
              message: 'must NOT have fewer than 0 items',
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
          const len3 = data12.length;
          for (let i4 = 0; i4 < len3; i4++) {
            if (!validate127(data12[i4], { instancePath: instancePath + '/ontology/' + i4, parentData: data12, parentDataProperty: i4, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate127.errors : vErrors.concat(validate127.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err26 = { instancePath: instancePath + '/ontology', schemaPath: '#/properties/ontology/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.ontology_mappings !== undefined) {
        let data14 = data.ontology_mappings;
        if (Array.isArray(data14)) {
          const len4 = data14.length;
          for (let i5 = 0; i5 < len4; i5++) {
            if (!validate133(data14[i5], { instancePath: instancePath + '/ontology_mappings/' + i5, parentData: data14, parentDataProperty: i5, rootData, dynamicAnchors })) {
              vErrors = vErrors === null ? validate133.errors : vErrors.concat(validate133.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err27 = { instancePath: instancePath + '/ontology_mappings', schemaPath: '#/properties/ontology_mappings/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      }
      if (data.annotations !== undefined) {
        let data16 = data.annotations;
        if (data16 && typeof data16 == 'object' && !Array.isArray(data16)) {
        } else {
          const err28 = { instancePath: instancePath + '/annotations', schemaPath: '#/$defs/Annotations/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
      if (data.prefixes !== undefined) {
        let data17 = data.prefixes;
        if (data17 && typeof data17 == 'object' && !Array.isArray(data17)) {
          for (const key1 in data17) {
            let data18 = data17[key1];
            if (typeof data18 === 'string') {
              if (func1(data18) < 1) {
                const err29 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
              if (!formats0.test(data18)) {
                const err30 = {
                  instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                  schemaPath: '#/properties/prefixes/additionalProperties/format',
                  keyword: 'format',
                  params: { format: 'iri' },
                  message: 'must match format "' + 'iri' + '"',
                };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            } else {
              const err31 = {
                instancePath: instancePath + '/prefixes/' + key1.replace(/~/g, '~0').replace(/\//g, '~1'),
                schemaPath: '#/properties/prefixes/additionalProperties/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
        } else {
          const err32 = { instancePath: instancePath + '/prefixes', schemaPath: '#/properties/prefixes/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
          if (vErrors === null) {
            vErrors = [err32];
          } else {
            vErrors.push(err32);
          }
          errors++;
        }
      }
      if (data.tessera !== undefined) {
        let data19 = data.tessera;
        if (!(typeof data19 == 'number' && !(data19 % 1) && !isNaN(data19))) {
          const err33 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/type', keyword: 'type', params: { type: 'integer' }, message: 'must be integer' };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
        if (3 !== data19) {
          const err34 = { instancePath: instancePath + '/tessera', schemaPath: '#/properties/tessera/const', keyword: 'const', params: { allowedValue: 3 }, message: 'must be equal to constant' };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
      if (data.tessera_notes !== undefined) {
        let data20 = data.tessera_notes;
        if (typeof data20 === 'string') {
          if (func1(data20) > 10000) {
            const err35 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/maxLength',
              keyword: 'maxLength',
              params: { limit: 10000 },
              message: 'must NOT have more than 10000 characters',
            };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
          if (func1(data20) < 1) {
            const err36 = {
              instancePath: instancePath + '/tessera_notes',
              schemaPath: '#/properties/tessera_notes/minLength',
              keyword: 'minLength',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 characters',
            };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        } else {
          const err37 = { instancePath: instancePath + '/tessera_notes', schemaPath: '#/properties/tessera_notes/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
      }
      if (data.tessera_includes !== undefined) {
        let data21 = data.tessera_includes;
        if (Array.isArray(data21)) {
          if (data21.length > 200) {
            const err38 = {
              instancePath: instancePath + '/tessera_includes',
              schemaPath: '#/properties/tessera_includes/maxItems',
              keyword: 'maxItems',
              params: { limit: 200 },
              message: 'must NOT have more than 200 items',
            };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
          if (data21.length < 1) {
            const err39 = {
              instancePath: instancePath + '/tessera_includes',
              schemaPath: '#/properties/tessera_includes/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
          const len5 = data21.length;
          for (let i6 = 0; i6 < len5; i6++) {
            let data22 = data21[i6];
            if (typeof data22 === 'string') {
              if (func1(data22) < 1) {
                const err40 = {
                  instancePath: instancePath + '/tessera_includes/' + i6,
                  schemaPath: '#/properties/tessera_includes/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            } else {
              const err41 = {
                instancePath: instancePath + '/tessera_includes/' + i6,
                schemaPath: '#/properties/tessera_includes/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          let i7 = data21.length;
          let j1;
          if (i7 > 1) {
            const indices0 = {};
            for (; i7--;) {
              let item0 = data21[i7];
              if (typeof item0 !== 'string') {
                continue;
              }
              if (typeof indices0[item0] == 'number') {
                j1 = indices0[item0];
                const err42 = {
                  instancePath: instancePath + '/tessera_includes',
                  schemaPath: '#/properties/tessera_includes/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i7, j: j1 },
                  message: 'must NOT have duplicate items (items ## ' + j1 + ' and ' + i7 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
                break;
              }
              indices0[item0] = i7;
            }
          }
        } else {
          const err43 = { instancePath: instancePath + '/tessera_includes', schemaPath: '#/properties/tessera_includes/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err43];
          } else {
            vErrors.push(err43);
          }
          errors++;
        }
      }
      if (data.tessera_exports !== undefined) {
        let data23 = data.tessera_exports;
        if (Array.isArray(data23)) {
          if (data23.length < 1) {
            const err44 = {
              instancePath: instancePath + '/tessera_exports',
              schemaPath: '#/properties/tessera_exports/minItems',
              keyword: 'minItems',
              params: { limit: 1 },
              message: 'must NOT have fewer than 1 items',
            };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
          const len6 = data23.length;
          for (let i8 = 0; i8 < len6; i8++) {
            let data24 = data23[i8];
            if (typeof data24 === 'string') {
              if (func1(data24) < 1) {
                const err45 = {
                  instancePath: instancePath + '/tessera_exports/' + i8,
                  schemaPath: '#/properties/tessera_exports/items/minLength',
                  keyword: 'minLength',
                  params: { limit: 1 },
                  message: 'must NOT have fewer than 1 characters',
                };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            } else {
              const err46 = {
                instancePath: instancePath + '/tessera_exports/' + i8,
                schemaPath: '#/properties/tessera_exports/items/type',
                keyword: 'type',
                params: { type: 'string' },
                message: 'must be string',
              };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
          }
          let i9 = data23.length;
          let j2;
          if (i9 > 1) {
            const indices1 = {};
            for (; i9--;) {
              let item1 = data23[i9];
              if (typeof item1 !== 'string') {
                continue;
              }
              if (typeof indices1[item1] == 'number') {
                j2 = indices1[item1];
                const err47 = {
                  instancePath: instancePath + '/tessera_exports',
                  schemaPath: '#/properties/tessera_exports/uniqueItems',
                  keyword: 'uniqueItems',
                  params: { i: i9, j: j2 },
                  message: 'must NOT have duplicate items (items ## ' + j2 + ' and ' + i9 + ' are identical)',
                };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
                break;
              }
              indices1[item1] = i9;
            }
          }
        } else {
          const err48 = { instancePath: instancePath + '/tessera_exports', schemaPath: '#/properties/tessera_exports/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err48];
          } else {
            vErrors.push(err48);
          }
          errors++;
        }
      }
      if (data.tessera_imports !== undefined) {
        let data25 = data.tessera_imports;
        if (Array.isArray(data25)) {
          if (data25.length > 50) {
            const err49 = {
              instancePath: instancePath + '/tessera_imports',
              schemaPath: '#/properties/tessera_imports/maxItems',
              keyword: 'maxItems',
              params: { limit: 50 },
              message: 'must NOT have more than 50 items',
            };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
          const len7 = data25.length;
          for (let i10 = 0; i10 < len7; i10++) {
            let data26 = data25[i10];
            if (data26 && typeof data26 == 'object' && !Array.isArray(data26)) {
              if (data26.project === undefined) {
                const err50 = {
                  instancePath: instancePath + '/tessera_imports/' + i10,
                  schemaPath: '#/properties/tessera_imports/items/required',
                  keyword: 'required',
                  params: { missingProperty: 'project' },
                  message: "must have required property '" + 'project' + "'",
                };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (data26.alias === undefined) {
                const err51 = {
                  instancePath: instancePath + '/tessera_imports/' + i10,
                  schemaPath: '#/properties/tessera_imports/items/required',
                  keyword: 'required',
                  params: { missingProperty: 'alias' },
                  message: "must have required property '" + 'alias' + "'",
                };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
              if (data26.concepts === undefined) {
                const err52 = {
                  instancePath: instancePath + '/tessera_imports/' + i10,
                  schemaPath: '#/properties/tessera_imports/items/required',
                  keyword: 'required',
                  params: { missingProperty: 'concepts' },
                  message: "must have required property '" + 'concepts' + "'",
                };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
              for (const key2 in data26) {
                if (!(key2 === 'project' || key2 === 'ontology' || key2 === 'alias' || key2 === 'concepts' || key2 === 'version')) {
                  const err53 = {
                    instancePath: instancePath + '/tessera_imports/' + i10,
                    schemaPath: '#/properties/tessera_imports/items/additionalProperties',
                    keyword: 'additionalProperties',
                    params: { additionalProperty: key2 },
                    message: 'must NOT have additional properties',
                  };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
              }
              if (data26.project !== undefined) {
                let data27 = data26.project;
                if (typeof data27 === 'string') {
                  if (func1(data27) < 1) {
                    const err54 = {
                      instancePath: instancePath + '/tessera_imports/' + i10 + '/project',
                      schemaPath: '#/properties/tessera_imports/items/properties/project/minLength',
                      keyword: 'minLength',
                      params: { limit: 1 },
                      message: 'must NOT have fewer than 1 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err54];
                    } else {
                      vErrors.push(err54);
                    }
                    errors++;
                  }
                } else {
                  const err55 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/project',
                    schemaPath: '#/properties/tessera_imports/items/properties/project/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err55];
                  } else {
                    vErrors.push(err55);
                  }
                  errors++;
                }
              }
              if (data26.ontology !== undefined) {
                let data28 = data26.ontology;
                if (typeof data28 === 'string') {
                  if (func1(data28) < 1) {
                    const err56 = {
                      instancePath: instancePath + '/tessera_imports/' + i10 + '/ontology',
                      schemaPath: '#/properties/tessera_imports/items/properties/ontology/minLength',
                      keyword: 'minLength',
                      params: { limit: 1 },
                      message: 'must NOT have fewer than 1 characters',
                    };
                    if (vErrors === null) {
                      vErrors = [err56];
                    } else {
                      vErrors.push(err56);
                    }
                    errors++;
                  }
                } else {
                  const err57 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/ontology',
                    schemaPath: '#/properties/tessera_imports/items/properties/ontology/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err57];
                  } else {
                    vErrors.push(err57);
                  }
                  errors++;
                }
              }
              if (data26.alias !== undefined) {
                let data29 = data26.alias;
                if (typeof data29 === 'string') {
                  if (!pattern4.test(data29)) {
                    const err58 = {
                      instancePath: instancePath + '/tessera_imports/' + i10 + '/alias',
                      schemaPath: '#/properties/tessera_imports/items/properties/alias/pattern',
                      keyword: 'pattern',
                      params: { pattern: '^[A-Za-z0-9_]+$' },
                      message: 'must match pattern "' + '^[A-Za-z0-9_]+$' + '"',
                    };
                    if (vErrors === null) {
                      vErrors = [err58];
                    } else {
                      vErrors.push(err58);
                    }
                    errors++;
                  }
                } else {
                  const err59 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/alias',
                    schemaPath: '#/properties/tessera_imports/items/properties/alias/type',
                    keyword: 'type',
                    params: { type: 'string' },
                    message: 'must be string',
                  };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
              }
              if (data26.concepts !== undefined) {
                let data30 = data26.concepts;
                if (Array.isArray(data30)) {
                  if (data30.length < 1) {
                    const err60 = {
                      instancePath: instancePath + '/tessera_imports/' + i10 + '/concepts',
                      schemaPath: '#/properties/tessera_imports/items/properties/concepts/minItems',
                      keyword: 'minItems',
                      params: { limit: 1 },
                      message: 'must NOT have fewer than 1 items',
                    };
                    if (vErrors === null) {
                      vErrors = [err60];
                    } else {
                      vErrors.push(err60);
                    }
                    errors++;
                  }
                  const len8 = data30.length;
                  for (let i11 = 0; i11 < len8; i11++) {
                    let data31 = data30[i11];
                    if (typeof data31 === 'string') {
                      if (func1(data31) < 1) {
                        const err61 = {
                          instancePath: instancePath + '/tessera_imports/' + i10 + '/concepts/' + i11,
                          schemaPath: '#/properties/tessera_imports/items/properties/concepts/items/minLength',
                          keyword: 'minLength',
                          params: { limit: 1 },
                          message: 'must NOT have fewer than 1 characters',
                        };
                        if (vErrors === null) {
                          vErrors = [err61];
                        } else {
                          vErrors.push(err61);
                        }
                        errors++;
                      }
                    } else {
                      const err62 = {
                        instancePath: instancePath + '/tessera_imports/' + i10 + '/concepts/' + i11,
                        schemaPath: '#/properties/tessera_imports/items/properties/concepts/items/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err62];
                      } else {
                        vErrors.push(err62);
                      }
                      errors++;
                    }
                  }
                  let i12 = data30.length;
                  let j3;
                  if (i12 > 1) {
                    const indices2 = {};
                    for (; i12--;) {
                      let item2 = data30[i12];
                      if (typeof item2 !== 'string') {
                        continue;
                      }
                      if (typeof indices2[item2] == 'number') {
                        j3 = indices2[item2];
                        const err63 = {
                          instancePath: instancePath + '/tessera_imports/' + i10 + '/concepts',
                          schemaPath: '#/properties/tessera_imports/items/properties/concepts/uniqueItems',
                          keyword: 'uniqueItems',
                          params: { i: i12, j: j3 },
                          message: 'must NOT have duplicate items (items ## ' + j3 + ' and ' + i12 + ' are identical)',
                        };
                        if (vErrors === null) {
                          vErrors = [err63];
                        } else {
                          vErrors.push(err63);
                        }
                        errors++;
                        break;
                      }
                      indices2[item2] = i12;
                    }
                  }
                } else {
                  const err64 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/concepts',
                    schemaPath: '#/properties/tessera_imports/items/properties/concepts/type',
                    keyword: 'type',
                    params: { type: 'array' },
                    message: 'must be array',
                  };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
              }
              if (data26.version !== undefined) {
                let data32 = data26.version;
                const _errs80 = errors;
                let valid33 = false;
                let passing1 = null;
                const _errs81 = errors;
                if ('latest' !== data32) {
                  const err65 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/version',
                    schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf/0/const',
                    keyword: 'const',
                    params: { allowedValue: 'latest' },
                    message: 'must be equal to constant',
                  };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                }
                var _valid2 = _errs81 === errors;
                if (_valid2) {
                  valid33 = true;
                  passing1 = 0;
                }
                const _errs82 = errors;
                if (data32 && typeof data32 == 'object' && !Array.isArray(data32)) {
                  if (data32.pin === undefined) {
                    const err66 = {
                      instancePath: instancePath + '/tessera_imports/' + i10 + '/version',
                      schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf/1/required',
                      keyword: 'required',
                      params: { missingProperty: 'pin' },
                      message: "must have required property '" + 'pin' + "'",
                    };
                    if (vErrors === null) {
                      vErrors = [err66];
                    } else {
                      vErrors.push(err66);
                    }
                    errors++;
                  }
                  for (const key3 in data32) {
                    if (!(key3 === 'pin')) {
                      const err67 = {
                        instancePath: instancePath + '/tessera_imports/' + i10 + '/version',
                        schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf/1/additionalProperties',
                        keyword: 'additionalProperties',
                        params: { additionalProperty: key3 },
                        message: 'must NOT have additional properties',
                      };
                      if (vErrors === null) {
                        vErrors = [err67];
                      } else {
                        vErrors.push(err67);
                      }
                      errors++;
                    }
                  }
                  if (data32.pin !== undefined) {
                    let data33 = data32.pin;
                    if (typeof data33 === 'string') {
                      if (func1(data33) < 1) {
                        const err68 = {
                          instancePath: instancePath + '/tessera_imports/' + i10 + '/version/pin',
                          schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf/1/properties/pin/minLength',
                          keyword: 'minLength',
                          params: { limit: 1 },
                          message: 'must NOT have fewer than 1 characters',
                        };
                        if (vErrors === null) {
                          vErrors = [err68];
                        } else {
                          vErrors.push(err68);
                        }
                        errors++;
                      }
                    } else {
                      const err69 = {
                        instancePath: instancePath + '/tessera_imports/' + i10 + '/version/pin',
                        schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf/1/properties/pin/type',
                        keyword: 'type',
                        params: { type: 'string' },
                        message: 'must be string',
                      };
                      if (vErrors === null) {
                        vErrors = [err69];
                      } else {
                        vErrors.push(err69);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err70 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/version',
                    schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf/1/type',
                    keyword: 'type',
                    params: { type: 'object' },
                    message: 'must be object',
                  };
                  if (vErrors === null) {
                    vErrors = [err70];
                  } else {
                    vErrors.push(err70);
                  }
                  errors++;
                }
                var _valid2 = _errs82 === errors;
                if (_valid2 && valid33) {
                  valid33 = false;
                  passing1 = [passing1, 1];
                } else {
                  if (_valid2) {
                    valid33 = true;
                    passing1 = 1;
                  }
                }
                if (!valid33) {
                  const err71 = {
                    instancePath: instancePath + '/tessera_imports/' + i10 + '/version',
                    schemaPath: '#/properties/tessera_imports/items/properties/version/oneOf',
                    keyword: 'oneOf',
                    params: { passingSchemas: passing1 },
                    message: 'must match exactly one schema in oneOf',
                  };
                  if (vErrors === null) {
                    vErrors = [err71];
                  } else {
                    vErrors.push(err71);
                  }
                  errors++;
                } else {
                  errors = _errs80;
                  if (vErrors !== null) {
                    if (_errs80) {
                      vErrors.length = _errs80;
                    } else {
                      vErrors = null;
                    }
                  }
                }
              }
            } else {
              const err72 = {
                instancePath: instancePath + '/tessera_imports/' + i10,
                schemaPath: '#/properties/tessera_imports/items/type',
                keyword: 'type',
                params: { type: 'object' },
                message: 'must be object',
              };
              if (vErrors === null) {
                vErrors = [err72];
              } else {
                vErrors.push(err72);
              }
              errors++;
            }
          }
        } else {
          const err73 = { instancePath: instancePath + '/tessera_imports', schemaPath: '#/properties/tessera_imports/type', keyword: 'type', params: { type: 'array' }, message: 'must be array' };
          if (vErrors === null) {
            vErrors = [err73];
          } else {
            vErrors.push(err73);
          }
          errors++;
        }
      }
    } else {
      const err74 = { instancePath, schemaPath: '#/type', keyword: 'type', params: { type: 'object' }, message: 'must be object' };
      if (vErrors === null) {
        vErrors = [err74];
      } else {
        vErrors.push(err74);
      }
      errors++;
    }
    validate126.errors = vErrors;
    return errors === 0;
  }
  validate126.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

  return {
    standaloneDraft030: validate20,
    embeddedDraft030: validate76,
    ontologyDraft030: validate21,
    tesseraDraft030: validate81,
    tesseraRevisionTwoDraft030: validate100,
    tesseraPartDraft030: validate119,
    tesseraRevisionThreeDraft030: validate126,
  };
})();
export const semanticDraft030 = generatedSemanticDraft030.semanticDraft030;
export const standaloneDraft030 = generatedMappingsDraft030.standaloneDraft030;
export const embeddedDraft030 = generatedMappingsDraft030.embeddedDraft030;
export const ontologyDraft030 = generatedMappingsDraft030.ontologyDraft030;
export const tesseraDraft030 = generatedMappingsDraft030.tesseraDraft030;
export const tesseraRevisionTwoDraft030 = generatedMappingsDraft030.tesseraRevisionTwoDraft030;
export const tesseraPartDraft030 = generatedMappingsDraft030.tesseraPartDraft030;
export const tesseraRevisionThreeDraft030 = generatedMappingsDraft030.tesseraRevisionThreeDraft030;
