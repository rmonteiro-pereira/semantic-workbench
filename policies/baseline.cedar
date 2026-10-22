// Baseline policies shipped with the workbench. They cannot be edited from the Admin panel, and
// a forbid here wins over any permit, including the compiled role policies and Admin rules.

// Every person with access may list the workspace and their own state; each list is filtered
// to what that person may read.
@id("B1-workspace-lists")
permit (
  principal is SW::User,
  action in [SW::Action::"read", SW::Action::"viewOwnState"],
  resource is SW::Workspace
);

// Projects marked "everyone with access can read".
@id("B6-everyone-read")
permit (
  principal is SW::User,
  action in [
    SW::Action::"read",
    SW::Action::"export",
    SW::Action::"history",
    SW::Action::"viewOwnState"
  ],
  resource
)
when { resource.everyoneCanRead };

// Agent clients read the projects an Admin granted them, and nothing else.
@id("B8-agent")
permit (principal is SW::Client, action == SW::Action::"agentRead", resource)
when { principal.projects.contains(resource.project) };

// Nobody approves or deprecates a metric they own.
@id("F1-no-self-approval")
forbid (principal is SW::User, action == SW::Action::"approveMetric", resource)
when
{
  resource.owner != "" &&
  (resource.owner == principal.email || resource.owner == principal.username)
};

// A project without a domain is reached only through a grant naming it, or by an Admin.
@id("F2-no-domain")
forbid (principal is SW::User, action, resource)
when
{
  !resource.hasDomain &&
  !(principal in resource.explicitHolders) &&
  !(principal in SW::RoleHolder::"admin@workspace")
};

// A deactivated person can do nothing, whatever their grants say.
@id("F3-deactivated")
forbid (principal is SW::User, action, resource)
when { principal.deactivated };

// Agent clients only read through the agent routes.
@id("F4-bearer-scope")
forbid (principal is SW::Client, action, resource)
unless { action == SW::Action::"agentRead" };

// Protected branches change only through publishing, which needs the publish action.
@id("F5-protected-branch")
forbid (principal, action == SW::Action::"push", resource)
when { context.protectedBranch };

// A restricted file is invisible to everyone outside its groups and addresses, except Admins.
@id("F6-restricted")
forbid (principal, action, resource)
when
{
  resource.restricted &&
  !(principal is SW::User && principal.accessSets.containsAll(resource.restrictedTo)) &&
  !(principal in SW::RoleHolder::"admin@workspace")
};

// Remote addresses, clones and subfolder projects are Admin actions.
@id("F7-remote-admin")
forbid (
  principal,
  action in
    [SW::Action::"setRemote", SW::Action::"clone", SW::Action::"registerProjects"],
  resource
)
unless { principal in SW::RoleHolder::"admin@workspace" };

// A signed-in person without any grant sees only the No access page.
@id("F8-no-access")
forbid (principal is SW::User, action, resource)
when { !principal.hasAccess };
