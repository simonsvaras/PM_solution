package czm.pm_solution_be.sync;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TimeSpentParser {
    private static final Pattern ADD_PATTERN = Pattern.compile("^added (.+) of time spent", Pattern.CASE_INSENSITIVE);
    private static final Pattern SUB_PATTERN = Pattern.compile("^subtracted (.+) of time spent", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOKEN = Pattern.compile("(\\d+)\\s*([dhms])", Pattern.CASE_INSENSITIVE);

    public static Integer parseDeltaSeconds(String body) {
        if (body == null) return null;
        Matcher mAdd = ADD_PATTERN.matcher(body.trim());
        Matcher mSub = SUB_PATTERN.matcher(body.trim());
        boolean neg;
        String expr;
        if (mAdd.find()) { neg = false; expr = mAdd.group(1); }
        else if (mSub.find()) { neg = true; expr = mSub.group(1); }
        else return null;

        int seconds = 0;
        Matcher tm = TOKEN.matcher(expr);
        while (tm.find()) {
            int val = Integer.parseInt(tm.group(1));
            String unit = tm.group(2).toLowerCase();
            switch (unit) {
                case "d" -> seconds += val * 86400;
                case "h" -> seconds += val * 3600;
                case "m" -> seconds += val * 60;
                case "s" -> seconds += val;
            }
        }
        if (seconds == 0) return null;
        return neg ? -seconds : seconds;
    }
}

