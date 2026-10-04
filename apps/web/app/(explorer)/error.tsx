"use client";

/** Explorer pages read the chain on the server; when the public RPC stalls, say so and offer a retry instead of crashing. */
export default function ExplorerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Chain data did not load</h2>
      <p className="muted">The Monad testnet RPC timed out or rate limited this request. It usually clears within a minute.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
