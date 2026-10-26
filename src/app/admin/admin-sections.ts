/** The areas of the Admin page, in the order the section navigation lists them. */
export const ADMIN_SECTIONS = [
  {
    id: 'grants',
    label: 'Access grants',
    description: 'Give roles to people and groups, on the whole workspace or on part of it.',
  },
  {
    id: 'roles',
    label: 'Roles',
    description: 'Read the built-in roles and define custom roles of your own.',
  },
  {
    id: 'users',
    label: 'Users & groups',
    description: 'See who has signed in, their groups and roles, and deactivate accounts.',
  },
  {
    id: 'policies',
    label: 'Policies',
    description: 'Review the built-in access rules and add rules of your own.',
  },
  {
    id: 'projects',
    label: 'Projects access',
    description: 'Set which domains and projects each group can see.',
  },
  {
    id: 'audit',
    label: 'Audit',
    description: 'Search and export the record of access decisions.',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Check the sign-in provider, session lifetimes and active sessions.',
  },
  {
    id: 'access-check',
    label: 'Access check',
    description: 'Ask why a person can or cannot do something, or who can reach a project.',
  },
] as const;

/** Names one Admin section; it is also the last part of the page's URL hash. */
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];

/** The section the page opens on when the URL names none. */
export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'grants';

/** Finds the label and description of a section. */
export function adminSection(id: AdminSectionId) {
  return ADMIN_SECTIONS.find(section => section.id === id)!;
}
