const { Actor } = require("apify");
const axios = require("axios");

Actor.main(async () => {
    try {
        const input = await Actor.getInput();
        console.log("🟢 Received input:", input);

        // Default configuration
        const {
            locationName,
            pagesToFetch = 1,
            datePosted = "3 days",
            companyName,
            onlyRemote = false,
            excludeFreshers = true,
            minSalary,
            sendNotification = false,
        } = input;

        // Clean up keywords
        let includeKeyword = (input.includeKeyword || "").replace(/,/g, " AND ").replace(/\s+/g, " ").trim();

        // Prepare location looping
        const locations = typeof locationName === "string" ? [locationName] :
                         Array.isArray(locationName) ? locationName : [""];

        const allJobs = [];

        // Loop through each location
        for (const location of locations) {
            console.log(`📌 Searching jobs in "${location}"`);

            // Loop pagination
            for (let page = 1; page <= pagesToFetch; page++) {

                const payload = {
                    ...input,
                    includeKeyword,
                    locationName: location.trim(),
                    companyName: companyName || undefined,
                    datePosted,
                    page,
                    source: "google jobs",
                };

                console.log(`🔍 API Request - Page ${page}`, payload);

                // API request with retry logic
                let res;
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        res = await axios.post("https://api.orgupdate.com/search-jobs-v1", payload);
                        break;
                    } catch (err) {
                        console.error(`⚠️ Attempt ${attempt} failed for ${location}: ${err.message}`);
                        if (attempt === 2) throw err;
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

                let jobs = res?.data || [];
                console.log(`📥 Fetched ${jobs.length} jobs`);

                // Filter jobs based on conditions
                jobs = jobs.filter(job => {
                    if (excludeFreshers && job.title?.match(/fresher|intern|graduate/i)) return false;
                    if (onlyRemote && job.location && !job.location.toLowerCase().includes("remote")) return false;
                    if (minSalary && job.salary < minSalary) return false;
                    return true;
                });

                allJobs.push(...jobs);
            }
        }

        // Deduplicate by job URL or title
        const uniqueJobs = [...new Map(allJobs.map(job => [job.url || job.title, job])).values()];
        console.log(`🧹 Deduplicated to ${uniqueJobs.length} jobs`);

        // Save to dataset
        if (uniqueJobs.length) {
            await Actor.pushData(uniqueJobs);
        }

        // Optionally save CSV
        await Actor.setValue("jobs.csv", uniqueJobs, { contentType: "text/csv" });

        // Optional Email Notification
        if (sendNotification && uniqueJobs.length > 0) {
            await Actor.call("apify/send-mail", {
                to: "your.email@example.com",
                subject: `🚀 ${uniqueJobs.length} new job matches found!`,
                text: JSON.stringify(uniqueJobs.slice(0, 5), null, 2),
            });
        }

        console.log(`🎉 Finished scraping! Total jobs saved: ${uniqueJobs.length}`);
        console.log("📂 CSV Saved: jobs.csv");

    } catch (err) {
        console.error("❌ Job search failed:", err.message);
        throw err;
    }
});
