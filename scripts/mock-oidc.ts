// Runs the test identity provider on loopback for browser and integration checks.
import { startMockOidc, type ClaimShape, type MockOidcOptions } from '../tests/helpers/mock-oidc';

function parseOptions(args: string[]): MockOidcOptions {
  const options: MockOidcOptions = { port: 4400, shape: 'entra' };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case '--port':
        if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error('Invalid port');
        options.port = Number(value);
        break;
      case '--shape':
        if (!['entra', 'keycloak', 'generic'].includes(value)) throw new Error('Invalid claim shape');
        options.shape = value as ClaimShape;
        break;
      case '--layout':
        if (value !== 'issuer' && value !== 'entra') throw new Error('Invalid endpoint layout');
        options.layout = value;
        break;
      case '--redirect':
        new URL(value);
        (options.redirectUris ??= []).push(value);
        break;
      case '--post-logout':
        new URL(value);
        (options.postLogoutRedirectUris ??= []).push(value);
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
}

async function main() {
  const provider = await startMockOidc(parseOptions(process.argv.slice(2)));
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await provider.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(
    JSON.stringify({
      issuer: provider.issuer,
      endpointBase: provider.endpointBase,
      graphUrl: provider.graphUrl,
      origin: provider.origin,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
