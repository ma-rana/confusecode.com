/**
 * A minimal counting gate for the concurrency cap (§7.4).
 * Limits simultaneous in-flight analyses so a burst can't spawn unbounded
 * workers and exhaust RAM/CPU. This variant does NOT queue — it reports
 * whether a slot was acquired, so the caller can shed load with a clean 503.
 */
export class ConcurrencyGate {
  private inFlight = 0;
  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.inFlight >= this.max) return false;
    this.inFlight++;
    return true;
  }

  release(): void {
    if (this.inFlight > 0) this.inFlight--;
  }

  get active(): number {
    return this.inFlight;
  }
}
