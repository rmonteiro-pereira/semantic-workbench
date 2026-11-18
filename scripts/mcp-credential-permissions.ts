// Keep Windows permission checks independent of localized command output.
const windowsPermissions = `
$ErrorActionPreference = 'Stop'
$path = $env:SW_BRIDGE_ACL_PATH
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $path
if ($env:SW_BRIDGE_ACL_CREATE -eq '1') {
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in $acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])) {
    $acl.RemoveAccessRuleSpecific($rule)
  }
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($user, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $path -AclObject $acl
  $acl = Get-Acl -LiteralPath $path
}
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $user) { exit 1 }
$own = $false
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -ne 'Allow') { continue }
  if ($rule.IdentityReference -ne $user) { exit 1 }
  $own = $true
}
if (!$own) { exit 1 }
`;

/** Verifies an owner-only Windows ACL and sets it only on a newly created directory. */
export function privateWindowsAcl(path: string, created: boolean, run: typeof Bun.spawnSync = Bun.spawnSync): boolean {
  const result = run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', windowsPermissions], {
    env: { ...process.env, SW_BRIDGE_ACL_PATH: path, SW_BRIDGE_ACL_CREATE: created ? '1' : '0' },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return result.exitCode === 0;
}
