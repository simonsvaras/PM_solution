package czm.pm_solution_be.sync.dto;

public class SyncSummary {
    public int fetched;
    public int inserted;
    public int updated;
    public int skipped;
    public int pages;

    public SyncSummary addFetched(int n) { this.fetched += n; return this; }
    public SyncSummary addInserted(int n) { this.inserted += n; return this; }
    public SyncSummary addUpdated(int n) { this.updated += n; return this; }
    public SyncSummary addSkipped(int n) { this.skipped += n; return this; }
    public SyncSummary addPage() { this.pages += 1; return this; }
}

