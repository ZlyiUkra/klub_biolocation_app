// A counting semaphore (T047 of specs/001-self-hosted-club-site): at most `limit` tasks run at once, the rest wait in
// the order they asked. It exists for the password hash, whose every computation holds 128 MiB for a quarter of a
// second: without a limit a burst of sign-ins would ask the machine for gigabytes at once (server/src/auth/password.ts
// says how many places it gives).
//
// How it works: `active` counts the tasks that hold a place. A task that finds a free place takes it; one that does
// not joins `waiting` and is woken by the task that leaves, which hands its place over directly, so the count never
// dips and a newcomer cannot jump the queue. The place is given back in a `finally`, so a task that throws frees it
// as surely as one that finishes.

export class Semaphore {
  readonly limit: number;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError("a semaphore needs a whole limit of at least 1");
    }
    this.limit = limit;
  }

  /** Runs `task` when a place is free and gives the place back when it ends, whether it resolved or threw. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active += 1;
    } else {
      // The place is handed over by release(), which does not lower `active` when someone is waiting.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}
