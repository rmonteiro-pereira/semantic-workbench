// Keeps termination signals attached to the same cleanup path as hot reload.

/** Releases resources before exiting on either termination signal and returns a detach function. */
export function installShutdownHandlers(close: () => Promise<void>) {
  function shutdown() {
    void close().then(
      () => process.exit(0),
      error => {
        console.error(error);
        process.exit(1);
      },
    );
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return () => {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
  };
}
