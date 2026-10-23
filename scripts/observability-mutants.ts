// Faults in the logging, telemetry and browser report code. Each tuple is the category, the
// module, the exact text and its replacement; the assertions are in observability-cases.ts.
export const observabilityMutants: [string, string, string, string][] = [
  // Redaction of free text.
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    '.replace(AUTH_SCHEME, `$1 ${REDACTED}`)',
    '',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    '.replace(JSON_WEB_TOKEN, REDACTED)',
    '',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    ".replace(URL_USERINFO, '$1***@')",
    '',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    '.replace(URL_QUERY, `$1?${REDACTED}`)',
    '',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    '.replace(SENSITIVE_ASSIGNMENT, `$1${REDACTED}`)',
    '',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    'if (options.paths !== false) {',
    'if (false) {',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    'result.length > MAX_STRING_LENGTH ?',
    'false ?',
  ],
  // Redaction of fields by name.
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    'if (!TRUSTED_KEYS.has(key) && isSensitiveKey(key)) {',
    'if (false) {',
  ],
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    '    SECRET_KEY.test(key) ||\n',
    '',
  ],
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    '    CONTENT_KEY.test(key) ||\n',
    '',
  ],
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    '    SESSION_KEY.test(key) ||\n',
    '',
  ],
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    '    LOCATION_KEY.test(key)',
    '    false',
  ],
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    'if (depth >= MAX_DEPTH) return REDACTED;',
    '',
  ],
  [
    'observability-sensitive-fields',
    'server/observability/redaction.ts',
    'value.slice(0, MAX_ARRAY_ITEMS)',
    'value',
  ],
  // The telemetry-off guard.
  [
    'observability-telemetry-settings',
    'server/observability/settings.ts',
    "if (!serverMode) return { enabled: false, reason: 'local-mode' };",
    '',
  ],
  [
    'observability-telemetry-settings',
    'server/observability/settings.ts',
    "if (connectionString === '') return",
    'if (false) return',
  ],
  [
    'observability-telemetry-settings',
    'server/observability/settings.ts',
    "if (url.protocol !== 'https:' || !known) {",
    'if (false) {',
  ],
  [
    'observability-telemetry-settings',
    'server/observability/settings.ts',
    'INGESTION_HOST_SUFFIXES.some(s => host.endsWith(s))',
    'true',
  ],
  [
    'observability-telemetry-settings',
    'server/observability/settings.ts',
    "if (!INSTRUMENTATION_KEY.test(parts.get('InstrumentationKey') ?? '')) {",
    'if (false) {',
  ],
  [
    'observability-telemetry-settings',
    'server/observability/settings.ts',
    'if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {',
    'if (false) {',
  ],
  [
    'observability-telemetry-start',
    'server/observability/telemetry.ts',
    'if (!settings.enabled) {',
    'if (false) {',
  ],
  // Browser report validation and limits.
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'Object.keys(body).length !== 1 ||',
    'false ||',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'body.reports.length === 0 ||',
    'false ||',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'body.reports.length > MAX_REPORTS_PER_REQUEST',
    'false',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    "if (!onlyKeys(candidate, ERROR_KEYS)) return 'An error report has unknown fields.';",
    '',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    "if (!onlyKeys(candidate, OPERATION_KEYS)) return 'An operation report has unknown fields.';",
    '',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'return value.length <= maxLength && (allowEmpty || value.length > 0);',
    'return true;',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'if (durationMs < 0 || durationMs > MAX_DURATION_MS) return',
    'if (false) return',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'if (!REPORTED_OPERATIONS.includes(operation as ReportedOperation)) {',
    'if (false) {',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'return message.replace(QUOTED_TEXT, \'"…"\').slice(0, MAX_MESSAGE_LENGTH);',
    'return message;',
  ],
  [
    'observability-report-schema',
    'src/observability/browser-report.ts',
    'return budget !== null && durationMs > budget;',
    'return budget !== null && durationMs >= budget;',
  ],
  [
    'observability-report-route',
    'server/routes/browser-reports.ts',
    'if (!options.enabled) return',
    'if (false) return',
  ],
  [
    'observability-report-route',
    'server/routes/browser-reports.ts',
    'if (!allowance.allowed) {',
    'if (false) {',
  ],
  [
    'observability-report-route',
    'server/routes/browser-reports.ts',
    'readJson(request, MAX_REPORT_BODY_BYTES)',
    'readJson(request, 1_000_000_000)',
  ],
  [
    'observability-report-route',
    'server/routes/browser-reports.ts',
    'if (!checked.ok) throw new BadRequestError(checked.error);',
    '',
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    'if (queue.length >= limits.queued) return;',
    '',
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    "if (mode === 'off' || sent + queue.length >= limits.perSession) return;",
    'if (false) return;',
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    "if (status === 404 || status === 401 || status === 403) mode = 'off';",
    '',
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    'if (seenErrors.has(identity) || seenErrors.size >= limits.queued) return;',
    '',
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    "      mode = 'off';\n      queue = [];",
    "      mode = 'off';",
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    "if (operation !== 'page-load' && !slow) return;",
    '',
  ],
  [
    'observability-reporter',
    'src/observability/reporter.ts',
    'const message = scrubErrorMessage(error instanceof Error ? error.message : String(error));',
    'const message = error instanceof Error ? error.message : String(error);',
  ],
  // Only allow-listed log fields leave the server.
  [
    'observability-export-fields',
    'server/observability/telemetry.ts',
    '.filter(([name]) => EXPORTED_FIELDS.has(name))',
    '.filter(() => true)',
  ],
  [
    'observability-redaction',
    'server/observability/redaction.ts',
    ".replace(EMAIL_ADDRESS, '<address>')",
    '',
  ],
  // The exporter's own usage reporting to Microsoft stays off.
  [
    'observability-azure-backends',
    'server/observability/azure-backends.ts',
    "process.env.APPLICATION_INSIGHTS_NO_STATSBEAT = 'true';",
    '',
  ],
  // Operational telemetry is not a security event and never reaches the audit log.
  ['observability-unaudited', 'server/auth/middleware.ts', 'if (row.unaudited) return false;', ''],
  [
    'observability-unaudited',
    'server/auth/middleware.ts',
    "if (decision === 'deny') return true;",
    '',
  ],
];
