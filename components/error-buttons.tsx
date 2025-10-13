'use client';
import { useEffect, useState } from 'react';

export default function ErrorButtons() {
  const [isErrored, setIsErrored] = useState(false);

  return (
    <div>
      <div>
        <button
          type="button"
          onClick={() => {
            throw new Error('Threw client-side Error');
          }}
        >
          Throw client-side onClick error
        </button>
      </div>
      <div>
        <ThrowerOfErrors isErrored={isErrored} setIsErrored={setIsErrored} />
        <button type="button" onClick={() => setIsErrored(true)}>
          Trigger error boundary
        </button>
      </div>
      <div>
        <button
          type="button"
          onClick={async () => {
            throw new Error('an async error occurred');
          }}
        >
          Trigger promise error
        </button>
      </div>
    </div>
  );
}

function ThrowerOfErrors({
  isErrored,
  setIsErrored,
}: {
  isErrored: boolean;
  setIsErrored: (isErrored: boolean) => void;
}) {
  useEffect(() => {
    if (isErrored) {
      setIsErrored(false);
      throw new Error('Threw useEffect error');
    }
  }, [isErrored, setIsErrored]);

  return null;
}
