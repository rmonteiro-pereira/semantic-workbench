/** Static instructions for setting up Git credentials; the app never handles credentials. */
import React, { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { Modal } from '../projects/Modal';
import { scm } from '../projects/api';

type System = 'Windows' | 'macOS' | 'Linux';

// Commands per operating system. They configure Git's own helpers; nothing passes through the app.
const HELPERS: Record<System, { text: string; command: string }> = {
  Windows: {
    text: 'Git for Windows includes Git Credential Manager, which asks for your sign-in in its own window and keeps it in Windows Credential Manager.',
    command: 'git config --global credential.helper manager',
  },
  macOS: {
    text: 'The macOS keychain helper keeps your token or password in the login keychain.',
    command: 'git config --global credential.helper osxkeychain',
  },
  Linux: {
    text: 'The libsecret helper keeps credentials in your desktop keyring. Without a keyring, the cache helper keeps them in memory for an hour.',
    command: 'git config --global credential.helper libsecret',
  },
};

const SSH_COMMANDS = ['ssh-keygen -t ed25519 -C "you@example.com"', 'ssh -T git@github.com'];

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard
      ?.writeText(command)
      .then(() => setCopied(true))
      .catch(() => {});
  }
  return (
    <div className="copyable-command">
      <code>{command}</code>
      <button type="button" onClick={copy} aria-label={`Copy ${command}`}>
        <Copy size={13} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// What the guide says about the helper Git has configured; undefined while it is being read.
function helperMessage(helper: string | null | undefined) {
  if (helper === undefined) return 'Checking Git’s credential helper…';
  if (helper) return `Credential helper in your Git settings: ${helper}.`;
  return 'No credential helper is set in your Git settings.';
}

const guessSystem = (): System => {
  const platform = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Windows/i.test(platform)) return 'Windows';
  if (/Mac OS/i.test(platform)) return 'macOS';
  return 'Linux';
};

/** Explains a credential helper and an SSH key for each operating system. */
export function CredentialGuide({ onClose }: { onClose: () => void }) {
  const [system, setSystem] = useState<System>(guessSystem);
  const [helper, setHelper] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    scm
      .credentialHelper()
      .then(result => setHelper(result.helper))
      .catch(() => setHelper(undefined));
  }, []);
  const footer = (
    <button type="button" className="primary" onClick={onClose}>
      Close
    </button>
  );
  return (
    <Modal title="Credential setup guide" onCancel={onClose} footer={footer}>
      <div className="credential-guide">
        <p className="dialog-intro">
          The workbench never asks for, stores or sends your credentials. Git uses a credential
          helper or an SSH key that you set up once in a terminal; after that, Fetch, Pull and Push
          work from the app.
        </p>
        <p role="status" className="credential-helper">
          {helperMessage(helper)}
        </p>
        <div className="segmented" role="tablist" aria-label="Operating system">
          {(Object.keys(HELPERS) as System[]).map(option => (
            <button
              key={option}
              role="tab"
              aria-selected={system === option}
              className={system === option ? 'selected' : ''}
              onClick={() => setSystem(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <h3>HTTPS: a credential helper</h3>
        <p>{HELPERS[system].text}</p>
        <CopyableCommand command={HELPERS[system].command} />
        {system === 'Linux' && (
          <CopyableCommand command="git config --global credential.helper 'cache --timeout=3600'" />
        )}
        <p>
          Use a personal access token from your Git host instead of your account password; the
          helper asks for it on the next push.
        </p>
        <h3>SSH: a key</h3>
        <p>
          Create a key, add the public key (the <code>.pub</code> file) to your Git host’s SSH
          settings, test the connection, then use the SSH address (<code>git@…</code>) as the
          remote.
        </p>
        {SSH_COMMANDS.map(command => (
          <CopyableCommand key={command} command={command} />
        ))}
      </div>
    </Modal>
  );
}

// Phrases Git and Git hosts use when a remote refuses or asks for credentials.
const AUTH_FAILURES = [
  /authentication failed/i,
  /could not read username/i,
  /permission denied \(publickey/i,
  /terminal prompts disabled/i,
  /access denied/i,
  /returned error: 40[13]/i,
  /invalid username or password/i,
];

/** Tells whether a Git error message means the remote refused or asked for credentials. */
export function looksLikeAuthFailure(message: string) {
  return AUTH_FAILURES.some(pattern => pattern.test(message));
}
