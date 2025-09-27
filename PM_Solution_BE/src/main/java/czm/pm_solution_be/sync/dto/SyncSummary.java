package czm.pm_solution_be.sync.dto;

import java.util.Collection;
import java.util.LinkedHashSet;

public class SyncSummary {
    public int fetched;
    public int inserted;
    public int updated;
    public int skipped;
    public int pages;
    public long durationMs;
    public final LinkedHashSet<String> missingUsernames = new LinkedHashSet<>();

    public SyncSummary addFetched(int n) { this.fetched += n; return this; }
    public SyncSummary addInserted(int n) { this.inserted += n; return this; }
    public SyncSummary addUpdated(int n) { this.updated += n; return this; }
    public SyncSummary addSkipped(int n) { this.skipped += n; return this; }
    public SyncSummary addPage() { this.pages += 1; return this; }

    public SyncSummary addMissingUsername(String username) {
        if (username != null && !username.isBlank()) {
            this.missingUsernames.add(username);
        }
        return this;
    }

    public SyncSummary addMissingUsernames(Collection<String> usernames) {
        if (usernames == null) {
            return this;
        }
        for (String username : usernames) {
            addMissingUsername(username);
        }
        return this;
    }
}
