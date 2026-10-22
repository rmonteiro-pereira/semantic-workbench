/** The owner field of the metric wizard, offering the people who have signed in. */
import React, { useEffect, useState } from 'react';
import { api } from '../projects/api';
import type { Person } from '../governance/guards';

/**
 * A text input with the people who may read the project as suggestions. An owner the server
 * found unverified is flagged, because approval then treats the metric as having no owner.
 */
export function OwnerInput({
  project,
  value,
  onChange,
  verified,
}: {
  project: string;
  value: string;
  onChange: (value: string) => void;
  /** The server's verdict on the shown owner; absent when it has not judged this value. */
  verified?: boolean;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [unavailable, setUnavailable] = useState('');
  useEffect(() => {
    let live = true;
    api.people(project).then(
      list => {
        if (live) setPeople(list);
      },
      (error: Error) => {
        if (live) setUnavailable(`People list unavailable: ${error.message}`);
      },
    );
    return () => {
      live = false;
    };
  }, [project]);
  return (
    <>
      <input
        aria-label="Owner"
        list="metric-owner-people"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      <datalist id="metric-owner-people">
        {people.map(person => (
          <option key={person.owner} value={person.owner}>
            {person.name}
          </option>
        ))}
      </datalist>
      {verified === false && (
        <small className="owner-unverified">
          Unverified owner: this names nobody who has signed in with a verified address or username.
        </small>
      )}
      {unavailable && <small className="owner-unverified">{unavailable}</small>}
    </>
  );
}
