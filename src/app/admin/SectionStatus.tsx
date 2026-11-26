import './section-status.css';
/**
 * Says that an Admin area is loading, or why it could not load with a way to try again. Every
 * area uses it, so loading and failure read the same everywhere; the area draws its own content
 * only once its data has arrived.
 */
export function SectionStatus({ subject, loading, error, onRetry }: { subject: string; loading: boolean; error: string; onRetry?: () => void }) {
  if (error) {
    return (
      <div className="admin-load-problem" role="alert">
        <p>{`Could not load ${subject}. ${error}`}</p>
        {onRetry && <button onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (loading) {
    return (
      <p className="admin-loading" role="status">
        {`Loading ${subject}`}
      </p>
    );
  }
  return null;
}
