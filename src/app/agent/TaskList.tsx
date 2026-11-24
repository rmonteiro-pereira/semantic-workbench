// The agent's plan is descriptive and grants no workbench permission.
import type { TaskEntry } from '../../shared/agent-panel/events';
const STATUS = { pending: 'Pending', in_progress: 'In progress', completed: 'Completed' };

/** Shows the task list exactly as the agent reports it, with status in words. */
export function TaskList({ entries }: { entries: readonly TaskEntry[] }) {
  if (!entries.length) return null;
  return (
    <section aria-label="The agent's task list">
      <h3>The agent's task list</h3>
      <ol>
        {entries.map((entry, index) => (
          <li key={index}>
            <strong>{STATUS[entry.status]}</strong>: {entry.content}
          </li>
        ))}
      </ol>
    </section>
  );
}
