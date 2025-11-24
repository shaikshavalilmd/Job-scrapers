const { Actor } = require("apify");
const axios = require("axios");

Actor.main(async () => {
    try {
        const input = await Actor.getInput();
        console.log("🟢 Received input:", input);

        // 🔹 Default configuration
        const {
            locationName,
            extraLocations = [], // Additional locations
            pagesToFetch = 1,
            datePosted = "3days", // Must match allowed values
            companyName,
            onlyRemote = false,
            excludeFreshers = true,
            minSalary,
            sendNotification = false,
        } = input;

        // 🔥 Force sources (hardcoded)
        const sources = [
            "google jobs",
            "naukri",
            "linkedin",
            "indeed",
            "glassdoor",
            "monster"
        ];

        // 🔹 Keyword formatting
        let includeKeyword = (input.includeKeyword || "")
            .replace(/,/g, " AND ")
            .replace(/\s+/g, " ")
            .trim();

        // 🔹 Combine main + extra locations
        let locations = [];
        if (typeof locationName === "string") locations.push(locationName);
        if (Array.isArray(extraLocations)) locations = [...locations, ...extraLocations];
        if (locations.length === 0) locations = [""]; // fallback

        const allJobs = [];

        // 🔁 Search loop → SOURCE → LOCATION → PAGE
        for (const source of sources) {
            console.log(`\n🌐 Searching from source: "${source}"`);

            for (const location of locations) {
                console.log(`📌 Location: "${location}"`);

                for (let page = 1; page <= pagesToFetch; page++) {
                    const payload = {
                        ...input,
                        includeKeyword,
                        locationName: location.trim(),
                        companyName: companyName || undefined,
                        datePosted, // must be "all", "today", "3days", "week", or "month"
                        page,
                        source, // dynamic
                    };

                    console.log(`🔍 API Request → Source: ${source} | Page: ${page}`, payload);

                    // Retry logic for API
                    let res;
                    for (let attempt = 1; attempt <= 2; attempt++) {
                        try {
                            res = await axios.post("https://api.orgupdate.com/search-jobs-v1", payload);
                            break;
                        } catch (err) {
                            console.error(`⚠️ Attempt ${attempt} failed (${source}/${location}):`, err.message);
                            if (attempt === 2) throw err;
                            await Actor.waitForTimeout(2000);
                        }
                    }

                    let jobs = res?.data || [];
                    console.log(`📥 ${jobs.length} jobs received from ${source}`);

                    // Filtering logic
                    jobs = jobs.filter(job => {
                        if (excludeFreshers && /fresher|intern|graduate/i.test(job.title || "")) return false;
                        if (onlyRemote && job.location && !job.location.toLowerCase().includes("remote")) return false;
                        if (minSalary && job.salary < minSalary) return false;
                        if (companyName && !(job.company || "").toLowerCase().includes(companyName.toLowerCase())) return false;
                        return true;
                    });

                    // Attach source label
                    jobs = jobs.map(job => ({ ...job, source }));

                    allJobs.push(...jobs);
                }
            }
        }

        // 🧹 Deduplicate by source + URL
        const uniqueJobs = [
            ...new Map(allJobs.map(job => [`${job.url}_${job.source}`, job])).values(),
        ];
        console.log(`🧹 Deduplicated to ${uniqueJobs.length} jobs`);

        // 💾 Save results
        if (uniqueJobs.length) {
            await Actor.pushData(uniqueJobs);
        }
        await Actor.setValue("jobs.csv", uniqueJobs, { contentType: "text/csv" });

        // 📧 Email Notification (optional)
        if (sendNotification && uniqueJobs.length > 0) {
            await Actor.call("apify/send-mail", {
                to: "your.email@example.com", // update this
                subject: `🚀 ${uniqueJobs.length} jobs found!`,
                text: JSON.stringify(uniqueJobs.slice(0, 5), null, 2),
            });
        }

        console.log(`🎉 Scraping Completed! Total jobs saved: ${uniqueJobs.length}`);
        console.log("📂 CSV file saved: jobs.csv");

    } catch (err) {
        console.error("❌ Job search failed:", err.message);
        throw err;
    }
});
