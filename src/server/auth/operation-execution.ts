// Keeps internal publication steps inside their admitted operation, including trusted workspace startup.
import { AsyncLocalStorage } from 'node:async_hooks';
import { operationInventory, type OperationEntry } from './operation-inventory';

const execution = new AsyncLocalStorage<{ id: string; steps: readonly string[] }>();

/** Carries reviewed internal steps through asynchronous work admitted by the operation boundary. */
export function executeOperation<T>(entry: OperationEntry, use: () => T): T {
  return execution.run({ id: entry.id, steps: entry.steps ?? [] }, use);
}

/** Executes a domain step without granting another route, action or audit outcome. */
export function operationStep<T>(id: string, use: () => T): T {
  const operation = execution.getStore();
  if (operation && !operation.steps.includes(id)) throw new Error(`${operation.id} does not own internal step ${id}.`);
  return use();
}

/** Runs the registered startup upgrade, with no HTTP or protocol dispatch surface. */
export function upgradePublications<T>(use: () => T): T {
  const entry = operationInventory.lifecycleOperations['publication.upgrade'];
  if (!entry) throw new Error('Missing publication upgrade operation.');
  return operationStep(entry.id, () => execution.run({ id: entry.id, steps: entry.steps }, use));
}
