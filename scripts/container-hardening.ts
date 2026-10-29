/** Runtime restrictions the image must run under: no writable root, no capabilities. */
export const containerHardening = {
  tmpfs: '/tmp',
  capabilitiesDropped: 'ALL',
  securityOption: 'no-new-privileges',
};

/**
 * Container run flags that prove the image writes only to /data and /tmp. The same restrictions
 * are set in compose.yaml for the Compose service.
 */
export function hardenedRunArguments(): string[] {
  return ['--read-only', '--tmpfs', containerHardening.tmpfs, '--cap-drop', containerHardening.capabilitiesDropped, '--security-opt', containerHardening.securityOption];
}
