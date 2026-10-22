// Separates suites that own a server identity provider from local workspace checks.
/** Browser suites exercised against the server-mode image. */
export { selfServedSuites as serverSuites } from './gate-suites';
