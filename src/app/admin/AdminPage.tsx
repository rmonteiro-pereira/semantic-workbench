import { AgentProgramsSection } from './AgentProgramsSection';
import { AgentConnectionsSection } from './AgentConnectionsSection';
import { ArrowLeft } from 'lucide-react';
import { useLayoutEffect, useRef, type ComponentType } from 'react';
import { PersonMenu } from '../auth/PersonMenu';
import { ScrollStrip } from '../components/ScrollStrip';
import { AccessCheckSection } from './AccessCheckSection';
import { adminHash } from './admin-route';
import { adminSection, ADMIN_SECTIONS, type AdminSectionId } from './admin-sections';
import { BootstrapNotice } from './AdminNotices';
import { AuditSection } from './AuditSection';
import { GitRemotesSection } from './GitRemotesSection';
import { PoliciesSection } from './PoliciesSection';
import { ProjectAccessSection } from './ProjectAccessSection';
import { RolesAccessSection } from './RolesAccessSection';
import { SettingsSection } from './SettingsSection';
import { UsersSection } from './UsersSection';
import './admin.css';

const sectionViews: Record<AdminSectionId, ComponentType> = {
  'agent-programs': AgentProgramsSection,
  'agent-connections': AgentConnectionsSection,
  grants: () => <RolesAccessSection view="grants" />,
  roles: () => <RolesAccessSection view="roles" />,
  users: UsersSection,
  policies: PoliciesSection,
  projects: ProjectAccessSection,
  'git-remotes': GitRemotesSection,
  audit: AuditSection,
  settings: SettingsSection,
  'access-check': AccessCheckSection,
};

/** Lists the sections down the left side, or along a scrolling strip on a phone. */
function AdminNav({ current }: { current: AdminSectionId }) {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      <ScrollStrip className="admin-nav-list" selection={current}>
        {ADMIN_SECTIONS.map(section => (
          <a key={section.id} href={adminHash(section.id)} className={section.id === current ? 'selected' : ''} aria-current={section.id === current ? 'page' : undefined}>
            {section.label}
          </a>
        ))}
      </ScrollStrip>
    </nav>
  );
}

/** The width at which the navigation wraps above the content instead of sitting beside it. */
const PHONE_LAYOUT = '(max-width: 760px)';

/**
 * On a phone the wrapped navigation sits above the section and scrolls with it, so it can push the
 * section's fields and actions below the window. Showing any section but the first brings its
 * heading to the top; the navigation stays one scroll up. Entering Admin keeps the navigation in view.
 */
function useSectionInView(section: AdminSectionId) {
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (section === ADMIN_SECTIONS[0].id) return;
    if (!globalThis.matchMedia?.(PHONE_LAYOUT).matches) return;
    content.current?.scrollIntoView({ block: 'start' });
  }, [section]);
  return content;
}

/** The Admin workspace: a section navigation and the full-width content of one section. */
export function AdminPage({ section, onBackToWorkspace }: { section: AdminSectionId; onBackToWorkspace: () => void }) {
  const View = sectionViews[section];
  const { label, description } = adminSection(section);
  const content = useSectionInView(section);
  return (
    <div className="admin-page admin-scope">
      <header className="admin-page-header">
        <button className="admin-back" onClick={onBackToWorkspace}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to workspace
        </button>
        <h1>Admin</h1>
        <PersonMenu />
      </header>
      <div className="admin-layout">
        <AdminNav current={section} />
        <section ref={content} className="admin-content" aria-label={label}>
          <h2>{label}</h2>
          <p className="admin-section-intro">{description}</p>
          <BootstrapNotice />
          <View key={section} />
        </section>
      </div>
    </div>
  );
}
