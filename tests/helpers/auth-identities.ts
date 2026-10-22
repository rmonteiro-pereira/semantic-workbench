// The test people, groups and agent clients shared by the mock OpenID provider, the Keycloak
// realm and the access fixture. Each person exists to prove one sign-in or access rule.

/** Tenant id of the test directory, used as `tid` in Entra-shaped tokens. */
export const TEST_TENANT_ID = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';

/** A test group: Entra object id for Entra-shaped tokens and its name for Keycloak. */
export type TestGroup = { id: string; name: string };

/** Groups of the test directory. */
export const TEST_GROUPS = {
  salesEditors: { id: '7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a01', name: 'Sales Editors' },
  hrViewers: { id: '7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a02', name: 'HR Viewers' },
  workbenchAdmins: { id: '7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a03', name: 'Workbench Admins' },
  finance: { id: '7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a04', name: 'Finance' },
  salesViewers: { id: '7d1f3a52-2c4e-4b8a-9a61-0f3c5e2b1a05', name: 'Sales Viewers' },
} satisfies Record<string, TestGroup>;

/** A test person as the directory knows them, before any claim shape is applied. */
export type TestUser = {
  /** Short login name typed on the mock's chooser page and in Keycloak. */
  username: string;
  /** Entra object id; the stable id is `tid:oid`. */
  oid: string;
  name: string;
  /** The `email` claim as the directory sends it, including its letter case. */
  email: string;
  /** Whether Entra marks the address as owned by a verified domain (`xms_edov`). */
  emailDomainVerified: boolean;
  /** Keycloak's `email_verified` flag. */
  emailVerified: boolean;
  /** User principal name; guests carry `#EXT#`. */
  upn: string;
  groups: TestGroup[];
  /** Entra app roles in the token; the workbench must ignore them for people. */
  appRoles?: string[];
  /** Groups are too many for the token, so they must be read from the directory. */
  groupOverage?: boolean;
};

const oid = (serial: number) => `a1100000-0000-4000-8000-${String(serial).padStart(12, '0')}`;

/** People of the test directory and the rule each one demonstrates. */
export const TEST_USERS = {
  // Editor of the Sales domain through a group grant.
  alice: {
    username: 'alice',
    oid: oid(1),
    name: 'Alice Andrade',
    email: 'alice@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'alice@example.org',
    groups: [TEST_GROUPS.salesEditors],
  },
  // Steward of Sales through an e-mail grant stored in lower case; his token uses mixed case.
  bob: {
    username: 'bob',
    oid: oid(2),
    name: 'Bob Barros',
    email: 'Bob@Example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'Bob@Example.org',
    groups: [],
  },
  // Viewer of HR through a group grant, and of the project without a domain by e-mail.
  carol: {
    username: 'carol',
    oid: oid(3),
    name: 'Carol Costa',
    email: 'carol@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'carol@example.org',
    groups: [TEST_GROUPS.hrViewers],
  },
  // Admin through the Workbench Admins group grant.
  dave: {
    username: 'dave',
    oid: oid(4),
    name: 'Dave Dias',
    email: 'dave@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'dave@example.org',
    groups: [TEST_GROUPS.workbenchAdmins],
  },
  // No grant at all; her token carries an `Admin` app role that must change nothing.
  erin: {
    username: 'erin',
    oid: oid(5),
    name: 'Erin Esteves',
    email: 'erin@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'erin@example.org',
    groups: [],
    appRoles: ['Admin'],
  },
  // Sales Editor who is also in Finance, so he can read the restricted finance folder.
  frank: {
    username: 'frank',
    oid: oid(6),
    name: 'Frank Freitas',
    email: 'frank@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'frank@example.org',
    groups: [TEST_GROUPS.salesEditors, TEST_GROUPS.finance],
  },
  // Guest: an e-mail grant names her address, but it is unverified and must never match.
  gina: {
    username: 'gina',
    oid: oid(7),
    name: 'Gina Gomes',
    email: 'gina@partner.example',
    emailDomainVerified: false,
    emailVerified: false,
    upn: 'gina_partner.example#EXT#@workbenchtest.onmicrosoft.com',
    groups: [],
  },
  // Holder of the custom role "Metric reviewer" on Sales through an e-mail grant.
  hank: {
    username: 'hank',
    oid: oid(8),
    name: 'Hank Hall',
    email: 'hank@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'hank@example.org',
    groups: [],
  },
  // Sales Editor whose groups overflow the token and are resolved through the directory.
  olga: {
    username: 'olga',
    oid: oid(9),
    name: 'Olga Oliveira',
    email: 'olga@example.org',
    emailDomainVerified: true,
    emailVerified: true,
    upn: 'olga@example.org',
    groups: [TEST_GROUPS.salesEditors],
    groupOverage: true,
  },
} satisfies Record<string, TestUser>;

/** Name of one test person. */
export type TestUserName = keyof typeof TEST_USERS;

/** Agent clients: one granted access to a project, one valid but never granted. */
export const TEST_CLIENTS = {
  granted: { clientId: 'sw-agent', secret: 'sw-agent-test-secret', name: 'Sales agent' },
  ungranted: {
    clientId: 'sw-agent-ungranted',
    secret: 'sw-agent-ungranted-test-secret',
    name: 'Ungranted agent',
  },
};

/** The workbench's own client registration at the test provider. */
export const TEST_WORKBENCH_CLIENT = {
  clientId: 'semantic-workbench',
  secret: 'semantic-workbench-test-secret',
};
