const { Actor } = require("apify");
const axios = require("axios");

Actor.main(async () => {
    try {
        const input = await Actor.getInput();
        console.log("Received input:", input);

        // Handle keyword cleanup
        let includeKeyword = input.includeKeyword || "";
        includeKeyword = includeKeyword
            .replace(/\s+/g, " ")
            .trim()
            .replace(/,/g, " AND "); // "A, B, C" → "A AND B AND C"

        // If ' 3 years experience ' included → normalize as AND
        if (includeKeyword.toLowerCase().includes("years")) {
            includeKeyword = includeKeyword.replace(/(\d+)\s*years/i, "$1 years experience");
        }

        // Support single or multiple locations
        const locations = typeof input.locationName === "string"
            ? [input.locationName]
            : Array.isArray(input.locationName)
            ? input.locationName
            : [""]; // fallback

        const allJobs = [];
        for (const location of locations) {
            const payload = {
                ...input,
                includeKeyword,
                locationName: location.trim(),
                companyName: input.companyName || undefined,
                datePosted: input.datePosted || "3 days",
                source: "google jobs",
            };

            console.log(`🔍 Searching jobs for location "${payload.locationName}" with keyword "${payload.includeKeyword}"`);

            // Attempt API request with retry
            let res;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    res = await axios.post("https://api.orgupdate.com/search-jobs-v1", payload);
                    break;
                } catch (err) {
                    console.error(`⚠️ Attempt ${attempt} failed for ${location}:`, err.message);
                    if (attempt === 2) throw err; // retry only once
                    await new Promise(r => setTimeout(r, 2000)); // Wait before retry
                }
            }

            const jobs = res?.data || [];
            console.log(`📩 Received ${jobs.length} jobs for "${location}"`);
            allJobs.push(...jobs);
        }

        // Store all jobs
        if (allJobs.length) {
            await Actor.pushData(allJobs);
        }

        console.log(`🎉 Finished! Total jobs saved: ${allJobs.length}`);
    } catch (err) {
        console.error("❌ Job search failed:", err.message, err);
        throw err;
    }
});
