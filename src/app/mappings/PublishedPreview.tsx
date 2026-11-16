// Labels editing previews independently of the production request source.
import { useEffect, useState } from 'react';
import { scm } from '../projects/api';

/** Names the saved authoring view and the production commit reported by Source Control. */
export function PublishedPreview({ project, revisionKey }: { project: string; revisionKey: string }) {
  const [publication, setPublication] = useState({ project: '', text: 'loading…' });
  useEffect(() => {
    let active = true;
    if (!project) return;
    scm.status(project).then(
      status => {
        if (!active) return;
        const snapshot = status.published;
        const text = snapshot && snapshot.state !== 'none' ? `${snapshot.branch} @ ${snapshot.commit.slice(0, 7)}` : 'none';
        setPublication({ project, text });
      },
      () => {
        if (active) setPublication({ project, text: 'status unavailable' });
      },
    );
    return () => {
      active = false;
    };
  }, [project, revisionKey]);
  return <p className="mapping-heading-note">Preview of your working copy · Published: {publication.project === project ? publication.text : 'loading…'}. Exported context is a preview.</p>;
}
